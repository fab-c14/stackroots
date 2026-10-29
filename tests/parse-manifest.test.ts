import assert from "node:assert/strict";
import { test } from "node:test";
import { parseManifests } from "../src/lib/parse-manifest.ts";

const packageJson = `{
  "name": "field-notes",
  "dependencies": {
    "react": "^18.2.0",
    "@scope/pkg": "1.2.3"
  },
  "devDependencies": {
    "typescript": "^5.4.0"
  },
  "optionalDependencies": {
    "fsevents": "~2.3.3"
  },
  "peerDependencies": {
    "react": ">=17",
    "zod": "^3.0.0"
  }
}`;

test("reads direct roots from package.json and keeps peer-only packages", () => {
  const result = parseManifests([{ name: "package.json", text: packageJson }]);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(
    result.graph.direct.map((dep) => [dep.name, dep.requested, dep.resolved, dep.kind]),
    [
      ["@scope/pkg", "1.2.3", null, "runtime"],
      ["react", "^18.2.0", null, "runtime"],
      ["fsevents", "~2.3.3", null, "optional"],
      ["typescript", "^5.4.0", null, "dev"],
      ["zod", "^3.0.0", null, "peer"],
    ],
  );
  assert.equal(result.graph.rootName, "field-notes");
  assert.deepEqual(result.graph.sources, ["package.json"]);
  assert.ok(result.graph.edges.some((edge) => edge.from === "root" && edge.to === "zod"));
});

test("says when a manifest declares no dependencies", () => {
  const result = parseManifests([
    { name: "package.json", text: `{ "name": "empty-app" }` },
  ]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.graph.direct, []);
  assert.match(result.notices.join(" "), /no dependencies/i);
});

test("reads an npm lockfile v3 without package.json", () => {
  const lock = `{
    "name": "field-notes",
    "lockfileVersion": 3,
    "packages": {
      "": {
        "name": "field-notes",
        "dependencies": { "react": "^18.2.0" },
        "devDependencies": { "typescript": "^5.4.0" }
      },
      "node_modules/react": {
        "version": "18.3.1",
        "dependencies": { "loose-envify": "^1.1.0" }
      },
      "node_modules/loose-envify": { "version": "1.4.0" },
      "node_modules/typescript": { "version": "5.4.5" }
    }
  }`;

  const result = parseManifests([{ name: "package-lock.json", text: lock }]);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(
    result.graph.direct.map((dep) => [dep.name, dep.requested, dep.resolved, dep.kind]),
    [
      ["react", "^18.2.0", "18.3.1", "runtime"],
      ["typescript", "^5.4.0", "5.4.5", "dev"],
    ],
  );
  assert.ok(
    result.graph.edges.some(
      (edge) => edge.from === "react" && edge.to === "loose-envify" && edge.requested === "^1.1.0",
    ),
  );
  assert.match(result.notices.join(" "), /lockfile root/i);
});

test("reads npm lockfile v1 direct keys as unspecified kind", () => {
  const lock = `{
    "lockfileVersion": 1,
    "dependencies": {
      "react": {
        "version": "18.3.1",
        "requires": { "loose-envify": "^1.1.0" }
      }
    }
  }`;

  const result = parseManifests([{ name: "package-lock.json", text: lock }]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.graph.direct, [
    { name: "react", requested: null, resolved: "18.3.1", kind: "unspecified" },
  ]);
});

test("pairs package.json ranges with npm lock resolved versions", () => {
  const lock = `{
    "lockfileVersion": 3,
    "packages": {
      "": { "dependencies": { "react": "^18.0.0" } },
      "node_modules/react": { "version": "18.3.1" }
    }
  }`;

  const result = parseManifests([
    { name: "package-lock.json", text: lock },
    { name: "package.json", text: `{ "name": "app", "dependencies": { "react": "^18.2.0" } }` },
  ]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.graph.direct, [
    { name: "react", requested: "^18.2.0", resolved: "18.3.1", kind: "runtime" },
  ]);
  assert.deepEqual(result.graph.sources.sort(), ["package-lock.json", "package.json"]);
});

