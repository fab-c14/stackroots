import { connection } from "next/server";
import { GEMMA_MODEL } from "@/lib/epitaph";
import { requestFix } from "@/lib/gemma-fix";

export async function POST(request: Request) {
  await connection();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, message: "Send the findings for Gemma 4." }, { status: 400 });
  }

  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const notes = Array.isArray(record.notes)
    ? record.notes.filter((item): item is string => typeof item === "string").map((item) => item.slice(0, 400)).slice(0, 16)
    : [];
  if (notes.length === 0) {
    return Response.json({ ok: false, message: "There is nothing for Gemma 4 to explain." }, { status: 400 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({
      ok: false,
      code: "missing-key",
      model: GEMMA_MODEL,
      message: "Set GEMINI_API_KEY so Gemma 4 can write the fix.",
    });
  }

  try {
    const fix = await requestFix(notes, apiKey);
    return Response.json({ ok: true, model: GEMMA_MODEL, fix });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gemma 4 did not answer.";
    return Response.json({ ok: false, code: "model-failed", model: GEMMA_MODEL, message }, { status: 502 });
  }
}
