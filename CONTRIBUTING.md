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
