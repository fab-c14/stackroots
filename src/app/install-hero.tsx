"use client";

import { useState } from "react";

const COMMAND = "npx stackroots check zod recompose";

export function InstallHero() {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(COMMAND);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="command-strip" id="command">
      <p className="lede">From the stackroots folder, after npm install.</p>
      <div className="command">
        <code>{COMMAND}</code>
        <button type="button" className="primary" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <details className="command-more">
        <summary>All commands</summary>
        <pre>
          <code>{`npx stackroots report
npx stackroots check zod
npx stackroots check zod recompose
npx stackroots check recompose@0.30.0`}</code>
        </pre>
        <p>
          If 18.10.0 would break this project, the check names a published release that fits and prints npm install
          name@version. npm install --legacy-peer-deps skips the peer check and installs the newest release anyway.
          Stackroots does not skip the check.
        </p>
      </details>
    </section>
  );
}
