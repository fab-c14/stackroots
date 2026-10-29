import { parse as parseYaml } from "yaml";

export type DepKind = "runtime" | "dev" | "optional" | "peer" | "unspecified";

export type DirectDep = {
  name: string;
  requested: string | null;
  resolved: string | null;
  kind: DepKind;
};

export type GraphEdge = {
  from: string;
  to: string;
  requested: string | null;
};

export type SourceKind = "package.json" | "package-lock.json" | "pnpm-lock.yaml" | "yarn.lock";

export type ManifestGraph = {
  rootName: string | null;
  enginesNode: string | null;
  direct: DirectDep[];
  edges: GraphEdge[];
  sources: SourceKind[];
};

export type ParseIssue = {
  code: "empty" | "unreadable" | "yarn-needs-manifest";
  message: string;
  resolvedCount?: number;
};

export type ParseResult =
  | { ok: true; graph: ManifestGraph; notices: string[] }
  | { ok: false; issue: ParseIssue };

export type ManifestFile = {
  name: string;
  text: string;
};

type JsonRecord = Record<string, unknown>;

type YarnEntry = {
  selectors: string[];
  version: string;
  dependencies: Array<{ to: string; requested: string }>;
};

const KIND_RANK: Record<DepKind, number> = {
  runtime: 0,
  optional: 1,
  dev: 2,
  peer: 3,
  unspecified: 4,
};

const SOURCE_ORDER: SourceKind[] = [
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
];

const LOCKFILE_NOTICE =
  "Read from the lockfile root. A package.json would add the ranges you wrote.";

const EMPTY_MANIFEST_NOTICE = "This manifest declares no dependencies.";

export function parseManifests(files: ManifestFile[]): ParseResult {
  const usable = files.filter((file) => file.text.replace(/^\uFEFF/, "").trim() !== "");
  if (files.length === 0 || usable.length === 0) {
    return { ok: false, issue: { code: "empty", message: "This file is empty." } };
  }

  let packageJson: JsonRecord | null = null;
  let npmLock: JsonRecord | null = null;
  let pnpmLock: JsonRecord | null = null;
  let yarnEntries: YarnEntry[] | null = null;
  let sawBad = false;

  for (const file of usable) {
    const loaded = loadFile(file);
    if (loaded.kind === "bad") {
      sawBad = true;
      continue;
    }
    if (loaded.kind === "package.json") packageJson = loaded.data;
    if (loaded.kind === "package-lock.json") npmLock = loaded.data;
    if (loaded.kind === "pnpm-lock.yaml") pnpmLock = loaded.data;
    if (loaded.kind === "yarn.lock") yarnEntries = loaded.entries;
  }

  if (!packageJson && !npmLock && !pnpmLock && yarnEntries) {
    return {
      ok: false,
      issue: {
        code: "yarn-needs-manifest",
        resolvedCount: yarnEntries.length,
        message: `This Yarn lockfile resolves ${yarnEntries.length} packages and does not name the direct roots. Add the package.json from the same project.`,
      },
    };
  }

  if (!packageJson && !npmLock && !pnpmLock) {
    return {
      ok: false,
      issue: {
        code: "unreadable",
        message: "This is not a package.json or a lockfile Stackroots can read.",
      },
    };
  }

  const resolutions = new Map<string, string>();
  const edges: GraphEdge[] = [];
  const sources = new Set<SourceKind>();
  let rootName: string | null = null;
  let enginesNode: string | null = null;
  let directs: DirectDep[] = [];
  let fromLockfile = false;

  if (packageJson) {
    sources.add("package.json");
    rootName = typeof packageJson.name === "string" ? packageJson.name : null;
    const engines = asRecord(packageJson.engines);
    enginesNode = typeof engines?.node === "string" ? engines.node : null;
    directs = directsFromPackageJson(packageJson);
  }

  if (npmLock) {
    sources.add("package-lock.json");
    const fromNpm = readNpmLock(npmLock);
    if (!rootName) rootName = fromNpm.rootName;
    mergeResolutions(resolutions, fromNpm.resolutions);
    pushEdges(edges, fromNpm.edges);
    if (!packageJson) {
      directs = fromNpm.direct;
      fromLockfile = true;
    }
  }

  if (pnpmLock) {
    sources.add("pnpm-lock.yaml");
    const fromPnpm = readPnpmLock(pnpmLock);
    mergeResolutions(resolutions, fromPnpm.resolutions);
    pushEdges(edges, fromPnpm.edges);
    if (!packageJson && !npmLock) {
      directs = fromPnpm.direct;
      fromLockfile = true;
    }
  }

  if (yarnEntries) {
    sources.add("yarn.lock");
    mergeResolutions(resolutions, resolutionsFromYarn(yarnEntries));
    pushEdges(edges, edgesFromYarn(yarnEntries));
  }

  directs = directs.map((dep) => ({
    ...dep,
    resolved: dep.resolved ?? resolvedFor(dep, resolutions),
  }));

  for (const dep of directs) {
    pushEdges(edges, [{ from: "root", to: dep.name, requested: dep.requested }]);
  }

  const notices: string[] = [];
  if (fromLockfile) notices.push(LOCKFILE_NOTICE);
  if (packageJson && directs.length === 0) notices.push(EMPTY_MANIFEST_NOTICE);
  if (sawBad) notices.push("A file was skipped because it is not a package.json or a lockfile.");

  return {
    ok: true,
    notices,
    graph: {
      rootName,
      enginesNode,
      direct: sortDirects(directs),
      edges,
      sources: SOURCE_ORDER.filter((source) => sources.has(source)),
    },
  };
}

