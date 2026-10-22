---
title: "The reader's side"
---
# The reader's side

This is what someone visiting your garden can do. None of it needs setting up.

## Finding things

- **Search** (`Ctrl K`) covers every note. You can narrow it by folder, note
  type and when a note was last tended (the last 30 days, the last year, or
  longer ago), or by tag with `#tag`. When notes set their own `stage`, a stage
  filter joins them. For large vaults, `search: { engine: pagefind }` loads only
  what each query needs.
- **Graph** (`Ctrl G`) shows the whole garden. Filter it by folder, tag and
  stage, and colour notes by folder, type, stage or freshness. Its time slider replays how the garden grew,
  and its 3D button lays the garden out in space: drag to turn it, scroll to zoom.
  Each note also has a local graph in its sidebar, showing its own links (1)
  or their links too (2); the reader's choice is remembered.
- **Backlinks** under each note show who links to it, with the sentence around
  the link. Related notes (shared tags and links, and optionally
  [closeness in meaning](#notes-close-in-meaning)) and unlinked mentions follow.
- **Wandering:** `j` and `k` move to the next or previous note of the explorer,
  and 🎲 (or `r`) opens a random one.
- **Trails:** a [trail](writing.md#trails) is a guided walk the author laid
  out. Once started, every stop shows where you are on it; `n` and `p` go to
  the next and previous stop.
- **Footprints:** the browser remembers which notes the reader opened and
  how far they read the last one. The home page offers to continue reading
  there, and the graph can colour the notes visited, the rest staying in the
  fog. Nothing leaves the browser; "Forget where I've been" in the View menu
  clears it.
- **Walks:** "🥾 Walk from here to…" under a note's title asks for another
  note and finds the shortest chain of links between them, followed either
  way. The walk then guides like a trail, `n` and `p` included, and its bar
  copies a link that hands the same walk to someone else.
- **Overview pages:** `/tags`, `/archive` (with a yearly activity calendar),
  `/recent`, and `/timeline`, `/map`, `/stats` and `/calendar` (daily notes)
  when some note qualifies.

### Notes close in meaning

With `related: { semantic: true }`, related notes also include notes that are
about the same thing in other words, marked "≈ similar idea", even across
languages. datme reads each note with a small multilingual sentence model
(`paraphrase-multilingual-MiniLM-L12-v2`, about 120 MB, downloaded once) on the
machine that builds the site; nothing is sent to a service, and protected notes
and locked parts are never read. Each note's result is cached, so later builds
only read the notes that changed.

The model runs on [transformers.js](https://huggingface.co/docs/transformers.js),
an optional dependency to install next to datme:

```bash
bun add @huggingface/transformers          # in a project that depends on datme

# or both in one global install, as in CI
bun add --global @dynamotn/datme @huggingface/transformers
datme build ~/MyVault
```

`bunx` cannot do this: it installs each `--package` in a directory of its own,
so datme never finds transformers.js there.

`threshold` (0.55 by default) sets how close two notes must be; `model` picks
another feature-extraction model from Hugging Face.

The same vectors serve search. Opened on a note with nothing typed, the search
dialog lists the notes closest to it in meaning, with how close each one is.
The site ships one small vector per note (384 bytes with the default model) and
no model, so nothing is downloaded for this.

### Searching by meaning

`search: { meaning: true }` adds a ✨ button to the search dialog. A reader who
presses it gets results that blend the words they typed with closeness in
meaning, so "how to take notes" finds a note about the slip box. Their browser
downloads the same model the build used (about 120 MB, once, from Hugging Face,
with transformers.js from jsDelivr) and embeds each query itself: what they
type never leaves the page. Nothing loads until they press the button. It needs
`related.semantic`, and the `minisearch` engine.

## Reading

- **Previews:** hover an internal link to read the note in a popover. Hover a
  footnote number or a citation to see it in place.
- **Stacked pages:** "Stacked pages" in the View menu opens linked notes side
  by side, like a trail of index cards.
- **Reading progress:** notes of 300 words or more show a progress bar and the
  minutes left.
- **Old notes:** with `outdated: { after: 2 }`, a note not updated for two
  years says when it last was, and that some of it may be out of date; its
  cards and rows in lists carry a ⏳. The
  browser checks again, so the notice appears even if the site is not rebuilt.
  Home and daily notes never show it, and a note opts out with `outdated: false`.
- **Short notes:** a folder listed in `appearance.stream` shows its notes in
  full on its page, newest first, like a feed of passing thoughts, instead of
  as cards.
- **The View menu:** the sliders button in the header gathers how the page is
  laid out and read: each sidebar folds away on its own, reader mode hides
  both, and the reading preferences enlarge the text, switch to a legible font
  (Atkinson Hyperlegible) or high contrast. When the site offers it
  (`appearance.readerSwitch`), a Style group restyles every page in another
  of its styles. Every choice stays in the reader's browser.
- **Turning pages:** on a note in the `eink` style (or one the Style group
  can draw in it), "Turn pages" in the View menu lays the note out in pages as
  tall as the screen, as an e-reader does. Page Down and the right arrow turn
  to the next, Page Up and the left arrow back (swapped in right-to-left
  languages); so does a tap on the right or left edge of the page, or the
  buttons under it beside "Page 2 of 7". A link reached with Tab turns to its
  page, screen readers and find-in-page read the note as one text, and it
  prints as one long page.
- **Graphs:** the wheel zooms a graph around the pointer, and the + and −
  buttons in its corner zoom it for readers without one.
- **Languages:** with several languages, the header shows the current one;
  the menu under it switches to the same page in another.
- **Theme:** light and dark follow the system, or `theme.scheme` in
  `datme.yaml`, with a toggle that remembers the reader's choice.
- **Images:** images and drawings open large in a lightbox; arrows move
  between them.
- **Right-to-left:** Arabic, Hebrew, Persian, Urdu and other right-to-left
  languages get `dir="rtl"`.

## Watching an idea grow

With `history: true`, a note that changed links to its history page: each
version, newest first, with the paragraphs added and removed since the one
before. See [Privacy](privacy.md#note-history) before turning it on.

## Sharing

- Select text in a note to copy a link to that exact passage (`#:~:text=`). The
  link opens the page scrolled to the passage, highlighted.
- Or press 🖍 Highlight to keep the passage, with words of your own: click a
  highlight to write them. "My highlights" in the View menu lists every one,
  page by page, and exports them as Markdown for your own vault: each passage
  quoted, your words under it, a link back to the exact place. Highlights stay
  in your browser. When the author rewrites a passage, its highlight finds the
  words again from the text around them; one whose words are gone is kept and
  marked as no longer found.
- Every page has a social card, and JSON-LD for search engines.
- Notes can show webmentions (likes, reposts, replies) and comments, when the
  site enables them.

## On the fediverse

People on Mastodon and other fediverse servers can follow the garden. A static
site cannot send posts to followers itself, so datme hands that to
[Bridgy Fed](https://fed.brid.gy):

```yaml
site:
  url: https://garden.example
activitypub: bridgy
```

datme then redirects WebFinger to Bridgy Fed (in `_redirects`, so on Netlify or
Cloudflare Pages) and marks pages with microformats: the author on the home
page, and each note's title, text, date and address. Sign the site up at
fed.brid.gy; the garden becomes `@garden.example@garden.example`, and replies
come back as [webmentions](#following-the-garden). Bridgy Fed's
[documentation](https://fed.brid.gy/docs) explains how new notes reach
followers.

Where Bridgy Fed is not wanted, `activitypub: { username: notes }` publishes
only the static parts: WebFinger, an actor and an outbox of the 20 newest
notes. Searching `@notes@garden.example` on a fediverse server then finds the
garden and shows those notes, but following it does nothing, as no server
answers.

## Embedding a note elsewhere

Each public note announces an oEmbed description (`<note>.oembed.json`), so
sites and tools that support oEmbed turn a link to it into a card: its title,
excerpt and image, linking back. The card lives at `<note>/embed` for any page
to put in an iframe. The `_headers` file lets every site frame those cards
(`frame-ancestors *`); with `headers: { csp: true }` the site-wide policy still
applies to them, so embedding then needs a host that can drop a header for a
path. Turn it off with `oembed: false`. It needs `site.url`.

## Following the garden

- **Feeds:** every folder and tag has an RSS feed, linked from its page.
- **Changes:** with `history: true`, `/changes` follows how the garden is
  tended, not only what is planted: each change to a note, grouped by week,
  with the paragraphs that grew and were cut and a glimpse of what grew.
  Typo-size edits are left out. `/changes.xml`, and `changes.xml` next to every
  folder and tag feed, announce the same; add `changes` to `nav` to link it.
- **Email:** with `subscribe` set, a form under each note and on folder and tag
  pages signs readers up for new notes. See [below](#email-subscriptions).

### Email subscriptions

```yaml
subscribe:
  provider: buttondown
  username: my-garden
```

Each form sends its topic along: `folder:Books` on the Books folder, `tag:book`
on the #book tag, nothing under a note. With Buttondown it becomes a tag on the
subscriber, so one list serves every topic:

1. In Buttondown, add an RSS-to-email automation for the feed of each topic
   (`https://your.site/Books/index.xml`, `https://your.site/tags/book/index.xml`),
   sent to subscribers with the matching tag.
2. Add one for the garden's main feed, for subscribers without a tag.

Any other service that takes a plain form post works with `provider: form`:

```yaml
subscribe:
  provider: form
  action: https://lists.example.com/subscription/form
  field: email                # name of the email field (default: email)
  topicField: list            # optional: a hidden field carrying the topic
```

With `headers: { csp: true }`, the Content Security Policy lets forms post to
that service only.

## Listening

A note chosen for audio (see `tts` in the configuration) shows a ▶ Listen
button at the top. It plays the note's MP3 in place, a second click pauses it,
and moving to another page stops it. Notes without audio, protected notes, and
every site built with `datme dev` show no button.

## Taking it along

- **Offline:** the site installs as an app, and pages a reader has opened stay
  readable without a connection.
- **Print:** notes print cleanly. Footnotes return to the end, sidebars go
  away, and embeds show their links.
- **Markdown:** with `llms: true`, every public note has a `.md` copy next to
  its page, listed in `/llms.txt`; `/llms-full.txt` holds them all in one file.
  The note's 📄 Markdown menu copies that text, opens it, or asks ChatGPT or
  Claude to read it (`askAi`; only when `site.url` is set, as they fetch it).
