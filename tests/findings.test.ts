import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectGraph } from "../src/lib/inspect-graph.ts";
import { localFinding, projectReport, rootTable, worse } from "../src/lib/findings.ts";
import { parseManifests } from "../src/lib/parse-manifest.ts";
import { SAMPLE_FILES } from "../src/lib/sample-manifest.ts";

test("flags a missing lockfile version and a resolved version outside the range", () => {
  assert.equal(localFinding({ requested: "^18.3.1", resolved: null, range: "caret" }).label, "Unresolved");
  assert.equal(localFinding({ requested: "^17.0.2", resolved: "18.3.1", range: "caret" }).level, "error");
});

test("warns on open, git, and folder ranges, and stays quiet when the lockfile matches", () => {
  assert.equal(localFinding({ requested: "*", resolved: "1.0.0", range: "any" }).level, "warn");
  assert.equal(localFinding({ requested: "github:org/repo", resolved: "1.0.0", range: "git" }).label, "Git");
  assert.equal(localFinding({ requested: "^18.3.1", resolved: "18.3.1", range: "caret" }).level, "ok");
});

test("the sample report names the heaviest root when nothing is wrong", () => {
  const parsed = parseManifests(SAMPLE_FILES);
  if (!parsed.ok) throw new Error("sample");
  const view = inspectGraph(parsed.graph);
  const report = projectReport(
    view.roots.map((root) => ({ ...root, pulls: root.pulls.length })),
    view.summary.pullsKnown,
  );
  assert.equal(report.problems.length, 0);
  assert.match(report.headline, /12 direct roots/);
  assert.match(report.detail, /^next pulls 10/);
});

test("the root table lines up the heaviest package first", () => {
  const table = rootTable([
    { name: "zod", kind: "runtime", requested: "^3.23.8", resolved: "3.23.8", pulls: 0 },
    { name: "next", kind: "runtime", requested: "^15.0.0", resolved: "15.0.3", pulls: 10 },
  ]);
  const lines = table.split("\n");
  assert.match(lines[0], /^root\s+kind\s+asked\s+resolved\s+pulls/);
  assert.match(lines[1], /^next\s+runtime\s+\^15\.0\.0\s+15\.0\.3\s+10/);
  assert.match(lines[2], /^zod\s+runtime/);
});

test("error outranks a warning", () => {
  assert.equal(worse("warn", "error"), "error");
  assert.equal(worse("ok", "warn"), "warn");
});
