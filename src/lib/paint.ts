const RESET = "\u001b[0m";

const KIND_CODE: Record<string, string> = {
  runtime: "32",
  dev: "33",
  optional: "36",
  peer: "35",
  unspecified: "90",
};

export function colorEnabled(stream: { isTTY?: boolean }, env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NO_COLOR) return false;
  if (env.TERM === "dumb") return false;
  return Boolean(stream.isTTY);
}

export function dye(text: string, code: string, on: boolean): string {
  if (!on || text.length === 0) return text;
  return `\u001b[${code}m${text}${RESET}`;
}

export function paintReportLine(line: string, on: boolean): string {
  if (!on || line.length === 0) return line;
  const match = line.match(/^(.*?\s{2,})(runtime|dev|optional|peer|unspecified)(\s{2,}.*)$/);
  if (!match) return dye(line, "2", true);
  return `${match[1]}${dye(match[2], KIND_CODE[match[2]] ?? "2", true)}${match[3]}`;
}

export function levelCode(level: string): string {
  if (level === "error") return "1;31";
  if (level === "warn") return "33";
  return "32";
}
