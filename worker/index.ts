/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

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
    ctx.waitUntil(sendDueReminders(env));
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

function reminderEmail(item:ReminderRow,home:string){
  const title=escapeHtml(item.title),course=escapeHtml(item.subject),url=escapeHtml(home),due=escapeHtml(new Date(item.due_at).toLocaleString("en-US",{dateStyle:"full",timeStyle:"short",timeZone:"UTC"}));
  return `<!doctype html><html><body style="margin:0;background:#0b0e12;font-family:Arial,sans-serif;color:#f2f3ee"><div style="max-width:560px;margin:0 auto;padding:40px 20px"><div style="font-size:20px;font-weight:700;margin-bottom:30px"><span style="display:inline-block;background:#d9ff63;color:#151b10;border-radius:9px;padding:7px 11px;margin-right:9px">A</span>Aster</div><div style="background:#14181d;border:1px solid #293038;border-radius:16px;padding:30px"><div style="color:#b7cc72;font-size:11px;font-weight:700;letter-spacing:1.5px">ASSIGNMENT REMINDER</div><h1 style="font-family:Georgia,serif;font-size:28px;line-height:1.2;margin:12px 0">${title}</h1><p style="color:#9aa3ab;font-size:14px;line-height:1.6">Your <strong style="color:#eef0eb">${course}</strong> assignment is due <strong style="color:#eef0eb">${due} UTC</strong>.</p><a href="${url}" style="display:inline-block;margin-top:16px;background:#d9ff63;color:#151b10;text-decoration:none;font-size:13px;font-weight:700;padding:13px 18px;border-radius:9px">Open Aster →</a><p style="color:#626b73;font-size:11px;line-height:1.5;margin:24px 0 0">If your session has expired, Aster will ask you to sign in before opening your planner.</p></div><p style="color:#4f5861;font-size:10px;text-align:center;margin-top:20px">Sent because you scheduled an assignment reminder in Aster.</p></div></body></html>`;
}
function escapeHtml(value:string){return value.replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]||char))}

export default worker;
