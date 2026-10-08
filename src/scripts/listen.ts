/**
 * Listen to a note: the browser's own voices (the Web Speech API) read the
 * prose sentence by sentence, the sentence being read is highlighted, and the
 * page follows it. Code, diagrams, math, footnote markers and locked parts
 * are skipped; headings and callout titles are read. Nothing leaves the page.
 */
import { loadPrefs, savePrefs, RATES } from "./prefs"

/** Blocks read one after the other. */
const BLOCKS = "p, li, h1, h2, h3, h4, h5, h6, dt, dd, th, td, figcaption, .callout-title"
/** Parts of the page never read: code, pictures, math, markers, and what is locked or only for the eyes. */
const SKIP = [
  "pre",
  "script",
  "style",
  "svg",
  "canvas",
  "math",
  ".katex",
  ".mermaid",
  ".diagram",
  ".drawing",
  "figure.markmap",
  ".chart",
  ".locked-part",
  "form.locked",
  ".sidenote",
  ".heading-anchor",
  ".block-id",
  ".transclude-src",
  "[data-footnote-ref]",
  "a[data-footnote-backref]",
  ".data-footnote-backref",
  "[aria-hidden='true']",
  ".listen",
].join(", ")

/** The blocks of a note to read, in order: the innermost ones, so a list item is read without its sub-list. */
export function readableBlocks(prose: Element): HTMLElement[] {
  return [...prose.querySelectorAll<HTMLElement>(BLOCKS)].filter((b) => !b.closest(SKIP) && textNodes(b).some((n) => n.data.trim()))
}

/** The text nodes of a block that are read: not inside a skipped part, nor inside a nested block. */
export function textNodes(block: Element): Text[] {
  const doc = block.ownerDocument
  const walker = doc.createTreeWalker(block, 4 /* NodeFilter.SHOW_TEXT */)
  const out: Text[] = []
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    const parent = n.parentElement
    if (!parent) continue
    if (parent.closest(SKIP)) continue
    // A nested block (a sub-list's item) is read on its own.
    const owner = parent.closest(BLOCKS)
    if (owner && owner !== block && block.contains(owner)) continue
    out.push(n)
  }
  return out
}

export interface Sentence {
  text: string
  /** Where it starts and ends in the joined text of the block's read nodes. */
  start: number
  end: number
}

