---
title: "Configuration: datme.yaml"
---
# Configuration: `datme.yaml`

The settings live in `datme.yaml` at the root of the vault, so they travel with
the notes. Every key is optional. `datme init` writes a commented starter file.

An invalid file stops the build and names the path of every problem, for
example `languages: Too small: expected array to have >=1 items`.

## The site

```yaml
site:
  title: My Garden            # or one value per language: { en-US: …, vi-VN: … }
  tagline: Notes in progress
  url: https://notes.example.com   # enables the sitemap, absolute links and JSON-LD
  author: Me
  logo: 🌿                     # defaults to the first letter of the title
  me: [https://mastodon.social/@me]   # rel="me" links, e.g. to verify the site on Mastodon; the footer
                                      # shows them as logos (GitHub, X, LinkedIn, Mastodon, Bluesky…)
  fediverse: "@me@mastodon.social"    # credited when a note is shared on Mastodon

languages: [en-US]            # the first is served at /, others under /<lang>/
```

`site.url` may end in a path, such as `https://me.github.io/garden/` for a
GitHub or GitLab project site: every page, link, feed, the sitemap, search and
the offline app then live under `/garden/`. Paths you write yourself in `nav`
and `footer`, like `/cv.pdf`, are taken from the root of the site and get the
path in front too. ActivityPub needs a `site.url` at the root of its host,
where other servers look for `/.well-known/`.

## What gets published

See [Privacy](privacy.md) for the whole picture.

```yaml
publish: explicit             # or `all`: everything except `publish: false`
home: index.md                # note rendered as the home page: the part above the
                              # first H2 is the hero, each H2 section becomes a shelf
# home: bento                 # the same note over a dashboard of tiles, or choose them:
# home: { note: index.md, layout: bento, tiles: [now, recent, random, stats, graph, stream, tags] }
ignore: [Archive, Journal]    # added to .obsidian, .trash, templates, private
privateLinks: text            # links to private notes: text, placeholder or hide
check:
  structure: true             # datme check notices orphan notes, dead ends and hubs
encryption:
  iterations: 600000          # PBKDF2 rounds for passwords (at least 100000)
```

## How notes are read

```yaml
conventions:
  typePrefix: type/           # tags like type/book become chips on the note
  blogTags: [type/blog, blog] # listed as posts on the home page
  mapTags: [type/moc, moc]    # listed as maps of content
  flashcardTags: [flashcards] # decks: Q::A, Q:::A and ?-separated cards flip open
  timelineTags: [timeline, type/event]  # events dated by `date` on /timeline
  ratingScale: 5              # highest `rating`: 7 draws ratings as seven stars

stages:                       # top-level folders shown as note maturity, in this order
  Inbox: fleeting             # presets: fleeting, literature, permanent
  Sources: literature
  Notes: permanent
  Maps: Maps of content       # any other text is a stage of your own, with that label
  Lab: { icon: 🧪, label: { en-US: Lab, vi-VN: Thử nghiệm } }  # icon and label both optional
  seedling: { icon: 🌱 }      # or set by a property: `stage: seedling`

types:                        # icons and labels for type/* tags (common ones built in)
  recipe: { icon: 🍲, label: Recipe }

properties:
  hide: [rating]              # frontmatter keys left out of the properties block

lineBreaks:                   # keep single line breaks, as Obsidian does (poems, lyrics)
  types: [composition]        # also: all: true, folders: [Poems]; frontmatter lineBreaks overrides

bibliography: refs.bib        # BibTeX file(s) for [@key] citations
glossary: true                # link the first mention of each type/term note
linkPreviews: true            # a pasted URL alone in a paragraph becomes a card
archiveDeadLinks: true        # dead links found by `check --external` point to the Internet Archive
```

## Look and navigation

