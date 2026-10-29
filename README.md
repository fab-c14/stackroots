# Stackroots

Check a package before it joins a project.

Author: [fab-c14](https://github.com/fab-c14)

Live site: [stackroots-three.vercel.app](https://stackroots-three.vercel.app)

Command: `npx @fab-c14/stackroots check <package>`

Stackroots reads a project's `package.json` and lockfile, then says whether a package you are about to install fits the roots already there. The command prints the finding and the `npm install` line to use. The website runs the same check. Gemma 4 writes a fix only after a check finds a problem, or when you press the button on a selected package. Gemma does not run in the command, and it does not run on page load.

The check is free.

## Try the site

Open [stackroots-three.vercel.app](https://stackroots-three.vercel.app). A sample project named field-notes is already loaded. It uses React 19.3.0 and Node `>=18 <20`.

1. On a narrow screen, open the **Scan** tab. The check form is on the left. The project is on the right, under **Live**.
2. In **Check packages before you install them**, type `recompose` and press **Check**. The right side names the conflict: recompose 0.30.0 wants React 16 or older, and this project has React 19.3.0. No published release accepts that project, so the fix is not to install it.
3. Try `zod`, or several names at once: `zod, recompose@0.30.0`. Twelve names is the cap.
4. Paste a public repo such as `github.com/owner/repo` and press **Scan**. That replaces the sample. You can also drop a `package.json` and its lockfile.
5. Press **Open work**. Stackroots follows the GitHub repository on each root you already use and lists open help-wanted issues. An issue from the repo you scanned is kept only when its title names one of those packages.
6. Press **Ask Gemma 4 what this needs** on a selected root, or read the Gemma note that appears after a check with findings. Only public package facts are sent. The raw `package.json` stays in the browser.

Gemma 4 is `gemma-4-31b-it` through the Gemini API. The deterministic check does not need a key. The Gemma buttons need `GEMINI_API_KEY` on the host.

## Try the command

Node 22.18 or newer. From the project you want to check:

```bash
npx @fab-c14/stackroots report
npx @fab-c14/stackroots check zod
npx @fab-c14/stackroots check zod recompose
npx @fab-c14/stackroots check recompose@0.30.0
```

`npx` installs the package from the public npm registry. The command walks up from the current folder until it finds a manifest. It reads `package.json`, `package-lock.json`, `pnpm-lock.yaml`, and `yarn.lock`. A Yarn lockfile does not name the direct roots by itself, so it asks for `package.json`.

`report` does not call npm. It lists roots that disagree with the lockfile.

`check` looks up published releases. You can pass several names, separated by spaces or commas, or pin one with `name@version`. When the release you asked for would break this project, the command prints `npm install name@version` for a published release that fits. If you ask for `18.10.0` and that release conflicts, it names a different version. If no release fits, it tells you not to install the package. An error exits 1.

Errors are red, warnings are yellow, and each root kind has its own color. Set `NO_COLOR=1` to print plain text.

## Not legacy-peer-deps

`npm install --legacy-peer-deps` skips the peer check and installs the newest release anyway. The project is still incompatible. Stackroots does not skip the check. It names a published version that accepts the peers you have, or it tells you not to install the package.

## What a check decides

- A deprecated release is an error.
- A release already installed at the same version is reported as already there.
- A move inside the same major is allowed. A new major is an error.
- A missing required peer is a warning. An optional peer that is missing stays quiet.
- A peer range this project does not satisfy is an error.
- Node ranges that do not overlap are an error. This only runs when `package.json` has `engines.node`.
- Names in the same command count as installed together, so a peer brought in by a sibling is not treated as missing.
- A candidate with no peer declaration is not treated as a fix for a release that declares one.

## What a report decides

- No resolved version is an error. Add the lockfile from the same install.
- An open range (`*`, `x`, `latest`) is a warning.
- A git or folder install is a warning.
- A resolved version outside the requested range is an error.
- The heaviest root is the one that pulls the most packages in the lockfile.

## Example

`report` on this repository:

```text
13 direct roots. The lockfile agrees with the ranges in package.json.
eslint pulls 35.

root                    kind     asked   resolved  pulls
eslint                  dev      ^9      9.39.5    35
next                    runtime  16.4.3  16.4.3    21
eslint-config-next      dev      16.4.3  16.4.3    11
@tailwindcss/turbopack  dev      ^4      4.3.3     4
react-dom               runtime  19.3.0  19.3.0    2
@types/node             dev      ^20     20.19.43  1
@types/react            dev      ^19     19.3.0    1
@types/react-dom        dev      ^19     19.3.0    1
react                   runtime  19.3.0  19.3.0    0
semver                  runtime  ^7.8.5  7.8.5     0
tailwindcss             dev      ^4      4.3.3     0
typescript              dev      ^5      5.9.3     0
yaml                    runtime  ^2.8.0  2.9.1     0
```

`npx @fab-c14/stackroots check recompose` against this repository exits 1:

```text
recompose 0.30.0
error  react is 19.3.0. recompose wants ^0.14.0 || ^15.0.0 || ^16.0.0.
do     No published release of recompose accepts this project. Do not install it. npm install --legacy-peer-deps would only hide this conflict.
```

## Work on this repository

```bash
npm install
npm test
npm run dev
```

`npm run dev` serves the same desk at http://localhost:3000. Copy `.env.example` to `.env.local` and set `GEMINI_API_KEY` if you want Gemma locally. `GITHUB_TOKEN` is optional. It raises the GitHub rate limit for repository scans and for **Open work**.

The mark is `public/brand/mark.svg`. The header uses that file. The browser tab uses the same drawing at `src/app/icon.svg`.
