import type { APIRoute, GetStaticPaths } from "astro"
import { site, type Lang } from "~/site.config"
import { getVault, type Note } from "~/lib/vault"
import { renderNote } from "~/lib/markdown"
import { cardSpec, renderOg, OG_SOURCE, type OgCard } from "~/lib/og"
import { baseStyle, lookOf } from "~/lib/look"
import { callNumber } from "~/lib/catalog"
import { readCache, writeCache } from "~/lib/render-cache"
import { formatDate, langPrefix, t } from "~/lib/i18n"

type Props = { lang: Lang; note?: Note }

/** A card for each home page and for every note without its own banner. */
export const getStaticPaths = (() => {
  if (!site.ogImages) return []
  const vault = getVault()
  return site.langs.flatMap((lang) => [
    { params: { slug: langPrefix(lang) + "index" }, props: { lang } },
    ...vault.notes[lang].filter((n) => !n.isHome && !n.banner).map((note) => ({ params: { slug: note.slug }, props: { lang, note } })),
  ])
}) satisfies GetStaticPaths

export const GET: APIRoute<Props> = async ({ props: { lang, note } }) => {
  const kicker = site.title[lang]
  // The card is drawn in the page's style: the home's is the site's, a note's its own.
  const accent = site.theme.accent
  const spec = cardSpec(baseStyle(note ? lookOf(note) : site.appearance.style), typeof accent === "object" ? accent.light : accent)
  let card: OgCard
  if (!note) card = { title: site.title[lang], kicker: site.tagline[lang] || kicker, logo: site.logo }
  else {
    const r = await renderNote(note)
    const stage = note.stage ? site.stages[note.stage].label[lang] : undefined
    const minutes = r.words ? t(lang).readingTime(Math.max(1, Math.round(r.words / 220))) : undefined
    card = {
      title: r.h1 ?? note.title,
      kicker,
      meta: [formatDate(note.created, lang), stage, minutes].filter(Boolean).join(" · "),
      tags: note.tags.map((x) => (x.startsWith(site.conventions.typePrefix) ? x.slice(site.conventions.typePrefix.length) : x)),
      logo: site.logo,
      // An atlas letters the note's region, a catalogue card its call number; other cards leave them out of the cache key.
      region: spec.design === "atlas" && note.dir ? getVault().folders[lang].get(note.dir.split("/")[0])?.name : undefined,
      callNumber: spec.design === "catalog" ? callNumber(note.dir, getVault().trees[lang].folders.map((f) => f.dir)) : undefined,
    }
  }
  // Drawing a card is the slowest step of a build; an unchanged card in an unchanged style is reused.
  const key = [JSON.stringify(card), JSON.stringify(spec)]
  let png = readCache("og", OG_SOURCE, key)
  if (!png) {
    png = await renderOg(card, spec)
    writeCache("og", OG_SOURCE, key, png)
  }
  return new Response(new Uint8Array(png), { headers: { "content-type": "image/png" } })
}
