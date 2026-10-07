---
title: "The reader's side"
---
# The reader's side

This is what someone visiting your garden can do. None of it needs setting up.

## Finding things

- **Search** (`Ctrl K`) covers every note. You can narrow it by folder and note
  type, or by tag with `#tag`. For large vaults, `search: { engine: pagefind }`
  loads only what each query needs.
- **Graph** (`Ctrl G`) shows the whole garden. Filter it by folder and tag, and
  colour notes by folder or type. Its time slider replays how the garden grew.
  Each note also has a local graph in its sidebar.
- **Backlinks** under each note show who links to it, with the sentence around
  the link. Related notes (shared tags and links) and unlinked mentions follow.
- **Wandering:** `j` and `k` move to the next or previous note of the explorer,
  and 🎲 (or `r`) opens a random one.
- **Overview pages:** `/tags`, `/archive` (with a yearly activity calendar),
  `/recent`, and `/timeline`, `/map` and `/stats` when some note qualifies.

## Reading

- **Previews:** hover an internal link to read the note in a popover. Hover a
  footnote number or a citation to see it in place.
- **Stacked pages:** the header button opens linked notes side by side, like a
  trail of index cards.
- **Reading progress:** notes of 300 words or more show a progress bar and the
  minutes left.
- **Reading preferences:** the "Aa" menu enlarges the text, switches to a
  legible font (Atkinson Hyperlegible) or high contrast. The choice stays in
  the reader's browser.
- **Sidebars:** each one folds away on its own. Reader mode hides both.
- **Theme:** light and dark follow the system, with a toggle.
- **Images:** images and drawings open large in a lightbox; arrows move
  between them.
- **Right-to-left:** Arabic, Hebrew, Persian, Urdu and other right-to-left
  languages get `dir="rtl"`.

## Sharing

- Select text in a note to copy a link to that exact passage (`#:~:text=`). The
  link opens the page scrolled to the passage, highlighted.
- Every page has a social card, and JSON-LD for search engines.
- Notes can show webmentions (likes, reposts, replies) and comments, when the
  site enables them.

## Following the garden

- **Feeds:** every folder and tag has an RSS feed, linked from its page.
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

## Taking it along

- **Offline:** the site installs as an app, and pages a reader has opened stay
  readable without a connection.
- **Print:** notes print cleanly. Footnotes return to the end, sidebars go
  away, and embeds show their links.
- **Markdown:** with `llms: true`, every public note has a `.md` copy next to
  its page, listed in `/llms.txt`.
