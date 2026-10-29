import { finishEpitaph, GEMMA_MODEL, readGemmaText } from "./epitaph";

const SYSTEM = "Write the two sentences and nothing else.";

export async function requestFix(notes: string[], apiKey: string): Promise<string> {
  const findings = notes.map((note) => note.trim()).filter(Boolean).slice(0, 16).join("\n");
  if (!findings) throw new Error("There is nothing to explain.");
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMMA_MODEL}:generateContent`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": apiKey,
    },
    cache: "no-store",
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Write two sentences the developer can act on. Use only the findings below the line.

Findings:
left-pad is deprecated. use padStart.
Do this: Do not install left-pad.
Answer: Do not install left-pad. It is deprecated, and the notice says to use padStart.

Findings:
${findings}
Answer:`,
            },
          ],
        },
      ],
      generationConfig: { temperature: 0.2, maxOutputTokens: 700 },
      store: false,
    }),
  });
  const payload = (await response.json()) as unknown;
  if (!response.ok) {
    const record = payload && typeof payload === "object" ? (payload as { error?: { message?: string } }) : {};
    throw new Error(record.error?.message || "Gemma 4 did not answer.");
  }
  const text = readGemmaText(payload);
  if (!text) throw new Error("Gemma 4 returned an empty note.");
  const note = finishEpitaph(text);
  if (note.length < 40 || !/[.!?]/.test(note)) throw new Error("Gemma 4 did not finish the note.");
  return note;
}
