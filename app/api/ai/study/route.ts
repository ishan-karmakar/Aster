import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/app/supabase";
async function emailFor(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, authorization },
  });
  if (!response.ok) return null;
  return ((await response.json()) as { email?: string }).email || null;
}
export async function POST(request: Request) {
  const email = await emailFor(request);
  if (!email) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json()) as {
      action: "subtasks" | "questions" | "explain";
      title?: string;
      subject?: string;
      details?: string;
    },
    apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey)
    return Response.json(
      { error: "OPENAI_API_KEY is not configured." },
      { status: 503 },
    );
  const instruction =
    body.action === "subtasks"
      ? "Create 3 to 6 concise, ordered, editable work steps with estimated minutes."
      : body.action === "questions"
        ? "Create 5 concise practice questions and short answer keys for review."
        : "Explain the schedule change calmly in two sentences, naming the practical reason and next action.";
  const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.4-mini",
        input: `${instruction}\nSubject: ${body.subject || "General"}\nTask: ${body.title || ""}\nDetails: ${body.details || ""}`,
      }),
    }),
    data = (await response.json()) as {
      output_text?: string;
      output?: Array<{ content?: Array<{ text?: string }> }>;
    };
  if (!response.ok)
    return Response.json(
      { error: "Aster AI is temporarily unavailable." },
      { status: 502 },
    );
  const text =
    data.output_text ||
    data.output
      ?.flatMap((item) => item.content || [])
      .map((item) => item.text || "")
      .join("") ||
    "";
  return Response.json({ text });
}
