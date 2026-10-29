# Stackroots

Check a package before it joins a project.

Author: [fab-c14](https://github.com/fab-c14)

Live site: [stackroots-three.vercel.app](https://stackroots-three.vercel.app)

Package: [@fab-c14/stackroots](https://www.npmjs.com/package/@fab-c14/stackroots)

Stackroots reads the nearest `package.json` and lockfile and says whether a package you are about to install fits the roots already there. It prints the finding and, when one exists, the `npm install` line to use. The check is free.

Give this file to a person or to an agent. The procedure under **Instructions for an agent** is enough to run the check without the rest of the repository. The same procedure is the project skill at [`.cursor/skills/stackroots/SKILL.md`](.cursor/skills/stackroots/SKILL.md).

## How to run

Node 22.18 or newer.

From the project you want to check:

```bash
npx @fab-c14/stackroots report
npx @fab-c14/stackroots check zod
npx @fab-c14/stackroots check zod recompose
npx @fab-c14/stackroots check recompose@0.30.0
```

`npx` installs the package from the public npm registry. The command walks up from the current folder until it finds a manifest. It reads `package.json`, `package-lock.json`, `pnpm-lock.yaml`, and `yarn.lock`. A Yarn lockfile does not name the direct roots by itself, so run it in a folder that also has `package.json`.

`report` does not call npm. It lists roots that disagree with the lockfile.

`check` looks up published releases. Separate names with spaces or commas, or pin one with `name@version`. The cap is 12. An error exits 1. Set `NO_COLOR=1` to print plain text. Errors are red, warnings are yellow, and each root kind has its own color.

To try the same check in a browser, open [stackroots-three.vercel.app](https://stackroots-three.vercel.app). A sample project named field-notes is already loaded. It uses React 19.3.0 and Node `>=18 <20`.

1. On a narrow screen, open **Scan**. The check form is on the left. The project is on the right, under **Live**.
2. In **Check packages before you install them**, type `recompose` and press **Check**. recompose 0.30.0 wants React 16 or older. This project has React 19.3.0. No published release accepts that project, so the fix is not to install it.
3. Try `zod`, or several names: `zod, recompose@0.30.0`.
4. Paste a public repo such as `github.com/owner/repo` and press **Scan**, or drop a `package.json` and its lockfile.
5. Press **Open work** to list open help-wanted issues on packages this project already uses.
6. Press **Ask Gemma 4 what this needs** on a selected root, or read the note that appears after a check with findings. Gemma 4 (`gemma-4-31b-it`) runs only then. It does not run in the command, and it does not run on page load. Only public package facts are sent. The raw `package.json` stays in the browser. The Gemma buttons need `GEMINI_API_KEY` on the host. The check does not.

## Why it helps

A person can see a conflict before npm writes it into the lockfile. If version 18.10.0 would break the peers already in the project, Stackroots names a published release that fits and prints `npm install name@version`. If none fits, it says not to install the package.

`npm install --legacy-peer-deps` is not that fix. That flag skips the peer check and installs the newest release anyway. The project is still incompatible. Stackroots does not skip the check.

An agent can use the same command as a gate before it adds a dependency. The exit code and the `do` and `fix` lines are the decision. The agent does not have to guess a version, and it should not hide a conflict with `--legacy-peer-deps`.

## Instructions for an agent

Follow these steps before adding, upgrading, or recommending an npm package. Run them in the project that contains the manifest, not in a temporary folder.

1. Use Node 22.18 or newer.
2. Read the tree first when the task touches several dependencies:

   ```bash
   npx @fab-c14/stackroots report
   ```

3. Check every package you intend to install. Repeat names are ignored. More than 12 names keeps the first 12.

   ```bash
   npx @fab-c14/stackroots check <package> [more]
   npx @fab-c14/stackroots check <package>@<version>
   ```

4. Read the output before you install.
   - Exit 0 and no `error` line: the release fits. You may install the name you checked.
   - A `fix` line is an npm command. Run that command. Do not install the version that was rejected.
   - A `do` line that says not to install means stop. Do not run `npm install` for that package.
   - Do not add `--legacy-peer-deps` or `legacy-peer-deps=true`. That hides the conflict the check just reported.
5. Tell the user the `error` line and the `do` line in your own summary. Do not invent a version the command did not print.
6. Do not call Gemma from the command. Gemma runs on the website only, and only after a finding or a button press.

A missing required peer is a warning. An optional missing peer is quiet. A peer range this project does not satisfy is an error. A new major of a package already installed is an error. A move inside the same major is allowed. Node ranges are compared only when `package.json` has `engines.node`. Names passed together count as installed together. A release that does not declare a peer is not a fix for a release that does.

`report` treats a missing resolved version as an error, an open range (`*`, `x`, `latest`) as a warning, a git or folder install as a warning, and a resolved version outside the requested range as an error.

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
