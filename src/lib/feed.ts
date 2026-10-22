import fs from "node:fs"
import path from "node:path"
import rss from "@astrojs/rss"
import { site, type Lang } from "~/site.config"
import { listed, byRecent, getVault, type Note } from "./vault"
import { renderNote } from "./markdown"
import { langPrefix } from "./i18n"
import { sluggify } from "./slug"
import { gardenChanges } from "./changes"
import { formatDate, t } from "./i18n"
import { collectionOf, episodeNumber, field, releasesOf, specOf, textOf, whenOf } from "./note-layouts"
import { audioType, digestOf } from "./collection-views"
import { escapeAttr } from "./html"

/** What a feed covers: the whole site, a folder (with its subfolders) or a tag (with its subtags). */
export type FeedScope = { kind: "site" } | { kind: "folder"; dir: string } | { kind: "tag"; tag: string }

/** Path of a feed, without the leading slash: index.xml, Books/index.xml, tags/book/index.xml. */
export function feedPath(lang: Lang, scope: FeedScope): string {
  const prefix = langPrefix(lang)
  if (scope.kind === "folder") return `${prefix}${sluggify(scope.dir)}/index.xml`
  if (scope.kind === "tag") return `${prefix}tags/${scope.tag}/index.xml`
  return `${prefix}index.xml`
}

function notesOf(lang: Lang, scope: FeedScope): Note[] {
  if (scope.kind === "tag") return getVault().tags[lang].get(scope.tag) ?? []
  const all = listed(lang).filter((n) => !n.isHome)
  if (scope.kind === "folder") return all.filter((n) => n.dir === scope.dir || n.dir.startsWith(scope.dir + "/"))
  return all
}

export async function feed(lang: Lang, scope: FeedScope = { kind: "site" }): Promise<Response> {
  const notes = byRecent(notesOf(lang, scope), "created").slice(0, 40)
  const name = scope.kind === "folder" ? getVault().folders[lang].get(scope.dir)?.name : scope.kind === "tag" ? `#${scope.tag}` : undefined
  return rss({
    title: name ? `${name} · ${site.title[lang]}` : site.title[lang],
    description: site.tagline[lang],
    // RSS needs absolute links; without site.url they point at the dev server.
    site: site.url ?? "http://localhost:4321",
    customData: `<language>${lang}</language>`,
    items: await Promise.all(
      notes.map(async (n) => {
        const r = await renderNote(n)
        return {
          title: r.h1 ?? n.title,
          link: n.url,
          pubDate: n.created,
          description: r.description,
          categories: n.tags,
        }
      }),
    ),
  })
}

/** Path of the changes feed of a scope: changes.xml next to its index.xml. */
export const changesPath = (lang: Lang, scope: FeedScope) => feedPath(lang, scope).replace(/index\.xml$/, "changes.xml")

/** RSS of the changes to notes, not only new ones: each item a version, with what grew and what was cut. */
export function changesFeed(lang: Lang, scope: FeedScope = { kind: "site" }): Promise<Response> {
  const s = t(lang)
  const name = scope.kind === "folder" ? getVault().folders[lang].get(scope.dir)?.name : scope.kind === "tag" ? `#${scope.tag}` : undefined
  return rss({
    title: `${s.changes} · ${name ? `${name} · ` : ""}${site.title[lang]}`,
    description: s.changesLead,
    site: site.url ?? "http://localhost:4321",
    customData: `<language>${lang}</language>`,
    items: gardenChanges(lang, scope, 50).map((c) => {
      const summary = c.planted ? s.changeNew : s.changesSummary.replace("{added}", String(c.added)).replace("{removed}", String(c.removed))
      return {
        title: `${c.note.title} (${summary})`,
        link: c.url,
        // A note changes many times: each version is an item of its own.
        customData: `<guid isPermaLink="false">${new URL(c.note.url, "https://x").pathname}@${c.date.toISOString()}</guid>`,
        pubDate: c.date,
        description: c.excerpt,
        categories: c.note.tags,
      }
    }),
  })
}

/** Path of the podcast feed of an `episodes` collection, next to its page: Podcast/episodes.xml. */
export function episodesPath(note: Note): string {
  const dir = note.slug.replace(/(^|\/)index$/, "")
  return dir ? `${dir}/episodes.xml` : "episodes.xml"
}

