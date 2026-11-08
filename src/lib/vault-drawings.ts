import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import katex from "katex"
import { site } from "../site.config"
import { parseCanvas } from "./canvas"
import { parseDrawing, parseSelection, renderParts, renderScene, type FileView, type Scene } from "./excalidraw"
import { assetUrl, DOC, preprocess, urlPlaceholder, type DrawnDrawing } from "./obsidian"
import { filterLanguage } from "./vault-languages"
import type { Links, Report } from "./vault-links"
import type { Doc } from "./vault-types"

export type DrawDrawing = (target: string, fromDir: string, fragment?: string) => DrawnDrawing | undefined

/**
 * Draws the Excalidraw drawings of the vault, each (or the part a fragment
 * names) once per build, whatever embeds it. Problems a drawing read again
 * inside another has are reported once, through `reportOnce`.
 */
export function drawingRenderer({ resolveNote, resolveAsset, resolveDrawing, linkProblem }: Links, report: Report, reportOnce: Report): DrawDrawing {
  const scenes = new Map<string, Scene>()
  function sceneOf(rel: string): Scene {
    let scene = scenes.get(rel)
    if (!scene) {
      scene = parseDrawing(fs.readFileSync(path.join(site.vault, rel), "utf8"))
      scenes.set(rel, scene)
    }
    return scene
  }

  /** How deep drawings may embed drawings, so a drawing embedding itself still ends. */
  const MAX_NESTING = 3

  /**
   * Resolvers of one drawing: its links lead to published notes (as URL
   * placeholders, filled per language) and its embedded files show images,
   * other drawings, notes or formulas. What it uses is gathered as it draws.
   */
  function drawingContext(rel: string, scene: Scene, used: { assets: string[]; links: string[] }, depth: number) {
    const dir = path.posix.dirname(rel) === "." ? "" : path.posix.dirname(rel)
    const resolveLink = (target: string): string | undefined => {
      if (/^https?:\/\//.test(target)) return target
      const note = resolveNote(target.replace(/#.*$/, ""), dir)
      if (!note) {
        linkProblem(rel, { kind: "link", target })
        return undefined
      }
      used.links.push(note.key)
      return urlPlaceholder(note.key)
    }
    const resolveFile = (id: string): FileView | undefined => {
      const file = scene.files[id]
      // Only pictures: a data URL of anything else is not followed.
      if (file?.dataURL?.startsWith("data:image/")) return { kind: "image", href: file.dataURL }
      const embed = file?.embed
      if (!embed) return undefined
      if (embed.kind === "url") return { kind: "image", href: embed.url }
      if (embed.kind === "latex") {
        return { kind: "math", mathml: katex.renderToString(embed.tex, { output: "mathml", displayMode: true, throwOnError: false }) }
      }
      const nested = /\.excalidraw(\.md)?$/i.test(embed.target) || !/\.\w+$/.test(embed.target) ? resolveDrawing(embed.target, dir) : undefined
      if (nested && depth < MAX_NESTING) {
        try {
          const inner = sceneOf(nested)
          const parts = renderParts(inner, { ...drawingContext(nested, inner, used, depth + 1), idPrefix: `ex${depth + 1}-${hash(nested)}` })
          return { kind: "drawing", viewBox: parts.viewBox, body: parts.body }
        } catch (e) {
          reportOnce("warning", rel, `drawing ${nested} inside ${rel} cannot be drawn: ${(e as Error).message}`)
          return undefined
        }
      }
      const asset = resolveAsset(embed.target, dir)
      if (asset && /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(asset)) {
        used.assets.push(asset)
        return { kind: "image", href: assetUrl(asset) }
      }
      const note = resolveNote(embed.target, dir)
      if (note) {
        used.links.push(note.key)
        const title = typeof note.fm.title === "string" ? note.fm.title : note.stem
        return { kind: "note", title, href: urlPlaceholder(note.key) }
      }
      // A private note embedded in a drawing shows as such, without its name.
      return /\.\w+$/.test(embed.target) ? undefined : { kind: "note", title: "🔒" }
    }
    return { resolveLink, resolveFile }
  }

  const hash = (s: string) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 8)

  /** Draw a drawing (or the part a fragment names) once per build, whatever embeds it. */
  const drawn = new Map<string, DrawnDrawing | undefined>()
  function drawDrawing(target: string, fromDir: string, fragment = ""): DrawnDrawing | undefined {
    const rel = resolveDrawing(target, fromDir)
    if (!rel) return undefined
    const id = `${rel}#${fragment}`
    if (drawn.has(id)) return drawn.get(id)
    let result: DrawnDrawing | undefined
    try {
      const scene = sceneOf(rel)
      const used = { assets: [] as string[], links: [] as string[] }
      const svg = renderScene(scene, {
        ...drawingContext(rel, scene, used, 0),
        select: parseSelection(fragment),
        idPrefix: `ex-${hash(id)}`,
      })
      result = { svg, assets: [...new Set(used.assets)], links: [...new Set(used.links)], rel }
    } catch (e) {
      report("warning", rel, `drawing${fragment ? ` #${fragment}` : ""} cannot be drawn: ${(e as Error).message}`)
    }
    drawn.set(id, result)
    return result
  }

  return drawDrawing
}

/** What the pages of canvases, bases and drawings are made with. */
export interface DocInput {
  links: Links
  drawDrawing: DrawDrawing
  /** A vault file as text, such as the transcript of a video. */
  readText: (rel: string) => string | undefined
  /** The vault's published assets, which the docs add theirs to. */
  assets: Set<string>
  report: Report
}

/** Canvases and bases referenced by published notes become pages; canvas text is markdown too. */
export function buildDocs(docRefs: Set<string>, { links, drawDrawing, readText, assets, report }: DocInput): Map<string, Doc> {
  const { resolveNote, resolveAsset, resolveDrawing, privateLink, gardenLink } = links
  const docs = new Map<string, Doc>()
  for (const rel of docRefs) {
    const src = fs.readFileSync(path.join(site.vault, rel), "utf8")
    const dir = path.posix.dirname(rel) === "." ? "" : path.posix.dirname(rel)
    const kind = /\.excalidraw(\.md)?$/i.test(rel) ? "drawing" : rel.toLowerCase().endsWith(".canvas") ? "canvas" : "base"
    const name = path.posix
      .basename(rel)
      .replace(DOC, "")
      .replace(/\.excalidraw(\.md)?$/i, "")
    const doc: Doc = { rel, kind, name, dir, src, texts: {} }
    if (kind === "drawing") {
      // The whole drawing; its links are URL placeholders, filled per language below.
      const drawing = drawDrawing(rel, "")
      if (!drawing) continue
      drawing.assets.forEach((a) => assets.add(a))
      for (const lang of site.langs) doc.texts[lang] = { svg: drawing.svg }
    }
    if (kind === "canvas") {
      try {
        doc.canvas = parseCanvas(src)
      } catch {
        console.warn(`[datme] skipped ${rel}: not a valid canvas`)
        report("error", rel, "not a valid canvas, so it is not published")
        continue
      }
      for (const lang of site.langs) {
        doc.texts[lang] = {}
        for (const node of doc.canvas.nodes) {
          if (node.type === "text" && node.text) {
            const pre = preprocess(filterLanguage(node.text, lang), {
              lang,
              dir,
              resolveNote,
              resolveAsset,
              drawDrawing,
              drawingPage: resolveDrawing,
              readText,
              privateLink: (target, fromDir, alias) => privateLink(target, fromDir, alias, lang),
              gardenLink: (name, target) => gardenLink(name, target, lang),
            })
            pre.assets.forEach((a) => assets.add(a))
            doc.texts[lang][node.id] = pre.md
          } else if (node.type === "file" && node.file && !resolveNote(node.file, "")) {
            const asset = resolveAsset(node.file, "")
            if (asset && !DOC.test(asset)) assets.add(asset)
          }
        }
      }
    }
    docs.set(rel, doc)
  }
  return docs
}