function loadFile(
  file: ManifestFile,
):
  | { kind: "package.json"; data: JsonRecord }
  | { kind: "package-lock.json"; data: JsonRecord }
  | { kind: "pnpm-lock.yaml"; data: JsonRecord }
  | { kind: "yarn.lock"; entries: YarnEntry[] }
  | { kind: "bad" } {
  const text = file.text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const base = file.name.split(/[/\\]/).pop()?.toLowerCase() ?? "";

  if (base === "package.json") {
    const data = parseJsonObject(text);
    return data ? { kind: "package.json", data } : { kind: "bad" };
  }
  if (base === "package-lock.json" || base === "npm-shrinkwrap.json") {
    const data = parseJsonObject(text);
    return data ? { kind: "package-lock.json", data } : { kind: "bad" };
  }
  if (base === "pnpm-lock.yaml" || base === "pnpm-lock.yml") {
    const data = parseYamlObject(text);
    return data ? { kind: "pnpm-lock.yaml", data } : { kind: "bad" };
  }
  if (base === "yarn.lock") {
    const entries = loadYarn(text);
    return entries ? { kind: "yarn.lock", entries } : { kind: "bad" };
  }

  const json = parseJsonObject(text);
  if (json) {
    const classified = classifyJson(json);
    if (classified === "package.json") return { kind: "package.json", data: json };
    if (classified === "package-lock.json") return { kind: "package-lock.json", data: json };
  }

  if (text.includes("__metadata") || text.includes("yarn lockfile")) {
    const entries = loadYarn(text);
    if (entries && entries.length > 0) return { kind: "yarn.lock", entries };
  }

  if (text.includes("lockfileVersion") || text.includes("importers:")) {
    const data = parseYamlObject(text);
    if (data && ("importers" in data || "specifiers" in data || "dependencies" in data)) {
      return { kind: "pnpm-lock.yaml", data };
    }
  }

  return { kind: "bad" };
}

function classifyJson(data: JsonRecord): "package.json" | "package-lock.json" | null {
  if ("lockfileVersion" in data || "packages" in data) return "package-lock.json";
  const deps = asRecord(data.dependencies);
  if (deps) {
    const first = Object.values(deps)[0];
    if (first && typeof first === "object") return "package-lock.json";
  }
  if (
    "dependencies" in data ||
    "devDependencies" in data ||
    "optionalDependencies" in data ||
    "peerDependencies" in data ||
    typeof data.name === "string" ||
    "private" in data
  ) {
    return "package.json";
  }
  return null;
}

