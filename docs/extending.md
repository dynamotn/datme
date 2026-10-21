---
title: "Extending"
---
# Extending

## Your own look

- `theme.accent` and `theme.fonts` in `datme.yaml` change the colours and the
  Google Fonts families.
- `theme.code`, `theme.comments`, `theme.mermaid` and `theme.d2` pick the
  themes of code blocks, giscus comments and diagrams, light and dark, so they
  match the rest of the site and switch with it.
- `theme.css` (by default `datme.css` at the root of the vault) is a stylesheet
  loaded after datme's own, so it can restyle anything.
- `cssclasses` in a note's frontmatter adds classes to that note, as in
  Obsidian.
- `theme.preset` loads a theme pack, below.
- `strings` overrides any text of the interface, per language. The built-in
  texts live in `src/i18n/<language>.json`; to add a language for everyone,
  see [CONTRIBUTING](https://gitlab.com/dynamo-brain/datme/-/blob/main/CONTRIBUTING.md).

## Theme packs

A theme pack is a look to reuse and share: a folder holding a `theme.yaml`,
its stylesheets, and the fonts and pictures they load. `theme.preset` in
`datme.yaml` names one:

```yaml
theme:
  preset: ink               # .datme/themes/ink in the vault, else the datme-theme-ink package
  # preset: themes/ink      # a folder of the vault, by its path
  # preset: "@me/ink"       # a scoped package, by its full name
  accent: "#2d6a4f"         # anything under theme: beats the pack's value
```

A name is looked up in `.datme/themes/<name>` of the vault, then as the
package `datme-theme-<name>` (or the name itself, if it is scoped or already
starts with `datme-theme-`) in `node_modules` next to the vault or to datme;
install it with `bun add -d datme-theme-ink` beside the vault. A path must
stay inside the vault.

```yaml
# theme.yaml
name: Ink
style: ink                  # the site's style, unless appearance.style is set
accent: { light: "#1f3a93", dark: "#9db4ff" }
fonts: { heading: Fraunces, body: Ink Serif }
code: { light: github-light, dark: github-dark-dimmed }
mermaid: neutral            # also scheme, comments and d2, as under theme:
css: ink.css                # stylesheets for every page, one or a list
styles:                     # styles of its own
  ink:
    base: classic           # the built-in style it builds on: its pages and stylesheet
    css: paper.css          # loaded after the base's, only on pages in this style
```

- **Settings** take the same values as `theme:` in `datme.yaml`, and
  `datme.yaml` wins key by key (font by font for `fonts`).
- **Styles** a pack adds are used like the built-in ones: in
  `appearance.style`, `folders`, `tags`, `readerSwitch` and a note's `style:`.
  A page in one is drawn as its `base` (the same HTML, `data-look` and
  stylesheet) with the pack's stylesheets added on top. A name is lower-case
  letters, digits and `-`, and cannot be a built-in style's.
- **Fonts**: a family that the pack's CSS declares with `@font-face` is the
  pack's own and is never fetched from Google Fonts; other families are.
- **Files**: the pack's `.css`, `.woff2`, `.woff`, `.ttf`, `.otf`, `.png`,
  `.jpg`, `.gif`, `.webp` and `.avif` files are published under `/theme/`,
  keeping their paths, so `url(fonts/ink.woff2)` in `ink.css` just works.
  Nothing else is: no script of a pack ever runs, SVG files (which can carry
  scripts) are left out, and so are hidden folders, `node_modules` and any
  file a link points out of the pack's folder.

Problems with a pack never stop the build: a missing pack, a value datme does
not take or a stylesheet outside the pack is reported as a warning (by
`datme check` and `datme dev`), and the site keeps datme's own value.
`examples/themes/datme-theme-ink` in datme's repository is a complete pack to
start from.

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
| `src/lib/theme-pack.ts` | Finds and reads theme packs |
| `src/lib/vault.ts` | Scans the vault; resolves links; builds backlinks, tags and folders |
| `src/lib/obsidian.ts` | Turns Obsidian syntax into standard markdown |
| `src/lib/markdown.ts` | The unified pipeline: callouts, KaTeX, Shiki, transclusion |
| `src/lib/*.ts` | One module per feature: `dataview`, `bases`, `canvas`, `excalidraw`, `slides`, `locked`… |
| `src/components/`, `src/layouts/` | Astro components and page layouts |
| `src/scripts/` | Browser code: search, graph, popovers, unlocking, presenting… |
| `tests/fixtures/vault` | A small bilingual vault that the end-to-end tests build |

Tests live in `tests/`, one file per feature. A new feature usually adds a note
to the fixture vault and a test that builds it.
