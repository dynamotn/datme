import { site, type Lang } from "../site.config"
import { listed, filterLanguage, type Note } from "./vault"
import { langMeta } from "./i18n"
import { renderNote } from "./markdown"

/** Notes offered as plain markdown: public, listed, not the home page. */
export function plainNotes(lang: Lang): Note[] {
  return listed(lang).filter((n) => !n.protected && !n.isHome)
}

/** URL of the markdown copy of a note. */
export const mdUrl = (n: Note) => `${n.url}.md`

/**
 * A note as markdown for readers and tools that prefer text: its title and
 * the body in its language, without comments or frontmatter, which may hold
 * what the published page does not show.
 */
export function noteMarkdown(n: Note): string {
  const body = filterLanguage(n.source.raw, n.lang)
    .replace(/%%[\s\S]*?%%/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  const head = body.startsWith("# ") ? "" : `# ${n.title}\n\n`
  return `${head}${body}\n`
}

const abs = (p: string) => (site.url ? new URL(p, site.url + "/").href : p)

/** The site's /llms.txt (llmstxt.org): what it is about, and a link to every note's markdown. */
export async function llmsTxt(): Promise<string> {
  const lang = site.defaultLang
  const lines = [`# ${site.title[lang]}`, ""]
  if (site.tagline[lang]) lines.push(`> ${site.tagline[lang]}`, "")
  for (const l of site.langs) {
    const notes = plainNotes(l)
    if (!notes.length) continue
    lines.push(`## ${site.langs.length > 1 ? `Notes (${langMeta(l).name})` : "Notes"}`, "")
    for (const n of notes) {
      const { description } = await renderNote(n)
      lines.push(`- [${n.title}](${abs(mdUrl(n))})${description ? `: ${description}` : ""}`)
    }
    lines.push("")
  }
  return lines.join("\n")
}
