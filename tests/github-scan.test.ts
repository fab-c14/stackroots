import assert from "node:assert/strict";
import { test } from "node:test";
import { manifestNamesIn, parseGitHubTarget, readCommitShare, readIssues } from "../src/lib/github-scan.ts";

test("reads public GitHub repo URLs", () => {
  assert.deepEqual(parseGitHubTarget("https://github.com/colinhacks/zod"), {
    owner: "colinhacks",
    repo: "zod",
    ref: null,
  });
  assert.deepEqual(parseGitHubTarget("github.com/colinhacks/zod.git"), {
    owner: "colinhacks",
    repo: "zod",
    ref: null,
  });
  assert.deepEqual(parseGitHubTarget("colinhacks/zod"), {
    owner: "colinhacks",
    repo: "zod",
    ref: null,
  });
  assert.equal(parseGitHubTarget("https://github.com/colinhacks/zod/tree/v4")?.ref, "v4");
  assert.equal(parseGitHubTarget("https://github.com/colinhacks/zod/blob/main/package.json")?.ref, "main");
  assert.equal(parseGitHubTarget("https://gitlab.com/colinhacks/zod"), null);
  assert.equal(parseGitHubTarget("github.com/only-owner"), null);
});

test("picks manifest files from a root listing", () => {
  assert.deepEqual(
    manifestNamesIn([
      { name: "README.md", type: "file" },
      { name: "yarn.lock", type: "file" },
      { name: "package.json", type: "file" },
      { name: "src", type: "dir" },
    ]),
    ["package.json", "yarn.lock"],
  );
});

test("keeps help-wanted issues and drops pull requests", () => {
  const issues = readIssues([
    { title: "Add a recipe", html_url: "https://github.com/acme/app/issues/4", comments: 2 },
    { title: "Bump deps", html_url: "https://github.com/acme/app/pull/5", pull_request: {}, comments: 0 },
  ]);
  assert.deepEqual(issues, [{ title: "Add a recipe", url: "https://github.com/acme/app/issues/4", comments: 2 }]);
});

test("describes the top public contributor share", () => {
  assert.deepEqual(
    readCommitShare([
      { login: "ada", contributions: 80 },
      { login: "grace", contributions: 20 },
    ]),
    { login: "ada", percent: 80, sampled: 2 },
  );
  assert.equal(readCommitShare([]), null);
});
