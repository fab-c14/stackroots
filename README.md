# Stackroots

Check a package before it joins a project.

Author: [fab-c14](https://github.com/fab-c14)

Stackroots reads the nearest `package.json` and lockfile, then says whether a package you are about to install fits the roots already there. The command prints the finding and what to do. The website runs the same check and, only when that check finds a problem, asks Gemma 4 to write the fix. Gemma does not run in the command, and it does not run on page load.

## What it decides

`check` looks up the latest npm release for each name.

- A deprecated release is an error.
- A release already installed at the same version is reported as already there.
- A move inside the same major is allowed. A new major is an error.
- A missing required peer is a warning. An optional peer that is missing stays quiet.
- A peer range this project does not satisfy is an error.
- Node ranges that do not overlap are an error. This only runs when `package.json` has `engines.node`.
- Names in the same command count as installed together, so a peer brought in by a sibling is not treated as missing.

Separate names with spaces or commas. The cap is 12. An error exits 1.

`report` does not call npm. It reads the project you are in.

- No resolved version is an error. Add the lockfile from the same install.
- An open range (`*`, `x`, `latest`) is a warning.
- A git or folder install is a warning.
- A resolved version outside the requested range is an error.
- The heaviest root is the one that pulls the most packages in the lockfile.

Files it reads, walking up from the current folder: `package.json`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`. A Yarn lockfile does not name the direct roots by itself, so it asks for `package.json`.

## Command

From this folder:

```bash
npm install
npx stackroots report
npx stackroots check zod
npx stackroots check zod recompose
npx stackroots check recompose@0.30.0
```

`report` reads the project and lists roots that disagree with the lockfile.

`check` looks up published npm releases. You can pass several names, or pin one with `name@version`. When the release you asked for would break this project, the command prints `npm install name@version` for a published release that fits. If you ask for `18.10.0` and that release conflicts, it names a different version. If no release fits, it tells you not to install the package.

`npm install --legacy-peer-deps` is a different thing. That flag skips the peer check and installs the newest release anyway. The conflict stays in the project. Stackroots does not skip the check.

This package is `"private": true` and is not on the public npm registry. Run the commands from this folder. From another folder, `npx` looks for a published package and will not find this one.

In a terminal, errors are red, warnings are yellow, and each root kind has its own color. Set `NO_COLOR=1` to print plain text.

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

`check recompose` against this repository exits 1:

```text
recompose 0.30.0
error  react is 19.3.0. recompose wants ^0.14.0 || ^15.0.0 || ^16.0.0.
do     Keep react at 19.3.0. Do not install recompose unless you move react into ^0.14.0 || ^15.0.0 || ^16.0.0.
```

## Website

```bash
npm run dev
```

Open http://localhost:3000

The mark is `public/brand/mark.svg`. The header uses that file. The browser tab uses the same drawing at `src/app/icon.svg`.

The page loads a sample project called field-notes: 12 direct roots, a lockfile, and Node `>=18 <20`. Scan a public GitHub repository, drop a manifest, or type the packages you would install.

**Scan roots** compares the roots you already have with the latest npm releases. **Ask Gemma 4 what this needs** writes a note for the root you select. That request runs only when you press the button.

Copy `.env.example` to `.env.local` and set `GEMINI_API_KEY` for Gemma 4 (`gemma-4-31b-it` through the Gemini API). `GITHUB_TOKEN` is optional. It raises the GitHub rate limit for repository scans.

Only public package facts are sent to Gemma. The raw `package.json` stays in the browser.

## Test

```bash
npm test
```

## Still open

- Help-wanted issues on each dependency. Today that list is only for the repository you scan.
- Matching those issues to the packages you already use.
- Deploying the site.
