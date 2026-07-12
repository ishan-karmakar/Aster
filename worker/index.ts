/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { markMissedAndReschedule,normalizePlannerState,type PlannerState } from "../lib/planner";
import { explainScheduleChange } from "../lib/openai-study";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
  RESEND_API_KEY?: string;
  REMINDER_FROM_EMAIL?: string;
  HOME_URL?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  TOKEN_ENCRYPTION_KEY?: string;
  OPENAI_API_KEY?: string;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(Promise.all([sendDueReminders(env),rescheduleMissedWork(env),pullQueuedCalendarChanges(env).then(()=>syncConnectedCalendars(env))]));
  },
};

interface ScheduledController { scheduledTime: number; cron: string; }
type ReminderRow = { id:number; user_email:string; title:string; subject:string; due_at:string };

async function sendDueReminders(env:Env){
  if(!env.RESEND_API_KEY||!env.REMINDER_FROM_EMAIL)return;
  const now=new Date().toISOString();
  const due=await env.DB.prepare("SELECT id,user_email,title,subject,due_at FROM assignments WHERE reminder_status='pending' AND reminder_at<=? AND reminder_attempts<5 ORDER BY reminder_at LIMIT 50").bind(now).all<ReminderRow>();
  for(const item of due.results){
    const home=env.HOME_URL||"https://aster-homework-planner.yashman9012.chatgpt.site";
    const subject=`Reminder: ${item.title} is coming up`;
    const html=reminderEmail(item,home);
    const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,"Content-Type":"application/json","User-Agent":"Aster-Homework-Planner/1.0","Idempotency-Key":`assignment-reminder/${item.id}`},body:JSON.stringify({from:env.REMINDER_FROM_EMAIL,to:[item.user_email],subject,html,text:`${item.title} for ${item.subject} is due ${new Date(item.due_at).toLocaleString()}. Open Aster: ${home}`})});
    if(response.ok)await env.DB.prepare("UPDATE assignments SET reminder_status='sent' WHERE id=?").bind(item.id).run();
    else await env.DB.prepare("UPDATE assignments SET reminder_attempts=reminder_attempts+1 WHERE id=?").bind(item.id).run();
  }
}

async function rescheduleMissedWork(env:Env){
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS planner_state (user_email TEXT PRIMARY KEY NOT NULL, state TEXT NOT NULL, updated_at INTEGER NOT NULL DEFAULT (unixepoch()))").run();
  const rows=await env.DB.prepare("SELECT user_email,state FROM planner_state LIMIT 100").all<{user_email:string;state:string}>();
  for(const row of rows.results){try{const before=normalizePlannerState(JSON.parse(row.state) as PlannerState),next=markMissedAndReschedule(before);if(next.revisions.length!==before.revisions.length){next.revisions[0].explanation=await explainScheduleChange(env.OPENAI_API_KEY,next.revisions[0].reason,next.revisions[0].explanation);await env.DB.prepare("UPDATE planner_state SET state=?,updated_at=unixepoch() WHERE user_email=?").bind(JSON.stringify(next),row.user_email).run()}}catch{/* Keep processing other students if one record is malformed. */}}
}

