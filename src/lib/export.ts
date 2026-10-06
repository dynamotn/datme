import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { fromHtml } from "hast-util-from-html"
import { visit } from "unist-util-visit"
import type { Element, Root } from "hast"
import { site, type Lang } from "../site.config"
import { getVault, type FolderNode, type Note } from "./vault"
import { renderNote } from "./markdown"
import { toXhtml } from "./xhtml"
import { zip } from "./zip"

/**
 * A folder of the garden as a book: an EPUB, or one HTML page to print to
 * PDF. Chapters follow the folder tree; protected notes are left out.
 */
export type Format = "epub" | "html"

interface Chapter {
  note: Note
  title: string
  /** Rendered HTML, links and images not yet rewritten. */
  html: string
  file: string
}

const MEDIA_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
}

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

/** The notes of a folder in reading order: its introduction, its notes, then each subfolder. */
export function bookNotes(folder: FolderNode): Note[] {
  const out: Note[] = []
  const walk = (f: FolderNode) => {
    if (f.folderNote) out.push(f.folderNote)
    out.push(...f.notes)
    f.folders.forEach(walk)
  }
  walk(folder)
  return out.filter((n) => !n.protected)
}

/** A short, readable stylesheet: the book does not need the garden's chrome. */
function stylesheet(): string {
  let katex = ""
  try {
    katex = fs.readFileSync(createRequire(import.meta.url).resolve("katex/dist/katex.min.css"), "utf8")
  } catch {
    // math still reads, only less nicely
  }
  return `${katex}
body { font-family: Georgia, "Iowan Old Style", serif; line-height: 1.6; color: #1d1b17; margin: 0 auto; max-width: 42rem; padding: 0 1rem; }
h1, h2, h3 { line-height: 1.25; }
h1.chapter-title { page-break-before: always; break-before: page; margin-top: 2em; }
section.chapter:first-of-type h1.chapter-title { page-break-before: auto; break-before: auto; }
img, video { max-width: 100%; height: auto; }
pre { white-space: pre-wrap; background: #f4f4f2; padding: 0.8em; border-radius: 4px; font-size: 0.85em; }
code { font-family: "JetBrains Mono", ui-monospace, monospace; }
.shiki span { color: var(--shiki-light); }
blockquote, .callout { margin: 1em 0; padding: 0.4em 1em; border-left: 3px solid #999; background: #f7f7f4; }
.callout-title { font-weight: bold; }
table { border-collapse: collapse; }
th, td { border: 1px solid #ccc; padding: 0.25em 0.5em; }
.heading-anchor, .sidenote, .copy-btn, .media-embed iframe { display: none; }
.media-link { display: inline; }
mark { background: #fff1a8; }
nav.toc ol { list-style: none; padding-left: 0; }
`
}

interface Book {
  title: string
  lang: Lang
  chapters: Chapter[]
  /** Vault-relative assets to ship, by the URL the chapters use. */
  assets: Map<string, string>
}

