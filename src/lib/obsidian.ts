import GithubSlugger from "github-slugger"
import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkGfm from "remark-gfm"
import { visit } from "unist-util-visit"
import type { Lang } from "../site.config"
import { langPrefix } from "./i18n"
import { sluggify, slugTag, slugToUrl } from "./slug"
import { embedExternal } from "./media"
import { tabsHtml, columnsHtml } from "./layouts"
import { mediaFragment, parseCues, sidecars, transcriptHtml } from "./transcripts"
import { markdownSafe } from "./excalidraw"
import { CODE_SPAN } from "./links"
import { t } from "./i18n"

export interface LinkRef {
  key: string
  context: string
}

/** A link or embed the converter could not resolve, classified later by the vault. */
export interface LinkProblem {
  kind: "link" | "embed" | "drawing"
  target: string
  /** For a link to a private note, the words it left on the page ("" for none). */
  shown?: string
}

/** The only thing the converter needs to know about a resolved note. */
export interface LinkTarget {
  key: string
}

/** A drawing datme drew from its Excalidraw source, with the vault files it shows. */
export interface DrawnDrawing {
  svg: string
  assets: string[]
  /** Keys of the published notes the drawing links to or embeds. */
  links: string[]
  /** The drawing's file in the vault. */
  rel: string
}

interface Ctx {
  lang: Lang
  dir: string
  resolveNote(target: string, fromDir: string): LinkTarget | undefined
  resolveAsset(target: string, fromDir: string): string | undefined
  /** Draw an Excalidraw drawing that has no exported image; undefined when it cannot be found or read. */
  drawDrawing?(target: string, fromDir: string, fragment?: string): DrawnDrawing | undefined
  /** The vault file of a drawing a note links to, which then gets a page of its own. */
  drawingPage?(target: string, fromDir: string): string | undefined
  /** A Marp deck: comments are directives, and images stay markdown so `![bg](…)` keeps working. */
  slides?: boolean
  /** The text of a vault file, for the transcript of a media file. */
  readText?(rel: string): string | undefined
  /** The words a link to a private note leaves ("" for none); undefined when the target is not one. */
  privateLink?(target: string, fromDir: string, alias: string | undefined): string | undefined
}

const IMAGE = /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i
const AUDIO = /\.(mp3|wav|ogg|m4a|flac|webm)$/i
const VIDEO = /\.(mp4|webm|mov|mkv|ogv)$/i
const PDF = /\.pdf$/i
const EXCALIDRAW = /\.excalidraw(\.md)?$/i
/** Obsidian Canvas and Bases files, published as pages of their own. */
export const DOC = /\.(canvas|base)$/i

/** Obsidian's highlight colours, chosen by an emoji right after the opening `==`. */
const MARK_COLORS: Record<string, string> = { "🔴": "red", "🟠": "orange", "🟡": "yellow", "🟢": "green", "🔵": "blue", "🟣": "purple" }
const MARK_COLOR = new RegExp(`^(${Object.keys(MARK_COLORS).join("|")})\\uFE0F?\\s*`, "u")

/** The text of a highlight without its colour emoji, and the colour it names (none for the theme's own). */
export function highlightOf(inner: string): { color?: string; text: string } {
  const m = inner.match(MARK_COLOR)
  return m ? { color: MARK_COLORS[m[1]], text: inner.slice(m[0].length) } : { text: inner }
}

/** Slug of a canvas, base or drawing page: its path with its extension, a drawing's `.md` dropped. */
export function docSlug(rel: string): string {
  return sluggify(rel.replace(/\.excalidraw\.md$/i, ".excalidraw"))
}

/** URL of the page of a published canvas, base or drawing, which keeps its extension. */
export function docUrl(rel: string, lang: Lang): string {
  return slugToUrl(langPrefix(lang) + docSlug(rel))
}

/** Placeholder for a note URL; replaced once every slug of the language is known. */
export const urlPlaceholder = (key: string) => `\u0001URL:${key}\u0001`

export const escapeAttr = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

export function anchorOf(fragment: string): string {
  if (!fragment) return ""
  if (fragment.startsWith("^")) return "#" + fragment
  return "#" + new GithubSlugger().slug(fragment.split("#").pop()!.trim())
}

function assetUrl(rel: string): string {
  return "/assets/" + rel.split("/").map(encodeURIComponent).join("/")
}

/** The words of a link in plain text: its alias or target, unless it points at a private note. */
type LinkWords = (target: string, alias: string | undefined) => string

