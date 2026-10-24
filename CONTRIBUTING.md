# Contributing to datme

Issues and merge requests are welcome on
[GitLab](https://gitlab.com/dynamo-brain/datme). Before sending a change, run
the checks CI runs:

```bash
bun install
bun run lint          # Biome: lint, and the formatting it expects
bunx astro check
bun test --coverage
```

`bun run format` formats the tree. [Biome](https://biomejs.dev) reads
`biome.jsonc`, where each rule turned off says why; a finding that is
deliberate gets a `// biome-ignore <rule>: <reason>` comment on the line above.
`prek install` (or `pre-commit install`) runs Biome on staged files, and
`dyshellint` on shell scripts, before each commit; `git config
blame.ignoreRevsFile .git-blame-ignore-revs` keeps the formatting commit out of
`git blame`.

With `--coverage` the run fails unless every line and function of `src/` and
`bin/` runs in some test (`coverageThreshold` in `bunfig.toml`). Run single
files without it: on its own, a file covers only part of the code.

A change to `package.json` (`files`, dependencies, `engines`) or to how the
CLI starts should also pass `bun tools/pack-check.ts`: it packs datme,
installs the tarball with npm in an empty project and builds the fixture
vault with that copy under Node, as CI does on every Node `engines` allows.

Record anything a user could notice in `CHANGELOG.md`, under `[Unreleased]`.

## Benchmarks

`bun tools/bench.ts --notes 1000` builds a generated vault (`tools/bench-vault.ts`:
the same notes for the same `--seed`) twice, cold and from the cache, starts
`datme dev` and saves a note, then prints the times, peak memory, output size
and what a note page loads; `--install` adds the installed size, `--json`
writes the result and `--compare` checks it against a baseline (`--help` lists
the rest). The `bench` job runs 10,000 notes on the default branch and on a
schedule, 1,000 on a branch with an open merge request, and keeps
`bench.json`; it compares with `tools/bench-baseline.json` once one taken on
the CI runners is committed.

## Dependency updates

[Renovate](https://docs.renovatebot.com) opens the merge requests that update
dependencies, on GitLab only (the GitHub copy is a mirror), as configured in
`.gitlab/renovate.json`: once a month, with Astro, Shiki, Fontsource, Marp and
the type definitions each in one merge request, and the lockfile refreshed the
same day. Patches and minors of dev dependencies come weekly and merge on their
own once the pipeline passes; the rest waits for a review. Every Bun pin (the
CI images, `setup-bun`, the pipelines `datme deploy` writes and their examples)
moves in one merge request, never merged unread. An advisory gets its merge
request at once, outside the schedule. A merge request that a user could notice
still needs its line in `CHANGELOG.md`.

The `audit` job runs `bun audit` on `bun.lock`: it prints every advisory and
fails on a high or critical one, dev dependencies included, since `bun audit`
cannot tell them apart. `bun audit fix` updates what the ranges allow; for the
rest, raise the dependency or add an entry to `overrides` in `package.json`.
An override is a last resort: it holds a patched release under a parent's pin,
and only in datme's own install, never in a project that installs datme. When
nothing can be fixed yet, add `--ignore=GHSA-…` to the job in both
`.gitlab-ci.yml` and `.github/workflows/ci.yml`, with a comment saying why it
is safe to skip and which issue tracks it.

## Adding a language to the interface

The interface texts live in `src/i18n`, one JSON file per language, named by
its base tag: `fr.json` serves `fr-FR`, `fr-CA` and every other French.

1. Copy `src/i18n/en.json` to `src/i18n/<tag>.json` and translate the values.
   Keep the keys, and keep each placeholder (`{n}`, `{date}`, `{lang}`…) as it
   is: datme fills them in.
2. Import the file in `src/lib/i18n.ts` and add it to `builtin`.
3. Run `bun test tests/i18n.test.ts`. It fails when a key or a placeholder is
   missing or extra.

The garden words matter: notes are *planted*, *watered* and *tended*, and grow
through *stages*. Pick the words a gardener would use in your language.

A new key goes into every file in the same change, in English if you cannot
translate it; the test keeps them in step.

## Cutting a release

Releases start from the default branch, with the changes under
`[Unreleased]` in `CHANGELOG.md`:

```bash
scripts/release.sh --dry-run --version 3.0.0   # every check, nothing written
scripts/release.sh --version 3.0.0
```

The script runs the checks above, stamps `package.json`, turns
`[Unreleased]` into the release, commits `chore: release v3.0.0`, tags it and
pushes the branch and the tag to `origin` (GitLab) and `gh` (GitHub). The tag
does the rest: GitLab and GitHub each make a release described by the
version's section of `CHANGELOG.md` (`tools/release-notes.ts`), and GitHub
publishes the package to npm by trusted publishing, with no npm token. A
pre-release such as `3.0.0-rc.2` goes to npm's `next` dist-tag. Without
`--version`, the version comes from the Conventional Commits since the last
tag. See `scripts/release.sh --help` for the other options.

The script is written on [dybatpho](https://github.com/dynamotn/dybatpho),
read from the machine's checkout in `~/Working/personal/tools/dybatpho`; set
`DYBATPHO_DIR` to use another one.
