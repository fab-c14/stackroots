export type RegistryState = "found" | "missing" | "unreachable";

export type PackageFacts = {
  name: string;
  kind: string;
  requested: string | null;
  resolved: string | null;
  range: string;
  pulls: number;
  pullNames: string[];
  description: string | null;
  license: string | null;
  deprecated: string | null;
  published: string | null;
  latest: string | null;
  maintainers: number | null;
  repository: string | null;
  registry: RegistryState;
};

export type RootSnapshot = {
  name: string;
  kind: string;
  requested: string | null;
  resolved: string | null;
  range: string;
  pulls: number;
  pullNames: string[];
};

export const GEMMA_MODEL = "gemma-4-31b-it";

const SYSTEM = "Write the two sentences and nothing else.";

export function factsToPrompt(facts: PackageFacts): string {
  const lines = [
    `package: ${facts.name}`,
    `kind: ${facts.kind}`,
    `range: ${facts.range}`,
    line("asked for", facts.requested),
    line("resolved in this project", facts.resolved),
    `packages it pulls: ${facts.pulls}`,
    facts.pullNames.length > 0 ? `pulls: ${facts.pullNames.join(", ")}` : null,
    `registry: ${facts.registry}`,
    line("description", facts.description),
    line("license", facts.license),
    line("deprecation", facts.deprecated),
    line("latest published version", facts.latest),
    line("latest publish date", facts.published),
    facts.maintainers == null ? null : `maintainers listed: ${facts.maintainers}`,
    line("repository", facts.repository),
  ];
  return lines.filter((item): item is string => Boolean(item)).join("\n");
}

export function readLatestDocument(doc: unknown): {
  description: string | null;
  license: string | null;
  deprecated: string | null;
  latest: string | null;
  maintainers: number | null;
  repository: string | null;
} {
  const record = asRecord(doc);
  if (!record) {
    return {
      description: null,
      license: null,
      deprecated: null,
      latest: null,
      maintainers: null,
      repository: null,
    };
  }
  const licenseRecord = asRecord(record.license);
  const repositoryRecord = asRecord(record.repository);
  const license = typeof record.license === "string" ? record.license : stringOrNull(licenseRecord?.type);
  const repository =
    typeof record.repository === "string" ? record.repository : stringOrNull(repositoryRecord?.url);
  return {
    description: clip(stringOrNull(record.description)),
    license,
    deprecated: stringOrNull(record.deprecated),
    latest: stringOrNull(record.version),
    maintainers: Array.isArray(record.maintainers) ? record.maintainers.length : null,
    repository: repository ? repository.replace(/^git\+/, "").replace(/\.git$/, "") : null,
  };
}

export function readPublishDate(payload: unknown, name: string): string | null {
  const objects = asRecord(payload)?.objects;
  if (!Array.isArray(objects)) return null;
  for (const item of objects) {
    const pkg = asRecord(asRecord(item)?.package);
    if (pkg?.name !== name) continue;
    const date = stringOrNull(pkg.date);
    if (!date) return null;
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString().slice(0, 10);
  }
  return null;
}

export function readGemmaText(payload: unknown): string | null {
  const candidates = asRecord(payload)?.candidates;
  if (!Array.isArray(candidates)) return null;
  const parts = asRecord(asRecord(candidates[0])?.content)?.parts;
  if (!Array.isArray(parts)) return null;
  const chunks: string[] = [];
  for (const part of parts) {
    const text = asRecord(part)?.text;
    if (typeof text === "string") chunks.push(text);
  }
  const text = chunks.join("").trim();
  return text || null;
}

export function readRootSnapshot(body: unknown): RootSnapshot | null {
  const record = asRecord(body);
  const name = stringOrNull(record?.name);
  if (!record || !name || !isPackageName(name)) return null;
  const pullNames = Array.isArray(record.pullNames)
    ? record.pullNames.filter((item): item is string => typeof item === "string" && isPackageName(item)).slice(0, 8)
    : [];
  return {
    name,
    kind: stringOrNull(record.kind) ?? "unspecified",
    requested: stringOrNull(record.requested),
    resolved: stringOrNull(record.resolved),
    range: stringOrNull(record.range) ?? "unspecified",
    pulls: typeof record.pulls === "number" && record.pulls >= 0 ? Math.min(record.pulls, 10000) : pullNames.length,
    pullNames,
  };
}

