import { AsyncLocalStorage } from "node:async_hooks"
import { site, type StyleName } from "../site.config"
import { CHROMES, pickOption, type Chrome, type FrameRule, type LookRule } from "./look"

/** Query keys of the style switcher of `datme dev`, named like the note properties they stand in for. */
export const PREVIEW_KEYS = { style: "style", chrome: "chrome" } as const

/** A style and a chrome asked for in the page's address, to try them without editing files. */
export interface Preview {
  style?: StyleName
  chrome?: Chrome
}

// Astro clears the query of prerendered pages, even under `datme dev`, so the dev server keeps each request's
// own address aside. On globalThis: the config and the pages load this module as two copies.
const g = globalThis as { __datmeRequestUrl?: AsyncLocalStorage<URL> }
const requestUrls = (g.__datmeRequestUrl ??= new AsyncLocalStorage<URL>())

/** Middleware of the dev server: the request's address, query included, stays readable while its page renders. */
export function keepRequestUrl(req: { url?: string }, _res: unknown, next: () => void): void {
  requestUrls.run(new URL(req.url ?? "/", "http://localhost"), next)
}

/** The address of the page being rendered, with the query the dev server kept for it. */
export function pageUrl(url: URL): URL {
  const kept = requestUrls.getStore()
  if (!kept) return url
  const full = new URL(url)
  full.search = kept.search
  return full
}

/** The preview in a page's address; always none outside `datme dev`, so a build never depends on its URL. */
export function previewOf(url: URL, dev = Boolean(process.env.DATME_DEV)): Preview {
  if (!dev) return {}
  url = pageUrl(url)
  const pick = <T extends string>(key: string, options: readonly T[]) => pickOption(url.searchParams.get(key) ?? undefined, options).value
  return { style: pick(PREVIEW_KEYS.style, site.styles), chrome: pick(PREVIEW_KEYS.chrome, CHROMES) }
}

/** The address of this page previewed with `key` set to `value`, or back to its own when `value` is undefined. */
export function previewUrl(url: URL, key: keyof typeof PREVIEW_KEYS, value: string | undefined): string {
  const next = new URL(url)
  if (value) next.searchParams.set(PREVIEW_KEYS[key], value)
  else next.searchParams.delete(PREVIEW_KEYS[key])
  return next.pathname + next.search + next.hash
}

/** What the page's style and frame come from: a note (its source file), a folder, or neither. */
export type LookTarget =
  /** `tag`: the tag `appearance.tags` would give the note its style by, when it has one. */
  | { kind: "note"; file: string; dir: string; tag?: string }
  | { kind: "folder"; dir: string; file?: string }
  | { kind: "site" }

/** The rule behind a style, in words. */
export function describeLookRule(rule: LookRule, target: LookTarget): string {
  switch (rule.kind) {
    case "note":
      return `style: in ${"file" in target && target.file ? target.file : "the note"}`
    case "layout":
      return `the default of layout: ${rule.layout}`
    case "tags":
      return `appearance.tags → ${rule.tag}`
    case "folders":
      return `appearance.folders → ${rule.folder}`
    case "classic":
      return `appearance.classic → ${rule.folder}`
    case "site":
      return "appearance.style"
  }
}

/** The rule behind a frame, in words. */
export function describeFrameRule(rule: FrameRule, target: LookTarget): string {
  switch (rule.kind) {
    case "note":
      return `chrome: in ${"file" in target && target.file ? target.file : "the note"}`
    case "layout":
      return `the default of layout: ${rule.layout}`
    case "default":
      return "the default"
  }
}

/** A line to copy and the file it goes in. */
export interface ConfigLine {
  where: string
  code: string
}

/** A YAML key, quoted when it holds what YAML would read otherwise. */
function yamlKey(key: string): string {
  return /^[\p{L}\p{N}_][\p{L}\p{N}_ ./-]*$/u.test(key) && !key.endsWith(" ") ? key : JSON.stringify(key)
}

/** The lines that make a preview stick: in the note's or folder note's frontmatter, or in datme.yaml. */
export function configLines(target: LookTarget, preview: Preview): ConfigLine[] {
  const lines: ConfigLine[] = []
  const front = [preview.style && `style: ${preview.style}`, preview.chrome && `chrome: ${preview.chrome}`].filter(Boolean).join("\n")
  if (front && target.kind === "note") lines.push({ where: `frontmatter of ${target.file}`, code: front })
  if (preview.style && target.kind === "note" && target.tag) {
    lines.push({ where: `datme.yaml, for every note tagged ${target.tag}`, code: `appearance:\n  tags:\n    ${yamlKey(target.tag)}: ${preview.style}` })
  }
  // Only a folder note gives a folder page its chrome; a folder without one gets it by adding one.
  if (front && target.kind === "folder" && target.dir) {
    const file = target.file ?? `${target.dir}/${target.dir.split("/").pop()}.md`
    lines.push({ where: target.file ? `frontmatter of ${file}` : `frontmatter of a new folder note, ${file}`, code: front })
  }
  if (preview.style && target.kind !== "site" && target.dir) {
    lines.push({ where: "datme.yaml, for the whole folder", code: `appearance:\n  folders:\n    ${yamlKey(target.dir)}: ${preview.style}` })
  }
  if (preview.style && (target.kind === "site" || !target.dir)) {
    lines.push({ where: "datme.yaml, for the whole site", code: `appearance:\n  style: ${preview.style}` })
  }
  return lines
}
