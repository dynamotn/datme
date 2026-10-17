# Contributing to datme

Issues and merge requests are welcome on
[GitLab](https://gitlab.com/dynamo-brain/datme). Before sending a change, run
the checks CI runs:

```bash
bun install
bunx astro check
bun test
```

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
