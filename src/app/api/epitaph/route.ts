import { connection } from "next/server";
import { GEMMA_MODEL, loadPackageFacts, readRootSnapshot, requestEpitaph } from "@/lib/epitaph";

export async function POST(request: Request) {
  await connection();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, code: "bad-request", message: "Send the selected root as JSON." }, { status: 400 });
  }

  const root = readRootSnapshot(body);
  if (!root) {
    return Response.json({ ok: false, code: "bad-request", message: "That package name cannot be read." }, { status: 400 });
  }

  const facts = await loadPackageFacts(root);
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({
      ok: false,
      code: "missing-key",
      model: GEMMA_MODEL,
      facts,
      message: "Set GEMINI_API_KEY so Gemma 4 can write this note.",
    });
  }

  try {
    const epitaph = await requestEpitaph(facts, apiKey);
    return Response.json({ ok: true, model: GEMMA_MODEL, facts, epitaph });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gemma 4 did not answer.";
    return Response.json({ ok: false, code: "model-failed", model: GEMMA_MODEL, facts, message }, { status: 502 });
  }
}
