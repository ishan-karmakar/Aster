import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/app/supabase";
/* eslint-disable prefer-const -- planner state is mutated through nested collections during conflict reconciliation. */
import { getD1 } from "@/db/runtime";
import { decryptToken } from "@/lib/secure-token";
import { readPlannerState, writePlannerState } from "@/lib/planner-store";
type GoogleEvent = {
  id: string;
  status?: string;
  summary?: string;
  updated?: string;
  start?: { dateTime?: string };
  end?: { dateTime?: string };
  extendedProperties?: { private?: Record<string, string> };
};
type Link = {
  sessionId: string;
  eventId: string;
  eventUpdated: string;
  sessionUpdated: string;
};
async function emailFor(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, authorization },
  });
  if (!response.ok) return null;
  return ((await response.json()) as { email?: string }).email || null;
}
async function accessToken(refreshToken: string) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    }),
    data = (await response.json()) as { access_token?: string };
  if (!response.ok || !data.access_token)
    throw new Error("Google authorization expired. Reconnect your account.");
  return data.access_token;
}
async function google(url: string, token: string, init?: RequestInit) {
  return fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init?.headers || {}),
    },
  });
}
async function ensure(db: D1Database) {
  await db.batch([
    db.prepare(
      "CREATE TABLE IF NOT EXISTS calendar_connections (user_email TEXT PRIMARY KEY NOT NULL, provider TEXT NOT NULL, refresh_token TEXT NOT NULL, calendar_id TEXT, provider_email TEXT, sync_token TEXT, status TEXT NOT NULL DEFAULT 'connected', updated_at INTEGER NOT NULL DEFAULT (unixepoch()))",
    ),
    db.prepare(
      "CREATE TABLE IF NOT EXISTS calendar_event_links (user_email TEXT NOT NULL, session_id TEXT NOT NULL, event_id TEXT NOT NULL, event_updated TEXT, session_updated TEXT, PRIMARY KEY(user_email,session_id))",
    ),
  ]);
}
export async function POST(request: Request) {
  const email = await emailFor(request);
  if (!email) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const db = await getD1(),
    secret = process.env.TOKEN_ENCRYPTION_KEY || "";
  if (!db || !secret)
    return Response.json(
      { error: "Google Calendar is not configured." },
      { status: 503 },
    );
  await ensure(db);
  const connection = await db
    .prepare(
      "SELECT refresh_token AS refreshToken,calendar_id AS calendarId FROM calendar_connections WHERE user_email=? AND provider='google' AND status IN ('connected','error')",
    )
    .bind(email)
    .first<{ refreshToken: string; calendarId: string }>();
  if (!connection)
    return Response.json(
      { error: "Connect Google Calendar first." },
      { status: 409 },
    );
  try {
    const token = await accessToken(
        await decryptToken(connection.refreshToken, secret),
      ),
      calendarId = encodeURIComponent(connection.calendarId || "primary"),
      timeMin = new Date(Date.now() - 30 * 86400000).toISOString(),
      timeMax = new Date(Date.now() + 90 * 86400000).toISOString();
    let state = await readPlannerState(email);
    const linkResult = await db
        .prepare(
          "SELECT session_id AS sessionId,event_id AS eventId,event_updated AS eventUpdated,session_updated AS sessionUpdated FROM calendar_event_links WHERE user_email=?",
        )
        .bind(email)
        .all<Link>(),
      links = new Map(linkResult.results.map((item) => [item.sessionId, item])),
      eventResponse = await google(
        `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?singleEvents=true&showDeleted=true&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&maxResults=2500`,
        token,
      ),
      eventData = (await eventResponse.json()) as { items?: GoogleEvent[] },
      events = new Map((eventData.items || []).map((item) => [item.id, item]));
    for (const link of linkResult.results) {
      const event = events.get(link.eventId),
        session = state.sessions.find((item) => item.id === link.sessionId);
      if (!session) continue;
      if (!event || event.status === "cancelled") {
        if ((event?.updated || "") >= (session.updatedAt || ""))
          state.sessions = state.sessions.map((item) =>
            item.id === session.id
              ? {
                  ...item,
                  status: "skipped",
                  updatedAt: event?.updated || new Date().toISOString(),
                }
              : item,
          );
        continue;
      }
      const googleChanged = (event.updated || "") > (link.eventUpdated || ""),
        asterChanged = session.updatedAt > (link.sessionUpdated || "");
      if (
        googleChanged &&
        (!asterChanged || (event.updated || "") > session.updatedAt) &&
        event.start?.dateTime &&
        event.end?.dateTime
      )
        state.sessions = state.sessions.map((item) =>
          item.id === session.id
            ? {
                ...item,
                start: event.start!.dateTime!,
                end: event.end!.dateTime!,
                updatedAt: event.updated!,
              }
            : item,
        );
    }
    for (const session of state.sessions) {
      let link = links.get(session.id);
      if (session.status !== "planned") {
        if (link) {
          await google(
            `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(link.eventId)}`,
            token,
            { method: "DELETE" },
          );
          await db
            .prepare(
              "DELETE FROM calendar_event_links WHERE user_email=? AND session_id=?",
            )
            .bind(email, session.id)
            .run();
        }
        continue;
      }
      const body = {
        summary: `${session.subject}: ${session.title}`,
        description: `Aster study session${session.trigger ? `\nPlan: ${session.trigger}` : ""}${session.location ? `\nLocation: ${session.location}` : ""}`,
        start: {
          dateTime: session.start,
          timeZone: state.preferences.timezone,
        },
        end: { dateTime: session.end, timeZone: state.preferences.timezone },
        extendedProperties: { private: { asterSessionId: session.id } },
      };
      if (!link) {
        const response = await google(
            `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,
            token,
            { method: "POST", body: JSON.stringify(body) },
          ),
          created = (await response.json()) as GoogleEvent;
        if (response.ok) {
          link = {
            sessionId: session.id,
            eventId: created.id,
            eventUpdated: created.updated || "",
            sessionUpdated: session.updatedAt,
          };
          links.set(session.id, link);
          await db
            .prepare(
              "INSERT INTO calendar_event_links (user_email,session_id,event_id,event_updated,session_updated) VALUES (?,?,?,?,?)",
            )
            .bind(
              email,
              session.id,
              created.id,
              created.updated || "",
              session.updatedAt,
            )
            .run();
        }
      } else {
        const event = events.get(link.eventId);
        if (session.updatedAt > (event?.updated || link.eventUpdated || "")) {
          const response = await google(
              `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(link.eventId)}`,
              token,
              { method: "PATCH", body: JSON.stringify(body) },
            ),
            updated = (await response.json()) as GoogleEvent;
          if (response.ok)
            await db
              .prepare(
                "UPDATE calendar_event_links SET event_updated=?,session_updated=? WHERE user_email=? AND session_id=?",
              )
              .bind(updated.updated || "", session.updatedAt, email, session.id)
              .run();
        } else
          await db
            .prepare(
              "UPDATE calendar_event_links SET event_updated=?,session_updated=? WHERE user_email=? AND session_id=?",
            )
            .bind(
              event?.updated || link.eventUpdated,
              session.updatedAt,
              email,
              session.id,
            )
            .run();
      }
    }
    const busyResponse = await google(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&maxResults=2500`,
        token,
      ),
      busyData = (await busyResponse.json()) as { items?: GoogleEvent[] },
      exceptions = (busyData.items || [])
        .filter(
          (event) =>
            event.status !== "cancelled" &&
            event.start?.dateTime &&
            event.end?.dateTime &&
            !event.extendedProperties?.private?.asterSessionId,
        )
        .map((event) => ({
          id: `google-${event.id}`,
          title: event.summary || "Google Calendar",
          start: event.start!.dateTime!,
          end: event.end!.dateTime!,
          source: "google" as const,
        }));
    state.preferences.exceptions = [
      ...(state.preferences.exceptions || []).filter(
        (item) => item.source !== "google",
      ),
      ...exceptions,
    ];
    await writePlannerState(email, state);
    await db
      .prepare(
        "UPDATE calendar_connections SET updated_at=unixepoch(),status='connected' WHERE user_email=?",
      )
      .bind(email)
      .run();
    return Response.json({
      ok: true,
      sessions: state.sessions.length,
      busy: exceptions.length,
    });
  } catch (error) {
    await db
      .prepare(
        "UPDATE calendar_connections SET status='error',updated_at=unixepoch() WHERE user_email=?",
      )
      .bind(email)
      .run();
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Calendar sync failed.",
      },
      { status: 502 },
    );
  }
}
