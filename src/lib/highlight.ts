import rehypeShikiFromHighlighter, { type RehypeShikiCoreOptions } from "@shikijs/rehype/core"
import { bundledLanguages, bundledLanguagesInfo, createHighlighter, type BundledLanguage, type Highlighter, type LanguageRegistration } from "shiki"
import type { Plugin } from "unified"
import type { Root, Element } from "hast"
import { visit } from "unist-util-visit"

/**
 * One Shiki highlighter per process and pair of themes, loading only the
 * grammars a note's code blocks use. `@shikijs/rehype` would resolve every
 * bundled grammar again for each note it renders.
 */
const highlighters = new Map<string, Promise<Highlighter>>()
const loads = new WeakMap<Highlighter, Map<string, Promise<void>>>()

export function highlighter(themes: Record<string, string>): Promise<Highlighter> {
  const key = JSON.stringify(themes)
  let h = highlighters.get(key)
  if (!h) {
    h = createHighlighter({ themes: Object.values(themes), langs: [] })
    highlighters.set(key, h)
  }
  return h
}

const known = (lang: string): lang is BundledLanguage => Object.hasOwn(bundledLanguages, lang)

/** A grammar's registrations: itself and the languages it always embeds. */
async function registrations(lang: BundledLanguage): Promise<LanguageRegistration[]> {
  return (await bundledLanguages[lang]()).default
}

let injectors: Promise<Map<string, BundledLanguage[]>> | undefined
/** The grammars injecting into each scope (vue interpolations into markdown, tagged templates into ts). */
function injectorsByScope(): Promise<Map<string, BundledLanguage[]>> {
  injectors ??= (async () => {
    const by = new Map<string, BundledLanguage[]>()
    for (const { id } of bundledLanguagesInfo) {
      if (!known(id)) continue
      for (const reg of await registrations(id))
        for (const scope of reg.injectTo ?? []) by.set(scope, [...(by.get(scope) ?? []), id])
    }
    return by
  })()
  return injectors
}

/**
 * Every bundled language a block in `lang` can show: the grammar, what it
 * embeds, what it embeds only when loaded (a markdown fence of python) and
 * what injects into it, so a block highlights the same as with every grammar loaded.
 */
async function closure(lang: BundledLanguage): Promise<BundledLanguage[]> {
  const injectedBy = await injectorsByScope()
  const seen = new Set<BundledLanguage>()
  const walk = async (id: string): Promise<void> => {
    if (!known(id) || seen.has(id)) return
    seen.add(id)
    for (const reg of await registrations(id)) {
      // A grammar takes the injections into its scope and into each prefix of it, as Shiki resolves them.
      const parts = reg.scopeName.split(".")
      const injected = parts.flatMap((_, i) => injectedBy.get(parts.slice(0, i + 1).join(".")) ?? [])
      const next = [...(reg.embeddedLangs ?? []), ...(reg.embeddedLangsLazy ?? []), ...injected]
      await Promise.all(next.map(walk))
    }
  }
  await walk(lang)
  return [...seen]
}

/** Loads `langs` and everything they can embed, once per highlighter; unknown names stay unloaded. */
export function loadLanguages(h: Highlighter, langs: Iterable<string>): Promise<void> {
  let done = loads.get(h)
  if (!done) loads.set(h, (done = new Map()))
  const pending: Promise<void>[] = []
  for (const lang of new Set(langs)) {
    if (!known(lang)) continue
    let p = done.get(lang)
    if (!p) {
      p = closure(lang).then((ids) => h.loadLanguage(...ids))
      done.set(lang, p)
    }
    pending.push(p)
  }
  return Promise.all(pending).then(() => undefined)
}

/** The language a `<pre><code class="language-x">` names, as `@shikijs/rehype` reads it. */
function blockLanguage(pre: Element): string | undefined {
  const head = pre.children[0]
  if (head?.type !== "element" || head.tagName !== "code") return undefined
  const classes = head.properties?.className
  const cls = Array.isArray(classes) ? classes.find((c) => typeof c === "string" && c.startsWith("language-")) : undefined
  return typeof cls === "string" ? cls.slice("language-".length) : undefined
}

export type HighlightOptions = Omit<RehypeShikiCoreOptions, "lazy"> & { themes: Record<string, string> }

/** `@shikijs/rehype` on a shared highlighter whose grammars load on demand. */
export const rehypeHighlight: Plugin<[HighlightOptions], Root> = (options) => async (tree) => {
  const h = await highlighter(options.themes)
  const langs: string[] = []
  visit(tree, "element", (node) => {
    if (node.tagName !== "pre") return
    const lang = blockLanguage(node)
    if (lang) langs.push(lang)
  })
  if (options.defaultLanguage) langs.push(options.defaultLanguage)
  if (options.fallbackLanguage) langs.push(options.fallbackLanguage)
  await loadLanguages(h, langs)
  // The transformer reads only the tree: it takes no file and never calls back.
  await rehypeShikiFromHighlighter(h, options)(tree, undefined as never, undefined as never)
}
