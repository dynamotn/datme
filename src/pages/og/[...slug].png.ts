import type { APIRoute, GetStaticPaths } from "astro"
import { site, type Lang } from "~/site.config"
import { getVault, type Note } from "~/lib/vault"
import { renderNote } from "~/lib/markdown"
import { renderOg } from "~/lib/og"
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
  let card
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
    }
  }
  return new Response(new Uint8Array(await renderOg(card)), { headers: { "content-type": "image/png" } })
}
