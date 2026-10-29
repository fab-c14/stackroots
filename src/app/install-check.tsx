"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import type { DirectDep } from "@/lib/parse-manifest";

type Issue = { level: "error" | "warn"; message: string; solution: string };

type CheckResult = {
  name: string;
  ok: boolean;
  version?: string;
  issues?: Issue[];
  install?: string | null;
  message?: string;
};

type CheckResponse = {
  ok: boolean;
  results?: CheckResult[];
  rejected?: string[];
  extra?: number;
  message?: string;
};

type FixState =
  | { status: "idle" }
  | { status: "writing" }
  | { status: "ready"; text: string; model: string }
  | { status: "error"; message: string };

export function InstallCheck({
  installed,
  node,
  onLive,
}: {
  installed: Pick<DirectDep, "name" | "requested" | "resolved">[];
  node: string | null;
  onLive?: () => void;
}) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CheckResponse | null>(null);
  const [fix, setFix] = useState<FixState>({ status: "idle" });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setResult(null);
    setFix({ status: "idle" });
    try {
      const response = await fetch("/api/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, installed, node }),
      });
      const payload = (await response.json()) as CheckResponse;
      setResult(payload);
      setLoading(false);
      onLive?.();
      const notes = (payload.results ?? []).flatMap((item) =>
        (item.issues ?? []).flatMap((issue) => [issue.message, `Do this: ${issue.solution}`]),
      );
      if (payload.ok && notes.length > 0) {
        setFix({ status: "writing" });
        await writeFix(notes);
      }
    } catch {
      setResult({ ok: false, message: "The check could not reach the registry." });
      setLoading(false);
      onLive?.();
    }
  }

  const host = useHost("live-check");
  const findings = <CheckFindings result={result} fix={fix} />;

  async function writeFix(notes: string[]) {
    try {
      const response = await fetch("/api/fix", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      const payload = (await response.json()) as { ok: boolean; fix?: string; model?: string; message?: string };
      if (!payload.ok || !payload.fix) {
        setFix({ status: "error", message: payload.message ?? "Gemma 4 did not write a fix." });
        return;
      }
      setFix({ status: "ready", text: payload.fix, model: payload.model ?? "Gemma 4" });
    } catch {
      setFix({ status: "error", message: "Gemma 4 could not be reached." });
    }
  }

  return (
    <>
      <form className="scan" onSubmit={onSubmit}>
        <label htmlFor="install-name">Check packages before you install them</label>
        <div className="scan-row">
          <input
            id="install-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="zod, recompose@0.30.0"
            spellCheck={false}
            autoCapitalize="off"
          />
          <button className="primary" type="submit" disabled={loading || name.trim() === ""}>
            {loading ? "Checking" : "Check"}
          </button>
        </div>
      </form>
      {host ? createPortal(findings, host) : findings}
    </>
  );
}

function useHost(id: string) {
  const [node, setNode] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setNode(document.getElementById(id));
  }, [id]);
  return node;
}

function CheckFindings({ result, fix }: { result: CheckResponse | null; fix: FixState }) {
  if (!result) return null;
  if (!result.ok) {
    return (
      <p className="issue diagnosis" role="alert">
        {result.message}
      </p>
    );
  }
  return (
    <div className="diagnosis" aria-live="polite">
      {result.extra ? <p className="notice">Checked the first 12. {result.extra} were left out.</p> : null}
      {result.rejected && result.rejected.length > 0 ? (
        <p className="issue">Skipped {result.rejected.join(", ")}. Those are not package names.</p>
      ) : null}
      <ul className="diagnosis-list">
        {result.results?.map((item) => {
          const level = !item.ok ? "error" : worst(item.issues ?? []);
          return (
            <li key={item.name} data-level={level}>
              <header>
                <strong>{item.name}</strong>
                {item.version ? <span>{item.version}</span> : null}
              </header>
              {!item.ok ? <p>{item.message}</p> : null}
              {item.ok && (item.issues?.length ?? 0) === 0 ? (
                <p className="fix-copy">Install it. Nothing in this project conflicts.</p>
              ) : null}
              {item.install ? <code className="install-command">{item.install}</code> : null}
              {item.issues?.map((issue) => (
                <div key={issue.message} className="pair">
                  <div>
                    <p className="kicker">Found</p>
                    <p data-level={issue.level}>{issue.message}</p>
                  </div>
                  <div>
                    <p className="kicker">Do this</p>
                    <p className="fix-copy">{issue.solution}</p>
                  </div>
                </div>
              ))}
            </li>
          );
        })}
      </ul>
      {fix.status === "writing" ? <p className="gemma-fix">Gemma 4 is writing the fix for this project.</p> : null}
      {fix.status === "ready" ? (
        <section className="gemma-fix">
          <p className="kicker">{fix.model}</p>
          <p>{fix.text}</p>
        </section>
      ) : null}
      {fix.status === "error" ? <p className="gemma-fix gemma-miss">{fix.message}</p> : null}
    </div>
  );
}

function worst(issues: Issue[]): "ok" | "warn" | "error" {
  if (issues.some((issue) => issue.level === "error")) return "error";
  if (issues.some((issue) => issue.level === "warn")) return "warn";
  return "ok";
}
