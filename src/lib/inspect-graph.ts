import type { DepKind, ManifestGraph } from "./parse-manifest";

export type RangeClass =
  | "pinned"
  | "caret"
  | "tilde"
  | "range"
  | "any"
  | "workspace"
  | "file"
  | "git"
  | "unspecified";

export type Pull = {
  name: string;
  requested: string | null;
  alsoRoot: boolean;
};

export type RootView = {
  name: string;
  kind: DepKind;
  requested: string | null;
  resolved: string | null;
  range: RangeClass;
  pulls: Pull[];
};

export type GraphSummary = {
  direct: number;
  byKind: Record<DepKind, number>;
  byRange: Record<RangeClass, number>;
  resolved: number;
  unresolved: number;
  folded: number;
  pullsKnown: boolean;
};

export type GraphView = {
  summary: GraphSummary;
  roots: RootView[];
};

const RANGE_ORDER: RangeClass[] = [
  "pinned",
  "caret",
  "tilde",
  "range",
  "any",
  "workspace",
  "file",
  "git",
  "unspecified",
];

const KIND_ORDER: DepKind[] = ["runtime", "dev", "optional", "peer", "unspecified"];

export function classifyRange(requested: string | null): RangeClass {
  if (!requested || requested.trim() === "") return "unspecified";
  let value = requested.trim();
  if (value.startsWith("npm:")) value = value.slice(4);

  if (value.startsWith("workspace:")) return "workspace";
  if (value.startsWith("file:") || value.startsWith("link:") || value.startsWith("portal:")) return "file";
  if (/^(git(\+https?:|\+ssh:|\+file:)?|github:|gitlab:|bitbucket:|https?:)/.test(value)) return "git";
  if (value === "*" || value === "x" || value === "latest") return "any";
  if (value.startsWith("^")) return "caret";
  if (value.startsWith("~")) return "tilde";
  if (/^\d+\.\d+\.\d+(?:[-+].+)?$/.test(value)) return "pinned";
  return "range";
}

export function inspectGraph(graph: ManifestGraph): GraphView {
  const pullsKnown = graph.sources.some((source) => source !== "package.json");
  const directNames = new Set(graph.direct.map((dep) => dep.name));
  const pullsByName = new Map<string, Pull[]>();

  if (pullsKnown) {
    for (const dep of graph.direct) {
      const seen = new Set<string>();
      const pulls: Pull[] = [];
      for (const edge of graph.edges) {
        if (edge.from !== dep.name || !edge.to || seen.has(edge.to)) continue;
        seen.add(edge.to);
        pulls.push({
          name: edge.to,
          requested: edge.requested,
          alsoRoot: directNames.has(edge.to),
        });
      }
      pulls.sort((a, b) => a.name.localeCompare(b.name));
      pullsByName.set(dep.name, pulls);
    }
  }

  const roots: RootView[] = graph.direct.map((dep) => ({
    name: dep.name,
    kind: dep.kind,
    requested: dep.requested,
    resolved: dep.resolved,
    range: classifyRange(dep.requested),
    pulls: pullsByName.get(dep.name) ?? [],
  }));

  const byKind = emptyCounts(KIND_ORDER);
  const byRange = emptyCounts(RANGE_ORDER);
  let resolved = 0;
  for (const root of roots) {
    byKind[root.kind] += 1;
    byRange[root.range] += 1;
    if (root.resolved) resolved += 1;
  }

  const folded = new Set<string>();
  if (pullsKnown) {
    for (const edge of graph.edges) {
      for (const name of [edge.from, edge.to]) {
        if (!name || name === "root" || directNames.has(name)) continue;
        folded.add(name);
      }
    }
  }

  return {
    summary: {
      direct: roots.length,
      byKind,
      byRange,
      resolved,
      unresolved: roots.length - resolved,
      folded: folded.size,
      pullsKnown,
    },
    roots,
  };
}

function emptyCounts<T extends string>(keys: T[]): Record<T, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;
}