/** The sentences of a text, with Intl.Segmenter where the browser has it. */
export function sentences(text: string, lang: string): Sentence[] {
  const out: Sentence[] = []
  const push = (start: number, end: number) => {
    const raw = text.slice(start, end)
    const lead = raw.length - raw.trimStart().length
    const trimmed = raw.trim()
    if (trimmed) out.push({ text: trimmed.replace(/\s+/g, " "), start: start + lead, end: start + lead + trimmed.length })
  }
  const Seg = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter
  if (Seg) {
    for (const s of new Seg(lang, { granularity: "sentence" }).segment(text)) push(s.index, s.index + s.segment.length)
  } else {
    let start = 0
    for (const m of text.matchAll(/[.!?…]+["')\]]*\s+/g)) {
      push(start, m.index! + m[0].length)
      start = m.index! + m[0].length
    }
    push(start, text.length)
  }
  return out
}

/** A DOM range over a sentence of a block, for highlighting it. */
export function rangeOf(nodes: Text[], s: Sentence): Range | undefined {
  const doc = nodes[0]?.ownerDocument
  if (!doc) return undefined
  const range = doc.createRange()
  let pos = 0
  let started = false
  for (const n of nodes) {
    const next = pos + n.data.length
    if (!started && s.start < next) {
      range.setStart(n, s.start - pos)
      started = true
    }
    if (started && s.end <= next) {
      range.setEnd(n, s.end - pos)
      return range
    }
    pos = next
  }
  return undefined
}

/** A voice for the note's language: the exact tag first, then the same language, else the browser's default. */
export function voiceFor(voices: SpeechSynthesisVoice[], lang: string): SpeechSynthesisVoice | undefined {
  const tag = lang.toLowerCase()
  const base = tag.split("-")[0]
  return (
    voices.find((v) => v.lang.toLowerCase() === tag && v.localService) ??
    voices.find((v) => v.lang.toLowerCase() === tag) ??
    voices.find((v) => v.lang.toLowerCase().split(/[-_]/)[0] === base)
  )
}

/** One reading of a note: where it is, and what drives it. */
class Reader {
  private block = 0
  private sentence = 0
  private items: { el: HTMLElement; nodes: Text[]; sentences: Sentence[] }[]
  private playing = false
  /** Bumped on every jump, so the end of an utterance that was cut off does nothing. */
  private turn = 0
  rate: number

  constructor(
    prose: HTMLElement,
    private lang: string,
    private synth: SpeechSynthesis,
    private onChange: (state: "playing" | "paused" | "ended") => void,
  ) {
    this.items = readableBlocks(prose).map((el) => {
      const nodes = textNodes(el)
      return { el, nodes, sentences: sentences(nodes.map((n) => n.data).join(""), lang) }
    })
    this.rate = loadPrefs().rate
  }

  get empty() {
    return !this.items.length
  }

  play() {
    if (this.block >= this.items.length) this.block = this.sentence = 0
    this.playing = true
    this.onChange("playing")
    this.speak()
  }

  pause() {
    this.playing = false
    this.turn++
    this.synth.cancel()
    this.onChange("paused")
  }

  stop() {
    this.pause()
    this.mark(undefined)
    this.block = this.sentence = 0
  }

  /** The next or previous paragraph, from its first sentence. */
  skip(by: number) {
    this.block = Math.max(0, Math.min(this.items.length - 1, this.block + by))
    this.sentence = 0
    if (this.playing) {
      this.turn++
      this.synth.cancel()
      this.speak()
    } else this.mark(this.items[this.block])
  }

  setRate(rate: number) {
    this.rate = rate
    savePrefs({ ...loadPrefs(), rate })
    // The new speed applies from the sentence being read.
    if (this.playing) {
      this.turn++
      this.synth.cancel()
      this.speak()
    }
  }

  private speak(): void {
    const item = this.items[this.block]
    if (!item) {
      this.playing = false
      this.mark(undefined)
      return this.onChange("ended")
    }
    const s = item.sentences[this.sentence]
    if (!s) {
      this.block++
      this.sentence = 0
      return this.speak()
    }
    this.mark(item, s)
    const u = new SpeechSynthesisUtterance(s.text)
    u.lang = this.lang
    const voice = voiceFor(this.synth.getVoices(), this.lang)
    if (voice) u.voice = voice
    u.rate = this.rate
    const turn = this.turn
    u.onend = () => {
      if (turn !== this.turn || !this.playing) return
      this.sentence++
      this.speak()
    }
    u.onerror = u.onend
    this.synth.speak(u)
  }

  private shown: HTMLElement | undefined
  /** Highlight the sentence being read, or its paragraph where the browser cannot, and keep it in view. */
  private mark(item: { el: HTMLElement; nodes: Text[] } | undefined, s?: Sentence) {
    const highlights = (globalThis as { CSS?: { highlights?: Map<string, unknown> } }).CSS?.highlights
    const Highlight = (globalThis as { Highlight?: new (...r: Range[]) => unknown }).Highlight
    const range = item && s ? rangeOf(item.nodes, s) : undefined
    if (highlights && Highlight) {
      if (range) highlights.set("listen", new Highlight(range))
      else highlights.delete("listen")
    }
    if (this.shown !== item?.el) {
      this.shown?.classList.remove("listening")
      this.shown = item?.el
      this.shown?.classList.add("listening")
      const smooth = !matchMedia("(prefers-reduced-motion: reduce)").matches
      this.shown?.scrollIntoView({ block: "center", behavior: smooth ? "smooth" : "auto" })
    }
  }
}

let current: Reader | undefined

/** The ▶ Listen bar above a note, shown only where the browser can speak. */
export function setupListen(): void {
  const bar = document.querySelector<HTMLElement>("[data-listen]")
  const prose = document.querySelector<HTMLElement>(".prose")
  current?.stop()
  current = undefined
  if (!bar || !prose || bar.dataset.bound || !("speechSynthesis" in window)) return
  bar.dataset.bound = "1"
  const play = bar.querySelector<HTMLButtonElement>("[data-listen-play]")!
  const controls = bar.querySelector<HTMLElement>("[data-listen-controls]")!
  const speed = bar.querySelector<HTMLSelectElement>("[data-listen-rate]")!
  speed.innerHTML = RATES.map((r) => `<option value="${r}">${r}×</option>`).join("")
  speed.value = String(loadPrefs().rate)
  const label = (state: "playing" | "paused" | "ended") => {
    const on = state === "playing"
    play.setAttribute("aria-pressed", String(on))
    play.querySelector("span")!.textContent = on ? (play.dataset.pause ?? "") : state === "paused" ? (play.dataset.resume ?? "") : (play.dataset.listen ?? "")
    play.querySelector("i")!.textContent = on ? "⏸" : "▶"
    controls.hidden = state === "ended" && !current
  }
  const reader = () => {
    // A protected note's prose is only there once unlocked, so the reader is made at the first press.
    if (!current) {
      current = new Reader(prose, prose.lang || document.documentElement.lang, window.speechSynthesis, label)
      current.rate = Number(speed.value) || 1
    }
    return current
  }
  play.addEventListener("click", () => {
    const r = reader()
    if (r.empty) return
    controls.hidden = false
    if (play.getAttribute("aria-pressed") === "true") r.pause()
    else r.play()
  })
  bar.querySelector("[data-listen-prev]")!.addEventListener("click", () => reader().skip(-1))
  bar.querySelector("[data-listen-next]")!.addEventListener("click", () => reader().skip(1))
  bar.querySelector("[data-listen-stop]")!.addEventListener("click", () => {
    current?.stop()
    label("ended")
    controls.hidden = true
  })
  speed.addEventListener("change", () => reader().setRate(Number(speed.value)))
  bar.hidden = false
}

/** Leaving the page stops the voice. */
export function stopListening(): void {
  current?.stop()
  current = undefined
}
