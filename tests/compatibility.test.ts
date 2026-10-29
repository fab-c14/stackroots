import assert from "node:assert/strict";
import { test } from "node:test";
import { checkCompatibility, chooseInstall, readPackageNames, withBatchMates, type IncomingPackage } from "../src/lib/compatibility.ts";

const base: IncomingPackage = {
  name: "widget",
  version: "2.0.0",
  deprecated: null,
  peers: { react: ">=18" },
  optionalPeers: [],
  enginesNode: null,
};

test("flags a peer that is too old", () => {
  const issues = checkCompatibility([{ name: "react", requested: "^17.0.2", resolved: "17.0.2" }], base, null);
  assert.equal(issues.some((issue) => issue.level === "error" && issue.message.includes("react is 17.0.2")), true);
  assert.match(issues[0]?.solution ?? "", /Do not install widget/);
});

test("accepts a peer that satisfies the range", () => {
  const issues = checkCompatibility([{ name: "react", requested: "^18.3.1", resolved: "18.3.1" }], base, null);
  assert.deepEqual(issues, []);
});

test("warns when a required peer is missing and stays quiet when it is optional", () => {
  const missing = checkCompatibility([], base, null);
  assert.equal(missing[0]?.level, "warn");
  const optional = checkCompatibility([], { ...base, optionalPeers: ["react"] }, null);
  assert.deepEqual(optional, []);
});

test("treats a major jump and a deprecation as errors", () => {
  const issues = checkCompatibility(
    [{ name: "widget", requested: "^1.4.0", resolved: "1.4.2" }],
    { ...base, peers: {}, deprecated: "Use widget-next instead." },
    null,
  );
  assert.equal(issues.filter((issue) => issue.level === "error").length, 2);
});

test("reads several package names and keeps a mate available for peer checks", () => {
  const parsed = readPackageNames("zod, react-redux, oops!, @tanstack/react-query");
  assert.deepEqual(parsed.names, ["zod", "react-redux", "@tanstack/react-query"]);
  assert.deepEqual(parsed.rejected, ["oops!"]);

  const dom: IncomingPackage = { ...base, name: "react-dom", version: "18.3.1", peers: {} };
  const widget: IncomingPackage = { ...base, peers: { "react-dom": "^18" } };
  const issues = checkCompatibility([], widget, null);
  const together = checkCompatibility(withBatchMates([], widget, [widget, dom]), widget, null);
  assert.equal(issues.some((issue) => issue.message.includes("react-dom")), true);
  assert.equal(together.some((issue) => issue.message.includes("react-dom")), false);
});

test("flags a Node range that cannot overlap", () => {
  const issues = checkCompatibility([], { ...base, peers: {}, enginesNode: ">=22" }, ">=18 <20");
  assert.equal(issues.some((issue) => issue.message.includes("Node")), true);
});

test("reads a pinned version on a scoped name", () => {
  const parsed = readPackageNames("recompose@0.30.0 @tanstack/react-query@5");
  assert.deepEqual(parsed.specs, [
    { name: "recompose", version: "0.30.0" },
    { name: "@tanstack/react-query", version: "5" },
  ]);
});

test("names an older release when the newest one breaks, and refuses when none fits", () => {
  const installed = [{ name: "react", requested: "^17.0.2", resolved: "17.0.2" }];
  const older: IncomingPackage = { ...base, version: "1.2.0", peers: { react: "^17" } };
  const newer: IncomingPackage = { ...base, version: "2.0.0", peers: { react: ">=18" } };
  const plan = chooseInstall(installed, [newer, older], null, null, "2.0.0");
  assert.equal(plan.incoming?.version, "2.0.0");
  assert.equal(plan.install, "npm install widget@1.2.0");
  assert.match(plan.issues.find((issue) => issue.level === "error")?.solution ?? "", /1\.2\.0/);

  const blocked = chooseInstall(installed, [newer], null, "2.0.0", "2.0.0");
  assert.equal(blocked.install, null);
  assert.match(blocked.issues[0]?.solution ?? "", /legacy-peer-deps/);

  const missing = chooseInstall(installed, [older, newer], null, "18.10.0", "2.0.0");
  assert.equal(missing.install, "npm install widget@1.2.0");
  assert.match(missing.issues[0]?.message ?? "", /18\.10\.0 is not a published release/);

  const ancient: IncomingPackage = { ...base, version: "0.2.2", peers: {} };
  const current: IncomingPackage = { ...base, version: "0.30.0", peers: { react: "^16.0.0" } };
  const silent = chooseInstall(
    [{ name: "react", requested: "19.3.0", resolved: "19.3.0" }],
    [current, ancient],
    null,
    null,
    "0.30.0",
  );
  assert.equal(silent.install, null);
  assert.match(silent.issues[0]?.solution ?? "", /legacy-peer-deps/);
});
