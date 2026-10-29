"use client";

import { useState } from "react";
import type { RootView } from "@/lib/inspect-graph";
import type { PackageFacts } from "@/lib/epitaph";

type EpitaphResponse = {
  ok: boolean;
  code?: string;
  model?: string;
  facts?: PackageFacts;
  epitaph?: string;
  message?: string;
};

function cacheKey(root: RootView) {
  return `${root.name}@${root.resolved ?? ""}@${root.pulls.length}`;
}

export function EpitaphNote({ root }: { root: RootView }) {
  const key = cacheKey(root);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, EpitaphResponse>>({});
  const state = notes[key] ?? null;
  const loading = loadingKey === key;

  async function ask() {
    setLoadingKey(key);
    try {
      const response = await fetch("/api/epitaph", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: root.name,
          kind: root.kind,
          requested: root.requested,
          resolved: root.resolved,
          range: root.range,
          pulls: root.pulls.length,
          pullNames: root.pulls.map((pull) => pull.name),
        }),
      });
      const payload = (await response.json()) as EpitaphResponse;
      setNotes((current) => ({ ...current, [key]: payload }));
    } catch {
      setNotes((current) => ({
        ...current,
        [key]: { ok: false, code: "model-failed", message: "Gemma 4 could not be reached." },
      }));
    } finally {
      setLoadingKey(null);
    }
  }

  return (
    <section className="epitaph" aria-live="polite">
      <p className="by">Gemma 4</p>
      {state?.facts?.deprecated ? <p className="deprecated">{state.facts.deprecated}</p> : null}
      {state?.facts ? <FactLine facts={state.facts} /> : null}
      {state?.ok && state.epitaph ? <p>{state.epitaph}</p> : null}
      {state && !state.ok ? <p className="epitaph-error">{state.message}</p> : null}
      <button type="button" className="text-button" onClick={ask} disabled={loading}>
        {loading ? "Writing" : state?.epitaph ? "Ask again" : "Ask Gemma 4 what this needs"}
      </button>
      <p className="by">Runs only when you ask. The manifest stays in the browser.</p>
    </section>
  );
}

function FactLine({ facts }: { facts: PackageFacts }) {
  const bits = [
    facts.latest ? `latest ${facts.latest}` : null,
    facts.published ? `published ${facts.published}` : null,
    facts.license,
    facts.registry === "missing" ? "not on npm" : null,
    facts.registry === "unreachable" ? "registry unread" : null,
  ].filter((bit): bit is string => Boolean(bit));
  if (bits.length === 0 && !facts.description) return null;
  return (
    <p className="fact-line">
      {facts.description ? <span>{facts.description}</span> : null}
      {bits.length > 0 ? <span>{bits.join(" · ")}</span> : null}
    </p>
  );
}
