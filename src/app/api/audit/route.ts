import { connection } from "next/server";
import semver from "semver";
import { loadLatest } from "@/lib/compatibility";

const CAP = 40;
const NAME = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/i;

type Asked = { name: string; resolved: string | null };

type Note = {
  name: string;
  latest: string | null;
  level: "ok" | "warn" | "error";
  label: string;
  message: string;
  solution: string;
};

export async function POST(request: Request) {
  await connection();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, message: "Send the roots to scan." }, { status: 400 });
  }

  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const asked = Array.isArray(record.packages) ? record.packages.flatMap(readAsked) : [];
  if (asked.length === 0) {
    return Response.json({ ok: false, message: "This project has no roots to scan." }, { status: 400 });
  }

  const batch = asked.slice(0, CAP);
  const queue = [...batch];
  const notes: Note[] = [];
  await Promise.all(Array.from({ length: Math.min(6, queue.length) }, () => worker(queue, notes)));

  return Response.json({ ok: true, notes, skipped: asked.length - batch.length });
}

async function worker(queue: Asked[], notes: Note[]) {
  for (;;) {
    const item = queue.shift();
    if (!item) return;
    notes.push(await readNote(item));
  }
}

async function readNote(item: Asked): Promise<Note> {
  const loaded = await loadLatest(item.name);
  if (!loaded.incoming) {
    if (loaded.message.includes("not on the npm registry")) {
      return {
        name: item.name,
        latest: null,
        level: "warn",
        label: "Missing",
        message: loaded.message,
        solution: `Check the spelling. ${item.name} is not a package you can install from npm.`,
      };
    }
    return { ...unread(item.name), message: loaded.message };
  }
  const incoming = loaded.incoming;
  if (incoming.deprecated) {
    return {
      name: item.name,
      latest: incoming.version,
      level: "error",
      label: "Deprecated",
      message: `${item.name} is deprecated. ${incoming.deprecated}`,
      solution: `Remove ${item.name} when you can. Do not install it again.`,
    };
  }
  if (item.resolved && semver.valid(item.resolved) && semver.valid(incoming.version)) {
    const behind = semver.major(incoming.version) - semver.major(item.resolved);
    if (behind > 0) {
      return {
        name: item.name,
        latest: incoming.version,
        level: "warn",
        label: "Behind",
        message: `Resolved ${item.resolved}. Latest is ${incoming.version}.`,
        solution: `Staying on ${item.resolved} is valid. ${incoming.version} is a newer major, so read its changelog before you upgrade.`,
      };
    }
    if (behind < 0) {
      return {
        name: item.name,
        latest: incoming.version,
        level: "warn",
        label: "Ahead",
        message: `Resolved ${item.resolved}, ahead of latest ${incoming.version}.`,
        solution: `Confirm ${item.resolved} is the version you meant. The registry latest is ${incoming.version}.`,
      };
    }
  }
  return {
    name: item.name,
    latest: incoming.version,
    level: "ok",
    label: "Current",
    message: `Latest is ${incoming.version}.`,
    solution: "",
  };
}

function unread(name: string): Note {
  return {
    name,
    latest: null,
    level: "warn",
    label: "Unread",
    message: "The npm registry did not return this package.",
    solution: "Run the scan again when the registry answers.",
  };
}

function readAsked(value: unknown): Asked[] {
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  if (typeof record.name !== "string" || !NAME.test(record.name)) return [];
  return [{ name: record.name, resolved: typeof record.resolved === "string" ? record.resolved : null }];
}
