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
| `datme check [vault]` | Lists broken links, missing files, clashing URLs or aliases, and invalid frontmatter; exits 1 on errors |
| `datme deploy <host> [vault]` | Writes a CI config that publishes the vault on every push (see [Deploying](deploying.md)) |
| `datme export <folder> [vault]` | Turns a folder (`.` for the whole vault) into an EPUB book, or a printable page |
| `datme init [vault]` | Writes a starter `datme.yaml`; never overwrites one |

## Flags

| Flag | Commands | What it does |
| --- | --- | --- |
| `--site <url>` | dev, build, preview | Overrides the public URL (also `$DATME_SITE_URL`), handy for preview deploys |
| `--drafts` | dev, build, preview | Also builds drafts and scheduled notes, marked as such and kept out of search engines |
| `--strict` | check, build | Fails on warnings too, for CI |
| `--fresh` | build | Ignores the build cache and starts from scratch |
| `--verbose` | check | Also lists links to unpublished notes, and scheduled notes |
| `--external` | check | Also checks that links to other websites still answer (404, 410 and unreachable hosts are reported) |
| `--branch` | deploy | The branch to publish from (default: the current one) |
| `--format html` | export | One self-contained page to print as PDF, instead of EPUB |
| `--out` | build, export | Where to write the site (default `./dist`) or the book |
| `--lang` | export | The language of the book (default: the first one) |
| `--port`, `--host` | dev, preview | The port (default 4321); `--host` listens on every network interface |

## Checking a vault

`build` prints a one-line summary of the problems `check` would report.
`datme dev` also shows a note's problems on its page.

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
goes from about 23 s to 2.5 s. Notes that embed others or run queries are always
rendered again. Protected notes and locked parts are never written to the cache.

The cache lives in datme's `.datme/cache`. `$DATME_CACHE` moves it (handy for
CI caches), an empty value turns it off, and `--fresh` starts from scratch.
