import semver from "semver";

export type InstalledPackage = {
  name: string;
  requested: string | null;
  resolved: string | null;
};

export type IncomingPackage = {
  name: string;
  version: string;
  deprecated: string | null;
  peers: Record<string, string>;
  optionalPeers: string[];
  enginesNode: string | null;
};

export type CompatIssue = {
  level: "error" | "warn";
  message: string;
  solution: string;
};

const PACKAGE_NAME = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/i;
export const CHECK_CAP = 12;

export type PackageSpec = { name: string; version: string | null };

export function readPackageNames(input: string): {
  names: string[];
  specs: PackageSpec[];
  rejected: string[];
  extra: number;
} {
  const parts = input.split(/[\s,]+/).map((part) => part.trim()).filter(Boolean);
  const specs: PackageSpec[] = [];
  const rejected: string[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    const spec = splitSpec(part.replace(/^npm:/, ""));
    if (!spec || !PACKAGE_NAME.test(spec.name)) {
      rejected.push(part);
      continue;
    }
    if (seen.has(spec.name)) continue;
    seen.add(spec.name);
    specs.push(spec);
  }
  const capped = specs.slice(0, CHECK_CAP);
  return { names: capped.map((spec) => spec.name), specs: capped, rejected, extra: Math.max(0, specs.length - CHECK_CAP) };
}

export function withBatchMates(
  installed: InstalledPackage[],
  incoming: IncomingPackage,
  mates: IncomingPackage[],
): InstalledPackage[] {
  const present = new Set(installed.map((item) => item.name));
  const extra = mates
    .filter((mate) => mate.name !== incoming.name && !present.has(mate.name))
    .map((mate) => ({ name: mate.name, requested: mate.version, resolved: mate.version }));
  return extra.length === 0 ? installed : [...installed, ...extra];
}

export function readIncoming(doc: unknown): IncomingPackage | null {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return null;
  const record = doc as Record<string, unknown>;
  if (typeof record.name !== "string" || typeof record.version !== "string") return null;
  const peers = stringMap(record.peerDependencies);
  const meta = record.peerDependenciesMeta;
  const optionalPeers: string[] = [];
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    for (const [name, value] of Object.entries(meta)) {
      if (value && typeof value === "object" && "optional" in value && value.optional === true) optionalPeers.push(name);
    }
  }
  const engines = record.engines;
  const enginesNode =
    engines && typeof engines === "object" && "node" in engines && typeof engines.node === "string" ? engines.node : null;
  return {
    name: record.name,
    version: record.version,
    deprecated: typeof record.deprecated === "string" ? record.deprecated : null,
    peers,
    optionalPeers,
    enginesNode,
  };
}

