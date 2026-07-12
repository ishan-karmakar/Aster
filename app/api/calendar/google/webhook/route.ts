import { getD1 } from "@/db/runtime";
import { decryptToken } from "@/lib/secure-token";

export async function POST(request:Request){
 const token=request.headers.get("x-goog-channel-token"),channelId=request.headers.get("x-goog-channel-id"),secret=process.env.TOKEN_ENCRYPTION_KEY||"";
 if(!token||!channelId||!secret)return new Response(null,{status:400});
 try{
  const {email}=JSON.parse(await decryptToken(token,secret)) as {email:string},db=await getD1();if(!db)return new Response(null,{status:503});
  await db.batch([db.prepare("CREATE TABLE IF NOT EXISTS calendar_webhooks (channel_id TEXT PRIMARY KEY NOT NULL, user_email TEXT NOT NULL, resource_id TEXT, expiration TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch()))"),db.prepare("CREATE TABLE IF NOT EXISTS calendar_sync_queue (user_email TEXT PRIMARY KEY NOT NULL, requested_at INTEGER NOT NULL DEFAULT (unixepoch()),attempts INTEGER NOT NULL DEFAULT 0,next_attempt_at INTEGER NOT NULL DEFAULT 0,last_error TEXT)")]);
  const registered=await db.prepare("SELECT user_email FROM calendar_webhooks WHERE channel_id=? AND user_email=?").bind(channelId,email).first();if(!registered)return new Response(null,{status:403});
  await db.prepare("INSERT INTO calendar_sync_queue (user_email) VALUES (?) ON CONFLICT(user_email) DO UPDATE SET requested_at=unixepoch(),attempts=0,next_attempt_at=0,last_error=NULL").bind(email).run();
  return new Response(null,{status:204});
 }catch{return new Response(null,{status:403})}
}
