# Getting started

This page takes you from an Obsidian vault to a garden online in four steps.
All you need is [Bun](https://bun.sh) or Node 23.6+.

## 1. Preview your vault

```bash
bunx @dynamotn/datme dev ~/MyVault
```

Open <http://localhost:4321>. The page reloads whenever a note changes, so you
can keep writing in Obsidian and watch the site follow.

With Node, use `npx @dynamotn/datme dev ~/MyVault`. If you install the package
globally (`npm i -g @dynamotn/datme`), the command is simply `datme`. Without a
vault argument, datme uses `$DATME_VAULT`, then the current directory.

## 2. Choose what to publish

At first the site is empty, and that's on purpose: **only notes with
`publish: true` in their frontmatter are published.**

```markdown
---
publish: true
tags: [type/blog]
---
# My first garden note
```

If you'd rather publish everything except a few notes, set `publish: all` in
`datme.yaml` and mark the exceptions with `publish: false`. [Privacy](privacy.md)
explains every way to keep something home.

## 3. Make it yours

```bash
bunx @dynamotn/datme init ~/MyVault
```

This writes a commented `datme.yaml` at the root of the vault, so the site's
settings travel with the notes. It never overwrites an existing file. Give the
site a title and its public URL, add languages, pick the menu, change the
accent colour:

```yaml
site:
  title: My Garden
  url: https://notes.example.com
languages: [en-US, vi-VN]
theme:
  accent: "#7c3aed"
```

Every key is optional. [Configuration](configuration.md) lists them all.

## 4. Put it online

```bash
bunx @dynamotn/datme deploy github ~/MyVault    # or gitlab, netlify, cloudflare
```

This writes a CI pipeline into the vault's git repository. After that, every
push rebuilds the site, and the build cache is kept between runs.
[Deploying](deploying.md) covers custom domains and other hosts.

## Before you publish

```bash
bunx @dynamotn/datme check ~/MyVault
```

`check` lists broken links, missing files, clashing URLs and invalid
frontmatter. Add `--external` to also find links to other websites that have
died. Run `dev` or `build` with `--drafts` to see drafts and scheduled notes as
they will look.

## Where next

- [Writing notes](writing.md) shows everything a note can do.
- [Plugins](plugins.md) shows how Dataview, Canvas, Excalidraw, Marp and friends turn out.
- [The reader's side](reading.md) is the tour your readers get.