```yaml
appearance:
  style: notebook             # notebook: index cards on dotted paper; classic: a quiet serif blog;
                              # garden: notes as plants in a bed, sized by how grown they are;
                              # terminal: a monospace TTY in green phosphor (theme.accent for amber);
                              # blueprint: grid paper, mono lettering, diagrams on drawing sheets;
                              # wiki: a dense reference page with an infobox of the note's properties;
                              # broadsheet: a newspaper, the home a front page, each top folder a section
                              # herbarium: the garden pressed, each note a specimen sheet;
                              # manuscript: a book page for long reading, notes in the margin;
                              # lacquer: black lacquer, vermilion and gold leaf, dark first;
                              # zine: a photocopied zine, pasted blocks, tape and grain;
                              # atlas: an old atlas, each top folder a region, the graph a map;
                              # catalog: a card catalogue, each note a card with a call number
                              # resume and darkroom are also valid, but made for a single page (see below)
  folders:                    # a style per folder, subfolders included; the longest match wins
    Writing: classic
    Garden: garden
  # classic: [Writing]        # older spelling of `folders: { Writing: classic }`
  tags:                       # a style per tag, nested tags included (poem/haiku follows poem);
    poem: classic             # a note's first tag found here wins, and beats its folder
    til: notebook
  stages:                     # a style per growth stage, a key of `stages`; after tags, before folders
    01_Fleeting: notebook
    03_Permanent: manuscript
  stream: [Thoughts]          # folders of short notes, shown in full, newest first, like a feed
  seasons: false              # true: the garden's colours follow the season; { hemisphere: south } below the equator
  readerSwitch: false         # true: readers pick any style that only recolours pages, in the View menu;
                              # or a list, e.g. [notebook, classic]

theme:
  preset: ink                 # a theme pack, see Extending; every value below beats the pack's
  scheme: auto                # light or dark before readers use the toggle; auto follows their system
  accent: "#7c3aed"           # or { light: …, dark: … }
  fonts: { heading: Fraunces, body: Literata }   # Google Fonts families, unless the theme pack ships them
  css: datme.css              # stylesheet in the vault, loaded after datme's own
  # Themes of embedded tools, one for both colour schemes or { light: …, dark: … };
  # each follows the light/dark toggle of the site.
  code: { light: github-light, dark: github-dark }   # Shiki: https://shiki.style/themes
  comments: { light: light, dark: dark }             # giscus theme names, or an https:// stylesheet
  mermaid: { light: neutral, dark: dark }            # default, neutral, dark, forest or base
  d2: { light: 0, dark: 200 }                        # D2 theme ids, unless a diagram sets its own

nav:                          # main menu in the header, in order
  - home                      # built-ins: home, tags, archive, recent, timeline, map, stats, calendar, practice, changes
  - note: About me            # a note, found like a wikilink (aliases work)
    label: About
  - url: /cv.pdf
    label: CV
sidebar:                      # shortcuts at the top of the left sidebar, same entries as nav
  - note: Now
  - tags

footer:                       # columns of links in the footer: a heading, then entries like nav
  Explore:
    - home
    - tags
    - note: About me
      label: About
  Elsewhere:
    - url: https://github.com/me
      label: GitHub
    - url: /index.xml
      label: RSS
  npm: https://www.npmjs.com/~me   # a heading with a URL is a single link; these share a first column
poweredBy: true               # the "grown with datme" line under the footer; false hides it

history: false                # a page per note showing how it grew, from git (see Privacy),
                              # and /changes with its feeds
related:                      # under each note: notes sharing tags or links,
  count: 5                    # and notes naming it without a link
  mentions: true
  semantic: false             # true: also notes close in meaning (see The reader's side);
                              # or { model: …, threshold: 0.55 }
stackedPages: true            # a header button to open linked notes side by side
topics: true                  # with related.semantic: group notes into topics for the graph and /stats;
                              # a number sets how many, false turns them off
graph:
  depth: 1                    # links the local graph follows: 1, or 2 for links of links
  view: 2d                    # how the global graph opens: 2d, or 3d (turned by dragging)

# The interface speaks English, Vietnamese, French, German, Spanish, Japanese and
# Chinese out of the box; other languages fall back to English.
strings:                      # override any UI text, per language
  en-US: { blog: Essays }     # e.g. garden, gardenLead, recentLead for a home without the garden wording
```

The `garden` style opens the home on the notes tended most recently, then the
maps of content as paths in, then every note as a tile in a bed: small and pale
for the first of your `stages`, large and green for the last, so a glance tells
seedlings from evergreens. Readers filter the bed by stage (by top folder when
there are no stages) and by tag. Folder and tag pages are beds too, and a note
says when it was planted and last tended. `theme.accent` and `theme.fonts`
override its moss green, Fraunces headings and Literata text.

