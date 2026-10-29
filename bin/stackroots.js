#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const child = spawnSync(
  process.execPath,
  [
    "--experimental-strip-types",
    "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
    path.join(__dirname, "..", "src", "cli.ts"),
    ...process.argv.slice(2),
  ],
  { stdio: "inherit" },
);

process.exit(child.status === null ? 1 : child.status);
