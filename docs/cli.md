---
title: "Command line"
---
# Command line

```bash
bunx @dynamotn/datme <command> [vault] [flags]   # or npx with Node 23.6+, or `datme` when installed globally
```

The vault defaults to `$DATME_VAULT`, then the current directory.

## Commands

| Command | What it does |
| --- | --- |
| `datme dev [vault]` | Live preview that reloads when a note changes. `--port`, `--host` |
| `datme build [vault]` | Builds into `--out` (default `./dist`). An existing directory is replaced only if datme created it. |
| `datme preview [vault]` | Builds, then serves the result |
| `datme check [vault]` | Lists broken links, missing files, clashing URLs or aliases, invalid frontmatter and Dataview queries that cannot run; exits 1 on errors |
| `datme deploy <host> [vault]` | Writes a CI config that publishes the vault on every push (see [Deploying](deploying.md)) |
| `datme export <folder> [vault]` | Turns a folder (`.` for the whole vault) into an EPUB book, or a printable page |
| `datme doctor [vault]` | Checks the machine and the vault before a build: the Bun or Node version, the optional packages the vault's notes need (D2, Typst, transformers.js), git, the `DATME_LOCK_…` variables of group passwords, and `site.url`. Each problem comes with the command that fixes it; exits 1 if one must be fixed |
| `datme init [vault]` | Writes a starter `datme.yaml`; never overwrites one |
| `datme mcp [vault]` | Serves the published notes to AI assistants over the Model Context Protocol (stdio); see [AI assistants](#ai-assistants) |
| `datme migrate <from> [vault]` | Lists what switching from `publish` (Obsidian Publish), `digital-garden` or `quartz` changes; `--write` applies it (see [Coming from another publisher](migrating.md)) |
| `datme related <note> [vault]` | Lists the published notes related to a note (published or not), and the places where its text names one without a link; `--json` for tools such as the Obsidian plugin |
| `datme url <note> [vault]` | Prints the URL path of a published note, canvas or drawing (`--lang` picks the language); fails for a private one |

## Flags

| Flag | Commands | What it does |
| --- | --- | --- |
| `--site <url>` | dev, build, preview | Overrides the public URL (also `$DATME_SITE_URL`), handy for preview deploys |
| `--drafts` | dev, build, preview | Also builds drafts and scheduled notes, marked as such and kept out of search engines |
| `--strict` | check, build | Fails on warnings too, for CI |
| `--fresh` | build | Ignores the build cache and starts from scratch |
| `--verbose` | check, build | Also lists links to unpublished notes, and scheduled notes; with build, how many notes came from the cache |
| `--json` | check | Prints every problem, notices included, as JSON for other tools |
| `--privacy` | check | Lists what leaves the vault instead of the problems (see [Privacy](privacy.md#auditing-what-leaves-the-vault)); JSON with `--json` |
| `--external` | check | Also checks that links to other websites still answer (404, 410 and unreachable hosts are reported) |
| `--write` | migrate | Applies the changes instead of only listing them |
| `--branch` | deploy | The branch to publish from (default: the current one) |
| `--format html` | export | One self-contained page to print as PDF, instead of EPUB |
| `--out` | build, export | Where to write the site (default `./dist`) or the book |
| `--lang` | export, url, related | The language of the book, URL or suggestions (default: the first one) |
| `--port`, `--host` | dev, preview | The port (default 4321); `--host` listens on every network interface |

## Checking a vault

Besides what is broken, `check --verbose` lists notices about the shape of the
garden, in its first language:

- **Orphans:** notes no published note links to and the menu doesn't lead to.
  The home page, folder notes, daily notes and unlisted notes are left out.
- **Dead ends:** notes that link to no published note (daily notes aside).
- **Hubs:** notes linking to at least 15 notes and five times as many as the
  median note; a map of content could split them.

`check: { structure: false }` in `datme.yaml` turns these off. The Obsidian
plugin lists them too when its *Show notices* setting is on.

`check` also warns when `theme.accent`, set in `datme.yaml` or by a theme
pack, is too faint to read: below WCAG AA's 4.5:1 as link text on the light
or dark ground of any style the site uses (its configured styles and those
its notes take), or as the ground of the white or near-black text set on it.
The warning gives each ratio and an accent of the same hue, darker or
lighter, that passes. A theme pack's style is read on the ground of its base;
a ground its stylesheets change is not seen.

`check` runs every Dataview query of the published notes, ```` ```dataview ````
blocks and inline `` `= …` `` alike. One that cannot run is an error, since the
page would show the error instead of a result; one that datme does not
support yet, such as `CALENDAR`, is a warning. Either way `--strict` stops the
build before a broken query goes live.

`build` prints a one-line summary of the problems `check` would report.
`datme dev` also shows a note's problems on its page, and a switcher to
preview any page in another style or chrome, and a note or folder in another
layout or collection (see
[Writing](writing.md#page-layouts)).

Dead external links found by `check --external` are remembered. The next
builds point those links at their Internet Archive copy
(`archiveDeadLinks: false` keeps them as they are).

## Exporting a book

`datme export Books` turns the `Books` folder into an EPUB. Chapters follow the
folder tree, links between chapters stay links, and images are packed in.
Protected notes are left out. With `--format html` you get one self-contained
page instead, ready to print as a PDF.

## The build cache

Builds are incremental. Rendered notes and social cards are cached and reused
as long as their content, the config and datme stay the same; a 300-note vault
goes from about 23 s to 2.5 s. Protected notes and locked parts are never written
to the cache.

Notes that embed others or run queries are cached too, keyed by what they read:

- An embed: the embedded note, and whatever that one embeds or queries.
- A Dataview query whose `FROM` names only folders and tags: the notes in
  them. A note added to one of those folders counts, one added elsewhere doesn't.
- Any other query, base or map: every published note, so any change renders
  them again.
- A query that reads `today` is rendered again each day. One that reads `now`,
  or a Typst block that reads files, is never cached.

`datme build --verbose` ends with how many notes came from the cache.

Each vault has its own cache in the system's cache directory: `datme/<vault
name>-<id>` under `$XDG_CACHE_HOME` (or `~/.cache`) on Linux,
`~/Library/Caches` on macOS and `%LOCALAPPDATA%` on Windows, so building one
vault never prunes another's. `$DATME_CACHE` moves it (handy for CI caches), an empty value turns it off, and `--fresh` starts from scratch.
Since datme deletes what a build no longer uses, `$DATME_CACHE` must name an
empty directory or one datme filled; any other stops the build.

## AI assistants

`datme mcp` lets an assistant such as Claude read the garden as the public
does: the same notes, without private or protected ones, locked parts or
comments. It offers four tools, `search`, `read_note`, `backlinks` and
`related`, and every published note as a resource. Each answer carries the
note's public URL, so the assistant can cite it.

```bash
claude mcp add garden -- bunx @dynamotn/datme mcp ~/MyVault   # Claude Code
```

Other clients take the same command in their settings, such as Claude
Desktop's `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "garden": { "command": "bunx", "args": ["@dynamotn/datme", "mcp", "/path/to/MyVault"] }
  }
}
```

URLs are full when `site.url` is set; without it they are paths of the site.
