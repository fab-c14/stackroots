"use client";

import { useEffect, useMemo, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import { EpitaphNote } from "./epitaph-note";
import { InstallCheck } from "./install-check";
import { InstallHero } from "./install-hero";
import { localFinding, projectReport, worse, type Finding, type FindingLevel } from "@/lib/findings";
import { mergePackageWork, type PackageWork, type RepoScan } from "@/lib/github-scan";
import { inspectGraph, type RangeClass, type RootView } from "@/lib/inspect-graph";
import { parseManifests, type DepKind, type ManifestGraph, type ParseResult } from "@/lib/parse-manifest";
import { SAMPLE_FILES, SAMPLE_PACKAGE_JSON } from "@/lib/sample-manifest";

const KIND_LABEL: Record<DepKind, string> = {
  runtime: "Runtime",
  dev: "Dev",
  optional: "Optional",
  peer: "Peer",
  unspecified: "Lockfile",
};

const RANGE_LABEL: Record<RangeClass, string> = {
  pinned: "Pinned",
  caret: "Caret",
  tilde: "Tilde",
  range: "Range",
  any: "Any",
  workspace: "Workspace",
  file: "File",
  git: "Git",
  unspecified: "Unspecified",
};

const KINDS: DepKind[] = ["runtime", "dev", "optional", "peer", "unspecified"];

type SortMode = "weight" | "name" | "kind" | "problems";

type AuditNote = Finding & { name: string; latest: string | null };

const KIND_RANK: Record<DepKind, number> = {
  runtime: 0,
  optional: 1,
  dev: 2,
  peer: 3,
  unspecified: 4,
};

export function IngestDesk() {
  const [paste, setPaste] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [names, setNames] = useState<string[]>(["package.json", "package-lock.json"]);
  const [hot, setHot] = useState(false);
  const [sample, setSample] = useState(true);
  const [result, setResult] = useState<ParseResult>(() => parseManifests(SAMPLE_FILES));
  const [query, setQuery] = useState("");
  const [kinds, setKinds] = useState<DepKind[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>("weight");
  const [selected, setSelected] = useState("next");
  const [repoInput, setRepoInput] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scan, setScan] = useState<RepoScan | null>(null);
  const [audit, setAudit] = useState<Record<string, AuditNote> | null>(null);
  const [auditing, setAuditing] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [problemsOnly, setProblemsOnly] = useState(false);
  const [work, setWork] = useState<PackageWork[] | null>(null);
  const [working, setWorking] = useState(false);
  const [workError, setWorkError] = useState<string | null>(null);
  const [pane, setPane] = useState<"scan" | "stage">("stage");

  useEffect(() => {
    function showHash() {
      const id = window.location.hash.replace("#", "");
      if (id === "try") setPane("stage");
      if (id === "command") setPane("scan");
      if (!id) return;
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }));
    }
    window.addEventListener("hashchange", showHash);
    return () => window.removeEventListener("hashchange", showHash);
  }, []);

  const graph: ManifestGraph | null = result.ok ? result.graph : null;
  const view = useMemo(() => (graph ? inspectGraph(graph) : null), [graph]);

  const visible = useMemo(() => {
    if (!view) return [];
    const needle = query.trim().toLowerCase();
    const filtered = view.roots.filter((root) => {
      if (needle && !root.name.toLowerCase().includes(needle)) return false;
      if (kinds.length > 0 && !kinds.includes(root.kind)) return false;
      if (problemsOnly && toneFor(root, audit) === "ok") return false;
      return true;
    });
    return [...filtered].sort((a, b) => compareRoots(a, b, sortMode, audit));
  }, [view, query, kinds, sortMode, audit, problemsOnly]);

  const shown = visible.find((root) => root.name === selected) ?? visible[0] ?? null;
  const maxPulls = Math.max(1, ...visible.map((root) => root.pulls.length));

  function readManifest(files: { name: string; text: string }[], fromSample = false) {
    setNames(files.map((file) => file.name));
    setSample(fromSample);
    setResult(parseManifests(files));
    setQuery("");
    setKinds([]);
    setSelected("");
    setScan(null);
    setAudit(null);
    setAuditError(null);
    setWork(null);
    setWorkError(null);
    setProblemsOnly(false);
  }

  async function takeFiles(list: File[]) {
    if (list.length === 0) return;
    const files = await Promise.all(list.map(async (file) => ({ name: file.name, text: await file.text() })));
    readManifest(files);
  }

  async function onDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setHot(false);
    await takeFiles([...event.dataTransfer.files]);
  }

  async function onPick(event: ChangeEvent<HTMLInputElement>) {
    const list = event.target.files;
    if (!list) return;
    await takeFiles([...list]);
    event.target.value = "";
  }

  function onPaste(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    readManifest([{ name: "paste", text: paste }]);
  }

  function loadSample() {
    setPaste(SAMPLE_PACKAGE_JSON);
    readManifest(SAMPLE_FILES, true);
    setSelected("next");
    setSortMode("weight");
  }

  async function onScan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setScanning(true);
    setScanError(null);
    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: repoInput }),
      });
      const payload = (await response.json()) as
        | { ok: true; scan: RepoScan }
        | { ok: false; message?: string };
      if (!payload.ok) {
        setScan(null);
        setScanError(payload.message ?? "That repository could not be scanned.");
        setPane("scan");
        return;
      }
      if (!payload.scan) {
        setScan(null);
        setScanError("That repository could not be scanned.");
        setPane("scan");
        return;
      }
      readManifest(payload.scan.files);
      setScan(payload.scan);
      setSample(false);
      setPane("stage");
    } catch {
      setScanError("The scan could not reach GitHub.");
      setPane("scan");
    } finally {
      setScanning(false);
    }
  }

  async function onAudit() {
    if (!graph) return;
    setAuditing(true);
    setAuditError(null);
    try {
      const response = await fetch("/api/audit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          packages: graph.direct.map((dep) => ({ name: dep.name, resolved: dep.resolved })),
        }),
      });
      const payload = (await response.json()) as
        | { ok: true; notes: AuditNote[]; skipped: number }
        | { ok: false; message?: string };
      if (!payload.ok) {
        setAuditError(payload.message ?? "The registry scan did not finish.");
        return;
      }
      const next: Record<string, AuditNote> = {};
      for (const note of payload.notes) next[note.name] = note;
      setAudit(next);
      if (payload.skipped > 0) setAuditError(`Scanned the first 40 roots. ${payload.skipped} were left out.`);
    } catch {
      setAuditError("The registry scan could not be reached.");
    } finally {
      setAuditing(false);
    }
  }

  async function onWork() {
    if (!graph) return;
    setWorking(true);
    setWorkError(null);
    try {
      const response = await fetch("/api/work", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ names: graph.direct.map((dep) => dep.name) }),
      });
      const payload = (await response.json()) as
        | { ok: true; packages: PackageWork[]; skipped: number; limited: boolean }
        | { ok: false; message?: string };
      if (!payload.ok) {
        setWorkError(payload.message ?? "Open work could not be matched.");
        return;
      }
      setWork(payload.packages);
      setPane("stage");
      if (payload.limited) setWorkError("GitHub rate-limited part of this lookup. Add GITHUB_TOKEN to .env.local, or try again shortly.");
      else if (payload.skipped > 0) setWorkError(`Matched the first 12 roots. ${payload.skipped} were left out.`);
    } catch {
      setWorkError("Open work could not be reached.");
    } finally {
      setWorking(false);
    }
  }

  function clear() {
    setPaste("");
    setNames([]);
    setSample(false);
    setScan(null);
    setScanError(null);
    setAudit(null);
    setAuditError(null);
    setWork(null);
    setWorkError(null);
    setProblemsOnly(false);
    setResult({ ok: false, issue: { code: "empty", message: "Drop a manifest to begin." } });
    setQuery("");
    setKinds([]);
  }

  const workRows = useMemo(
    () => (view ? mergePackageWork(view.roots.map((root) => root.name), work ?? [], scan?.issues ?? []) : []),
    [view, work, scan],
  );
  const openRows = workRows.filter((item) => item.issues.length > 0);

  const rangeMix = view
    ? (Object.entries(view.summary.byRange) as Array<[RangeClass, number]>)
        .filter(([, count]) => count > 0)
        .map(([range, count]) => `${count} ${RANGE_LABEL[range].toLowerCase()}`)
        .join(" · ")
    : "";

  return (
    <main className="workspace" data-pane={pane}>
      <div className="pane-switch" role="tablist" aria-label="Workspace">
        <button type="button" role="tab" aria-selected={pane === "scan"} onClick={() => setPane("scan")}>
          Scan
        </button>
        <button type="button" role="tab" aria-selected={pane === "stage"} onClick={() => setPane("stage")}>
          Live
        </button>
      </div>
      <aside className="rail">
        <InstallHero />
        <div className="rail-actions">
          <label
            className={hot ? "slot hot" : "slot"}
            onDragOver={(event) => {
              event.preventDefault();
              setHot(true);
            }}
            onDragLeave={() => setHot(false)}
            onDrop={onDrop}
          >
            <input className="sr-only" type="file" multiple accept=".json,.yaml,.yml,.lock" onChange={onPick} />
            {graph ? "Replace manifest" : "Drop a manifest"}
          </label>
          <button type="button" className="text-button" onClick={loadSample}>
            Load sample
          </button>
          <button type="button" className="text-button" onClick={() => setPasteOpen((open) => !open)}>
            {pasteOpen ? "Hide paste" : "Paste"}
          </button>
          {graph ? (
            <button type="button" className="text-button" onClick={clear}>
              Clear
            </button>
          ) : null}
        </div>
        <div className="intake solo">
          <form className="scan" onSubmit={onScan}>
            <label htmlFor="repo-url">Scan a public GitHub repo</label>
            <div className="scan-row">
              <input
                id="repo-url"
                type="text"
                value={repoInput}
                onChange={(event) => setRepoInput(event.target.value)}
                placeholder="github.com/owner/repo"
                spellCheck={false}
                autoCapitalize="off"
              />
              <button className="primary" type="submit" disabled={scanning || repoInput.trim() === ""}>
                {scanning ? "Scanning" : "Scan"}
              </button>
            </div>
          </form>
          {graph ? <InstallCheck installed={graph.direct} node={graph.enginesNode} onLive={() => setPane("stage")} /> : null}
        </div>
        {scanError ? (
          <p className="issue" role="alert">
            {scanError}
          </p>
        ) : null}
        {pasteOpen ? (
          <form className="paste" onSubmit={onPaste}>
            <label htmlFor="manifest-paste">Paste a package.json</label>
            <textarea
              id="manifest-paste"
              value={paste}
              onChange={(event) => setPaste(event.target.value)}
              spellCheck={false}
              placeholder='{ "dependencies": { "react": "^18.3.1" } }'
            />
            <div className="actions">
              <button className="primary" type="submit">
                Read paste
              </button>
            </div>
          </form>
        ) : null}
      </aside>
      <section className="stage" id="try">
        <header className="stage-bar">
          <h1 className="project-name">{graph?.rootName ?? "No manifest yet"}</h1>
        </header>
        <div id="live-check" />
        {scanning ? <p className="notice">Reading the public repository.</p> : null}
      {scan ? <RepoPanel scan={scan} /> : null}

      {sample && graph ? (
        <p className="banner">Sample project field-notes is loaded. Type recompose and press Check, or scan a public GitHub repo.</p>
      ) : null}
      {names.length > 0 && graph ? <p className="plate-note">Read {names.join(", ")}.</p> : null}

      {result && !result.ok && result.issue.code !== "empty" ? (
        <p className="issue" role="alert">
          {result.issue.message}
        </p>
      ) : null}

      {result.ok
        ? result.notices.map((notice) => (
            <p className="notice" key={notice}>
              {notice}
            </p>
          ))
        : null}

      {view && graph ? (
        <>
          <ProjectReport viewRoots={view.roots} pullsKnown={view.summary.pullsKnown} node={graph.enginesNode} />
          <dl className="stats">
            <Stat label="Direct roots" value={view.summary.direct} />
            {KINDS.filter((kind) => view.summary.byKind[kind] > 0).map((kind) => (
              <Stat key={kind} label={KIND_LABEL[kind]} value={view.summary.byKind[kind]} kind={kind} />
            ))}
            <Stat label="Resolved" value={view.summary.resolved} />
            {view.summary.unresolved > 0 ? <Stat label="Unresolved" value={view.summary.unresolved} tone="error" /> : null}
            <Stat label={view.summary.pullsKnown ? "Folded under them" : "Folded"} value={view.summary.folded} />
          </dl>
          {rangeMix ? <p className="range-mix">{rangeMix}</p> : null}

          {visible.length > 0 ? (
            <div className="plate" role="group" aria-label="Direct roots by how many packages they pull">
              {visible.map((root) => {
                const height = view.summary.pullsKnown ? `${Math.max(8, (root.pulls.length / maxPulls) * 100)}%` : "42%";
                const pressed = shown?.name === root.name;
                return (
                  <button
                    key={root.name}
                    type="button"
                    className="bar"
                    data-tone={toneFor(root, audit)}
                    aria-pressed={pressed}
                    onClick={() => setSelected(root.name)}
                  >
                    <span className="stem-track">
                      <span className="stem" data-kind={root.kind} style={{ height }} />
                    </span>
                    <span className="bar-name">{root.name}</span>
                    <span className="bar-count">{view.summary.pullsKnown ? root.pulls.length : RANGE_LABEL[root.range]}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="notice">No roots match this filter.</p>
          )}
          <p className="plate-note">
            {view.summary.pullsKnown
              ? "Bar height is the number of packages that root pulls in the lockfile. Select one to read them."
              : "This manifest has no lockfile beside it, so the bars stay even. Add a lockfile to see what each root pulls."}
          </p>

          <div className="work">
            <div className="toolbar">
              <label>
                Find a root
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="react, eslint…"
                />
              </label>
              <div className="chips" role="group" aria-label="Filter by kind">
                {KINDS.filter((kind) => view.summary.byKind[kind] > 0).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    className="chip"
                    data-kind={kind}
                    aria-pressed={kinds.includes(kind)}
                    onClick={() =>
                      setKinds((current) =>
                        current.includes(kind) ? current.filter((item) => item !== kind) : [...current, kind],
                      )
                    }
                  >
                    {KIND_LABEL[kind]} {view.summary.byKind[kind]}
                  </button>
                ))}
                <button
                  type="button"
                  className="chip"
                  data-tone="error"
                  aria-pressed={problemsOnly}
                  onClick={() => setProblemsOnly((current) => !current)}
                >
                  Problems
                </button>
              </div>
              <label className="sort">
                Sort
                <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
                  <option value="weight">Heaviest</option>
                  <option value="name">Name</option>
                <option value="kind">Kind</option>
                <option value="problems">Problems</option>
              </select>
            </label>
            <button type="button" className="text-button scan-roots" onClick={onAudit} disabled={auditing}>
              {auditing ? "Scanning roots" : "Scan roots"}
            </button>
            <button type="button" className="text-button scan-roots" onClick={onWork} disabled={working}>
              {working ? "Matching" : "Open work"}
            </button>
          </div>
          {auditError ? (
            <p className={auditError.startsWith("Scanned") ? "notice" : "issue"} role="alert">
              {auditError}
            </p>
          ) : null}
          {audit ? <p className="audit-line">{auditLine(view.roots, audit)}</p> : null}
          {workError ? (
            <p className={workError.startsWith("Matched") ? "notice" : "issue"} role="alert">
              {workError}
            </p>
          ) : null}
          {work || openRows.length > 0 ? (
            <section className="open-work">
              <h2>Open work on roots you already use</h2>
              {openRows.length > 0 ? (
                <ul>
                  {openRows.map((item) => (
                    <li key={item.name}>
                      <button type="button" onClick={() => setSelected(item.name)}>
                        {item.name}
                      </button>
                      <a href={item.issues.length === 1 ? item.issues[0]?.url : (item.url ?? item.issues[0]?.url)}>
                        {item.issues.length === 1 ? item.issues[0]?.title : `${item.issues.length} help-wanted`}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>None of these roots have an open help-wanted issue.</p>
              )}
            </section>
          ) : null}

            <div className="split">
              <div className="log">
                <div className="log-head" aria-hidden="true">
                  <span />
                  <span>Package</span>
                  <span>Kind</span>
                  <span>Asked</span>
                  <span>Resolved</span>
                </div>
                <ul className="root-list">
                  {visible.map((root) => (
                    <li key={root.name}>
                      <button
                        type="button"
                        className="row"
                        data-kind={root.kind}
                        data-tone={toneFor(root, audit)}
                        aria-pressed={shown?.name === root.name}
                        onClick={() => setSelected(root.name)}
                      >
                        <span className="mark" data-kind={root.kind} aria-hidden="true" />
                        <span className="name">
                          {root.name}
                          <Flags root={root} note={audit?.[root.name]} openWork={(workRows.find((item) => item.name === root.name)?.issues.length ?? 0) > 0} />
                        </span>
                        <span className="meta kind">{KIND_LABEL[root.kind]}</span>
                        <span className="meta asked">{root.requested ?? "none"}</span>
                        <span className="meta resolved">{root.resolved ?? "unresolved"}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              {shown ? (
                <Detail
                  root={shown}
                  pullsKnown={view.summary.pullsKnown}
                  note={audit?.[shown.name]}
                  work={workRows.find((item) => item.name === shown.name) ?? null}
                />
              ) : (
                <p className="notice">Nothing selected.</p>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="empty-spec">
          <label
            className="empty-slot"
            onDragOver={(event) => {
              event.preventDefault();
              setHot(true);
            }}
            onDragLeave={() => setHot(false)}
            onDrop={onDrop}
          >
            <input className="sr-only" type="file" multiple accept=".json,.yaml,.yml,.lock" onChange={onPick} />
            <strong>Drop the manifest here</strong>
            <span>package.json, package-lock.json, pnpm-lock.yaml, yarn.lock</span>
          </label>
          <dl className="spec">
            <div>
              <dt>package.json</dt>
              <dd>The roots you asked for, and whether each range is pinned, caret, or open.</dd>
            </div>
            <div>
              <dt>package-lock.json</dt>
              <dd>Resolved versions, and the packages sitting under each root.</dd>
            </div>
            <div>
              <dt>pnpm-lock.yaml</dt>
              <dd>The same reading, from a pnpm importer.</dd>
            </div>
            <div>
              <dt>yarn.lock</dt>
              <dd>Resolved versions once the package.json from the same project is here too.</dd>
            </div>
          </dl>
        </div>
      )}
      </section>
    </main>
  );
}

function RepoPanel({ scan }: { scan: RepoScan }) {
  const heat = !scan.commitShare ? "low" : scan.commitShare.percent >= 80 ? "high" : scan.commitShare.percent >= 50 ? "mid" : "low";
  return (
    <section className="repo-panel">
      <div>
        <header>
          <a href={scan.url}>
            {scan.owner}/{scan.repo}
          </a>
          <span>{scan.ref}</span>
        </header>
        {scan.description ? <p>{scan.description}</p> : null}
        {scan.notices.map((notice) => (
          <p key={notice}>{notice}</p>
        ))}
      </div>
      <div>
        <h2>Commit share</h2>
        {scan.commitShare ? (
          <>
            <div className="share" aria-hidden="true">
              <span className="share-fill" data-heat={heat} style={{ width: `${scan.commitShare.percent}%` }} />
            </div>
            <p>
              {scan.commitShare.login} holds {scan.commitShare.percent}% of the commits GitHub counts for the top{" "}
              {scan.commitShare.sampled} public contributors.
            </p>
          </>
        ) : (
          <p>GitHub did not return a public contributor list.</p>
        )}
      </div>
      <div>
        <h2>Help wanted {scan.issues.length > 0 ? <span className="count">{scan.issues.length}</span> : null}</h2>
        {scan.issues.length > 0 ? (
          <ul>
            {scan.issues.map((issue) => (
              <li key={issue.url}>
                <a href={issue.url}>{issue.title}</a>
                <span>{issue.comments}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p>No open help-wanted issues on this repository.</p>
        )}
      </div>
    </section>
  );
}

function ProjectReport({
  viewRoots,
  pullsKnown,
  node,
}: {
  viewRoots: RootView[];
  pullsKnown: boolean;
  node: string | null;
}) {
  const report = projectReport(
    viewRoots.map((root) => ({ ...root, pulls: root.pulls.length })),
    pullsKnown,
  );
  return (
    <section className="report">
      <p>{report.headline}</p>
      <p>{report.detail}</p>
      {node ? <p>Node {node}</p> : null}
      {report.problems.length > 0 ? (
        <ul>
          {report.problems.map((problem) => (
            <li key={`${problem.name}-${problem.label}`} data-tone={problem.level}>
              <strong>{problem.name}</strong>
              <span>{problem.message}</span>
              <span>{problem.solution}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function Stat({
  label,
  value,
  kind,
  tone,
}: {
  label: string;
  value: number;
  kind?: DepKind;
  tone?: FindingLevel;
}) {
  return (
    <div data-kind={kind} data-tone={tone}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Flags({ root, note, openWork }: { root: RootView; note?: AuditNote; openWork?: boolean }) {
  const local = localFinding(root);
  const labels = [local.label, note?.label ?? ""].filter((label) => label !== "" && label !== "Current");
  if (labels.length === 0 && !openWork) return null;
  return (
    <span className="flags">
      {labels.map((label) => (
        <span key={label} className="flag" data-tone={label === local.label ? local.level : note?.level}>
          {label}
        </span>
      ))}
      {openWork ? <span className="flag">Open</span> : null}
    </span>
  );
}

function Detail({
  root,
  pullsKnown,
  note,
  work,
}: {
  root: RootView;
  pullsKnown: boolean;
  note?: AuditNote;
  work: PackageWork | null;
}) {
  const local = localFinding(root);
  const messages = [local.message, note?.message ?? ""].filter(Boolean);
  const fixes = [local.solution, note?.solution ?? ""].filter(Boolean);
  return (
    <aside className="detail">
      <h2>{root.name}</h2>
      {messages.length > 0 ? (
        <ul className="finding-list">
          {messages.map((message) => (
            <li key={message} data-tone={message === local.message ? local.level : note?.level}>
              {message}
            </li>
          ))}
        </ul>
      ) : null}
      {fixes.length > 0 ? (
        <div className="fix-block">
          <p className="kicker">Do this</p>
          {fixes.map((fix) => (
            <p key={fix}>{fix}</p>
          ))}
        </div>
      ) : null}
      <dl className="facts">
        <div>
          <dt>Kind</dt>
          <dd>{KIND_LABEL[root.kind]}</dd>
        </div>
        <div>
          <dt>Range</dt>
          <dd>{RANGE_LABEL[root.range]}</dd>
        </div>
        <div>
          <dt>Asked for</dt>
          <dd>{root.requested ?? "none"}</dd>
        </div>
        <div>
          <dt>Resolved</dt>
          <dd>{root.resolved ?? "none"}</dd>
        </div>
      </dl>
      {work ? (
        <div className="work-list">
          <h3>Help wanted</h3>
          {work.url && work.repo ? <p><a href={work.url}>{work.repo}</a></p> : null}
          {work.issues.length > 0 ? (
            <ul>
              {work.issues.map((issue) => (
                <li key={issue.url}>
                  <a href={issue.url}>{issue.title}</a>
                  <span>{issue.comments}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p>{work.note}</p>
          )}
        </div>
      ) : null}
      <EpitaphNote root={root} />
      <h3>{pullsKnown ? `${root.pulls.length} pulled` : "Pulls hidden"}</h3>
      {pullsKnown ? (
        root.pulls.length > 0 ? (
          <ul className="pulls">
            {root.pulls.map((pull) => (
              <li key={pull.name}>
                <span>{pull.name}</span>
                <span>
                  {pull.requested ?? "none"}
                  {pull.alsoRoot ? <span className="tag"> · also a root</span> : null}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="folded">This root pulls nothing else in the lockfile.</p>
        )
      ) : (
        <p className="folded">Add the lockfile from the same project to list the packages under this root.</p>
      )}
    </aside>
  );
}

function compareRoots(a: RootView, b: RootView, sortMode: SortMode, audit: Record<string, AuditNote> | null) {
  if (sortMode === "name") return a.name.localeCompare(b.name);
  if (sortMode === "kind") return KIND_RANK[a.kind] - KIND_RANK[b.kind] || a.name.localeCompare(b.name);
  if (sortMode === "problems") {
    const rank: Record<FindingLevel, number> = { error: 0, warn: 1, ok: 2 };
    return rank[toneFor(a, audit)] - rank[toneFor(b, audit)] || b.pulls.length - a.pulls.length || a.name.localeCompare(b.name);
  }
  return b.pulls.length - a.pulls.length || a.name.localeCompare(b.name);
}

function toneFor(root: RootView, audit: Record<string, AuditNote> | null): FindingLevel {
  const remote = audit?.[root.name]?.level ?? "ok";
  return worse(localFinding(root).level, remote);
}

function auditLine(roots: RootView[], audit: Record<string, AuditNote>) {
  let behind = 0;
  let deprecated = 0;
  let current = 0;
  for (const root of roots) {
    const note = audit[root.name];
    if (!note || note.level === "ok") current += 1;
    else if (note.label === "Deprecated") deprecated += 1;
    else behind += 1;
  }
  return `${current} on the current major · ${behind} to look at · ${deprecated} deprecated`;
}
