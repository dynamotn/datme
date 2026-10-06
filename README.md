# datme

Publish an Obsidian vault as a digital garden: every note is an index card
pinned on a notebook wall, with backlinks, a graph, full-text search and
optional multilingual notes. Long-form folders can keep a quiet serif blog look. Built with Astro; runs on [Bun](https://bun.sh) or Node 23.6+.

## Quick start

```bash
bunx @dynamotn/datme dev ~/MyVault                 # live preview at http://localhost:4321
bunx @dynamotn/datme build ~/MyVault --out ./site  # static site, ready for any host
npx @dynamotn/datme build ~/MyVault                # the same with Node 23.6+
```

Only notes with `publish: true` in their frontmatter are published, so nothing
private leaks by default. Run `bunx @dynamotn/datme init ~/MyVault` to write a commented
`datme.yaml` into the vault and adjust it.

## Commands

Installed globally (`npm i -g @dynamotn/datme`) the command is simply `datme`.

| Command | What it does |
| --- | --- |
| `datme dev [vault]` | Live preview; reloads when a note changes. `--port`, `--host` |
| `datme build [vault]` | Builds into `--out` (default `./dist`). An existing directory is only replaced if datme created it. |
| `datme preview [vault]` | Builds, then serves the result |
| `datme check [vault]` | Lists broken links, missing files, clashing URLs or aliases and invalid frontmatter; exits 1 on errors. `--verbose` also lists links to unpublished notes; `--external` also checks that links to other websites still answer (404, 410 and unreachable hosts are reported). |
| `datme deploy <host> [vault]` | Writes a CI config that publishes the vault on every push: `github` (Pages), `gitlab` (Pages), `netlify` or `cloudflare` (Pages, through GitHub Actions). Goes at the root of the vault's git repository, never overwrites a file, and keeps the build cache between runs. `--branch` picks the branch (default: the current one). |
| `datme init [vault]` | Writes a starter `datme.yaml`; never overwrites one |

The vault defaults to `$DATME_VAULT`, then the current directory. `--site <url>`
(or `$DATME_SITE_URL`) overrides the public URL, handy for preview deploys.
`build` prints a one-line summary of the problems `check` would report;
`--strict` makes `check` and `build` fail on warnings too, for CI.

Builds are incremental: rendered notes and social cards are cached and reused
while their content, the config and datme stay the same (a 300-note vault goes
from about 23 s to 2.5 s). Notes that embed others or run queries are always
rendered again, and protected notes are never cached. The cache lives in
datme's `.datme/cache`; `$DATME_CACHE` moves it (handy for CI caches), an
empty value turns it off, and `--fresh` starts from scratch.

## Configuration: `datme.yaml`

The file lives at the root of the vault, so the site settings travel with the
notes. Every key is optional.

```yaml
site:
  title: My Garden            # or one value per language: { en-US: …, vi-VN: … }
  tagline: Notes in progress
  url: https://notes.example.com   # enables the sitemap, absolute links and JSON-LD
  author: Me
  logo: 🌿                     # defaults to the first letter of the title
  me: [https://mastodon.social/@me]   # rel="me" links, e.g. to verify the site on Mastodon
  fediverse: "@me@mastodon.social"    # credited when a note is shared on Mastodon

languages: [en-US]            # the first is served at /, others under /<lang>/
publish: explicit             # or `all`: everything except `publish: false`
home: index.md                # note rendered as the home page
ignore: [Archive, Journal]    # added to .obsidian, .trash, templates, private

conventions:
  typePrefix: type/           # tags like type/book become chips on the note
  blogTags: [type/blog, blog] # listed as posts on the home page
  mapTags: [type/moc, moc]    # listed as maps of content
  flashcardTags: [flashcards] # decks: Q::A, Q:::A and ?-separated cards flip open

stages:                       # top-level folders shown as note maturity
  Inbox: fleeting             # presets: fleeting, literature, atomic,
  Notes: { icon: 🌳, label: Evergreen }  # permanent, structure, reference, project

nav:                          # main menu in the header, in order
  - home                      # built-ins: home, tags, archive, recent
  - note: About me            # a note, found like a wikilink (aliases work)
    label: About
  - url: /cv.pdf
    label: CV

appearance:
  style: notebook             # index cards on dotted paper; or `classic`
  classic: [Writing]          # folders whose notes use the other style

footer:
  GitHub: https://github.com/me

analytics:                    # google { id }, plausible { host? }, umami { id, host }, goatcounter { id }
  provider: plausible
comments:                     # giscus { repo, repoId, category, categoryId } or commento { host? }
  provider: giscus
  repo: me/garden
  repoId: R_xxx
  category: Comments
  categoryId: DIC_xxx
webmentions: {}               # receive mentions via webmention.io ({ domain } defaults to
                              # the host of site.url) and list likes, reposts and replies under notes
cname: true                   # write CNAME with the host of site.url
redirects: true               # write _redirects (Netlify, Cloudflare) with 301s for aliases and old URLs
images:                       # PNG/JPEG/WebP/AVIF get their size and resized WebP copies
  optimize: true              # (srcset), so phones never download the full picture
  widths: [480, 960, 1600]
  quality: 80
offline: true                 # installable app; pages a reader opened stay readable offline
ogImages: true                # social cards for the home page and notes without a banner
stackedPages: true            # a header button to open linked notes side by side
theme:
  accent: "#7c3aed"           # or { light: …, dark: … }
  fonts: { heading: Fraunces, body: Literata }   # Google Fonts families
  css: datme.css              # stylesheet in the vault, loaded after datme's own
related:                      # under each note: notes sharing tags or links,
  count: 5                    # and notes naming it without a link
  mentions: true
lineBreaks:                   # keep single line breaks, as Obsidian does (poems, lyrics)
  types: [composition]        # also: all: true, folders: [Poems]; frontmatter lineBreaks overrides
properties:
  hide: [rating]              # frontmatter keys left out of the properties block
types:                        # icons and labels for type/* tags (common ones built in)
  recipe: { icon: 🍲, label: Recipe }

strings:                      # override any UI text, per language
  en-US: { blog: Essays }
```

An invalid file stops the build with the path of every problem, e.g.
`languages: Too small: expected array to have >=1 items`.

## Writing notes

- Obsidian syntax works as in the app: `[[wikilinks]]`, `[[note#heading|alias]]`,
  `![[embeds]]` of notes, sections, images and PDFs, callouts (`> [!tip]-` folds),
  `==highlights==`, `%%comments%%`, `#tags`, `^block-ids`, LaTeX and Mermaid.
- `![](https://…)` embeds YouTube (privacy-enhanced, `t=` kept), Vimeo, tweets from twitter.com or x.com, and remote video or audio files; `![Title|640](…)` sets the width, as in Obsidian. Printed pages show the link instead.
- Flashcards in the Spaced Repetition plugin's syntax, in notes tagged `#flashcards`: `Question::Answer`, `Word:::Translation` (both ways), and multi-line cards with a `?` (or `??`) line between question and answer. They flip open on click; cloze deletions are not converted.
- Code blocks: ```` ```ts title="app.ts" {2,4-5} ```` adds a file name and highlights lines; `// [!code highlight]`, `[!code ++]`, `[!code --]` and `[!code focus]` work inline.
- Frontmatter: `title`, `permalink` (a custom URL, or one per language; the old URL redirects), `aliases` (become redirects), `tags`, `created`, `updated`,
  `banner` (+ `banner_x`, `banner_y`), `description`, `draft`, `unlisted`.
- Footnotes (`[^1]`) move into the margin as sidenotes on wide screens in reader mode or with both sidebars hidden; footnotes holding lists or code stay at the end.
- Series: notes sharing `series: Name` (or `series: "[[Intro note]]"`) show their part number, the list of parts and links to the previous and next part; `series_order` sets the order, otherwise the creation date does.
- Notes with a `password` field are published encrypted (AES-GCM, PBKDF2 key; `encryption.iterations` in datme.yaml) and unlocked in the browser. Their content never reaches excerpts, search, feeds, embeds or the graph.
- Multilingual notes: wrap per-language parts in `<!--lang:vi-VN-->` …
  `<!--lang:en-US-->` … `<!--lang:*-->`, and give `title` one value per language.
  A note without a block for a language is shown in its original language there,
  with a notice; `lang: en-US` in the frontmatter marks a note written in another
  language than the default one.
- Excalidraw drawings (`![[Plan.excalidraw]]`) use the SVG or PNG the Obsidian Excalidraw plugin exports next to them; with both `.light.svg` and `.dark.svg` the drawing follows the site theme.
- Search (`Ctrl K`) narrows by folder and note type, or by tag with `#tag`; the global graph (`Ctrl G`) filters by folder and tag.
- ```` ```dataview ```` blocks run at build time over the published notes only (never private ones): `LIST`/`TABLE [WITHOUT ID]`, `FROM` #tags, "folders" and [[links]] with `AND`/`OR`/`-`, `WHERE`, `FLATTEN`, `GROUP BY`, `SORT`, `LIMIT` and common functions, plus `TASK` queries over `- [ ]` items (with Tasks-plugin dates like 📅 and `[key:: value]` fields). DataviewJS shows a notice.
- Canvases (`.canvas`) linked or embedded from a published note become pannable, zoomable pages: text cards render markdown, file cards link to published notes or show images, and edges keep their labels and colours. With `publish: all`, every canvas is published.
- Bases (`.base`) get a page with all their views and render in place when embedded (`![[Books.base#Reading]]`): `filters` with `and`/`or`/`not` and expressions like `file.hasTag("book") && rating >= 4`, `formulas`, `properties.displayName`, and `table`, `cards` or `list` views with `order`, `sort` and `limit`. Like Dataview, they only see published notes.
- A note named after its folder (`Books/Books.md`) introduces that folder's page.
- Every folder and tag has its own RSS feed (`/Books/index.xml`, `/tags/book/index.xml`), linked from its page; `/recent` lists the notes planted or watered lately.
- Only assets referenced by a published note are copied to the site.

## Deploying

`datme build` writes a plain static site, so any static host works.
`datme deploy github|gitlab|netlify|cloudflare` writes a pipeline into the
vault's repository that runs the published package with
`bunx @dynamotn/datme`. Hand-written equivalents live in `examples/deploy/`:

- `gitlab-pages.yml`: copy to `.gitlab-ci.yml` to publish on GitLab Pages.
- `github-pages.yml`: copy to `.github/workflows/` and choose "GitHub Actions"
  as the Pages source.

Both fetch the full git history so notes without `created`/`updated` get their
real dates. Set `cname: true` when using a custom domain.

## Development

```bash
bun install
bun run dev ~/MyVault   # same as `datme dev`
bun run check           # type-check
bun run test            # unit tests and end-to-end builds of tests/fixtures
```

- `src/site.config.ts` loads and validates `datme.yaml`.
- `src/lib/vault.ts` scans the vault, resolves links, builds backlinks, tags and folders.
- `src/lib/obsidian.ts` turns Obsidian syntax into standard markdown.
- `src/lib/markdown.ts` is the unified pipeline: callouts, KaTeX, Shiki, transclusion.
- `src/cli.ts` is the `datme` command; `src/scripts/` holds the browser code.

## License

[CC BY-SA 4.0](LICENSE): share and adapt freely, with attribution, under the
same license.