function directsFromPackageJson(data: JsonRecord): DirectDep[] {
  const groups: Array<[DepKind, unknown]> = [
    ["runtime", data.dependencies],
    ["optional", data.optionalDependencies],
    ["dev", data.devDependencies],
    ["peer", data.peerDependencies],
  ];
  const seen = new Set<string>();
  const direct: DirectDep[] = [];
  for (const [kind, value] of groups) {
    for (const dep of readStringMap(value)) {
      if (seen.has(dep.name)) continue;
      seen.add(dep.name);
      direct.push({ name: dep.name, requested: dep.requested, resolved: null, kind });
    }
  }
  return direct;
}

function readNpmLock(data: JsonRecord): {
  rootName: string | null;
  direct: DirectDep[];
  resolutions: Map<string, string>;
  edges: GraphEdge[];
} {
  const packages = asRecord(data.packages);
  if (packages) {
    const root = asRecord(packages[""]);
    const direct = root
      ? directsFromPackageJson(root)
      : [];
    const resolutions = new Map<string, string>();
    const edges: GraphEdge[] = [];
    for (const [path, value] of Object.entries(packages)) {
      const info = asRecord(value);
      if (!info) continue;
      const from = packageNameFromNodeModules(path);
      if (!from) continue;
      if (from !== "root" && typeof info.version === "string" && path === `node_modules/${from}`) {
        resolutions.set(from, info.version);
      }
      if (from !== "root") {
        pushEdges(edges, edgesFromDepFields(from, info));
      }
    }
    for (const dep of direct) {
      const resolved = resolutions.get(dep.name);
      if (resolved) dep.resolved = resolved;
    }
    return {
      rootName: root && typeof root.name === "string" ? root.name : null,
      direct,
      resolutions,
      edges,
    };
  }

  const dependencies = asRecord(data.dependencies) ?? {};
  const direct: DirectDep[] = [];
  const resolutions = new Map<string, string>();
  const edges: GraphEdge[] = [];
  for (const [name, value] of Object.entries(dependencies)) {
    const info = asRecord(value);
    const version = info && (typeof info.version === "string" ? info.version : null);
    direct.push({ name, requested: null, resolved: version, kind: "unspecified" });
    if (version) resolutions.set(name, version);
    const requires = info ? asRecord(info.requires) : null;
    if (requires) {
      for (const [to, requested] of Object.entries(requires)) {
        if (typeof requested === "string") edges.push({ from: name, to, requested });
      }
    }
  }
  return { rootName: null, direct, resolutions, edges };
}

function readPnpmLock(data: JsonRecord): {
  direct: DirectDep[];
  resolutions: Map<string, string>;
  edges: GraphEdge[];
} {
  const specifiers = asRecord(data.specifiers);
  const importer = pnpmRootImporter(data) ?? data;
  const direct = [
    ...readPnpmBlock(importer.dependencies, "runtime", specifiers),
    ...readPnpmBlock(importer.optionalDependencies, "optional", specifiers),
    ...readPnpmBlock(importer.devDependencies, "dev", specifiers),
    ...readPnpmBlock(importer.peerDependencies, "peer", specifiers),
  ];
  const deduped = dedupeDirects(direct);
  const resolutions = new Map(deduped.flatMap((dep) => (dep.resolved ? [[dep.name, dep.resolved] as const] : [])));
  const edges: GraphEdge[] = [];
  const packages = asRecord(data.packages) ?? {};
  for (const [key, value] of Object.entries(packages)) {
    const info = asRecord(value);
    if (!info) continue;
    pushEdges(edges, edgesFromDepFields(nameBeforeVersion(key), info));
  }
  return { direct: deduped, resolutions, edges };
}

function pnpmRootImporter(data: JsonRecord): JsonRecord | null {
  const importers = asRecord(data.importers);
  if (!importers) return null;
  return asRecord(importers["."]) ?? asRecord(Object.values(importers)[0]) ?? null;
}

