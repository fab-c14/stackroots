import assert from "node:assert/strict";
import { test } from "node:test";
import {
  manifestNamesIn,
  matchIssuesToRoots,
  mergePackageWork,
  parseGitHubTarget,
  readCommitShare,
  readIssues,
  readNpmRepository,
  type PackageWork,
} from "../src/lib/github-scan.ts";

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

test("reads a GitHub repository from an npm registry record", () => {
  assert.deepEqual(readNpmRepository({ type: "git", url: "git+https://github.com/colinhacks/zod.git" }), {
    owner: "colinhacks",
    repo: "zod",
    ref: null,
  });
  assert.deepEqual(readNpmRepository("github:facebook/react"), { owner: "facebook", repo: "react", ref: null });
  assert.deepEqual(readNpmRepository("git@github.com:microsoft/TypeScript.git"), {
    owner: "microsoft",
    repo: "TypeScript",
    ref: null,
  });
  assert.equal(readNpmRepository({ url: "https://gitlab.com/example/lib.git" }), null);
  assert.equal(readNpmRepository(null), null);
});

test("matches help-wanted issues to roots already in the project", () => {
  const issues = [
    { title: "zod: accept a pipe of schemas", url: "https://github.com/acme/app/issues/4", comments: 1 },
    { title: "Refresh the readme", url: "https://github.com/acme/app/issues/9", comments: 0 },
  ];
  assert.deepEqual(matchIssuesToRoots(issues, ["zod", "react"]), [
    { name: "zod", issues: [issues[0]] },
  ]);

  const upstream: PackageWork[] = [
    {
      name: "zod",
      repo: "colinhacks/zod",
      url: "https://github.com/colinhacks/zod",
      issues: [{ title: "Infer a tuple", url: "https://github.com/colinhacks/zod/issues/2", comments: 3 }],
      note: null,
    },
    {
      name: "left-pad",
      repo: "stevemao/left-pad",
      url: "https://github.com/stevemao/left-pad",
      issues: [{ title: "Old issue", url: "https://github.com/stevemao/left-pad/issues/1", comments: 0 }],
      note: null,
    },
  ];
  const merged = mergePackageWork(["zod", "react"], upstream, issues);
  assert.deepEqual(
    merged.map((item) => item.name),
    ["zod"],
  );
  assert.deepEqual(
    merged[0]?.issues.map((issue) => issue.url),
    ["https://github.com/colinhacks/zod/issues/2", "https://github.com/acme/app/issues/4"],
  );
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
