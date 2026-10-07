---
title: "Extending"
---
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

A `datme.config.mjs` at the root of the vault extends the build:

```js
import remarkEmoji from "remark-emoji"
import rehypeExternalLinks from "rehype-external-links"

export default {
  // Plugins of the markdown pipeline, for syntax datme doesn't know.
  remarkPlugins: [remarkEmoji],
  rehypePlugins: [[rehypeExternalLinks, { rel: ["nofollow"] }]],

  // Fenced blocks of your own: ```greet becomes the HTML returned.
  codeBlocks: {
    greet: (source, { lang, key, meta }) => `<p class="greeting">Hello, ${source}</p>`,
  },

  // Tags added to the <head> of every page.
  head: ['<link rel="me" href="https://example.social/@me">'],
}
```

- **`codeBlocks`** maps a fence language to a function that gets the block's
  text and `{ lang, key, meta }`: the page's language, the note's key in the
  vault, and the rest of the fence line (`loud` in ```` ```greet loud ````).
  It returns HTML, or a promise of it. Your renderers run before datme's own,
  so they can also replace a built-in block. An error is shown in place of
  the block.
- **`head`** is a string or a list of strings of HTML.

### Plugins

The same fields can come bundled, so a package can ship a whole feature.
A plugin is an object with a `name` and any of the fields above; list them in
`plugins`:

```js
// datme-plugin-kroki/index.js
export default function kroki({ server = "https://kroki.io" } = {}) {
  const block = (type) => async (source) => {
    const res = await fetch(`${server}/${type}/svg`, { method: "POST", body: source })
    if (!res.ok) throw new Error(await res.text())
    return `<figure class="diagram">${await res.text()}</figure>`
  }
  return { name: "kroki", codeBlocks: { plantuml: block("plantuml"), graphviz: block("graphviz") } }
}
```

```js
// datme.config.mjs
import kroki from "datme-plugin-kroki"
export default { plugins: [kroki()] }
```

Two plugins can't render the same block language; datme says which one
clashes.

The file runs as code during the build, so only use plugins you trust. Pages
are cached by the file and the code of its plugins; a renderer should give the
same HTML for the same block. Under Bun, `datme dev` picks up a changed file
after a restart.

## Hacking on datme

```bash
bun install
bun run dev ~/MyVault   # same as `datme dev`
bun run check           # type-check
bun run test            # unit tests, end-to-end builds of tests/fixtures and axe
                        # accessibility checks; CI adds Lighthouse (lighthouserc.json)
```

`bun run screenshots` rebuilds the screenshots of the README from this
documentation garden (it needs `bunx playwright install chromium` once).
`bun run dev docs` previews the documentation itself.

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
