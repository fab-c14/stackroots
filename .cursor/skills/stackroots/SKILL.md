---
name: stackroots
description: >-
  Checks whether an npm package fits the current project before install.
  Use when adding, upgrading, or recommending an npm dependency, or when
  the user mentions peer dependencies, legacy-peer-deps, package.json,
  a lockfile, or stackroots.
---

# Stackroots

Run this before `npm install` of a new or upgraded package. The command is the decision. Do not invent a version, and do not pass `--legacy-peer-deps`.

Node 22.18 or newer. Run from the project that holds the manifest.

```bash
npx @fab-c14/stackroots report
npx @fab-c14/stackroots check <package> [more]
npx @fab-c14/stackroots check <package>@<version>
```

`report` reads the local tree and does not call npm. `check` looks up published releases. Separate names with spaces or commas. The cap is 12. Set `NO_COLOR=1` for plain text.

## After the command

- Exit 0 and no `error` line: install the name you checked.
- A `fix` line is the install command. Run that. Do not install the rejected version.
- A `do` line that says not to install means stop.
- Never add `--legacy-peer-deps` or `legacy-peer-deps=true` to get past an error.
- Quote the `error` and `do` lines to the user. Do not replace them with a version the command did not print.

A peer range the project does not satisfy is an error. A new major of a package already installed is an error. A missing required peer is a warning. Names in one command count as installed together. A release that does not declare a peer is not a fix for a release that does.

Gemma 4 is not part of this command. It runs on the website only, after a finding or a button press.

The full decision list and a worked example are in the repository README.
