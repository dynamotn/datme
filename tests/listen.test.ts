import { afterAll, describe, expect, test } from "bun:test"
import { Window } from "happy-dom"
import { rangeOf, readableBlocks, sentences, textNodes, voiceFor } from "../src/scripts/listen"

const happy = new Window({ url: "https://garden.example/note" })
const document = happy.document as unknown as Document

const prose = (html: string) => {
  const el = document.createElement("div")
  el.className = "prose"
  el.innerHTML = html
  return el
}
const read = (el: Element) => readableBlocks(el).map((b) => textNodes(b).map((n) => n.data).join("").trim())

describe("what is read", () => {
  test("headings, paragraphs, callout titles and list items, without code, math, markers or locked parts", () => {
    const el = prose(`
      <h2>Intro<a class="heading-anchor" aria-hidden="true">#</a></h2>
      <p>A slip box<sup><a data-footnote-ref href="#fn">1</a></sup> grows.</p>
      <pre><code>const x = 1</code></pre>
      <div class="callout"><div class="callout-title">Note</div><div class="callout-content"><p>Inside.</p></div></div>
      <p>Math <span class="katex">x^2</span> is skipped.</p>
      <div class="locked-part"><p>Secret words.</p></div>
      <ul><li>Top<ul><li>Nested</li></ul></li></ul>
      <figure class="chart"><figcaption>Chart</figcaption></figure>`)
    expect(read(el)).toEqual(["Intro", "A slip box grows.", "Note", "Inside.", "Math  is skipped.", "Top", "Nested"])
  })
})

describe("sentences", () => {
  test("split by the language's rules, with their place in the text", () => {
    const text = "  First one. Second one!  Third?"
    const s = sentences(text, "en-US")
    expect(s.map((x) => x.text)).toEqual(["First one.", "Second one!", "Third?"])
    expect(text.slice(s[1].start, s[1].end)).toBe("Second one!")
  })
})

describe("rangeOf", () => {
  test("covers a sentence across several text nodes", () => {
    const el = prose("<p>One <em>two</em> three. Four.</p>")
    const p = el.querySelector("p")!
    const nodes = textNodes(p)
    const [first] = sentences(nodes.map((n) => n.data).join(""), "en-US")
    expect(rangeOf(nodes, first)?.toString()).toBe("One two three.")
  })
})

describe("voiceFor", () => {
  const v = (lang: string, localService = true) => ({ lang, localService, name: lang }) as SpeechSynthesisVoice
  test("the note's language: exact tag, local first, then the same language", () => {
    expect(voiceFor([v("en-GB"), v("vi-VN", false), v("vi-VN")], "vi-VN")).toEqual(v("vi-VN"))
    expect(voiceFor([v("en-GB"), v("fr-FR")], "en-US")?.lang).toBe("en-GB")
    expect(voiceFor([v("fr-FR")], "vi-VN")).toBeUndefined()
  })
})

describe("the listen bar", () => {
  const saved = {
    window: globalThis.window,
    document: globalThis.document,
    matchMedia: globalThis.matchMedia,
    SpeechSynthesisUtterance: (globalThis as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance,
    localStorage: globalThis.localStorage,
  }
  afterAll(() => Object.assign(globalThis, saved))

  test("reads sentence after sentence in the note's language, pauses, and remembers the speed", async () => {
    const spoken: { text: string; lang: string; rate: number }[] = []
    const queue: { onend?: () => void }[] = []
    class Utterance {
      lang = ""
      rate = 1
      voice?: unknown
      onend?: () => void
      onerror?: () => void
      constructor(public text: string) {}
    }
    const synth = {
      getVoices: () => [],
      speak: (u: Utterance) => (spoken.push({ text: u.text, lang: u.lang, rate: u.rate }), queue.push(u)),
      cancel: () => void (queue.length = 0),
    }
    Object.assign(happy, { speechSynthesis: synth })
    Object.assign(globalThis, {
      window: happy,
      document: happy.document,
      matchMedia: () => ({ matches: true }),
      SpeechSynthesisUtterance: Utterance,
      localStorage: happy.localStorage,
    })
    happy.document.body.innerHTML = `
      <div class="listen" data-listen hidden>
        <button data-listen-play aria-pressed="false" data-listen="Listen" data-pause="Pause" data-resume="Resume"><i>▶</i> <span>Listen</span></button>
        <span data-listen-controls hidden><button data-listen-prev></button><button data-listen-next></button>
        <select data-listen-rate></select><button data-listen-stop></button></span>
      </div>
      <div class="prose" lang="vi-VN"><p>Câu một. Câu hai.</p><pre>code</pre><p>Đoạn hai.</p></div>`
    happy.HTMLElement.prototype.scrollIntoView = () => {}
    const { setupListen } = await import("../src/scripts/listen")
    setupListen()
    const bar = (happy.document as unknown as Document).querySelector("[data-listen]")!
    expect(bar.hasAttribute("hidden")).toBe(false)
    const play = bar.querySelector<HTMLButtonElement>("[data-listen-play]")!
    play.click()
    expect(spoken.at(-1)).toEqual({ text: "Câu một.", lang: "vi-VN", rate: 1 })
    queue.shift()!.onend!()
    expect(spoken.at(-1)?.text).toBe("Câu hai.")
    queue.shift()!.onend!()
    expect(spoken.at(-1)?.text).toBe("Đoạn hai.")
    expect(play.querySelector("span")!.textContent).toBe("Pause")
    play.click()
    expect(play.querySelector("span")!.textContent).toBe("Resume")

    const rate = bar.querySelector<HTMLSelectElement>("[data-listen-rate]")!
    rate.value = "1.5"
    rate.dispatchEvent(new happy.Event("change") as unknown as Event)
    expect(JSON.parse(happy.localStorage.getItem("prefs")!).rate).toBe(1.5)
    play.click()
    expect(spoken.at(-1)).toEqual({ text: "Đoạn hai.", lang: "vi-VN", rate: 1.5 })
  })
})
