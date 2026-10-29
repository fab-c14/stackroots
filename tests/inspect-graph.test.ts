import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyRange, inspectGraph } from "../src/lib/inspect-graph.ts";
import { parseManifests } from "../src/lib/parse-manifest.ts";
import { SAMPLE_FILES } from "../src/lib/sample-manifest.ts";

test("classifies the ranges a manifest can write", () => {
  assert.equal(classifyRange("^18.3.1"), "caret");
  assert.equal(classifyRange("~2.3.3"), "tilde");
  assert.equal(classifyRange("1.2.3"), "pinned");
  assert.equal(classifyRange("1.2.3-beta.1"), "pinned");
  assert.equal(classifyRange("*"), "any");
  assert.equal(classifyRange(">=17"), "range");
  assert.equal(classifyRange("workspace:*"), "workspace");
  assert.equal(classifyRange("file:../pkg"), "file");
  assert.equal(classifyRange("github:org/repo"), "git");
  assert.equal(classifyRange("npm:^1.0.0"), "caret");
  assert.equal(classifyRange(null), "unspecified");
});

test("the field-notes sample has weight, folded packages, and range mix", () => {
  const result = parseManifests(SAMPLE_FILES);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const view = inspectGraph(result.graph);
  assert.equal(view.summary.direct, 12);
  assert.equal(view.summary.byKind.runtime, 5);
  assert.equal(view.summary.byKind.dev, 6);
  assert.equal(view.summary.byKind.optional, 1);
  assert.equal(view.summary.resolved, 12);
  assert.equal(view.summary.folded, 17);
  assert.equal(view.summary.pullsKnown, true);
  assert.equal(view.summary.byRange.caret, 11);
  assert.equal(view.summary.byRange.tilde, 1);
  assert.equal(result.graph.enginesNode, ">=18 <20");

  const next = view.roots.find((root) => root.name === "next");
  assert.ok(next);
  assert.deepEqual(
    next?.pulls.map((pull) => pull.name),
    ["busboy", "caniuse-lite", "graceful-fs", "nanoid", "picocolors", "postcss", "react", "source-map", "styled-jsx", "watchpack"],
  );
  assert.equal(next?.pulls.find((pull) => pull.name === "react")?.alsoRoot, true);

  const zod = view.roots.find((root) => root.name === "zod");
  assert.equal(zod?.pulls.length, 0);
  assert.equal(zod?.resolved, "3.23.8");
});

test("package.json alone does not pretend the pulls are known", () => {
  const result = parseManifests([
    {
      name: "package.json",
      text: `{ "name": "solo", "dependencies": { "react": "^18.0.0" }, "devDependencies": { "typescript": "5.4.5" } }`,
    },
  ]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const view = inspectGraph(result.graph);
  assert.equal(view.summary.pullsKnown, false);
  assert.equal(view.summary.folded, 0);
  assert.equal(view.roots[0]?.pulls.length, 0);
  assert.equal(view.summary.byRange.caret, 1);
  assert.equal(view.summary.byRange.pinned, 1);
});