export async function loadPackageFacts(root: RootSnapshot): Promise<PackageFacts> {
  const empty = {
    ...root,
    description: null,
    license: null,
    deprecated: null,
    published: null,
    latest: null,
    maintainers: null,
    repository: null,
    registry: "unreachable" as RegistryState,
  };
  const encoded = encodeURIComponent(root.name);
  try {
    const [latestResponse, searchResponse] = await Promise.all([
      fetch(`https://registry.npmjs.org/${encoded}/latest`, { cache: "no-store" }),
      fetch(`https://registry.npmjs.org/-/v1/search?text=${encoded}&size=8`, { cache: "no-store" }),
    ]);
    if (latestResponse.status === 404) return { ...empty, registry: "missing" };
    if (!latestResponse.ok) return empty;
    const latest = readLatestDocument(await latestResponse.json());
    const published = searchResponse.ok ? readPublishDate(await searchResponse.json(), root.name) : null;
    return { ...empty, ...latest, published, registry: "found" };
  } catch {
    return empty;
  }
}

export async function requestEpitaph(facts: PackageFacts, apiKey: string): Promise<string> {
  return askGemma(
    apiKey,
    `Example facts:
package: left-pad
deprecation: use padStart
Two sentences: left-pad is deprecated, and the notice says to use padStart. A project that still depends on it should replace that dependency.

Real facts:
${factsToPrompt(facts)}
Two sentences:`,
  );
}

async function askGemma(apiKey: string, prompt: string): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMMA_MODEL}:generateContent`,
    {
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
                text: prompt,
              },
            ],
          },
        ],
        generationConfig: { temperature: 0.2, maxOutputTokens: 700 },
        store: false,
      }),
    },
  );
  const payload = (await response.json()) as unknown;
  if (!response.ok) {
    const message = stringOrNull(asRecord(asRecord(payload)?.error)?.message) ?? "Gemma 4 did not answer.";
    throw new Error(message);
  }
  const text = readGemmaText(payload);
  if (!text) throw new Error("Gemma 4 returned an empty note.");
  const note = finishEpitaph(text);
  if (note.length < 40 || !/[.!?]/.test(note)) throw new Error("Gemma 4 did not finish the note.");
  return note;
}

export function finishEpitaph(text: string): string {
  const quoted = [...text.matchAll(/"([^"]+)"/g)]
    .map((match) => match[1].trim())
    .filter((line) => line.length > 40 && /[.!?]/.test(line) && !/prompt|findings|example|do this/i.test(line));
  const usable = quoted.sort((a, b) => b.length - a.length)[0] ?? text.replace(/\s*\([^)]*(prompt|exactly|findings|example)[^)]*\)/gi, " ");
  const unwrapped = usable.split("\n").flatMap((line) => {
    const cleaned = line
      .trim()
      .replace(/^[-*]\s*/, "")
      .replace(/^(draft\s*\d*|sentence\s*\d*)\s*:\s*/i, "")
      .trim();
    if (!cleaned || /^(input|constraint|goal|target|package name|example)\b/i.test(cleaned)) return [];
    if (/output should|real findings|example findings|two sentences/i.test(cleaned)) return [];
    return [cleaned];
  });
  const withPeriod = unwrapped.filter((line) => /[.!?]/.test(line) && line.length > 40);
  const source = [...withPeriod].sort((a, b) => b.length - a.length)[0] ?? unwrapped.at(-1) ?? text;
  const spaced = source.replace(/`/g, "").replace(/([.!?])(?=[A-Za-z])/g, "$1 ");
  const sentences = spaced
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const unique: string[] = [];
  for (const sentence of sentences) {
    if (unique.some((item) => item.toLowerCase() === sentence.toLowerCase())) continue;
    unique.push(sentence);
  }
  return unique.slice(0, 2).join(" ");
}

function line(label: string, value: string | null): string | null {
  return value ? `${label}: ${value}` : null;
}

function clip(value: string | null): string | null {
  if (!value) return null;
  return value.length > 240 ? `${value.slice(0, 237)}...` : value;
}

function isPackageName(name: string): boolean {
  return /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/i.test(name) && name.length < 220;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return null;
}