function readPnpmBlock(value: unknown, kind: DepKind, specifiers: JsonRecord | null): DirectDep[] {
  const block = asRecord(value);
  if (!block) return [];
  const direct: DirectDep[] = [];
  for (const [name, raw] of Object.entries(block)) {
    if (typeof raw === "string" || typeof raw === "number") {
      const requested = specifiers && typeof specifiers[name] === "string" ? specifiers[name] : null;
      direct.push({
        name,
        requested,
        resolved: stripPnpmVersion(String(raw)),
        kind,
      });
      continue;
    }
    const info = asRecord(raw);
    if (!info) continue;
    const requested = typeof info.specifier === "string" ? info.specifier : null;
    const resolved =
      typeof info.version === "string" || typeof info.version === "number"
        ? stripPnpmVersion(String(info.version))
        : null;
    direct.push({ name, requested, resolved, kind });
  }
  return direct;
}

function loadYarn(text: string): YarnEntry[] | null {
  if (text.includes("__metadata")) {
    const data = parseYamlObject(text);
    if (!data) return null;
    return yarnEntriesFromBerry(data);
  }
  return yarnEntriesFromClassic(text);
}

function yarnEntriesFromBerry(data: JsonRecord): YarnEntry[] {
  const entries: YarnEntry[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (key === "__metadata") continue;
    const info = asRecord(value);
    if (!info || info.version == null) continue;
    entries.push({
      selectors: key.split(",").map((part) => part.trim().replace(/^"|"$/g, "")),
      version: String(info.version),
      dependencies: depList(info),
    });
  }
  return entries;
}

function yarnEntriesFromClassic(text: string): YarnEntry[] {
  const withoutComments = text
    .split("\n")
    .filter((line) => !line.startsWith("#"))
    .join("\n");
  const entries: YarnEntry[] = [];
  for (const stanza of withoutComments.split(/\n\s*\n/)) {
    const lines = stanza.split("\n").filter((line) => line.trim() !== "");
    if (lines.length === 0) continue;
    const selectors: string[] = [];
    let version: string | null = null;
    let inDeps = false;
    const dependencies: Array<{ to: string; requested: string }> = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === "dependencies:" || trimmed === "optionalDependencies:" || trimmed === "peerDependencies:") {
        inDeps = true;
        continue;
      }
      if (inDeps) {
        if (line.startsWith("    ")) {
          const match = line.trim().match(/^(?:"([^"]+)"|(\S+))\s+"([^"]+)"$/);
          const to = match?.[1] ?? match?.[2];
          const requested = match?.[3];
          if (to && requested) dependencies.push({ to, requested });
          continue;
        }
        inDeps = false;
      }
      const versionMatch = line.match(/^\s*version\s+"([^"]+)"\s*$/);
      if (versionMatch) {
        version = versionMatch[1] ?? null;
        continue;
      }
      if (!line.startsWith(" ") && trimmed.endsWith(":")) {
        selectors.push(
          ...trimmed
            .slice(0, -1)
            .split(",")
            .map((part) => part.trim().replace(/^"|"$/g, ""))
            .filter(Boolean),
        );
      }
    }
    if (selectors.length > 0 && version) entries.push({ selectors, version, dependencies });
  }
  return entries;
}

function resolutionsFromYarn(entries: YarnEntry[]): Map<string, string> {
  const resolutions = new Map<string, string>();
  for (const entry of entries) {
    for (const selector of entry.selectors) {
      const { name, range } = splitDescriptor(selector);
      if (!resolutions.has(`${name}\0${range}`)) resolutions.set(`${name}\0${range}`, entry.version);
    }
  }
  return resolutions;
}

function edgesFromYarn(entries: YarnEntry[]): GraphEdge[] {
  const edges: GraphEdge[] = [];
  for (const entry of entries) {
    const from = splitDescriptor(entry.selectors[0] ?? "").name;
    if (!from) continue;
    for (const dep of entry.dependencies) edges.push({ from, to: dep.to, requested: dep.requested });
  }
  return edges;
}

