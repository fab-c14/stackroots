import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { chooseInstall, loadPackument, readPackageNames, resolveRelease, withBatchMates } from "./lib/compatibility.ts";
import { projectReport, rootTable } from "./lib/findings.ts";
import { inspectGraph } from "./lib/inspect-graph.ts";
import { colorEnabled, dye, levelCode, paintReportLine } from "./lib/paint.ts";
import { parseManifests } from "./lib/parse-manifest.ts";

const MANIFESTS = ["package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock"];

const out = colorEnabled(process.stdout);
const err = colorEnabled(process.stderr);

async function main() {
  const [command, ...rawNames] = process.argv.slice(2);
  if (command === "report") {
    await report();
    return;
  }
  if (command !== "check" || rawNames.length === 0) {
    console.error("Usage:");
    console.error("  npx stackroots report");
    console.error("  npx stackroots check <package> [more packages]");
    console.error("  npx stackroots check <package>@<version>");
    process.exit(1);
  }
  const requested = readPackageNames(rawNames.join(" "));
  if (requested.names.length === 0) {
    complain("Enter one or more npm package names.");
    process.exit(1);
  }
  for (const rejected of requested.rejected) complain(`Skipped ${rejected}. That is not a package name.`);
  if (requested.extra > 0) complain(`Checked the first 12. ${requested.extra} were left out.`);

  const loaded = readProject();
  if (!loaded) return;
  const { root, manifest } = loaded;

  console.log(dye(root, "2", out));
  const packs = await Promise.all(requested.specs.map((spec) => loadPackument(spec.name)));
  const mates = packs.flatMap((pack, index) => {
    const release = resolveRelease(pack.versions, requested.specs[index]?.version ?? null, pack.latest);
    return release ? [release] : [];
  });
  let failed = requested.rejected.length > 0;
  for (let index = 0; index < packs.length; index += 1) {
    const pack = packs[index];
    const spec = requested.specs[index];
    if (!pack || !spec) continue;
    if (pack.versions.length === 0) {
      failed = true;
      console.log(dye(pack.name, "1", out));
      console.log(`${dye("error", levelCode("error"), out)}  ${pack.message}`);
      continue;
    }
    const release = resolveRelease(pack.versions, spec.version, pack.latest);
    const installed = release ? withBatchMates(manifest.graph.direct, release, mates) : manifest.graph.direct;
    const plan = chooseInstall(installed, pack.versions, manifest.graph.enginesNode, spec.version, pack.latest);
    const shown = plan.incoming;
    console.log(shown ? `${dye(shown.name, "1", out)} ${dye(shown.version, "2", out)}` : dye(spec.name, "1", out));
    if (plan.issues.length === 0) console.log(dye("No compatibility problems against this project.", levelCode("ok"), out));
    for (const issue of plan.issues) {
      console.log(`${dye(issue.level, levelCode(issue.level), out)}  ${issue.message}`);
      console.log(`${dye("do", "1;32", out)}     ${issue.solution}`);
    }
    if (plan.install) console.log(`${dye("fix", "1;32", out)}    ${plan.install}`);
    if (plan.issues.some((issue) => issue.level === "error")) failed = true;
  }
  if (failed) process.exit(1);
}

async function report() {
  const loaded = readProject();
  if (!loaded) return;
  const view = inspectGraph(loaded.manifest.graph);
  const written = projectReport(
    view.roots.map((root) => ({ ...root, pulls: root.pulls.length })),
    view.summary.pullsKnown,
  );
  console.log(dye(loaded.root, "2", out));
  console.log(dye(written.headline, "1", out));
  console.log(dye(written.detail, "32", out));
  console.log("");
  console.log(
    rootTable(
      view.roots.map((root) => ({
        name: root.name,
        kind: root.kind,
        requested: root.requested,
        resolved: root.resolved,
        pulls: root.pulls.length,
      })),
    )
      .split("\n")
      .map((line) => paintReportLine(line, out))
      .join("\n"),
  );
  for (const problem of written.problems) {
    console.log(`${dye(problem.level, levelCode(problem.level), out)}  ${dye(problem.name, "1", out)}: ${problem.message}`);
    console.log(`${dye("do", "1;32", out)}     ${problem.solution}`);
  }
  if (written.problems.some((problem) => problem.level === "error")) process.exit(1);
}

function complain(message: string) {
  console.error(dye(message, levelCode("error"), err));
}

function readProject() {
  const root = findProject(process.cwd());
  if (!root) {
    complain("No package.json in this folder or a parent folder.");
    process.exit(1);
  }
  const files = MANIFESTS.filter((file) => existsSync(join(root, file))).map((file) => ({
    name: file,
    text: readFileSync(join(root, file), "utf8"),
  }));
  const manifest = parseManifests(files);
  if (!manifest.ok) {
    complain(manifest.issue.message);
    process.exit(1);
  }
  return { root, manifest };
}

function findProject(start: string): string | null {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, "package.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

await main();
