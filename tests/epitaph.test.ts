import assert from "node:assert/strict";
import { test } from "node:test";
import { factsToPrompt, finishEpitaph, readGemmaText, readLatestDocument, readPublishDate, readRootSnapshot } from "../src/lib/epitaph.ts";
import type { PackageFacts } from "../src/lib/epitaph.ts";

const base: PackageFacts = {
  name: "next",
  kind: "runtime",
  requested: "^15.0.0",
  resolved: "15.0.3",
  range: "caret",
  pulls: 4,
  pullNames: ["busboy", "postcss", "react", "styled-jsx"],
  description: "The React framework",
  license: "MIT",
  deprecated: null,
  published: "2024-10-15",
  latest: "15.0.3",
  maintainers: 12,
  repository: "https://github.com/vercel/next.js",
  registry: "found",
};

test("the prompt keeps only known facts", () => {
  const prompt = factsToPrompt(base);
  assert.match(prompt, /package: next/);
  assert.match(prompt, /packages it pulls: 4/);
  assert.equal(prompt.includes("deprecation:"), false);

  const deprecated = factsToPrompt({ ...base, deprecated: "This package is no longer maintained." });
  assert.match(deprecated, /deprecation: This package is no longer maintained/);
});

test("reads an npm latest document", () => {
  const facts = readLatestDocument({
    name: "left-pad",
    version: "1.3.0",
    description: "String left pad",
    license: "MIT",
    deprecated: "Use String.prototype.padStart()",
    repository: { type: "git", url: "git+https://github.com/stevemao/left-pad.git" },
    maintainers: [{ name: "one" }, { name: "two" }],
  });
  assert.equal(facts.latest, "1.3.0");
  assert.equal(facts.deprecated, "Use String.prototype.padStart()");
  assert.equal(facts.repository, "https://github.com/stevemao/left-pad");
  assert.equal(facts.maintainers, 2);
});

test("reads a publish date only for the exact package", () => {
  const date = readPublishDate(
    {
      objects: [
        { package: { name: "next-auth", date: "2020-01-01T00:00:00.000Z" } },
        { package: { name: "next", date: "2024-10-15T12:00:00.000Z" } },
      ],
    },
    "next",
  );
  assert.equal(date, "2024-10-15");
});

test("reads Gemma's text and rejects a nameless root", () => {
  assert.equal(
    readGemmaText({ candidates: [{ content: { parts: [{ text: "Next is still current. " }, { text: "It pulls four packages." }] } }] }),
    "Next is still current. It pulls four packages.",
  );
  assert.equal(
    finishEpitaph(
      "* Draft: ignore this\n\n`is` is a type testing library. The latest version is 3.3.2.is is a type testing library. The latest version is 3.3.2.",
    ),
    "is is a type testing library. The latest version is 3.3.2.",
  );
  assert.equal(readRootSnapshot({ name: "../etc/passwd", pulls: 1 }), null);
  assert.equal(readRootSnapshot({ name: "react", kind: "runtime", pulls: 1, pullNames: ["loose-envify"] })?.pullNames[0], "loose-envify");
});
