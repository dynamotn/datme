import { site, type Lang } from "../site.config"
import { getVault, listed, filterLanguage, type Note } from "./vault"
import { langMeta, t } from "./i18n"
import { renderNote } from "./markdown"
import { withoutLocked } from "./locked"
import { withoutComments } from "./obsidian"
import { absUrl, withBase } from "./base"

/** Notes offered as plain markdown: public, listed, not the home page. */
export function plainNotes(lang: Lang): Note[] {
  return listed(lang).filter((n) => !n.protected && !n.isHome)
}

/** Whether a note has a markdown copy next to its page: one of plainNotes, when llms is on. */
export const hasMarkdown = (n: Note) => site.llms && !n.unlisted && !n.protected && !n.isHome

/** URL of the markdown copy of a note. */
export const mdUrl = (n: Note) => `${n.url}.md`

/**
 * A note as markdown for readers and tools that prefer text: its title and
 * the body in its language, without comments or frontmatter, which may hold
 * what the published page does not show.
 */
export function noteMarkdown(n: Note): string {
  const body = publicMarkdown(filterLanguage(n.source.raw, n.contentLang), n)
  const head = body.startsWith("# ") ? "" : `# ${n.title}\n\n`
  return `${head}${body}\n`
}

/**
 * Markdown as the public may read it: without locked parts and comments and,
 * given the note it belongs to, with links to private notes as the page shows
 * them. Every plain-text copy of a note goes through here.
 */
export function publicMarkdown(md: string, n?: Note): string {
  const open = withoutComments(withoutLocked(md))
  return (n ? withoutPrivateLinks(open, n) : open).replace(/\n{3,}/g, "\n\n").trim()
}

/** Links and embeds of private notes as the words the page shows for them, following privateLinks. */
export function withoutPrivateLinks(md: string, n: Note): string {
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

/** Chat assistants that take a first message in their URL. */
const ASSISTANTS = {
  chatgpt: { name: "ChatGPT", url: "https://chatgpt.com/?q=" },
  claude: { name: "Claude", url: "https://claude.ai/new?q=" },
} as const

/**
 * Links that open a chat assistant asked to read a note's markdown copy.
 * The assistant fetches it, so there are none without a public site.url.
 */
export function askAiLinks(n: Note): { name: string; href: string }[] {
  if (!site.url || !hasMarkdown(n)) return []
  const s = t(n.lang)
  const prompt = s.askAiPrompt.replace("{url}", absUrl(mdUrl(n)))
  return site.askAi.map((id) => ({
    name: s.askAi.replace("{app}", ASSISTANTS[id].name),
    href: ASSISTANTS[id].url + encodeURIComponent(prompt),
  }))
}

/** Title and tagline that open both /llms.txt and /llms-full.txt. */
function intro(): string[] {
  const lang = site.defaultLang
  const lines = [`# ${site.title[lang]}`, ""]
  if (site.tagline[lang]) lines.push(`> ${site.tagline[lang]}`, "")
  return lines
}

/** Heading of a language's notes, named only when the site has several. */
const notesHeading = (l: Lang) => `## ${site.langs.length > 1 ? `Notes (${langMeta(l).name})` : "Notes"}`

/** The site's /llms.txt (llmstxt.org): what it is about, and a link to every note's markdown. */
export async function llmsTxt(): Promise<string> {
  const lines = intro()
  for (const l of site.langs) {
    const notes = plainNotes(l)
    if (!notes.length) continue
    lines.push(notesHeading(l), "")
    for (const n of notes) {
      const { description } = await renderNote(n)
      lines.push(`- [${n.title}](${absUrl(mdUrl(n))})${description ? `: ${description}` : ""}`)
    }
    lines.push("")
  }
  lines.push("## Optional", "", `- [Full text](${absUrl(withBase("/llms-full.txt"))}): every note above in one file`, "")
  return lines.join("\n")
}

/** The site's /llms-full.txt: the markdown copy of every note in one file, each after the URL of its page. */
export function llmsFullTxt(): string {
  const lines = intro()
  for (const l of site.langs) {
    const notes = plainNotes(l)
    if (!notes.length) continue
    lines.push(notesHeading(l), "")
    for (const n of notes) lines.push("---", "", `Source: ${absUrl(n.url)}`, "", noteMarkdown(n))
  }
  return lines.join("\n")
}
