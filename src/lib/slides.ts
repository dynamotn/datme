/**
 * Slide decks written for Marp, as the Marp Slides plugin of Obsidian (and
 * Marp for VS Code) shows them: a note with `marp: true` in its frontmatter,
 * whose slides are split by `---` and styled by HTML comment directives.
 * Decks are rendered at build time with Marp Core, so they look as in the
 * plugin's preview; themes are the built-in ones plus any vault CSS file that
 * declares `@theme`.
 */
import { Marp } from "@marp-team/marp-core"
import { dump } from "js-yaml"

export function isSlides(fm: Record<string, unknown>): boolean {
  return fm.marp === true || fm.marp === "true"
}

/** Global directives Marp reads from the frontmatter; every other field is the garden's own. */
export const GLOBAL = [
  "theme",
  "style",
  "headingDivider",
  "size",
  "math",
  "lang",
  "paginate",
  "header",
  "footer",
  "class",
  "backgroundColor",
  "backgroundImage",
  "backgroundPosition",
  "backgroundRepeat",
  "backgroundSize",
  "color",
  "transition",
]

/**
 * The Marp directives of a deck's frontmatter, with vault paths in images and
 * `url(...)` turned into asset URLs by `resolve`.
 */
export function slideDirectives(
  fm: Record<string, unknown>,
  resolve: (target: string) => string | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const local = (s: string) =>
    s
      .replace(/(!?\[[^\]\n]*\]\()(?!https?:|data:|\/)([^)\s]+)\)/g, (m, pre: string, t: string) => {
        const url = resolve(t)
        return url ? `${pre}${url})` : m
      })
      .replace(/url\((["']?)(?!https?:|data:|\/)([^)"']+)\1\)/g, (m, q: string, t: string) => {
        const url = resolve(t)
        return url ? `url(${q}${url}${q})` : m
      })
  for (const key of GLOBAL) {
    const v = fm[key]
    if (v == null || typeof v === "object") continue
    out[key] = typeof v === "string" ? local(v) : v
  }
  return out
}

/** Whether a CSS file of the vault is a Marp theme: it names itself with `@theme` in a comment. */
export function isTheme(css: string): boolean {
  return /\/\*[\s\S]*?@theme\s+\S+[\s\S]*?\*\//.test(css)
}

export interface Deck {
  /** The deck's host element, its slides (inline SVGs) and styles inside a declarative shadow root. */
  html: string
  count: number
}

/**
 * How the slides sit on the page, inside the shadow root: stacked while
 * reading, one at a time and filling the screen while presenting.
 */
const FRAME = `:host{display:block;margin:1.5rem 0}
.marpit{display:flex;flex-direction:column;gap:1.25rem}
.marpit>svg[data-marpit-svg]{display:block;width:100%;height:auto;border-radius:6px;box-shadow:0 1px 3px rgb(0 0 0/.18),0 6px 20px rgb(0 0 0/.08)}
:host(.presenting){position:fixed;inset:0;z-index:1000;margin:0;background:#000;cursor:pointer}
:host(.presenting) .marpit{height:100%;gap:0;justify-content:center}
:host(.presenting) .marpit>svg[data-marpit-svg]{display:none;width:100%;height:100%;border-radius:0;box-shadow:none}
:host(.presenting) .marpit>svg[data-marpit-svg].current{display:block}
@media print{.marpit>svg[data-marpit-svg]{break-inside:avoid;box-shadow:none;border:1px solid #ccc}}`

const escapeAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")

export function renderSlides(
  md: string,
  directives: Record<string, unknown>,
  themes: string[],
  /** UI strings: the presenter button, and the deck's name for screen readers, "{n}" its slide count. */
  labels: { present: string; slides: string },
): Deck {
  const marp = new Marp({
    // Notes are trusted, as everywhere else in the garden.
    html: true,
    // Emoji stay text: Twemoji would fetch images from a CDN.
    emoji: { shortcode: true, unicode: false },
    math: "katex",
    // The site brings its own presenter script; the polyfill is only for old WebKit.
    script: false,
    inlineSVG: true,
    container: { tag: "div", class: "marpit" },
  })
  for (const css of themes) {
    try {
      marp.themeSet.add(css)
    } catch {
      // not a valid theme: Marp falls back to the default one
    }
  }
  const front = Object.keys(directives).length ? `---\n${dump(directives)}---\n\n` : ""
  const { html, css } = marp.render(front + md)
  const count = (html.match(/<svg\b[^>]*data-marpit-svg/g) ?? []).length
  // Fonts a theme imports must load in the document: @font-face is ignored inside a shadow root.
  const imports = css.match(/@import\s+(?:url\()?["'][^"']+["']\)?[^;]*;/g) ?? []
  const scoped = imports.reduce((c, i) => c.replace(i, ""), css)
  // A shadow root keeps the page's prose styles out of the slides, and the theme's styles in.
  return {
    html:
      (imports.length ? `<style>${imports.join("")}</style>` : "") +
      `<div class="marp-deck" role="group" aria-label="${escapeAttr(labels.slides.replace("{n}", String(count)))}" data-present="${escapeAttr(labels.present)}">` +
      `<template shadowrootmode="open"><style>${FRAME}</style><style>${scoped}</style>${html}</template></div>`,
    count,
  }
}
