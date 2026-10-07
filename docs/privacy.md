---
title: "Privacy"
---
# Privacy

A vault holds more than you mean to share. datme starts from "nothing is
public", and gives you several ways to share a little more.

## What gets published

- **Notes:** with `publish: explicit` (the default), only notes with
  `publish: true`. With `publish: all`, every note except those with
  `publish: false`.
- **Folders:** `.obsidian`, `.trash`, `templates`, `private`, and anything
  listed in `ignore`, are never read.
- **Files:** only the images and attachments a published note uses are copied
  to the site.
- **Canvases and bases:** only those a published note links to or embeds, or
  all of them with `publish: all`.
- **Queries:** Dataview, Tasks, `query` blocks and Bases only see published
  notes.
- **Comments:** `%%comments%%` and HTML comments never reach the page, nor the
  markdown copies made for `llms.txt`.

## Unlisted notes

`unlisted: true` publishes the note but leaves it out of the explorer, folder
and tag pages, lists, related notes and the markdown copies. People who have the
link can still read it.

## Drafts and scheduled notes

- `draft: true` keeps a note private.
- `publish_date: 2025-01-31` keeps it private until that day; the first build
  after it publishes the note. [Deploying](deploying.md#one-command) shows how to
  get a daily build on each host.

`dev`, `build` and `preview` with `--drafts` include both, marked as drafts and
kept out of search engines. That's handy for preview deploys.

## Password-protected notes

A note with a `password` field is published encrypted, and readers unlock it in
the browser:

```markdown
---
publish: true
password: correct horse battery staple
---
```

- Encryption is AES-256-GCM, with a key derived from the password by PBKDF2.
  Set the number of rounds with `encryption.iterations`.
- Nothing of the note's content reaches excerpts, search, feeds, embeds, the
  graph, the build cache or the markdown copies.
- The password is removed from the frontmatter before anything renders.

## Locked parts

*Live example: [Locked part](showcase/Locked%20part.md), password `datme`.*

To protect only a passage, wrap it the way language blocks are written:

```markdown
Anyone can read this.

<!--lock:correct horse battery staple-->
## Just for friends
Only readers with the password see this, links and all.
<!--lock:*-->

And this is public again.
```

- The part is taken out of the note before anything else reads it. Its text
  and links never reach search, excerpts, feeds, the graph, the build cache or
  the markdown copies.
- The page carries the part encrypted, with an unlock form in its place.
- A note can hold several parts, each with its own password. A password that
  opens one part also opens the others it fits.
- Once a password works, it's remembered for the rest of the session.
- Locked parts work inside language blocks. Keep them at the top level of the
  note, not inside a callout or a list.

> [!note]
> Images inside a locked part are still published as files; only the text is
> encrypted. Passwords live in the vault as plain text, like the `password`
> field. The vault stays private; only the built site is public.

## What the site loads from elsewhere

A built site is self-contained, apart from what you opt into:

- Google Fonts, when `theme.fonts` names families, and the fonts of the Marp
  theme a deck uses.
- Atkinson Hyperlegible, only when a reader picks the legible font.
- Images of link preview cards, and embedded videos, tweets and map tiles.
- Analytics, comments and webmentions, when configured.

`headers: { csp: true }` adds a Content Security Policy derived from the
features in use.