export function checkCompatibility(
  installed: InstalledPackage[],
  incoming: IncomingPackage,
  projectNode: string | null,
): CompatIssue[] {
  const issues: CompatIssue[] = [];
  const current = installed.find((item) => item.name === incoming.name);

  if (incoming.deprecated) {
    issues.push({
      level: "error",
      message: `${incoming.name} is deprecated. ${incoming.deprecated}`,
      solution: `Do not install ${incoming.name}. ${incoming.deprecated}`,
    });
  }

  if (current) {
    const have = concreteVersion(current);
    if (have && semver.valid(incoming.version) && semver.neq(have, incoming.version)) {
      const level = semver.major(have) === semver.major(incoming.version) ? "warn" : "error";
      issues.push({
        level,
        message: `${incoming.name} is already at ${have}. Installing ${incoming.version} ${level === "error" ? "changes the major version" : "moves the version"}.`,
        solution:
          level === "error"
            ? `Stay on ${have}. Treat ${incoming.version} as its own upgrade, not a drop-in install.`
            : `Installing ${incoming.version} stays on the same major as ${have}.`,
      });
    } else if (have && have === incoming.version) {
      issues.push({
        level: "warn",
        message: `${incoming.name} ${have} is already installed.`,
        solution: `Skip the install. ${have} is already in this project.`,
      });
    }
  }

  for (const [peer, range] of Object.entries(incoming.peers)) {
    const found = installed.find((item) => item.name === peer);
    if (!found) {
      if (!incoming.optionalPeers.includes(peer)) {
        issues.push({
          level: "warn",
          message: `${incoming.name} expects ${peer} ${range}, and this project does not depend on it.`,
          solution: `Install ${peer} at ${range} in the same command, or ${incoming.name} will not resolve.`,
        });
      }
      continue;
    }
    const have = concreteVersion(found);
    if (!have || !semver.validRange(range)) {
      issues.push({
        level: "warn",
        message: `Could not compare ${peer} in this project with the range ${range}.`,
        solution: `Check ${peer} ${range} by hand before installing ${incoming.name}.`,
      });
      continue;
    }
    if (!semver.satisfies(have, range, { includePrerelease: true })) {
      issues.push({
        level: "error",
        message: `${peer} is ${have}. ${incoming.name} wants ${range}.`,
        solution: `Keep ${peer} at ${have}. Do not install ${incoming.name} unless you move ${peer} into ${range}.`,
      });
    }
  }

  if (projectNode && incoming.enginesNode && semver.validRange(projectNode) && semver.validRange(incoming.enginesNode)) {
    if (!semver.intersects(projectNode, incoming.enginesNode)) {
      issues.push({
        level: "error",
        message: `${incoming.name} wants Node ${incoming.enginesNode}. This project says ${projectNode}.`,
        solution: `Use a Node version inside both ${projectNode} and ${incoming.enginesNode}, or pick a release of ${incoming.name} that accepts this project.`,
      });
    }
  }

  return issues;
}

export type InstallPlan = {
  incoming: IncomingPackage | null;
  issues: CompatIssue[];
  install: string | null;
};

export function chooseInstall(
  installed: InstalledPackage[],
  versions: IncomingPackage[],
  projectNode: string | null,
  requested: string | null,
  latest: string | null,
): InstallPlan {
  const name = versions[0]?.name ?? "package";
  const stable = versions.filter((item) => semver.valid(item.version) && semver.prerelease(item.version) === null);
  const pool = stable.length > 0 ? stable : versions.filter((item) => semver.valid(item.version));
  const ordered = [...pool].sort((a, b) => semver.rcompare(a.version, b.version));
  const target = resolveRelease(ordered, requested, latest);
  const reference = target ?? ordered[0] ?? null;
  const fit = reference
    ? ordered.find(
        (item) =>
          !item.deprecated &&
          sameConstraints(item, reference) &&
          !hasError(installed, item, projectNode),
      )
    : null;

  if (!target) {
    const command = fit ? installCommand(fit, installed) : null;
    return {
      incoming: null,
      issues: [
        {
          level: "error",
          message: `${name} ${requested} is not a published release.`,
          solution: fit
            ? `Install ${fit.name}@${fit.version} instead. ${command}`
            : `No published release of ${name} accepts this project. Do not install it.`,
        },
      ],
      install: command,
    };
  }

  const issues = checkCompatibility(installed, target, projectNode);
  if (!hasError(installed, target, projectNode)) {
    return { incoming: target, issues, install: installCommand(target, installed, latest) };
  }

  if (fit && fit.version !== target.version) {
    const command = installCommand(fit, installed);
    const broken = issues.find((issue) => issue.level === "error");
    if (broken) broken.solution = `Install ${fit.name}@${fit.version} instead of ${target.version}. ${command}`;
    return { incoming: target, issues, install: command };
  }

  const broken = issues.find((issue) => issue.level === "error");
  if (broken) {
    broken.solution = `No published release of ${target.name} accepts this project. Do not install it. npm install --legacy-peer-deps would only hide this conflict.`;
  }
  return { incoming: target, issues, install: null };
}

