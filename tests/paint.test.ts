import assert from "node:assert/strict";
import { test } from "node:test";
import { rootTable } from "../src/lib/findings.ts";
import { colorEnabled, dye, paintReportLine } from "../src/lib/paint.ts";

test("stays plain when color is off", () => {
  assert.equal(dye("error", "31", false), "error");
  const row = rootTable([
    { name: "eslint", kind: "dev", requested: "^9", resolved: "9.0.0", pulls: 2 },
  ]).split("\n")[1];
  assert.equal(paintReportLine(row, false), row);
});

test("colors the kind and dims the header", () => {
  const [header, heavy, light] = rootTable([
    { name: "eslint", kind: "dev", requested: "^9", resolved: "9.0.0", pulls: 2 },
    { name: "react", kind: "runtime", requested: "19.3.0", resolved: "19.3.0", pulls: 0 },
  ]).split("\n");
  assert.match(paintReportLine(header, true), /^\u001b\[2mroot/);
  assert.match(paintReportLine(heavy, true), /\u001b\[33mdev\u001b\[0m/);
  assert.match(paintReportLine(light, true), /\u001b\[32mruntime\u001b\[0m/);
  const devLine = rootTable([
    { name: "eslint", kind: "dev", requested: "^9", resolved: "9.0.0", pulls: 2 },
  ]).split("\n")[1];
  assert.match(paintReportLine(devLine, true), /\u001b\[33mdev\u001b\[0m/);
});

test("NO_COLOR and a dumb terminal turn color off", () => {
  assert.equal(colorEnabled({ isTTY: true }, { NO_COLOR: "1" }), false);
  assert.equal(colorEnabled({ isTTY: true }, { TERM: "dumb" }), false);
  assert.equal(colorEnabled({ isTTY: false }, {}), false);
  assert.equal(colorEnabled({ isTTY: true }, {}), true);
});