/** Plain-text rendering of a markdown line, used as backlink context. */
function plainLine(line: string, words: LinkWords = (t, a) => a ?? t): string {
  return line
    .replace(/!?\[\[([^\]|]+?)(?:\\?\|([^\]]+))?\]\]/g, (_, t: string, a?: string) => words(t.split("#")[0], a))
    .replace(/\[([^\]]*)\]\(([^)]*)\)/g, (_, text: string, href: string) => (/\.md(#|$)/i.test(href) ? words(href.replace(/#.*$/, ""), text) : text))
    .replace(/<[^>]+>/g, "")
    .replace(/^\s*(?:[-*+]|\d+\.|>|#+|\|)\s*/g, "")
    .replace(/\[!\w+\][+-]?/g, "")
    .replace(/[*_=`|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220)
}

/** An HTML comment, including the short `<!-->` and `<!--->` that CommonMark counts as whole comments. */
const COMMENT = /<!--(?:-?>|[\s\S]*?-->)/g

/**
 * Inline math as Obsidian reads it: no space just inside the dollars and no
 * digit right after the closing one, so "$5 and $10" stays text. `$$` is left
 * to the markdown parser.
 */
const INLINE_MATH = /(?<![\\$])\$(?=[^\s$])(?:\\.|[^$\\\n])*?[^\s\\$]\$(?![\d$])/g

/**
 * Code blocks the fence pattern cannot see, indented by four spaces, found by
 * the markdown parser itself: four spaces in a list item may be its next
 * paragraph instead, which must still be converted.
 */
function maskIndentedCode(md: string, mask: (s: string) => string): string {
  if (!/^(?: {4}|\t)/m.test(md)) return md
  const spans: [number, number][] = []
  visit(unified().use(remarkParse).use(remarkGfm).parse(md), "code", (node) => {
    const { start, end } = node.position ?? {}
    if (start?.offset != null && end?.offset != null) spans.push([start.offset, end.offset])
  })
  for (const [from, to] of spans.reverse()) md = md.slice(0, from) + mask(md.slice(from, to)) + md.slice(to)
  return md
}

/**
 * Obsidian's inline footnotes, ^[text], as GFM footnotes defined at the end of
 * the note; their text may hold brackets of its own, such as a link.
 */
function inlineFootnotes(md: string): string {
  const defs: string[] = []
  let out = ""
  let i = 0
  for (let at = md.indexOf("^[", i); at >= 0; at = md.indexOf("^[", i)) {
    let depth = 0
    let end = -1
    for (let j = at + 1; j < md.length && md[j] !== "\n"; j++) {
      if (md[j] === "\\") j++
      else if (md[j] === "[") depth++
      else if (md[j] === "]" && --depth === 0) {
        end = j
        break
      }
    }
    const text = end > 0 ? md.slice(at + 2, end).trim() : ""
    // Without its closing bracket on the same line, `^[` stays text.
    if (!text) {
      out += md.slice(i, at + 2)
      i = at + 2
      continue
    }
    defs.push(text)
    out += md.slice(i, at) + `[^datme-inline-${defs.length}]`
    i = end + 1
  }
  if (!defs.length) return md
  return out + md.slice(i) + "\n\n" + defs.map((d, n) => `[^datme-inline-${n + 1}]: ${d}`).join("\n") + "\n"
}

/**
 * Convert Obsidian-only syntax into CommonMark + inline HTML, so the rest of
 * the pipeline only has to deal with standard markdown. Code is masked first.
 */
export function preprocess(
  src: string,
  ctx: Ctx,
): { md: string; links: LinkRef[]; assets: string[]; docs: string[]; problems: LinkProblem[] } {
  const masks: string[] = []
  const mask = (s: string) => `\u0000${masks.push(s) - 1}\u0000`

  // ```tabs blocks hold markdown, not code: they become tabs whose content is converted like the rest.
  const maskFences = (text: string): string =>
    text.replace(/^(\s*)(`{3,}|~{3,})([^\n]*)\n([\s\S]*?)\n\s*\2[^\S\n]*$/gm, (m, _indent, _fence, info: string, body: string, offset: number) =>
      !ctx.slides && /^\s*tabs\s*$/i.test(info) ? maskFences(tabsHtml(body, `${ctx.dir}:${offset}`)) : mask(m),
    )
  let md = maskIndentedCode(maskFences(src), mask)
    .replace(/^\$\$[\s\S]*?^\$\$/gm, (m) => mask(m))
    .replace(CODE_SPAN, (m) => mask(m))
    .replace(INLINE_MATH, (m) => mask(m))
    .replace(/%%[\s\S]*?%%/g, "")
  // A deck keeps its comments (directives, speaker notes) and styles, untouched by tags and highlights.
  // Elsewhere a comment loses its words but stays, empty: like any comment it may end a list or start a block of HTML.
  md = ctx.slides
    ? md.replace(/<!--[\s\S]*?-->|<style\b[\s\S]*?<\/style>/gi, (m) => mask(m))
    : md.replace(COMMENT, "<!---->")

  // Multi-Column Markdown regions; their settings block is masked like any code by now.
  if (!ctx.slides) md = columnsHtml(md, (text) => masks[Number(text.match(/^\u0000(\d+)\u0000$/)?.[1] ?? NaN)])

  // \== and \[[ are written out as they are, so no highlight or link may start there.
  md = md.replace(/\\[=[]/g, (m) => mask(m))
  if (!ctx.slides) md = inlineFootnotes(md)

  const links: LinkRef[] = []
  const assets: string[] = []
  const docs: string[] = []
  const problems: LinkProblem[] = []
  const broken = (kind: LinkProblem["kind"], target: string, html: string, shown?: string) => {
    problems.push(shown === undefined ? { kind, target } : { kind, target, shown })
    return html
  }
  /** The words of a link to a private note, or undefined for any other target. */
  const privateWords = (target: string, alias: string | undefined): string | undefined => {
    let decoded = target
    try {
      decoded = decodeURI(target)
    } catch {
      // keep the raw target
    }
    return decoded.trim() ? ctx.privateLink?.(decoded.trim(), ctx.dir, alias) : undefined
  }
  const contextOf = (line: string) => plainLine(line, (t, a) => privateWords(t, a) ?? a ?? t)
  /** A link to a private note as plain words, or nothing when it shows none. */
  const privateSpan = (kind: LinkProblem["kind"], target: string, shown: string) =>
    broken(kind, target, shown ? `<span class="broken-link" title="Not published">${shown}</span>` : "", shown)
  /** The line around `offset` of the text being rewritten, its masked code put back. */
  const lineOf = (text: string, offset: number) => {
    const end = text.indexOf("\n", offset)
    return text.slice(text.lastIndexOf("\n", offset - 1) + 1, end < 0 ? undefined : end).replace(/\u0000(\d+)\u0000/g, (_m, i) => masks[Number(i)])
  }

  /**
   * A block an embed puts on the page, such as a PDF or a player with its
   * transcript, as a placeholder the renderer opens out of its paragraph: as
   * raw HTML at the start of a line it would swallow the lines after it.
   */
  const blockEmbed = (html: string) => mask(`<span class="block-embed" data-html="${escapeAttr(html).replace(/\n/g, "&#10;")}"></span>`)

  const internalLink = (src: LinkTarget, fragment: string, text: string) =>
    `<a href="${urlPlaceholder(src.key)}${escapeAttr(anchorOf(fragment))}" class="internal" data-key="${escapeAttr(src.key)}">${text}</a>`

  /**
   * An audio or video player, started at the fragment's time, with the
   * transcript of a .vtt or .srt file of the same name next to it.
   */
  const embedMedia = (rel: string, fragment: string, video: boolean): string => {
    const src = assetUrl(rel) + mediaFragment(fragment)
    const wanted = sidecars(rel, ctx.lang)
    // Only a file right next to the media: another file of that name elsewhere is not its transcript.
    const sidecar = ctx.readText
      ? wanted.map((c) => ctx.resolveAsset(c, "")).find((found, i) => found?.toLowerCase() === wanted[i].toLowerCase())
      : undefined
    const cues = sidecar ? parseCues(ctx.readText?.(sidecar) ?? "") : []
    const tag = video ? "video" : "audio"
    if (!cues.length) return `<${tag} src="${src}" controls></${tag}>`
    const s = t(ctx.lang)
    let track = ""
    if (video && /\.vtt$/i.test(sidecar!)) {
      assets.push(sidecar!)
      track = `<track kind="captions" src="${assetUrl(sidecar!)}" srclang="${escapeAttr(ctx.lang)}" label="${escapeAttr(s.captions)}">`
    }
    // SubRip is not a format players read: the browser builds captions from the transcript instead.
    const fromCues = video && !track ? " data-captions-from-cues" : ""
    return blockEmbed(
      `<figure class="media-transcript"><${tag} src="${src}" controls preload="metadata"${fromCues} data-captions-label="${escapeAttr(s.captions)}" data-captions-lang="${escapeAttr(ctx.lang)}">${track}</${tag}>` +
      transcriptHtml(cues, s.transcript) +
      `</figure>`
    )
  }

  const embedAsset = (rel: string, alias: string | undefined, fragment = ""): string => {
    assets.push(rel)
    const url = assetUrl(rel)
    if (IMAGE.test(rel) && ctx.slides) {
      // Marp reads sizes and backgrounds from the alt text: ![[a.png|300]] is ![w:300](a.png).
      const size = alias?.match(/^(\d+)(?:x(\d+))?$/)
      const alt = size ? `w:${size[1]}${size[2] ? ` h:${size[2]}` : ""}` : (alias ?? "")
      return `![${alt}](${url})`
    }
    if (IMAGE.test(rel)) {
      const size = alias?.match(/^(\d+)(?:x(\d+))?$/)
      const alt = size ? "" : (alias ?? "")
      const dims = size ? ` width="${size[1]}"${size[2] ? ` height="${size[2]}"` : ""}` : ""
      // In a span, so an image alone on its line does not start a block of raw HTML that swallows the next line.
      return `<span class="image-embed"><img src="${url}" alt="${escapeAttr(alt)}"${dims} loading="lazy"></span>`
    }
    if (AUDIO.test(rel) && !ctx.slides) return embedMedia(rel, fragment, false)
    if (VIDEO.test(rel) && !ctx.slides) return embedMedia(rel, fragment, true)
    if (AUDIO.test(rel)) return `<audio src="${url}" controls></audio>`
    if (VIDEO.test(rel)) return `<video src="${url}" controls></video>`
    if (PDF.test(rel)) {
      // ![[a.pdf#page=3]] opens at that page, ![[a.pdf#height=400]] sets the frame's height.
      const page = fragment.match(/(?:^|&)page=(\d+)/)?.[1]
      const height = fragment.match(/(?:^|&)height=(\d+)/)?.[1]
      const style = height ? ` style="height:${height}px"` : ""
      return blockEmbed(`<iframe class="pdf" src="${url}${page ? `#page=${page}` : ""}"${style} loading="lazy"></iframe>`)
    }
    return `<a href="${url}" class="attachment">${escapeAttr(alias ?? rel.split("/").pop()!)}</a>`
  }

  // Excalidraw drawings: the SVG/PNG the Obsidian plugin exports next to them, or else drawn by datme.
  const embedDrawing = (file: string, alias: string | undefined, fragment = "", line = ""): string => {
    const base = file.replace(/\.md$/i, "")
    const find = (suffix: string) => ctx.resolveAsset(base + suffix, ctx.dir)
    const light = find(".light.svg") ?? find(".svg") ?? find(".light.png") ?? find(".png")
    const dark = find(".dark.svg") ?? find(".dark.png")
    const name = escapeAttr(base.split("/").pop()!.replace(EXCALIDRAW, ""))
    const width = alias?.match(/^\d+$/) ? ` style="max-width:${alias}px"` : ""
    // A part of the drawing (#^frame=…) can only be drawn, never taken from an export.
    if ((!light && !dark) || fragment) {
      const drawn = ctx.drawDrawing?.(file, ctx.dir, fragment)
      if (drawn) {
        assets.push(...drawn.assets)
        // What the drawing links to counts as linked from the note, for backlinks and the graph.
        for (const key of drawn.links) links.push({ key, context: contextOf(line) })
        // The SVG carries its own name for screen readers.
        // Masked like code: later passes must not read `url(#clip)` as a #tag or `==` as a highlight.
        return mask(`<span class="drawing generated"${width}>${markdownSafe(drawn.svg.replace(/role="(img|group)"/, `role="$1" aria-label="${name}"`))}</span>`)
      }
      problems.push({ kind: "drawing", target: file })
      return `<span class="drawing-missing">✏️ ${name}: the drawing cannot be found or read</span>`
    }
    const img = (rel: string, cls: string) => {
      assets.push(rel)
      return `<img class="${cls}" src="${assetUrl(rel)}" alt="${name}" loading="lazy">`
    }
    const pics = light && dark ? img(light, "drawing-light") + img(dark, "drawing-dark") : img((light ?? dark)!, "")
    return `<span class="drawing"${width}>${pics}</span>`
  }

  // Wikilinks and embeds: [[target#fragment|alias]] and ![[...]]; tables escape the pipe as \|.
  md = md.replace(/(!?)\[\[([^[\]\n]+?)\]\]/g, (_m, bang: string, inner: string, offset: number, whole: string) => {
    const raw = inner.replace(/\\\|/g, "|")
    const pipe = raw.indexOf("|")
    const target = pipe >= 0 ? raw.slice(0, pipe) : raw
    // An empty alias, [[note|]], shows the target as if there were none.
    const alias = (pipe >= 0 && raw.slice(pipe + 1).trim()) || undefined
    const hash = target.indexOf("#")
    const file = (hash >= 0 ? target.slice(0, hash) : target).trim()
    const fragment = hash >= 0 ? target.slice(hash + 1).trim() : ""

    if (bang && EXCALIDRAW.test(file)) return embedDrawing(file, alias, fragment, lineOf(whole, offset))
    // A link (not an embed) to a drawing opens it on a page of its own, as the plugin opens it in a tab.
    if (!bang && EXCALIDRAW.test(file) && ctx.drawingPage) {
      const rel = ctx.drawingPage(file, ctx.dir)
      const name = escapeAttr(alias ?? file.split("/").pop()!.replace(EXCALIDRAW, ""))
      if (!rel) return broken("link", file, `<span class="broken-link">${name}</span>`)
      docs.push(rel)
      return `<a href="${docUrl(rel, ctx.lang)}" class="internal doc">${name}</a>`
    }
    if (DOC.test(file)) {
      const rel = ctx.resolveAsset(file, ctx.dir)
      const name = escapeAttr(alias ?? file.split("/").pop()!.replace(DOC, ""))
      if (!rel) return broken(bang ? "embed" : "link", file, `<span class="broken-link">${name}</span>`)
      docs.push(rel)
      const url = docUrl(rel, ctx.lang)
      if (bang && /\.base$/i.test(rel)) {
        return `<span class="base-ph" data-rel="${escapeAttr(rel)}" data-view="${escapeAttr(fragment)}"></span>`
      }
      if (bang) return `<a class="doc-card internal" href="${url}">🗂️ ${name}</a>`
      return `<a href="${url}" class="internal doc">${name}</a>`
    }
    if (bang) {
      const note = file ? ctx.resolveNote(file, ctx.dir) : undefined
      if (note && !IMAGE.test(file)) {
        links.push({ key: note.key, context: contextOf(lineOf(whole, offset)) })
        return `<span class="transclude-ph" data-key="${escapeAttr(note.key)}" data-fragment="${escapeAttr(fragment)}"></span>`
      }
      const asset = file ? ctx.resolveAsset(file, ctx.dir) : undefined
      if (asset) return embedAsset(asset, alias, fragment)
      const shown = privateWords(file, alias)
      if (shown !== undefined) return privateSpan("embed", file, escapeAttr(shown))
      return broken("embed", file, `<span class="broken-link">${escapeAttr(alias ?? file)}</span>`)
    }

    // As Obsidian shows them: [[a/Note.md#Part]] reads "Note > Part".
    const name = file.split("/").pop()!.replace(/\.md$/i, "")
    const text = alias ?? [...(name ? [name] : []), ...(fragment ? fragment.split("#").map((f) => f.trim()) : [])].join(" > ")
    if (!file) return `<a href="${escapeAttr(anchorOf(fragment))}" class="internal anchor">${text}</a>`
    const note = ctx.resolveNote(file, ctx.dir)
    if (!note) {
      const asset = ctx.resolveAsset(file, ctx.dir)
      if (asset) {
        assets.push(asset)
        return `<a href="${assetUrl(asset)}" class="attachment">${text}</a>`
      }
      const shown = privateWords(file, alias)
      if (shown !== undefined) return privateSpan("link", file, shown)
      return broken("link", file, `<span class="broken-link" title="Not published">${text}</span>`)
    }
    links.push({ key: note.key, context: contextOf(lineOf(whole, offset)) })
    return internalLink(note, fragment, text)
  })

  // ![](https://…) of a video page, a tweet or a media file embeds it, as in Obsidian.
  md = md.replace(/!\[([^\]\n]*)\]\((https?:\/\/[^)\s]+)\)/g, (m, alt: string, href: string) => embedExternal(alt, href) ?? m)

  // Standard markdown links pointing at vault notes or assets.
  // A target in angle brackets, [a](<My note.md>), may hold spaces.
  md = md.replace(
    /(!?)\[([^\]\n]*)\]\((?:<(?!https?:|mailto:|#|\/)([^<>#\n]+?)(#[^<>\n]*)?>|(?!https?:|mailto:|#|\/|<)([^)\s]+?)(#[^)\s]*)?)\)/g,
    (m, bang: string, text: string, angled: string | undefined, angledFrag: string | undefined, bare: string | undefined, bareFrag: string | undefined, offset: number, whole: string) => {
      const target = angled ?? bare!
      let frag = angledFrag ?? bareFrag
      let decoded = target
      try {
        decoded = decodeURI(target)
        if (frag) frag = decodeURIComponent(frag)
      } catch {
        // keep the raw target
      }
      if (!bang && /\.md$/i.test(decoded)) {
        const note = ctx.resolveNote(decoded, ctx.dir)
        if (!note) {
          const shown = privateWords(decoded, text)
          if (shown !== undefined) return privateSpan("link", decoded, shown)
          return broken("link", decoded, `<span class="broken-link">${text}</span>`)
        }
        links.push({ key: note.key, context: contextOf(lineOf(whole, offset)) })
        return internalLink(note, (frag ?? "").slice(1), text)
      }
      // Canvases, bases and drawings open on their own page, as their wikilinks do.
      if (!bang && (DOC.test(decoded) || EXCALIDRAW.test(decoded))) {
        const rel = EXCALIDRAW.test(decoded) ? ctx.drawingPage?.(decoded, ctx.dir) : ctx.resolveAsset(decoded, ctx.dir)
        if (rel) {
          docs.push(rel)
          return `<a href="${docUrl(rel, ctx.lang)}" class="internal doc">${text}</a>`
        }
      }
      const asset = ctx.resolveAsset(decoded, ctx.dir)
      // Only targets that look like files: a bare word may be a route of the site itself.
      if (!asset) return /\.\w+$/.test(decoded) ? broken(bang ? "embed" : "link", decoded, m) : m
      if (bang) return embedAsset(asset, text || undefined, (frag ?? "").slice(1))
      assets.push(asset)
      return `<a href="${assetUrl(asset)}" class="attachment">${text}</a>`
    },
  )

  // Raw <img src="relative"> written in notes.
  md = md.replace(/(<img\b[^>]*?\bsrc=)(["'])(?!https?:|\/|data:)([^"']+)\2/g, (m, pre, q, target) => {
    const asset = ctx.resolveAsset(target, ctx.dir)
    if (!asset) return m
    assets.push(asset)
    return `${pre}${q}${assetUrl(asset)}${q}`
  })

  md = md
    // A single `=` may sit inside a highlight: ==a=b==.
    .replace(/==((?:[^=\n]|=(?!=))+)==/g, (_m, inner: string) => {
      const { color, text } = highlightOf(inner)
      return color ? `<mark class="mark-${color}">${text}</mark>` : `<mark>${text}</mark>`
    })
    // `(#tag)` is a tag, but `[link](#heading)` links to a heading.
    .replace(/(^|\s|(?<!\])\()#([\p{L}_][\p{L}\p{N}_/-]*)/gu, (_m, pre: string, tag: string) => {
      const url = slugToUrl(langPrefix(ctx.lang) + "tags/" + slugTag(tag))
      return `${pre}<a href="${url}" class="tag-link">#${tag}</a>`
    })
    .replace(/[^\S\n]\^([A-Za-z0-9-]+)$/gm, ' <span class="block-id" id="^$1"></span>')
    // On a line of its own, after a list, quote or table, the id names that block; the renderer moves it there.
    .replace(/^\^([A-Za-z0-9-]+)[^\S\n]*$/gm, '<span class="block-id" id="^$1"></span>')

  // Math is masked by now: a `$` left in the text is a dollar, as Obsidian reads "$5 and $10", not the start of math.
  // As a character reference it reads as a dollar in raw HTML too; tags, scripts, styles and URLs keep theirs.
  if (!ctx.slides) {
    md = md.replace(/(<(script|style)\b[\s\S]*?<\/\2>|<[^>\n]*>|https?:\/\/\S+)|(?<![\\$])\$(?!\$)/gi, (_m, kept: string | undefined) => kept ?? "&#36;")
  }

  md = md.replace(/\u0000(\d+)\u0000/g, (_m, i) => masks[Number(i)])
  return { md, links, assets, docs, problems }
}
