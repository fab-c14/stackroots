import { connection } from "next/server";
import { loadPackageWork, type PackageWork } from "@/lib/github-scan";

const CAP = 12;
const NAME = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/i;

export async function POST(request: Request) {
  await connection();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, message: "Send the package names already in this project." }, { status: 400 });
  }

  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const names = Array.isArray(record.names)
    ? record.names.filter((item): item is string => typeof item === "string" && NAME.test(item))
    : [];
  if (names.length === 0) {
    return Response.json({ ok: false, message: "This project has no roots to match." }, { status: 400 });
  }

  const batch = [...new Set(names)].slice(0, CAP);
  const queue = [...batch];
  const packages: PackageWork[] = [];
  let limited = false;
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, () => worker(queue, packages, () => limited, (value) => {
    limited = value;
  })));

  return Response.json({
    ok: true,
    packages,
    skipped: names.length - batch.length,
    limited,
  });
}

async function worker(
  queue: string[],
  packages: PackageWork[],
  isLimited: () => boolean,
  markLimited: (value: boolean) => void,
) {
  for (;;) {
    const name = queue.shift();
    if (!name) return;
    if (isLimited()) {
      packages.push({ name, repo: null, url: null, issues: [], note: "GitHub rate-limited this lookup." });
      continue;
    }
    const found = await loadPackageWork(name, process.env.GITHUB_TOKEN);
    if (found.limited) markLimited(true);
    packages.push({ name: found.name, repo: found.repo, url: found.url, issues: found.issues, note: found.note });
  }
}