test("reads a pnpm v9 lockfile importer", () => {
  const lock = `
lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      react:
        specifier: ^18.2.0
        version: 18.3.1(react-dom@18.3.1)
    devDependencies:
      typescript:
        specifier: ^5.4.0
        version: 5.4.5
packages:
  react@18.3.1:
    dependencies:
      loose-envify: 1.4.0
`;

  const result = parseManifests([{ name: "pnpm-lock.yaml", text: lock }]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.graph.direct.map((dep) => [dep.name, dep.requested, dep.resolved, dep.kind]),
    [
      ["react", "^18.2.0", "18.3.1", "runtime"],
      ["typescript", "^5.4.0", "5.4.5", "dev"],
    ],
  );
  assert.ok(result.graph.edges.some((edge) => edge.from === "react" && edge.to === "loose-envify"));
});

test("reads a pnpm v5 lockfile", () => {
  const lock = `
lockfileVersion: 5.4
specifiers:
  react: ^18.2.0
  typescript: ^5.4.0
dependencies:
  react: 18.3.1
devDependencies:
  typescript: 5.4.5
`;

  const result = parseManifests([{ name: "pnpm-lock.yaml", text: lock }]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.graph.direct.map((dep) => [dep.name, dep.resolved, dep.kind]),
    [
      ["react", "18.3.1", "runtime"],
      ["typescript", "5.4.5", "dev"],
    ],
  );
  assert.equal(result.graph.direct[0]?.requested, "^18.2.0");
});

test("asks for package.json when only a Yarn lockfile is present", () => {
  const lock = `# yarn lockfile v1

react@^18.2.0:
  version "18.3.1"
  dependencies:
    loose-envify "^1.1.0"

loose-envify@^1.1.0:
  version "1.4.0"
`;

  const result = parseManifests([{ name: "yarn.lock", text: lock }]);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.issue.code, "yarn-needs-manifest");
  assert.equal(result.issue.resolvedCount, 2);
  assert.match(result.issue.message, /package\.json/);
});

test("resolves Yarn classic versions onto package.json roots", () => {
  const lock = `# yarn lockfile v1

react@^18.0.0, react@^18.2.0:
  version "18.3.1"
  dependencies:
    loose-envify "^1.1.0"

"@scope/pkg@1.2.3":
  version "1.2.3"

typescript@^5.4.0:
  version "5.4.5"
`;

  const manifest = `{
    "name": "app",
    "dependencies": { "react": "^18.2.0", "@scope/pkg": "1.2.3" },
    "devDependencies": { "typescript": "^5.4.0" }
  }`;

  const result = parseManifests([
    { name: "yarn.lock", text: lock },
    { name: "package.json", text: manifest },
  ]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.graph.direct.map((dep) => [dep.name, dep.resolved, dep.kind]),
    [
      ["@scope/pkg", "1.2.3", "runtime"],
      ["react", "18.3.1", "runtime"],
      ["typescript", "5.4.5", "dev"],
    ],
  );
  assert.ok(result.graph.edges.some((edge) => edge.from === "react" && edge.to === "loose-envify"));
});

test("resolves a Yarn Berry lockfile onto package.json roots", () => {
  const lock = `
__metadata:
  version: 6
  cacheKey: 8

"loose-envify@npm:^1.1.0":
  version: 1.4.0

"react@npm:^18.2.0":
  version: 18.3.1
  dependencies:
    loose-envify: "npm:^1.1.0"
`;

  const result = parseManifests([
    { name: "yarn.lock", text: lock },
    {
      name: "package.json",
      text: `{ "dependencies": { "react": "^18.2.0" } }`,
    },
  ]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.graph.direct, [
    { name: "react", requested: "^18.2.0", resolved: "18.3.1", kind: "runtime" },
  ]);
});

test("rejects an empty file", () => {
  const result = parseManifests([{ name: "package.json", text: " \n\t" }]);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.issue.code, "empty");
});

test("rejects a file that is not a manifest", () => {
  const result = parseManifests([{ name: "notes.txt", text: "hello from the fest" }]);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.issue.code, "unreadable");
});

test("sniffs a pasted package.json", () => {
  const result = parseManifests([
    { name: "paste", text: `{ "dependencies": { "left-pad": "1.3.0" } }` },
  ]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.graph.direct[0]?.name, "left-pad");
  assert.deepEqual(result.graph.sources, ["package.json"]);
});