async function collect(dir: string, lang: Lang): Promise<Book> {
  const vault = getVault()
  const folder = vault.folders[lang].get(dir.replace(/^\.?\/*|\/+$/g, ""))
  if (!folder) throw new Error(`no published folder "${dir}" in ${site.vault}`)
  const notes = bookNotes(folder)
  if (!notes.length) throw new Error(`folder "${dir}" has no note that can be exported`)
  const chapters: Chapter[] = []
  const assets = new Map<string, string>()
  for (const [i, note] of notes.entries()) {
    const r = await renderNote(note)
    chapters.push({ note, title: r.h1 ?? note.title, html: r.html, file: `chapter-${i + 1}.xhtml` })
    for (const a of note.assets) assets.set("/assets/" + a.split("/").map(encodeURIComponent).join("/"), a)
  }
  const title = folder.dir ? (folder.folderNote?.title ?? folder.name) : site.title[lang]
  return { title, lang, chapters, assets }
}

/**
 * Point links between chapters at each other, other site links at the
 * published site, and images at the copies shipped with the book.
 */
function rewrite(tree: Root, book: Book, target: (c: Chapter, hash: string) => string, image: (rel: string) => string | undefined) {
  const byUrl = new Map(book.chapters.map((c) => [c.note.url, c]))
  visit(tree, "element", (el: Element) => {
    if (el.tagName === "a" && typeof el.properties.href === "string") {
      const href = el.properties.href
      if (!href.startsWith("/")) return
      const [p, hash = ""] = href.split("#")
      const chapter = byUrl.get(decodeURI(p).replace(/\/$/, ""))
      if (chapter) el.properties.href = target(chapter, hash)
      else if (site.url) el.properties.href = site.url + href
    }
    if (el.tagName === "img" && typeof el.properties.src === "string") {
      delete el.properties.srcSet
      delete el.properties.sizes
      delete el.properties.loading
      const rel = book.assets.get(el.properties.src)
      const src = rel && image(rel)
      if (src) el.properties.src = src
      else if (el.properties.src.startsWith("/") && site.url) el.properties.src = site.url + el.properties.src
    }
  })
}

const anchor = (c: Chapter) => c.file.replace(/\.xhtml$/, "")

/** One self-contained page: images inlined, so it prints or archives on its own. */
export async function exportHtml(dir: string, lang: Lang = site.defaultLang): Promise<string> {
  const book = await collect(dir, lang)
  const body = book.chapters
    .map((c) => {
      const tree = fromHtml(c.html, { fragment: true })
      rewrite(
        tree,
        book,
        (to, hash) => `#${hash || anchor(to)}`,
        (rel) => {
          const file = path.join(site.vault, rel)
          const type = MEDIA_TYPES[path.extname(rel).toLowerCase()]
          return type && fs.existsSync(file) ? `data:${type};base64,${fs.readFileSync(file).toString("base64")}` : undefined
        },
      )
      return `<section class="chapter" id="${anchor(c)}"><h1 class="chapter-title">${escape(c.title)}</h1>${toXhtml(tree)}</section>`
    })
    .join("\n")
  const toc = book.chapters.map((c) => `<li><a href="#${anchor(c)}">${escape(c.title)}</a></li>`).join("")
  return `<!doctype html>
<html lang="${escape(lang)}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(book.title)}</title>
<style>${stylesheet()}</style></head>
<body>
<h1>${escape(book.title)}</h1>
${site.author ? `<p class="author">${escape(site.author)}</p>` : ""}
<nav class="toc"><ol>${toc}</ol></nav>
${body}
</body>
</html>
`
}

const xhtmlPage = (title: string, lang: Lang, body: string, extra = "") => `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${escape(lang)}" xml:lang="${escape(lang)}">
<head><meta charset="utf-8"/><title>${escape(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/>${extra}</head>
<body>${body}</body>
</html>
`

/** An EPUB 3 book; the same folder always gives the same identifier. */
export async function exportEpub(dir: string, lang: Lang = site.defaultLang): Promise<Uint8Array> {
  const book = await collect(dir, lang)
  const images = new Map<string, string>()
  const chapters = book.chapters.map((c) => {
    const tree = fromHtml(c.html, { fragment: true })
    rewrite(
      tree,
      book,
      (to, hash) => `${to.file}${hash ? `#${hash}` : ""}`,
      (rel) => {
        if (!MEDIA_TYPES[path.extname(rel).toLowerCase()] || !fs.existsSync(path.join(site.vault, rel))) return undefined
        const name = `images/${images.size + 1}${path.extname(rel).toLowerCase()}`
        if (!images.has(rel)) images.set(rel, name)
        return images.get(rel)
      },
    )
    return { c, xhtml: xhtmlPage(c.title, lang, `<section class="chapter"><h1 class="chapter-title">${escape(c.title)}</h1>${toXhtml(tree)}</section>`) }
  })
  const id = `urn:uuid:${uuidFrom(`${site.url ?? site.vault}:${lang}:${dir}`)}`
  const modified = new Date().toISOString().replace(/\.\d+Z$/, "Z")
  const manifest = [
    `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
    `<item id="css" href="style.css" media-type="text/css"/>`,
    ...chapters.map(({ c }, i) => `<item id="c${i + 1}" href="${c.file}" media-type="application/xhtml+xml"/>`),
    ...[...images].map(([rel, name], i) => `<item id="img${i + 1}" href="${name}" media-type="${MEDIA_TYPES[path.extname(rel).toLowerCase()]}"/>`),
  ].join("\n    ")
  const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="${escape(lang)}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">${id}</dc:identifier>
    <dc:title>${escape(book.title)}</dc:title>
    <dc:language>${escape(lang)}</dc:language>
    ${site.author ? `<dc:creator>${escape(site.author)}</dc:creator>` : ""}
    <meta property="dcterms:modified">${modified}</meta>
  </metadata>
  <manifest>
    ${manifest}
  </manifest>
  <spine>
    ${chapters.map((_, i) => `<itemref idref="c${i + 1}"/>`).join("\n    ")}
  </spine>
</package>
`
  const nav = xhtmlPage(
    book.title,
    lang,
    `<nav epub:type="toc" id="toc"><h1>${escape(book.title)}</h1><ol>${chapters.map(({ c }) => `<li><a href="${c.file}">${escape(c.title)}</a></li>`).join("")}</ol></nav>`,
  )
  return zip([
    { name: "mimetype", data: "application/epub+zip", store: true },
    {
      name: "META-INF/container.xml",
      data: `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>
`,
    },
    { name: "OEBPS/content.opf", data: opf },
    { name: "OEBPS/nav.xhtml", data: nav },
    { name: "OEBPS/style.css", data: stylesheet() },
    ...chapters.map(({ c, xhtml }) => ({ name: `OEBPS/${c.file}`, data: xhtml })),
    ...[...images].map(([rel, name]) => ({ name: `OEBPS/${name}`, data: fs.readFileSync(path.join(site.vault, rel)) })),
  ])
}

/** A stable UUID (version 5 layout) from a string, so rebuilding a book keeps its identity. */
function uuidFrom(s: string): string {
  const h = crypto.createHash("sha1").update(s).digest()
  h[6] = (h[6] & 0x0f) | 0x50
  h[8] = (h[8] & 0x3f) | 0x80
  const x = h.subarray(0, 16).toString("hex")
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`
}
