export type RepoIssue = {
  title: string;
  url: string;
  comments: number;
};

export type CommitShare = {
  login: string;
  percent: number;
  sampled: number;
};

export type ScannedFile = {
  name: string;
  text: string;
};

export type RepoScan = {
  owner: string;
  repo: string;
  ref: string;
  url: string;
  description: string | null;
  files: ScannedFile[];
  issues: RepoIssue[];
  commitShare: CommitShare | null;
  notices: string[];
};

export type GitHubTarget = {
  owner: string;
  repo: string;
  ref: string | null;
};

const MANIFESTS = ["package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock"] as const;
const MAX_CHARS = 1_500_000;

export function parseGitHubTarget(input: string): GitHubTarget | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (!trimmed.includes("://") && !trimmed.includes("github.com")) {
    const short = trimmed.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/);
    if (short?.[1] && short[2]) return { owner: short[1], repo: short[2], ref: null };
  }

  let url: URL;
  try {
    url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (url.hostname !== "github.com" && url.hostname !== "www.github.com") return null;

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const owner = parts[0];
  const repo = parts[1]?.replace(/\.git$/, "");
  if (!owner || !repo || !isSlug(owner) || !isSlug(repo)) return null;

  let ref: string | null = null;
  if (parts[2] === "tree" && parts.length === 4 && parts[3]) ref = decodeURIComponent(parts[3]);
  if (parts[2] === "blob" && parts.length >= 4 && parts[3]) ref = decodeURIComponent(parts[3]);
  return { owner, repo, ref };
}

export function manifestNamesIn(listing: unknown): string[] {
  if (!Array.isArray(listing)) return [];
  const present = new Set<string>();
  for (const item of listing) {
    const record = asRecord(item);
    if (record?.type === "file" && typeof record.name === "string") present.add(record.name);
  }
  return MANIFESTS.filter((name) => present.has(name));
}

export function readIssues(payload: unknown): RepoIssue[] {
  if (!Array.isArray(payload)) return [];
  const issues: RepoIssue[] = [];
  for (const item of payload) {
    const record = asRecord(item);
    if (!record || record.pull_request) continue;
    if (typeof record.title !== "string" || typeof record.html_url !== "string") continue;
    issues.push({
      title: record.title,
      url: record.html_url,
      comments: typeof record.comments === "number" ? record.comments : 0,
    });
    if (issues.length === 6) break;
  }
  return issues;
}

export function readCommitShare(payload: unknown): CommitShare | null {
  if (!Array.isArray(payload)) return null;
  const rows = payload.flatMap((item) => {
    const record = asRecord(item);
    if (!record || typeof record.login !== "string" || typeof record.contributions !== "number") return [];
    return [{ login: record.login, contributions: record.contributions }];
  });
  const total = rows.reduce((sum, row) => sum + row.contributions, 0);
  const top = rows[0];
  if (!top || total <= 0) return null;
  return { login: top.login, percent: Math.round((top.contributions / total) * 100), sampled: rows.length };
}

export async function scanPublicRepo(input: string, token?: string): Promise<
  | { ok: true; scan: RepoScan }
  | { ok: false; code: "bad-url" | "not-found" | "no-manifest" | "rate-limit"; message: string }
> {
  const target = parseGitHubTarget(input);
  if (!target) {
    return { ok: false, code: "bad-url", message: "Use a public GitHub repo, like github.com/owner/name." };
  }

  const headers = githubHeaders(token);
  const repoResponse = await fetch(`https://api.github.com/repos/${target.owner}/${target.repo}`, { headers, cache: "no-store" });
  if (repoResponse.status === 404) {
    return { ok: false, code: "not-found", message: "That repository is not public, or the name is wrong." };
  }
  if (repoResponse.status === 403 || repoResponse.status === 429) {
    return { ok: false, code: "rate-limit", message: "GitHub rate-limited this scan. Add GITHUB_TOKEN to .env.local, or try again shortly." };
  }
  if (!repoResponse.ok) {
    return { ok: false, code: "not-found", message: "GitHub did not return that repository." };
  }

  const repo = asRecord(await repoResponse.json());
  const ref = target.ref ?? (typeof repo?.default_branch === "string" ? repo.default_branch : "HEAD");
  const description = typeof repo?.description === "string" ? repo.description : null;

  const listingResponse = await fetch(
    `https://api.github.com/repos/${target.owner}/${target.repo}/contents/?ref=${encodeURIComponent(ref)}`,
    { headers, cache: "no-store" },
  );
  if (listingResponse.status === 403 || listingResponse.status === 429) {
    return { ok: false, code: "rate-limit", message: "GitHub rate-limited this scan. Add GITHUB_TOKEN to .env.local, or try again shortly." };
  }
  const names = listingResponse.ok ? manifestNamesIn(await listingResponse.json()) : [];
  if (names.length === 0) {
    return {
      ok: false,
      code: "no-manifest",
      message: "No package.json or lockfile at the root of that repo.",
    };
  }

  const [files, issues, commitShare] = await Promise.all([
    readManifestFiles(target, ref, names),
    readHelpWanted(target, headers),
    readShare(target, headers),
  ]);

  return {
    ok: true,
    scan: {
      owner: target.owner,
      repo: target.repo,
      ref,
      url: `https://github.com/${target.owner}/${target.repo}`,
      description,
      files: files.files,
      issues,
      commitShare,
      notices: files.notices,
    },
  };
}

async function readManifestFiles(target: GitHubTarget, ref: string, names: string[]) {
  const notices: string[] = [];
  const files: ScannedFile[] = [];
  await Promise.all(
    names.map(async (name) => {
      const response = await fetch(
        `https://raw.githubusercontent.com/${target.owner}/${target.repo}/${encodeURIComponent(ref)}/${name}`,
        { cache: "no-store", headers: { "user-agent": "stackroots" } },
      );
      if (!response.ok) {
        notices.push(`${name} was listed but could not be read.`);
        return;
      }
      const text = await response.text();
      if (text.length > MAX_CHARS) {
        notices.push(`${name} is too large to scan, so it was left out.`);
        return;
      }
      files.push({ name, text });
    }),
  );
  files.sort((a, b) => MANIFESTS.indexOf(a.name as (typeof MANIFESTS)[number]) - MANIFESTS.indexOf(b.name as (typeof MANIFESTS)[number]));
  return { files, notices };
}

async function readHelpWanted(target: GitHubTarget, headers: HeadersInit): Promise<RepoIssue[]> {
  const response = await fetch(
    `https://api.github.com/repos/${target.owner}/${target.repo}/issues?state=open&labels=${encodeURIComponent("help wanted")}&per_page=6`,
    { headers, cache: "no-store" },
  );
  if (!response.ok) return [];
  return readIssues(await response.json());
}

async function readShare(target: GitHubTarget, headers: HeadersInit): Promise<CommitShare | null> {
  const response = await fetch(
    `https://api.github.com/repos/${target.owner}/${target.repo}/contributors?per_page=5`,
    { headers, cache: "no-store" },
  );
  if (!response.ok) return null;
  return readCommitShare(await response.json());
}

function githubHeaders(token?: string): HeadersInit {
  return {
    accept: "application/vnd.github+json",
    "user-agent": "stackroots",
    "x-github-api-version": "2022-11-28",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

function isSlug(value: string): boolean {
  return /^[A-Za-z0-9_.-]+$/.test(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return null;
}
