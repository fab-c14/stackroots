import { connection } from "next/server";
import { chooseInstall, loadPackument, readPackageNames, resolveRelease, withBatchMates, type InstalledPackage } from "@/lib/compatibility";

type CheckResult = {
  name: string;
  ok: boolean;
  version?: string;
  issues?: ReturnType<typeof chooseInstall>["issues"];
  install?: string | null;
  message?: string;
};

export async function POST(request: Request) {
  await connection();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, message: "Send the package names and the project roots." }, { status: 400 });
  }

  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const raw = Array.isArray(record.names)
    ? record.names.filter((item): item is string => typeof item === "string").join(" ")
    : typeof record.name === "string"
      ? record.name
      : "";
  const parsed = readPackageNames(raw);
  if (parsed.names.length === 0) {
    return Response.json({ ok: false, message: "Enter one or more npm package names, separated by spaces or commas." }, { status: 400 });
  }

  const installed = Array.isArray(record.installed) ? record.installed.flatMap(readInstalled) : [];
  const projectNode = typeof record.node === "string" ? record.node : null;
  const packs = await Promise.all(parsed.specs.map((spec) => loadPackument(spec.name)));
  const mates = packs.flatMap((pack, index) => {
    const release = resolveRelease(pack.versions, parsed.specs[index]?.version ?? null, pack.latest);
    return release ? [release] : [];
  });
  const results: CheckResult[] = packs.map((pack, index) => {
    const spec = parsed.specs[index];
    if (!spec || pack.versions.length === 0) return { name: pack.name, ok: false, message: pack.message };
    const release = resolveRelease(pack.versions, spec.version, pack.latest);
    const plan = chooseInstall(
      release ? withBatchMates(installed, release, mates) : installed,
      pack.versions,
      projectNode,
      spec.version,
      pack.latest,
    );
    return {
      name: plan.incoming?.name ?? spec.name,
      ok: true,
      version: plan.incoming?.version,
      issues: plan.issues,
      install: plan.install,
    };
  });

  return Response.json({ ok: true, results, rejected: parsed.rejected, extra: parsed.extra });
}

function readInstalled(value: unknown): InstalledPackage[] {
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  if (typeof record.name !== "string") return [];
  return [
    {
      name: record.name,
      requested: typeof record.requested === "string" ? record.requested : null,
      resolved: typeof record.resolved === "string" ? record.resolved : null,
    },
  ];
}
