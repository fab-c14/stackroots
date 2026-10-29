import semver from "semver";

export type FindingLevel = "ok" | "warn" | "error";

export type Finding = {
  level: FindingLevel;
  label: string;
  message: string;
  solution: string;
};

export function localFinding(root: {
  requested: string | null;
  resolved: string | null;
  range: string;
}): Finding {
  if (!root.resolved && root.range !== "file" && root.range !== "git" && root.range !== "workspace") {
    return {
      level: "error",
      label: "Unresolved",
      message: "No resolved version. Add the lockfile from the same install.",
      solution: "Add the lockfile from the same install before trusting this range.",
    };
  }
  if (root.range === "any") {
    return { level: "warn", label: "Open", message: "This range accepts any version.", solution: "Pin a version, or use a caret, before this ships." };
  }
  if (root.range === "git") {
    return {
      level: "warn",
      label: "Git",
      message: "This root is installed from git, not the npm registry.",
      solution: "Prefer a registry release when the same code is published.",
    };
  }
  if (root.range === "file") {
    return {
      level: "warn",
      label: "Local",
      message: "This root points at a folder on disk.",
      solution: "This install only works on a machine that has that folder.",
    };
  }

  const requested = root.requested?.startsWith("npm:") ? root.requested.slice(4) : root.requested;
  if (
    root.resolved &&
    requested &&
    semver.valid(root.resolved) &&
    semver.validRange(requested) &&
    !semver.satisfies(root.resolved, requested, { includePrerelease: true })
  ) {
    return {
      level: "error",
      label: "Range",
      message: `${root.resolved} is outside ${requested}.`,
      solution: `Widen ${requested} so it includes ${root.resolved}, or reinstall a version inside that range.`,
    };
  }
  return { level: "ok", label: "", message: "", solution: "" };
}

export type ReportRoot = {
  name: string;
  requested: string | null;
  resolved: string | null;
  range: string;
  pulls: number;
};

export type ProjectReport = {
  headline: string;
  detail: string;
  problems: Array<Finding & { name: string }>;
};

export function projectReport(roots: ReportRoot[], pullsKnown: boolean): ProjectReport {
  const problems = roots.flatMap((root) => {
    const finding = localFinding(root);
    return finding.level === "ok" ? [] : [{ name: root.name, ...finding }];
  });
  const errors = problems.filter((item) => item.level === "error").length;
  const warnings = problems.length - errors;
  const heaviest = [...roots].sort((a, b) => b.pulls - a.pulls || a.name.localeCompare(b.name))[0];
  const headline =
    problems.length === 0
      ? `${roots.length} direct roots. The lockfile agrees with the ranges in package.json.`
      : `${errors} would break an install. ${warnings} need a look.`;
  const detail =
    pullsKnown && heaviest
      ? `${heaviest.name} pulls ${heaviest.pulls}.`
      : "Add the lockfile to see what each root pulls.";
  return { headline, detail, problems };
}

export function rootTable(
  roots: Array<{ name: string; kind: string; requested: string | null; resolved: string | null; pulls: number }>,
): string {
  const rows = [
    ["root", "kind", "asked", "resolved", "pulls"],
    ...[...roots]
      .sort((a, b) => b.pulls - a.pulls || a.name.localeCompare(b.name))
      .map((root) => [root.name, root.kind, root.requested ?? "none", root.resolved ?? "none", String(root.pulls)]),
  ];
  const widths = rows[0].map((_, index) => Math.max(...rows.map((row) => row[index].length)));
  return rows
    .map((row) => row.map((cell, index) => (index === widths.length - 1 ? cell : cell.padEnd(widths[index]))).join("  "))
    .join("\n");
}

export function worse(a: FindingLevel, b: FindingLevel): FindingLevel {
  const rank: Record<FindingLevel, number> = { error: 2, warn: 1, ok: 0 };
  return rank[a] >= rank[b] ? a : b;
}