async function syncConnectedCalendars(env:Env){
  if(!env.GOOGLE_CLIENT_ID||!env.GOOGLE_CLIENT_SECRET||!env.TOKEN_ENCRYPTION_KEY)return;
  await env.DB.batch([env.DB.prepare("CREATE TABLE IF NOT EXISTS calendar_connections (user_email TEXT PRIMARY KEY NOT NULL, provider TEXT NOT NULL, refresh_token TEXT NOT NULL, calendar_id TEXT, provider_email TEXT, sync_token TEXT, status TEXT NOT NULL DEFAULT 'connected', updated_at INTEGER NOT NULL DEFAULT (unixepoch()))"),env.DB.prepare("CREATE TABLE IF NOT EXISTS calendar_event_links (user_email TEXT NOT NULL, session_id TEXT NOT NULL, event_id TEXT NOT NULL, event_updated TEXT, session_updated TEXT, PRIMARY KEY(user_email,session_id))")]);
  const connections=await env.DB.prepare("SELECT user_email,refresh_token,calendar_id FROM calendar_connections WHERE provider='google' AND status IN ('connected','error') ORDER BY updated_at LIMIT 20").all<{user_email:string;refresh_token:string;calendar_id:string}>();
  for(const connection of connections.results){try{const refresh=await decryptWorkerToken(connection.refresh_token,env.TOKEN_ENCRYPTION_KEY),tokenResponse=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,refresh_token:refresh,grant_type:"refresh_token"})}),tokens=await tokenResponse.json() as {access_token?:string};if(!tokens.access_token)throw new Error("Refresh failed");const row=await env.DB.prepare("SELECT state FROM planner_state WHERE user_email=?").bind(connection.user_email).first<{state:string}>();if(!row)continue;const state=normalizePlannerState(JSON.parse(row.state) as PlannerState),links=await env.DB.prepare("SELECT session_id,event_id,session_updated FROM calendar_event_links WHERE user_email=?").bind(connection.user_email).all<{session_id:string;event_id:string;session_updated:string}>(),bySession=new Map(links.results.map(item=>[item.session_id,item])),calendarId=encodeURIComponent(connection.calendar_id||"primary");for(const session of state.sessions){const link=bySession.get(session.id);if(session.status!=="planned"){if(link){await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(link.event_id)}`,{method:"DELETE",headers:{authorization:`Bearer ${tokens.access_token}`}});await env.DB.prepare("DELETE FROM calendar_event_links WHERE user_email=? AND session_id=?").bind(connection.user_email,session.id).run()}continue}const event={summary:`${session.subject}: ${session.title}`,description:"Aster study session",start:{dateTime:session.start,timeZone:state.preferences.timezone},end:{dateTime:session.end,timeZone:state.preferences.timezone},extendedProperties:{private:{asterSessionId:session.id}}};if(!link){const response=await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,{method:"POST",headers:{authorization:`Bearer ${tokens.access_token}`,"content-type":"application/json"},body:JSON.stringify(event)}),created=await response.json() as {id?:string;updated?:string};if(created.id)await env.DB.prepare("INSERT INTO calendar_event_links (user_email,session_id,event_id,event_updated,session_updated) VALUES (?,?,?,?,?)").bind(connection.user_email,session.id,created.id,created.updated||"",session.updatedAt).run()}else if(session.updatedAt>(link.session_updated||""))await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(link.event_id)}`,{method:"PATCH",headers:{authorization:`Bearer ${tokens.access_token}`,"content-type":"application/json"},body:JSON.stringify(event)})}await env.DB.prepare("UPDATE calendar_connections SET status='connected',updated_at=unixepoch() WHERE user_email=?").bind(connection.user_email).run()}catch{await env.DB.prepare("UPDATE calendar_connections SET status='error',updated_at=unixepoch() WHERE user_email=?").bind(connection.user_email).run()}}
}

