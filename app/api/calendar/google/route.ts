import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/app/supabase";
import { getD1 } from "@/db/runtime";
import { encryptToken } from "@/lib/secure-token";
async function emailFor(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, authorization },
  });
  if (!response.ok) return null;
  return ((await response.json()) as { email?: string }).email || null;
}
const config = () => ({
  clientId: process.env.GOOGLE_CLIENT_ID || "",
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  redirectUri: process.env.GOOGLE_REDIRECT_URI || "",
  secret: process.env.TOKEN_ENCRYPTION_KEY || "",
});
async function ensure(db: D1Database) {
  await db
    .prepare(
      "CREATE TABLE IF NOT EXISTS calendar_connections (user_email TEXT PRIMARY KEY NOT NULL, provider TEXT NOT NULL, refresh_token TEXT NOT NULL, calendar_id TEXT, provider_email TEXT, sync_token TEXT, status TEXT NOT NULL DEFAULT 'connected', updated_at INTEGER NOT NULL DEFAULT (unixepoch()))",
    )
    .run();
}
export async function GET(request: Request) {
  const email = await emailFor(request);
  if (!email) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const values = config(),
    configured = Object.values(values).every(Boolean),
    db = await getD1();
  if (!configured || !db)
    return Response.json({ configured, connected: false });
  await ensure(db);
  const row = await db
    .prepare(
      "SELECT provider_email AS email,status FROM calendar_connections WHERE user_email=? AND provider='google'",
    )
    .bind(email)
    .first<{ email: string; status: string }>();
  return Response.json({
    configured: true,
    connected: row?.status === "connected",
    email: row?.email,
  });
}
export async function POST(request: Request) {
  const email = await emailFor(request);
  if (!email) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const values = config();
  if (!Object.values(values).every(Boolean))
    return Response.json(
      { error: "Google Calendar is not configured." },
      { status: 503 },
    );
  const state = await encryptToken(
      JSON.stringify({ email, expires: Date.now() + 10 * 60 * 1000 }),
      values.secret,
    ),
    url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: values.clientId,
    redirect_uri: values.redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope:
      "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/userinfo.email",
    state,
  }).toString();
  return Response.json({ url: url.toString() });
}
export async function DELETE(request: Request) {
  const email = await emailFor(request);
  if (!email) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const db = await getD1();
  if (db) {
    await ensure(db);
    await db
      .prepare(
        "DELETE FROM calendar_connections WHERE user_email=? AND provider='google'",
      )
      .bind(email)
      .run();
  }
  return Response.json({ ok: true });
}
