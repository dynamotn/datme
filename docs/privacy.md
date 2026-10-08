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
  to the site; those that only encrypted content uses travel inside it.
- **Canvases and bases:** only those a published note links to or embeds, or
  all of them with `publish: all`.
- **Queries:** Dataview, Tasks, `query` blocks and Bases only see published
  notes.
- **Comments:** `%%comments%%` and HTML comments never reach the page, nor the
  markdown copies made for `llms.txt`.

## Links to private notes

A published note may link to one that is not. The link can't lead anywhere,
so its words stay as plain text. Those words are often the private note's
title, and a title such as "Job interview at X" says a lot on its own.
`privateLinks` chooses what the page shows:

```yaml
privateLinks: text            # the words as written (the default)
privateLinks: placeholder     # "a private note", whatever the words were
privateLinks: hide            # nothing for [[Job interview]]; an alias, as in [[Job interview|that day]], stays
```

The setting also covers embeds, the backlink snippets of other notes,
properties, and Dataview fields. `datme check --verbose` lists every link to a
private note that still shows its name.

## Auditing what leaves the vault

`datme check --privacy` lists everything a build would publish, so you can
read it through before the first deploy:

- the published notes and their URLs, marked when protected or unlisted
- the canvases, bases and drawings published as pages
- every file copied to the site
- the frontmatter keys shown in properties blocks, and the notes showing each
- the links to private notes, with the words each leaves on the page
- the outside hosts the site loads from, and why

`--json` prints the same as JSON.

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
- A note can hold several parts, each with its own password or
  [group](#group-passwords-kept-out-of-the-vault). A password that
  opens one part also opens the others it fits.
- Once a password works, it's remembered for the rest of the session.
- Locked parts work inside language blocks. Keep them at the top level of the
  note, not inside a callout or a list.

## Group passwords, kept out of the vault

A password written in a note sits in the vault as plain text. To keep it out,
name a group instead, with `@`:

```markdown
<!--lock:@friends-->
For friends only.
<!--lock:*-->
```

or `password: "@friends"` in the frontmatter of a whole note. The password is
read from the environment variable `DATME_LOCK_FRIENDS` (`@close-friends` reads
`DATME_LOCK_CLOSE_FRIENDS`), so it can live in your CI secrets:

- **GitLab:** add a masked CI/CD variable; pipelines see it as is.
- **GitHub and Cloudflare:** add a repository secret, then uncomment the
  `DATME_LOCK_…` line that `datme deploy` wrote into the workflow's `env`.
- **Netlify:** add an environment variable to the site.

Changing a group's password is then one setting, for every note that uses it.

If the variable is missing, nothing is published in the clear: a locked part
is left out of the page, a protected note is not published at all, and
`datme check` reports it as an error.

## Files of encrypted content

An image, a PDF or any other file that only a locked part or a protected note
uses is never published as a file of its own. It travels inside the ciphertext,
as a data URI, and appears once the reader unlocks. A file that a public note
also uses stays an ordinary file, since it is public anyway.

## Note history

`history: true` gives each note that changed a page showing how it grew: every
version, newest first, with the paragraphs added and removed. It's built from
the vault's git history, and it's off by default for a reason: **it publishes
what you later deleted.**

What it never shows is what readers could not have seen on that day:

- Versions where the note was private, a draft or protected are skipped.
- Each version is cleaned like the note itself: no frontmatter, comments,
  locked parts or other languages.
- Commit messages are never shown, only dates.

A note opts out with `history: false` in its frontmatter. History pages are
kept out of search engines.

## What the site loads from elsewhere

A built site is self-contained, apart from what you opt into:

- Google Fonts, when `theme.fonts` names families, and the fonts of the Marp
  theme a deck uses.
- Atkinson Hyperlegible, only when a reader picks the legible font.
- Images of link preview cards, and embedded videos, tweets and map tiles.
- Analytics, comments and webmentions, when configured.

`headers: { csp: true }` adds a Content Security Policy derived from the
features in use.