export function resolveRelease(
  versions: IncomingPackage[],
  requested: string | null,
  latest: string | null,
): IncomingPackage | null {
  const ordered = [...versions].filter((item) => semver.valid(item.version)).sort((a, b) => semver.rcompare(a.version, b.version));
  if (!requested) return ordered.find((item) => item.version === latest) ?? ordered[0] ?? null;
  if (semver.valid(requested)) return ordered.find((item) => item.version === requested) ?? null;
  if (semver.validRange(requested)) return ordered.find((item) => semver.satisfies(item.version, requested)) ?? null;
  return null;
}

export async function loadPackument(
  name: string,
): Promise<{ name: string; latest: string | null; versions: IncomingPackage[]; message: string }> {
  try {
    const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {
      headers: { accept: "application/vnd.npm.install-v1+json" },
      cache: "no-store",
    });
    if (response.status === 404) return { name, latest: null, versions: [], message: `${name} is not on the npm registry.` };
    if (!response.ok) return { name, latest: null, versions: [], message: "The npm registry did not return that package." };
    const doc = (await response.json()) as { "dist-tags"?: { latest?: string }; versions?: Record<string, unknown> };
    const versions = Object.values(doc.versions ?? {})
      .map(readIncoming)
      .filter((item): item is IncomingPackage => item !== null);
    const latest = typeof doc["dist-tags"]?.latest === "string" ? doc["dist-tags"].latest : null;
    return { name, latest, versions, message: "" };
  } catch {
    return { name, latest: null, versions: [], message: "The npm registry could not be reached." };
  }
}

function concreteVersion(installed: InstalledPackage): string | null {
  if (installed.resolved && semver.valid(installed.resolved)) return installed.resolved;
  if (!installed.requested) return null;
  return semver.minVersion(installed.requested)?.version ?? null;
}

function splitSpec(part: string): PackageSpec | null {
  if (part.startsWith("@")) {
    const slash = part.indexOf("/");
    if (slash === -1) return null;
    const at = part.indexOf("@", slash + 1);
    if (at === -1) return { name: part, version: null };
    return { name: part.slice(0, at), version: part.slice(at + 1) || null };
  }
  const at = part.indexOf("@");
  if (at === -1) return { name: part, version: null };
  const version = part.slice(at + 1);
  return { name: part.slice(0, at), version: version || null };
}

function hasError(installed: InstalledPackage[], incoming: IncomingPackage, projectNode: string | null): boolean {
  return checkCompatibility(installed, incoming, projectNode).some((issue) => issue.level === "error");
}

function sameConstraints(candidate: IncomingPackage, reference: IncomingPackage): boolean {
  const required = Object.keys(reference.peers).filter((peer) => !reference.optionalPeers.includes(peer));
  if (required.some((peer) => !(peer in candidate.peers))) return false;
  if (reference.enginesNode && !candidate.enginesNode) return false;
  return true;
}

function installCommand(incoming: IncomingPackage, installed: InstalledPackage[], latest: string | null = null): string {
  const peers = Object.entries(incoming.peers).filter(
    ([peer]) => !installed.some((item) => item.name === peer) && !incoming.optionalPeers.includes(peer),
  );
  const own =
    latest && incoming.version === latest && peers.length === 0 ? incoming.name : `${incoming.name}@${incoming.version}`;
  const specs = [own, ...peers.map(([peer, range]) => ( /[\s<>|]/.test(range) ? `${peer}@"${range}"` : `${peer}@${range}`))];
  return `npm install ${specs.join(" ")}`;
}

export async function loadLatest(name: string): Promise<{ name: string; incoming: IncomingPackage | null; message: string }> {
  try {
    const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/latest`, { cache: "no-store" });
    if (response.status === 404) return { name, incoming: null, message: `${name} is not on the npm registry.` };
    if (!response.ok) return { name, incoming: null, message: "The npm registry did not return that package." };
    const incoming = readIncoming(await response.json());
    if (!incoming) return { name, incoming: null, message: "The registry record could not be read." };
    return { name, incoming, message: "" };
  } catch {
    return { name, incoming: null, message: "The npm registry could not be reached." };
  }
}

function stringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const map: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") map[key] = item;
  }
  return map;
}
