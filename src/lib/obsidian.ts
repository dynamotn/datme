import GithubSlugger from "github-slugger"
import type { Lang } from "../site.config"
import { langPrefix } from "./i18n"
import { sluggify, slugTag, slugToUrl } from "./slug"
import { embedExternal } from "./media"
import { tabsHtml, columnsHtml } from "./layouts"

export interface LinkRef {
  key: string
  context: string
}

/** A link or embed the converter could not resolve, classified later by the vault. */
export interface LinkProblem {
  kind: "link" | "embed" | "drawing"
  target: string
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

/** Plain-text rendering of a markdown line, used as backlink context. */
function plainLine(line: string): string {
  return line
    .replace(/!?\[\[([^\]|]+?)(?:\\?\|([^\]]+))?\]\]/g, (_, t, a) => a ?? t.split("#")[0])
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/^\s*(?:[-*+]|\d+\.|>|#+|\|)\s*/g, "")
    .replace(/\[!\w+\][+-]?/g, "")
    .replace(/[*_=`|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220)
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
  let md = maskFences(src)
    .replace(/^\$\$[\s\S]*?^\$\$/gm, (m) => mask(m))
    .replace(/(`+)(?!`)[\s\S]*?[^`]\1(?!`)/g, (m) => mask(m))
    .replace(/%%[\s\S]*?%%/g, "")
  // A deck keeps its comments (directives, speaker notes) and styles, untouched by tags and highlights.
  md = ctx.slides
    ? md.replace(/<!--[\s\S]*?-->|<style\b[\s\S]*?<\/style>/gi, (m) => mask(m))
    : md.replace(/<!--[\s\S]*?-->/g, "")

  // Multi-Column Markdown regions; their settings block is masked like any code by now.
  if (!ctx.slides) md = columnsHtml(md, (text) => masks[Number(text.match(/^\u0000(\d+)\u0000$/)?.[1] ?? NaN)])

  const links: LinkRef[] = []
  const assets: string[] = []
  const docs: string[] = []
  const problems: LinkProblem[] = []
  const broken = (kind: LinkProblem["kind"], target: string, html: string) => {
    problems.push({ kind, target })
    return html
  }
  const lines = md.split("\n")
  const lineOf = (offset: number) => {
    let n = 0
    for (let i = 0; i < lines.length; i++) {
      n += lines[i].length + 1
      if (offset < n) return lines[i]
    }
    return ""
  }

  const internalLink = (src: LinkTarget, fragment: string, text: string) =>
    `<a href="${urlPlaceholder(src.key)}${escapeAttr(anchorOf(fragment))}" class="internal" data-key="${escapeAttr(src.key)}">${text}</a>`

  const embedAsset = (rel: string, alias: string | undefined): string => {
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
      return `<img src="${url}" alt="${escapeAttr(alt)}"${dims} loading="lazy">`
    }
    if (AUDIO.test(rel)) return `<audio src="${url}" controls></audio>`
    if (VIDEO.test(rel)) return `<video src="${url}" controls></video>`
    if (PDF.test(rel)) return `<iframe class="pdf" src="${url}" loading="lazy"></iframe>`
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
        for (const key of drawn.links) links.push({ key, context: plainLine(line) })
        // The SVG carries its own name for screen readers.
        // Masked like code: later passes must not read `url(#clip)` as a #tag or `==` as a highlight.
        return mask(`<span class="drawing generated"${width}>${drawn.svg.replace(/role="(img|group)"/, `role="$1" aria-label="${name}"`)}</span>`)
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
  md = md.replace(/(!?)\[\[([^[\]\n]+?)\]\]/g, (_m, bang: string, inner: string, offset: number) => {
    const raw = inner.replace(/\\\|/g, "|")
    const pipe = raw.indexOf("|")
    const target = pipe >= 0 ? raw.slice(0, pipe) : raw
    const alias = pipe >= 0 ? raw.slice(pipe + 1).trim() : undefined
    const hash = target.indexOf("#")
    const file = (hash >= 0 ? target.slice(0, hash) : target).trim()
    const fragment = hash >= 0 ? target.slice(hash + 1).trim() : ""

    if (bang && EXCALIDRAW.test(file)) return embedDrawing(file, alias, fragment, lineOf(offset))
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
        links.push({ key: note.key, context: plainLine(lineOf(offset)) })
        return `<span class="transclude-ph" data-key="${escapeAttr(note.key)}" data-fragment="${escapeAttr(fragment)}"></span>`
      }
      const asset = file ? ctx.resolveAsset(file, ctx.dir) : undefined
      if (asset) return embedAsset(asset, alias)
      return broken("embed", file, `<span class="broken-link">${escapeAttr(alias ?? file)}</span>`)
    }

    const text = alias ?? (fragment && !file ? fragment : file.split("/").pop()!)
    if (!file) return `<a href="${escapeAttr(anchorOf(fragment))}" class="internal anchor">${text}</a>`
    const note = ctx.resolveNote(file, ctx.dir)
    if (!note) {
      const asset = ctx.resolveAsset(file, ctx.dir)
      if (asset) {
        assets.push(asset)
        return `<a href="${assetUrl(asset)}" class="attachment">${text}</a>`
      }
      return broken("link", file, `<span class="broken-link" title="Not published">${text}</span>`)
    }
    links.push({ key: note.key, context: plainLine(lineOf(offset)) })
    return internalLink(note, fragment, text)
  })

  // ![](https://…) of a video page, a tweet or a media file embeds it, as in Obsidian.
  md = md.replace(/!\[([^\]\n]*)\]\((https?:\/\/[^)\s]+)\)/g, (m, alt: string, href: string) => embedExternal(alt, href) ?? m)

  // Standard markdown links pointing at vault notes or assets.
  md = md.replace(
    /(!?)\[([^\]\n]*)\]\((?!https?:|mailto:|#|\/)([^)\s]+?)(#[^)\s]*)?\)/g,
    (m, bang: string, text: string, target: string, frag: string | undefined, offset: number) => {
      let decoded = target
      try {
        decoded = decodeURI(target)
      } catch {
        // keep the raw target
      }
      if (!bang && /\.md$/i.test(decoded)) {
        const note = ctx.resolveNote(decoded, ctx.dir)
        if (!note) return broken("link", decoded, `<span class="broken-link">${text}</span>`)
        links.push({ key: note.key, context: plainLine(lineOf(offset)) })
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
      if (bang) return embedAsset(asset, text || undefined)
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
    .replace(/==([^=\n]+)==/g, (_m, inner: string) => {
      const { color, text } = highlightOf(inner)
      return color ? `<mark class="mark-${color}">${text}</mark>` : `<mark>${text}</mark>`
    })
    .replace(/(^|[\s(])#([\p{L}_][\p{L}\p{N}_/-]*)/gu, (_m, pre: string, tag: string) => {
      const url = slugToUrl(langPrefix(ctx.lang) + "tags/" + slugTag(tag))
      return `${pre}<a href="${url}" class="tag-link">#${tag}</a>`
    })
    .replace(/[^\S\n]\^([A-Za-z0-9-]+)$/gm, ' <span class="block-id" id="^$1"></span>')

  md = md.replace(/\u0000(\d+)\u0000/g, (_m, i) => masks[Number(i)])
  return { md, links, assets, docs, problems }
}