/**
 * RSS of an `episodes` collection, newest first, each episode's `audio` as
 * its enclosure, so podcast apps can follow it. A file of the vault gives its
 * size; a sound elsewhere is of unknown length, which RSS writes as 0.
 */
export async function episodesFeed(note: Note): Promise<Response> {
  // Newest first whatever the groups of the page, as podcast apps expect.
  const time = (n: Note) => whenOf(n)?.getTime() ?? 0
  const episodes = collectionOf(note, specOf(note, "episodes"))
    .flatMap((g) => g.notes)
    .sort((a, b) => time(b) - time(a))
  return rss({
    title: `${note.title} · ${site.title[note.lang]}`,
    description: note.description ?? site.tagline[note.lang],
    site: site.url ?? "http://localhost:4321",
    xmlns: { itunes: "http://www.itunes.com/dtds/podcast-1.0.dtd" },
    customData: `<language>${note.lang}</language>`,
    items: await Promise.all(
      episodes.map(async (n) => {
        const r = await renderNote(n)
        const duration = field(n, "duration|length")
        const number = episodeNumber(n)
        return {
          title: r.h1 ?? n.title,
          link: n.url,
          pubDate: whenOf(n),
          description: r.description,
          categories: n.tags,
          enclosure: n.audio && {
            url: n.audio.href,
            length: n.audio.file ? fs.statSync(path.join(site.vault, n.audio.file)).size : 0,
            type: audioType(n.audio.href),
          },
          customData:
            (duration ? `<itunes:duration>${escapeAttr(duration)}</itunes:duration>` : "") + (number ? `<itunes:episode>${number}</itunes:episode>` : ""),
        }
      }),
    ),
  })
}

/** RSS of a changelog: each version with a number an item, at its anchor, dated when its heading gives a date. */
export async function releasesFeed(note: Note): Promise<Response> {
  const { releases } = releasesOf((await renderNote(note)).html)
  return rss({
    title: `${note.title} · ${site.title[note.lang]}`,
    description: note.description ?? site.tagline[note.lang],
    site: site.url ?? "http://localhost:4321",
    customData: `<language>${note.lang}</language>`,
    items: releases
      .filter((r) => r.id)
      .map((r) => ({
        title: `${note.title} ${r.version}`,
        link: `${note.url}#${r.id}`,
        pubDate: r.date ? new Date(`${r.date}T00:00:00Z`) : undefined,
        description: textOf(r.body),
      })),
  })
}

/** Path of the feed of a `digest`, next to its page: Garden/digest.xml. */
export function digestPath(note: Note): string {
  const dir = note.slug.replace(/(^|\/)index$/, "")
  return dir ? `${dir}/digest.xml` : "digest.xml"
}

/** RSS of a digest: each week an item, at its anchor on the page, with the notes planted and tended in it. */
export function digestFeed(note: Note): Promise<Response> {
  const s = t(note.lang)
  const weeks = digestOf(
    note,
    collectionOf(note, specOf(note, "digest")).flatMap((g) => g.notes),
  )
  const titles = (list: { note: Note }[]) => list.map((e) => e.note.title).join(", ")
  return rss({
    title: `${note.title} · ${site.title[note.lang]}`,
    description: note.description ?? site.tagline[note.lang],
    site: site.url ?? "http://localhost:4321",
    customData: `<language>${note.lang}</language>`,
    items: weeks.map((w) => ({
      title: `${w.label} (${formatDate(new Date(`${w.start}T00:00:00Z`), note.lang)} – ${formatDate(new Date(`${w.end}T00:00:00Z`), note.lang)})`,
      // Absolute already, so RSS adds no slash after the anchor.
      link: new URL(`${note.url}#${w.id.toLowerCase()}`, site.url ?? "http://localhost:4321").href,
      // The latest change of the week dates it, so the item moves up while the week goes on.
      pubDate: [...w.planted, ...w.tended].map((e) => e.date).sort((a, b) => b.getTime() - a.getTime())[0],
      description: [w.planted.length ? `${s.planted}: ${titles(w.planted)}` : "", w.tended.length ? `${s.tended}: ${titles(w.tended)}` : ""]
        .filter(Boolean)
        .join(" · "),
    })),
  })
}