function resolvedFor(dep: DirectDep, resolutions: Map<string, string>): string | null {
  if (dep.requested) {
    const exact =
      resolutions.get(`${dep.name}\0${dep.requested}`) ??
      resolutions.get(`${dep.name}\0npm:${dep.requested}`);
    if (exact) return exact;
  }
  return resolutions.get(dep.name) ?? null;
}

function mergeResolutions(target: Map<string, string>, extra: Map<string, string>) {
  for (const [key, version] of extra) {
    if (key.includes("\0")) {
      const name = key.split("\0")[0] ?? "";
      const range = key.split("\0")[1] ?? "";
      target.set(`${name}\0${range}`, version);
      if (!target.has(name)) target.set(name, version);
      continue;
    }
    if (!target.has(key)) target.set(key, version);
  }
}

function edgesFromDepFields(from: string, info: JsonRecord): GraphEdge[] {
  const edges: GraphEdge[] = [];
  for (const field of ["dependencies", "optionalDependencies", "peerDependencies"] as const) {
    const deps = asRecord(info[field]);
    if (!deps) continue;
    for (const [to, requested] of Object.entries(deps)) {
      if (typeof requested === "string" || typeof requested === "number") {
        edges.push({ from, to, requested: String(requested) });
      }
    }
  }
  return edges;
}

function depList(info: JsonRecord): Array<{ to: string; requested: string }> {
  return edgesFromDepFields("", info)
    .filter((edge) => edge.from === "")
    .map((edge) => ({ to: edge.to, requested: edge.requested ?? "" }));
}

function splitDescriptor(selector: string): { name: string; range: string } {
  const trimmed = selector.trim().replace(/^"|"$/g, "");
  const at = trimmed.startsWith("@") ? trimmed.indexOf("@", 1) : trimmed.indexOf("@");
  if (at === -1) return { name: trimmed, range: "" };
  return { name: trimmed.slice(0, at), range: trimmed.slice(at + 1) };
}

function nameBeforeVersion(key: string): string {
  return splitDescriptor(key).name;
}

function packageNameFromNodeModules(path: string): string | null {
  if (path === "") return "root";
  const marker = "node_modules/";
  const index = path.lastIndexOf(marker);
  if (index === -1) return null;
  return path.slice(index + marker.length);
}

function stripPnpmVersion(version: string): string {
  const paren = version.indexOf("(");
  return (paren === -1 ? version : version.slice(0, paren)).trim();
}

function readStringMap(value: unknown): Array<{ name: string; requested: string }> {
  const record = asRecord(value);
  if (!record) return [];
  const deps: Array<{ name: string; requested: string }> = [];
  for (const [name, requested] of Object.entries(record)) {
    if (typeof requested === "string") deps.push({ name, requested });
  }
  return deps;
}

function dedupeDirects(direct: DirectDep[]): DirectDep[] {
  const seen = new Set<string>();
  const result: DirectDep[] = [];
  for (const dep of direct) {
    if (seen.has(dep.name)) continue;
    seen.add(dep.name);
    result.push(dep);
  }
  return result;
}

function sortDirects(direct: DirectDep[]): DirectDep[] {
  return [...direct].sort(
    (a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || a.name.localeCompare(b.name),
  );
}

function pushEdges(target: GraphEdge[], extra: GraphEdge[]) {
  const seen = new Set(target.map((edge) => `${edge.from}\0${edge.to}\0${edge.requested ?? ""}`));
  for (const edge of extra) {
    const key = `${edge.from}\0${edge.to}\0${edge.requested ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    target.push(edge);
  }
}

function parseJsonObject(text: string): JsonRecord | null {
  try {
    return asRecord(JSON.parse(text));
  } catch {
    return null;
  }
}

function parseYamlObject(text: string): JsonRecord | null {
  try {
    return asRecord(parseYaml(text));
  } catch {
    return null;
  }
}

function asRecord(value: unknown): JsonRecord | null {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as JsonRecord;
  return null;
}
