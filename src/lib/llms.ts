import { site, type Lang } from "../site.config"
import { getVault, listed, filterLanguage, type Note } from "./vault"
import { langMeta } from "./i18n"
import { renderNote } from "./markdown"
import { withoutLocked } from "./locked"

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
  const body = withoutPrivateLinks(withoutLocked(filterLanguage(n.source.raw, n.contentLang)), n)
    .replace(/%%[\s\S]*?%%/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  const head = body.startsWith("# ") ? "" : `# ${n.title}\n\n`
  return `${head}${body}\n`
}

/** Links and embeds of private notes as the words the page shows for them, following privateLinks. */
function withoutPrivateLinks(md: string, n: Note): string {
  const vault = getVault()
  const words = (target: string, alias: string | undefined) => {
    let file = target.split("#")[0].trim()
    try {
      file = decodeURI(file)
    } catch {
      // keep the raw target
    }
    return file ? vault.privateLink(file, n.source.dir, alias, n.lang) : undefined
  }
  return md
    .replace(/!?\[\[([^[\]\n]+?)\]\]/g, (link, inner: string) => {
      const raw = inner.replace(/\\\|/g, "|")
      const pipe = raw.indexOf("|")
      return (pipe >= 0 ? words(raw.slice(0, pipe), raw.slice(pipe + 1).trim()) : words(raw, undefined)) ?? link
    })
    .replace(/\[([^\]\n]*)\]\(([^)\s]+?\.md)(#[^)\s]*)?\)/gi, (link, text: string, target: string) => words(target, text) ?? link)
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
