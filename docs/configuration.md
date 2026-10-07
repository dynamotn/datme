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
  me: [https://mastodon.social/@me]   # rel="me" links, e.g. to verify the site on Mastodon
  fediverse: "@me@mastodon.social"    # credited when a note is shared on Mastodon

languages: [en-US]            # the first is served at /, others under /<lang>/
```

## What gets published

See [Privacy](privacy.md) for the whole picture.

```yaml
publish: explicit             # or `all`: everything except `publish: false`
home: index.md                # note rendered as the home page
ignore: [Archive, Journal]    # added to .obsidian, .trash, templates, private
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

stages:                       # top-level folders shown as note maturity
  Inbox: fleeting             # presets: fleeting, literature, atomic,
  Notes: { icon: 🌳, label: Evergreen }  # permanent, structure, reference, project

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
  style: notebook             # index cards on dotted paper; or `classic`
  classic: [Writing]          # folders whose notes use the other style

theme:
  accent: "#7c3aed"           # or { light: …, dark: … }
  fonts: { heading: Fraunces, body: Literata }   # Google Fonts families
  css: datme.css              # stylesheet in the vault, loaded after datme's own
  # Themes of embedded tools, one for both colour schemes or { light: …, dark: … };
  # each follows the light/dark toggle of the site.
  code: { light: github-light, dark: github-dark }   # Shiki: https://shiki.style/themes
  comments: { light: light, dark: dark }             # giscus theme names, or an https:// stylesheet
  mermaid: { light: neutral, dark: dark }            # default, neutral, dark, forest or base
  d2: { light: 0, dark: 200 }                        # D2 theme ids, unless a diagram sets its own

nav:                          # main menu in the header, in order
  - home                      # built-ins: home, tags, archive, recent, timeline, map, stats, calendar
  - note: About me            # a note, found like a wikilink (aliases work)
    label: About
  - url: /cv.pdf
    label: CV

footer:
  GitHub: https://github.com/me
poweredBy: true               # the "grown with datme" line under the footer; false hides it

history: false                # a page per note showing how it grew, from git (see Privacy)
related:                      # under each note: notes sharing tags or links,
  count: 5                    # and notes naming it without a link
  mentions: true
  semantic: false             # true: also notes close in meaning (see The reader's side);
                              # or { model: …, threshold: 0.55 }
stackedPages: true            # a header button to open linked notes side by side

strings:                      # override any UI text, per language
  en-US: { blog: Essays }
```

## Search, images and maps

```yaml
search: { engine: minisearch } # or pagefind: indexes the built pages, loads only what a query needs
images:                       # PNG/JPEG/WebP/AVIF get their size and resized WebP copies
  optimize: true              # (srcset), so phones never download the full picture
  widths: [480, 960, 1600]
  quality: 80
  placeholders: true          # a tiny blurred copy shows while each image loads
map:                          # tiles of /map (OpenStreetMap by default)
  tiles: https://tile.openstreetmap.org/{z}/{x}/{y}.png
  darkTiles: https://…/{z}/{x}/{y}.png   # for the dark theme; else the light tiles are darkened
```

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
llms: true                    # /llms.txt and a .md copy of every public note (without comments)
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