type QueuedConnection={user_email:string;refresh_token:string;calendar_id:string};
type WorkerGoogleEvent={id:string;status?:string;summary?:string;updated?:string;start?:{dateTime?:string};end?:{dateTime?:string};extendedProperties?:{private?:Record<string,string>}};
async function pullQueuedCalendarChanges(env:Env){
 if(!env.GOOGLE_CLIENT_ID||!env.GOOGLE_CLIENT_SECRET||!env.TOKEN_ENCRYPTION_KEY)return;
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS calendar_sync_queue (user_email TEXT PRIMARY KEY NOT NULL, requested_at INTEGER NOT NULL DEFAULT (unixepoch()),attempts INTEGER NOT NULL DEFAULT 0,next_attempt_at INTEGER NOT NULL DEFAULT 0,last_error TEXT)").run();
 const queued=await env.DB.prepare("SELECT c.user_email,c.refresh_token,c.calendar_id FROM calendar_connections c JOIN calendar_sync_queue q ON q.user_email=c.user_email WHERE c.provider='google' AND q.next_attempt_at<=unixepoch() AND q.attempts<8 ORDER BY q.requested_at LIMIT 20").all<QueuedConnection>();
 for(const connection of queued.results){
  try{
   const refresh=await decryptWorkerToken(connection.refresh_token,env.TOKEN_ENCRYPTION_KEY),tokenResponse=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,refresh_token:refresh,grant_type:"refresh_token"})}),tokens=await tokenResponse.json() as {access_token?:string};
   if(!tokens.access_token)throw new Error("Refresh failed");
   const row=await env.DB.prepare("SELECT state FROM planner_state WHERE user_email=?").bind(connection.user_email).first<{state:string}>();if(!row)continue;
   const state=normalizePlannerState(JSON.parse(row.state) as PlannerState),links=await env.DB.prepare("SELECT session_id,event_id,event_updated,session_updated FROM calendar_event_links WHERE user_email=?").bind(connection.user_email).all<{session_id:string;event_id:string;event_updated:string;session_updated:string}>(),calendarId=encodeURIComponent(connection.calendar_id||"primary"),timeMin=new Date(Date.now()-30*86400000).toISOString(),timeMax=new Date(Date.now()+90*86400000).toISOString(),eventsResponse=await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?singleEvents=true&showDeleted=true&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&maxResults=2500`,{headers:{authorization:`Bearer ${tokens.access_token}`}}),eventsData=await eventsResponse.json() as {items?:WorkerGoogleEvent[]},events=new Map((eventsData.items||[]).map(item=>[item.id,item]));
   for(const link of links.results){const session=state.sessions.find(item=>item.id===link.session_id),event=events.get(link.event_id);if(!session)continue;if(!event||event.status==="cancelled"){if((event?.updated||"")>=(session.updatedAt||"")){session.status="skipped";session.updatedAt=event?.updated||new Date().toISOString()}continue}const googleChanged=(event.updated||"")>(link.event_updated||""),asterChanged=session.updatedAt>(link.session_updated||"");if(googleChanged&&(!asterChanged||(event.updated||"")>session.updatedAt)&&event.start?.dateTime&&event.end?.dateTime){session.start=event.start.dateTime;session.end=event.end.dateTime;session.updatedAt=event.updated||new Date().toISOString()}}
   const busyResponse=await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&maxResults=2500`,{headers:{authorization:`Bearer ${tokens.access_token}`}}),busyData=await busyResponse.json() as {items?:WorkerGoogleEvent[]},exceptions=(busyData.items||[]).filter(event=>event.status!=="cancelled"&&event.start?.dateTime&&event.end?.dateTime&&!event.extendedProperties?.private?.asterSessionId).map(event=>({id:`google-${event.id}`,title:event.summary||"Google Calendar",start:event.start!.dateTime!,end:event.end!.dateTime!,source:"google" as const}));
   state.preferences.exceptions=[...(state.preferences.exceptions||[]).filter(item=>item.source!=="google"),...exceptions];
   await env.DB.batch([env.DB.prepare("UPDATE planner_state SET state=?,updated_at=unixepoch() WHERE user_email=?").bind(JSON.stringify(state),connection.user_email),env.DB.prepare("DELETE FROM calendar_sync_queue WHERE user_email=?").bind(connection.user_email)]);
  }catch(error){const message=error instanceof Error?error.message:"Calendar sync failed";await env.DB.batch([env.DB.prepare("UPDATE calendar_connections SET status='error',updated_at=unixepoch() WHERE user_email=?").bind(connection.user_email),env.DB.prepare("UPDATE calendar_sync_queue SET attempts=attempts+1,next_attempt_at=unixepoch()+MIN(3600,60*(1 << attempts)),last_error=? WHERE user_email=?").bind(message,connection.user_email)])}
 }
}
async function decryptWorkerToken(value:string,secret:string){const encoder=new TextEncoder(),[iv,payload]=value.split("."),decode=(input:string)=>Uint8Array.from(atob(input),character=>character.charCodeAt(0)),digest=await crypto.subtle.digest("SHA-256",encoder.encode(secret)),key=await crypto.subtle.importKey("raw",digest,"AES-GCM",false,["decrypt"]),result=await crypto.subtle.decrypt({name:"AES-GCM",iv:decode(iv)},key,decode(payload));return new TextDecoder().decode(result)}

function reminderEmail(item:ReminderRow,home:string){
  const title=escapeHtml(item.title),course=escapeHtml(item.subject),url=escapeHtml(home),due=escapeHtml(new Date(item.due_at).toLocaleString("en-US",{dateStyle:"full",timeStyle:"short",timeZone:"UTC"}));
  return `<!doctype html><html><body style="margin:0;background:#0b0e12;font-family:Arial,sans-serif;color:#f2f3ee"><div style="max-width:560px;margin:0 auto;padding:40px 20px"><div style="font-size:20px;font-weight:700;margin-bottom:30px"><span style="display:inline-block;background:#d9ff63;color:#151b10;border-radius:9px;padding:7px 11px;margin-right:9px">A</span>Aster</div><div style="background:#14181d;border:1px solid #293038;border-radius:16px;padding:30px"><div style="color:#b7cc72;font-size:11px;font-weight:700;letter-spacing:1.5px">ASSIGNMENT REMINDER</div><h1 style="font-family:Georgia,serif;font-size:28px;line-height:1.2;margin:12px 0">${title}</h1><p style="color:#9aa3ab;font-size:14px;line-height:1.6">Your <strong style="color:#eef0eb">${course}</strong> assignment is due <strong style="color:#eef0eb">${due} UTC</strong>.</p><a href="${url}" style="display:inline-block;margin-top:16px;background:#d9ff63;color:#151b10;text-decoration:none;font-size:13px;font-weight:700;padding:13px 18px;border-radius:9px">Open Aster →</a><p style="color:#626b73;font-size:11px;line-height:1.5;margin:24px 0 0">If your session has expired, Aster will ask you to sign in before opening your planner.</p></div><p style="color:#4f5861;font-size:10px;text-align:center;margin-top:20px">Sent because you scheduled an assignment reminder in Aster.</p></div></body></html>`;
}
function escapeHtml(value:string){return value.replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]||char))}

export default worker;
