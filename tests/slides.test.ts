import { describe, expect, test } from "bun:test"
import { isSlides, isTheme, renderSlides, slideDirectives } from "../src/lib/slides"
import { preprocess } from "../src/lib/obsidian"
import { renderNote } from "../src/lib/markdown"
import { getVault } from "../src/lib/vault"

const labels = { present: "Present", slides: "Deck of {n} slides" }
const ctx = {
  lang: "en-US",
  dir: "",
  resolveNote: () => undefined,
  resolveAsset: (t: string) => (t.endsWith(".png") ? `img/${t}` : undefined),
  slides: true,
}

describe("Marp decks", () => {
  test("`marp: true` in the frontmatter marks a deck", () => {
    expect(isSlides({ marp: true })).toBe(true)
    expect(isSlides({ marp: false })).toBe(false)
    expect(isSlides({})).toBe(false)
  })

  test("only Marp's global directives are taken, with vault images resolved", () => {
    const d = slideDirectives(
      { marp: true, theme: "gaia", paginate: true, tags: ["x"], title: { en: "T" }, backgroundImage: "url(sky.png)", footer: "![](logo.png)" },
      (t) => `/assets/${t}`,
    )
    expect(d).toEqual({ theme: "gaia", paginate: true, backgroundImage: "url(/assets/sky.png)", footer: "![](/assets/logo.png)" })
  })

  test("a theme is a CSS file naming itself with @theme", () => {
    expect(isTheme("/* @theme garden */\nsection{}")).toBe(true)
    expect(isTheme("section{}")).toBe(false)
  })

  test("comments and styles survive preprocessing, untouched by tags and highlights", () => {
    const { md } = preprocess("<!-- backgroundColor: #abc -->\n<style>h1{color:#def}</style>\n#tag ==hi==", ctx)
    expect(md).toContain("<!-- backgroundColor: #abc -->")
    expect(md).toContain("<style>h1{color:#def}</style>")
    expect(md).toContain('class="tag-link">#tag</a> <mark>hi</mark>')
    // An ordinary note still drops its comments.
    expect(preprocess("<!-- gone -->x", { ...ctx, slides: false }).md).toBe("x")
  })

  test("images stay markdown, so Marp reads backgrounds and sizes from the alt text", () => {
    const { md } = preprocess("![[sky.png|bg left]] ![[sky.png|300]] ![[sky.png|300x200]] ![bg](sky.png)", ctx)
    expect(md).toBe("![bg left](/assets/img/sky.png) ![w:300](/assets/img/sky.png) ![w:300 h:200](/assets/img/sky.png) ![bg](/assets/img/sky.png)")
  })

  test("slides are inline SVGs in a shadow root, theme fonts loaded outside it", () => {
    const deck = renderSlides("# One\n\n---\n\n## Two", { theme: "gaia" }, [], labels)
    expect(deck.count).toBe(2)
    expect(deck.html).toMatch(/^<style>@import [^<]+<\/style><div class="marp-deck" role="group" aria-label="Deck of 2 slides" data-present="Present"><template shadowrootmode="open">/)
    expect(deck.html.match(/<svg data-marpit-svg/g)).toHaveLength(2)
    expect(deck.html).toMatch(/<\/template><\/div>$/)
  })

  test("a deck of the vault uses its own theme, links and images", async () => {
    const vault = getVault()
    expect(vault.slideThemes).toHaveLength(1)
    const note = vault.byKey["en-US"].get("07_Project/Talk")!
    expect(note.slides).toEqual({ theme: "garden", paginate: true, footer: "Slip-box talk" })
    expect(note.cssclasses).toContain("slide-deck")
    expect(note.links.map((l) => l.key)).toEqual(["03_Atomic/Zettelkasten"])
    expect(note.assets).toEqual(["_assets/images/wide.png", "_assets/images/diagram.png"])
    const r = await renderNote(note)
    // The first slide's heading is a slide, not the page title, and slides have no table of contents.
    expect(r.h1).toBeUndefined()
    expect(r.headings).toEqual([])
    expect(r.description).toBe("A deck about Zettelkasten #zettel")
    expect(r.html).toContain('data-theme="garden"')
    expect(r.html).toContain("background:#f4f1e8")
    expect(r.html).toContain('class="internal" data-key="03_Atomic/Zettelkasten"')
    expect(r.html).toContain("background-image:url(&quot;/assets/_assets/images/wide.png&quot;)")
    expect(r.html).toContain('style="width:200px;"')
    expect(r.html).toContain('class="lead"')
    expect(r.html).toContain("<footer>Slip-box talk</footer>")
    // Speaker notes are for the speaker.
    expect(r.html).not.toContain("keep it short")
  })
})
