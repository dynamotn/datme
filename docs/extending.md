# Extending

## Your own look

- `theme.accent` and `theme.fonts` in `datme.yaml` change the colours and the
  Google Fonts families.
- `theme.css` (by default `datme.css` at the root of the vault) is a stylesheet
  loaded after datme's own, so it can restyle anything.
- `cssclasses` in a note's frontmatter adds classes to that note, as in
  Obsidian.
- `strings` overrides any text of the interface, per language.

## Your own syntax: `datme.config.mjs`

A `datme.config.mjs` at the root of the vault adds remark and rehype plugins to
the markdown pipeline, for syntax datme doesn't know:

```js
import remarkEmoji from "remark-emoji"
import rehypeExternalLinks from "rehype-external-links"

export default {
  remarkPlugins: [remarkEmoji],
  rehypePlugins: [[rehypeExternalLinks, { rel: ["nofollow"] }]],
}
```

The file runs as code during the build, so only use plugins you trust. Under
Bun, `datme dev` picks up a changed file after a restart.

## Hacking on datme

```bash
bun install
bun run dev ~/MyVault   # same as `datme dev`
bun run check           # type-check
bun run test            # unit tests, end-to-end builds of tests/fixtures and axe
                        # accessibility checks; CI adds Lighthouse (lighthouserc.json)
```

A map of the code:

| Path | What it holds |
| --- | --- |
| `src/cli.ts` | The `datme` command |
| `src/site.config.ts` | Loads and validates `datme.yaml` |
| `src/lib/vault.ts` | Scans the vault; resolves links; builds backlinks, tags and folders |
| `src/lib/obsidian.ts` | Turns Obsidian syntax into standard markdown |
| `src/lib/markdown.ts` | The unified pipeline: callouts, KaTeX, Shiki, transclusion |
| `src/lib/*.ts` | One module per feature: `dataview`, `bases`, `canvas`, `excalidraw`, `slides`, `locked`… |
| `src/components/`, `src/layouts/` | Astro components and page layouts |
| `src/scripts/` | Browser code: search, graph, popovers, unlocking, presenting… |
| `tests/fixtures/vault` | A small bilingual vault that the end-to-end tests build |

Tests live in `tests/`, one file per feature. A new feature usually adds a note
to the fixture vault and a test that builds it.
