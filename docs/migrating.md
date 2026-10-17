---
title: "Coming from another publisher"
---
# Coming from another publisher

`datme migrate` switches a vault published another way to datme. It lists what
it would change and writes nothing; add `--write` to apply it.

```bash
bunx @dynamotn/datme migrate digital-garden ~/MyVault           # look first
bunx @dynamotn/datme migrate digital-garden ~/MyVault --write   # then apply
```

Frontmatter keys are renamed where they are, line by line: the rest of each
note, comments included, stays exactly as it was. Settings go into
`datme.yaml`. One that already exists keeps its keys; the command lists the
ones it left alone so you can merge them by hand. Commit your vault first, so
`git diff` shows every change.

## Obsidian Publish

```bash
datme migrate publish ~/MyVault
```

- `publish: true` already means the same in datme: nothing to change.
- `cover` and `image` become `banner`.
- `publish.css` at the root of the vault becomes the site's stylesheet
  (`theme.css`). Obsidian's class names differ from datme's, so expect to adjust
  some rules.

## Digital Garden plugin

```bash
datme migrate digital-garden ~/MyVault
```

| Digital Garden | datme |
| --- | --- |
| `dg-publish` | `publish` |
| `dg-permalink` | `permalink` |
| `dg-hide` | `unlisted` |
| `dg-home` | the note becomes `home` in `datme.yaml` |

Other `dg-` keys, such as `dg-note-icon`, are left as they are and listed:
datme does without them.

## Quartz

```bash
datme migrate quartz ~/quartz/content
```

Point it at the content folder. It reads `quartz.config.ts` there or one level
up:

- `pageTitle` and `baseUrl` become `site.title` and `site.url`.
- `locale` becomes `languages`.
- Folders in `ignorePatterns` go to `ignore`. Glob patterns are listed for you
  to handle, as datme ignores whole folders.
- Quartz publishes every note, so the vault gets `publish: all`. With the
  `ExplicitPublish` plugin it keeps datme's default, where only notes marked
  `publish: true` go out.
- `draft: true` notes stay out of the site, as in Quartz; `datme build --drafts`
  previews them.

## Then

Run `datme check` to see what is left: links datme resolves differently,
embeds of files outside the vault, and so on. [Getting started](getting-started.md)
covers previewing and deploying.