The `broadsheet` style turns the garden into a newspaper. The home is a front
page: a masthead with the site's name, a date line (the day of the newest
note) and the number of notes, the newest note as the lead story with its
banner and description, then a section per top folder with its latest stories.
A folder page leads with its newest note too. A note names its section above a
heavy serif headline, opens on a drop cap and runs in two columns where the
page is wide enough. It suits `stream` folders best: their newest note runs
across the top and the others fill the columns below, like a page of the paper.

The `terminal` style draws every page as a TTY: one monospace face, headings
written as Markdown prompts (`$` before the title, `##` before a section), and
a cursor after the title that blinks unless the reader asked for less motion.
It opens dark, phosphor on black with faint scanlines; light mode is a teletype
printout on ruled paper. The phosphor is green; `theme.accent` sets another
(`"#ffb000"` for amber), and the text is mixed from it so any accent stays
readable. The reader's legible-font and high-contrast options replace the
monospace and drop the glow.

The `blueprint` style is an engineering drawing: blue grid paper with white
and cyan line work (it opens dark), or white paper with blue ink in light mode.
Titles and headings are lettered in Space Mono capitals, sections are numbered
`01 /`, `02 /`, and every Mermaid, D2, Typst or Excalidraw diagram sits on a
framed drawing sheet with a title block in its corner (`DWG 01 · MERMAID ·
SCALE NTS`). It prints on white without the grid.

The `wiki` style reads like an encyclopedia: dense sans-serif text, serif
titles over thin rules and blue links. A note's `cover` (else its `banner`) and
its properties fill an infobox floated right of the text, its headings make a
numbered contents box at the top, and its related notes are listed under "See
also". On a phone the infobox comes first, full width.

With `seasons: true` the garden's colours follow the year: fresh green and
blossom in spring, deep green in summer, rust and ochre in autumn, frost blue
in winter, each in a light and a dark variant. The season is that of the
build date, and the page turns to the reader's own season when it opens, so a
page cached since summer still shows autumn. Seasons are meteorological
(spring from March); `seasons: { hemisphere: south }` starts spring in
September. `theme.accent` still wins over the season's accent.

The `herbarium` style is the garden pressed and kept: same stages, same
filters, but every note is a sheet of cream paper held down by linen tape,
with a label card in its bottom-right corner naming it, the date it was
collected (`created`), its stage and the note it was found near (the first
that links to it). Home, folder and tag pages show the notes as a cabinet of
sheets of one size, the stage's icon pressed on each.

The `manuscript` style is a book page for long reading: a narrow text column
with a wide right margin where footnotes stand as sidenotes, old-style
figures, a drop cap and small capitals on the first paragraph, and each H2
opened like a chapter with a roman numeral. A note in a `series` shows its
parts as a list of chapters.

The `lacquer` style follows Vietnamese lacquer painting (sơn mài): black
lacquer with vermilion and gold leaf, a gold rule under each title and a
vermilion lozenge before each section. It opens dark unless the reader chose
a theme; light mode is eggshell inlay with vermilion and darker gold.

The `zine` style is a self-printed zine run through a tired photocopier:
toner grain over the page, the title a cut-out strip in a wonky hand, each
section head lettered differently, and quotes, callouts, pictures and code
pasted down at a slight angle in boxes of mismatched colours, some held by
tape. On a phone and on paper everything lies straight again.

The `atlas` style is an old atlas on parchment, contour lines under the
page and a compass rose in the corner of each note. Each top folder is a
region: its name is lettered above the title of every note and folder in
it. The graph is drawn as a map, notes as towns on land in a pale sea,
joined by dotted roads.

The `catalog` style is a library card catalogue. Each note is a typed card
with a red rule under its heading and a hole punched at its foot, filed
under a call number made from its folders: the number the top folder starts
with (`03 Atoms`), or else its place among the top folders, then three
letters of its name, then the subfolder, so `03 Atoms/Code` is
`03.ATO · Code`; notes at the root are `00.GEN`. A folder page is a drawer,
its call number on a brass label, its subfolders drawer fronts and its notes
a row of cards.

