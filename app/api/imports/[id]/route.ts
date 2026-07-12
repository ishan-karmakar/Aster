import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/app/supabase";
import { getD1, getR2 } from "@/db/runtime";
async function emailFor(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, authorization },
  });
  if (!response.ok) return null;
  return ((await response.json()) as { email?: string }).email || null;
}
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const email = await emailFor(request);
  if (!email) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params,
    db = await getD1();
  if (!db) return Response.json({ ok: true });
  const row = await db
    .prepare(
      "SELECT object_key AS objectKey FROM syllabus_imports WHERE id=? AND user_email=?",
    )
    .bind(id, email)
    .first<{ objectKey: string | null }>();
  if (row?.objectKey) {
    const bucket = await getR2();
    if (bucket) await bucket.delete(row.objectKey);
  }
  await db
    .prepare("DELETE FROM syllabus_imports WHERE id=? AND user_email=?")
    .bind(id, email)
    .run();
  return Response.json({ ok: true });
}
