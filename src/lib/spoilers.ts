/**
 * Spoilers and content warnings: `||text||` inline, and the wrapper a note with
 * a `cw` property is shown in. Both work without JavaScript (a focusable span
 * revealed by `:focus`, a `<details>`); src/scripts/spoiler.ts and cw.ts
 * remember what a reader opened.
 */
import type { Plugin } from "unified"
import type { Root, Parent, PhrasingContent, Text } from "mdast"
import type { Lang } from "../site.config"
import { escapeAttr } from "./html"
import { t } from "./i18n"

// An opening `||` is followed by a word, a closing one follows a word: `a || b` and `||` alone are left as they are.
const OPEN = /\|\|(?=[^\s|]|$)/
const CLOSE = /(?<![\s|])\|\|/

const text = (value: string): Text => ({ type: "text", value })

/** `||text||` inside a paragraph, its emphasis and links included, a spoiler; code, maths and table cells keep their pipes. */
export const remarkSpoilers: Plugin<[{ lang: Lang }], Root> =
  ({ lang }) =>
  (tree) => {
    const label = t(lang).spoiler
    const walk = (parent: Parent) => {
      if (parent.type === "tableCell") return
      const kids = parent.children as PhrasingContent[]
      for (let i = 0; i < kids.length; i++) {
        const a = kids[i]
        if ("children" in a) walk(a)
        if (a.type !== "text") continue
        const open = OPEN.exec(a.value)
        if (!open) continue
        for (let j = i; j < kids.length; j++) {
          const b = kids[j]
          if (b.type !== "text") continue
          const from = j === i ? open.index + 2 : 0
          const close = CLOSE.exec(b.value.slice(from))
          if (!close) continue
          const end = from + close.index
          const inner = [...(j === i ? [] : [text(a.value.slice(open.index + 2)), ...kids.slice(i + 1, j)]), text(b.value.slice(from, end))].filter(
            (n) => n.type !== "text" || n.value,
          )
          const head = a.value.slice(0, open.index)
          const tail = b.value.slice(end + 2)
          kids.splice(
            i,
            j - i + 1,
            ...(head ? [text(head)] : []),
            {
              type: "emphasis",
              children: inner,
              data: { hName: "span", hProperties: { className: ["spoiler"], tabIndex: 0, role: "button", ariaLabel: label } },
            },
            ...(tail ? [text(tail)] : []),
          )
          // Resume after the spoiler: a tail is scanned for the next one.
          if (head) i++
          break
        }
      }
    }
    walk(tree)
  }

/** A note with a content warning: its text behind a `<details>` that opens on a press, and stays out of search results. */
export function warned(html: string, warning: string, url: string, lang: Lang): string {
  const s = t(lang)
  return (
    `<details class="cw" data-cw="${escapeAttr(url)}"><summary><span class="cw-label">${escapeAttr(s.contentWarning)}: ${escapeAttr(warning)}</span> ` +
    `<span class="cw-open">${escapeAttr(s.contentWarningOpen)}</span></summary><div class="cw-body" data-pagefind-ignore>${html}</div></details>`
  )
}

/** The part of a warned note's HTML a reader sees before opening it: no text of the note itself. */
export const beforeWarning = (html: string) => html.replace(/<div class="cw-body"[\s\S]*$/, "")