With `readerSwitch`, the View menu of every page lists the styles you offer,
and a reader's pick restyles the whole site for them until they choose "As
the author set it" again. The choice stays in their browser and applies
before the page first shows, so it never flashes the author's style first;
only the stylesheet of the chosen style is downloaded. It changes colours,
type and paper, not what a page holds: a garden home keeps its tiles in the
classic style. Pages in `resume` or `darkroom` keep their style, and those
two cannot be offered. Nor can `broadsheet`, `wiki`, `herbarium`, `atlas` and
`catalog`, which lay a page out their own way (a front page, an infobox, a
specimen label, a region, a call number):
their pages keep their style, and `true` leaves them out.

`home: bento` lays the home out as a grid of tiles under the home note's
intro, in whichever style the site has: the latest note with `layout: now`,
the notes tended most recently, a button to a random note, the numbers of
/stats, a small graph around the most linked note, the newest notes of the
`stream` folders and the most used tags. `tiles` picks which and in what
order; a tile with nothing to show (no now note, no stream folder) is left
out, and the grid closes up to one column on a phone.

The `resume` and `darkroom` styles are made for a single page rather than a
whole site: a note picks them with `style:` or through its `layout` (`cv`,
`gallery`), see [Page layouts](writing.md#page-layouts).

## Search, images and maps

```yaml
search:
  engine: minisearch          # or pagefind: indexes the built pages, loads only what a query needs
  meaning: false              # true: readers may also search by meaning (needs related.semantic)
images:                       # PNG/JPEG/WebP/AVIF get their size and resized WebP copies
  optimize: true              # (srcset), so phones never download the full picture
  widths: [480, 960, 1600]
  quality: 80
  placeholders: true          # a tiny blurred copy shows while each image loads
map:                          # tiles of /map (OpenStreetMap by default)
  tiles: https://tile.openstreetmap.org/{z}/{x}/{y}.png
  darkTiles: https://…/{z}/{x}/{y}.png   # for the dark theme; else the light tiles are darkened
```

## Audio in your voice

```yaml
tts:
  models:
    vi: vieneu                # one model per language; a language without one gets no audio
  folders: [Podcast]          # notes in these folders are read aloud at build time
  frontmatter:
    audio: true               # so are notes whose frontmatter has these values
```

Each key of `models` is one of your `languages`, or its base (`vi` for `vi-VN`),
and `vieneu` is the only model so far. At least one of `folders` and
`frontmatter` is needed. The voice sample is never part of the config: point
`DATME_TTS_VOICE` at the audio file to clone. See [Privacy](privacy.md).

A note whose audio fails alone is published without it, with a warning; an
engine that cannot start, refuses the voice sample or stops midway fails the
build. `DATME_TTS=off` builds without audio or Listen buttons, for a machine
without uv or the sample.

## Readers and the social web

```yaml
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
subscribe:                    # a form for new notes by email, under notes and on folder and tag pages
  provider: buttondown        # buttondown { username } or form { action, field?, topicField? }
  username: me
ogImages: true                # social cards for the home page and notes without a banner
activitypub: bridgy           # fediverse: bridgy (followable through Bridgy Fed), or { username }
                              # for a static actor that is found but not followed; needs site.url
neighbours: {}                # other datme gardens by name: [[name:Note]] links to one of their notes
oembed: true                  # other sites can embed a card of each public note (needs site.url)
llms: true                    # /llms.txt, /llms-full.txt and a .md copy of every public note (without comments)
askAi: [chatgpt, claude]      # assistants a note's Markdown menu opens it in (needs site.url); [] for none
stats: { hide: [] }           # garden health left off /stats: density, structure, freshness, hubs, topics
outdated: { after: 2 }        # say so on notes not updated for this many years (off by default)
offline: true                 # installable app; pages a reader opened stay readable offline
```

## Hosting

See [Deploying](deploying.md).

```yaml
cname: true                   # write CNAME with the host of site.url
redirects: true               # write _redirects (Netlify, Cloudflare) with 301s for aliases and old URLs
headers: { csp: false }       # _headers: safe defaults and caching; csp: true adds a CSP derived
                              # from the features in use (inline scripts allowed by hash)
```
