# datme

An Astro rebuild of the Quartz-based digital garden: a blog-like front page on top
of a second-brain notebook, published straight from an Obsidian vault.

## Usage

```bash
bun install
bun run dev      # http://localhost:4321, reloads when a note changes
bun run build    # static site in dist/
bun run check    # type-check
bun run test     # unit tests and an end-to-end build of tests/fixtures/vault
```

The vault is read in place from `~/Documents/Notes`; set `VAULT_PATH` to use
another one. Site settings live in `src/site.config.ts`.

## How content is published

- Only notes with `publish: true` are built; `draft: true` and notes with a
  `password` (encryption is not implemented yet) are skipped.
- `<!--lang:vi-VN-->` / `<!--lang:en-US-->` / `<!--lang:*-->` blocks and a
  per-language `title` map produce `/` (Vietnamese) and `/en-US/` pages, with
  Quartz-compatible slugs so existing URLs keep working.
- Only assets referenced by a published note are emitted under `/assets/`.

## Layout

- `src/lib/vault.ts` scans the vault, resolves links, builds backlinks, tags and the folder tree.
- `src/lib/obsidian.ts` turns wikilinks, embeds, highlights and tags into standard markdown.
- `src/lib/markdown.ts` is the unified pipeline: callouts, KaTeX, Shiki, transclusion.
- `src/scripts/` holds the client: search (MiniSearch), graph (d3-force), popovers, TOC.
- `tests/` runs with `bun test` against the fixture vault in `tests/fixtures/vault`.
