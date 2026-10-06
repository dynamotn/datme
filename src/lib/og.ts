import fs from "node:fs"
import { createRequire } from "node:module"
import satori from "satori"
import { Resvg } from "@resvg/resvg-js"

export interface OgCard {
  title: string
  /** Small line above the title, usually the site name. */
  kicker: string
  /** Line under the title: date, stage, reading time. */
  meta?: string
  tags?: string[]
  logo: string
}

const require = createRequire(import.meta.url)
/** The code drawing the cards, so cached cards are redrawn when it changes. */
export const OG_SOURCE = import.meta.url

type Weight = 400 | 700 | 800
let fonts: { name: string; data: Buffer; weight: Weight; style: "normal" }[] | undefined

const SUBSETS = ["latin", "latin-ext", "vietnamese"]
// Satori only falls back between differently named fonts, so each subset gets its own name.
const family = (name: string) => SUBSETS.map((s) => `${name}-${s}`).join(", ")

/** Static woff files: Satori cannot read woff2 or variable fonts. */
function loadFonts() {
  if (fonts) return fonts
  const file = (pkg: string, subset: string, weight: Weight) =>
    fs.readFileSync(require.resolve(`@fontsource/${pkg}/files/${pkg}-${subset}-${weight}-normal.woff`))
  fonts = []
  for (const subset of SUBSETS) {
    for (const weight of [400, 800] as const) {
      fonts.push({ name: `Bricolage-${subset}`, data: file("bricolage-grotesque", subset, weight), weight, style: "normal" })
    }
    fonts.push({ name: `Mono-${subset}`, data: file("space-mono", subset, 700), weight: 700, style: "normal" })
  }
  return fonts
}

/** Satori has no emoji font; drop pictographs instead of drawing empty boxes. */
export const stripEmoji = (s: string) =>
  s
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "")
    .replace(/\s+/g, " ")
    .trim()

type Node = { type: string; props: Record<string, unknown> }
const h = (type: string, style: Record<string, unknown>, ...children: (Node | string | undefined | false)[]): Node => ({
  type,
  // Satori lays out with flexbox only; every element needs it spelled out.
  props: { style: { display: "flex", ...style }, children: children.filter((c) => c !== undefined && c !== false) },
})

const INK = "#050505"
const CHIPS = ["#00ff85", "#ffa3e5", "#ffe800"]

/** A 1200×630 notebook index card, as a PNG. */
export async function renderOg(card: OgCard): Promise<Buffer> {
  const title = stripEmoji(card.title)
  const size = title.length > 70 ? 56 : title.length > 40 ? 68 : 84
  const tree = h(
    "div",
    {
      width: "100%",
      height: "100%",
      display: "flex",
      padding: 48,
      backgroundColor: "#f5f5f0",
      backgroundImage: "radial-gradient(#cfcfc8 2px, transparent 2px)",
      backgroundSize: "32px 32px",
      fontFamily: family("Bricolage"),
    },
    h(
      "div",
      {
        flex: 1,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        padding: "44px 56px 44px 88px",
        backgroundColor: "#fff",
        border: `6px solid ${INK}`,
        borderRadius: 16,
        boxShadow: `16px 16px 0 ${INK}`,
      },
      // The red margin line of a ruled notebook page.
      h("div", { position: "absolute", top: 0, bottom: 0, left: 56, width: 3, backgroundColor: "rgba(255,59,40,0.5)" }),
      h(
        "div",
        { display: "flex", alignItems: "center", gap: 18 },
        h(
          "div",
          {
            width: 64,
            height: 64,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: INK,
            color: "#ffe800",
            borderRadius: 10,
            fontSize: 38,
            fontWeight: 800,
            boxShadow: "5px 5px 0 #ff3b28",
          },
          stripEmoji(card.logo) || "✦",
        ),
        h(
          "div",
          {
            display: "flex",
            padding: "6px 14px",
            backgroundColor: INK,
            color: "#fff",
            borderRadius: 6,
            fontFamily: family("Mono"),
            fontSize: 22,
            fontWeight: 700,
            textTransform: "uppercase",
          },
          stripEmoji(card.kicker),
        ),
      ),
      h(
        "div",
        {
          display: "flex",
          flex: 1,
          alignItems: "center",
          fontSize: size,
          fontWeight: 800,
          lineHeight: 1.08,
          letterSpacing: "-0.03em",
          color: INK,
        },
        title,
      ),
      card.meta &&
        h(
          "div",
          {
            display: "flex",
            paddingTop: 14,
            borderTop: `3px dashed ${INK}`,
            fontFamily: family("Mono"),
            fontSize: 24,
            fontWeight: 700,
            color: "#4a4a4a",
          },
          stripEmoji(card.meta),
        ),
      !!card.tags?.length &&
        h(
          "div",
          { display: "flex", gap: 14, marginTop: 18 },
          ...card.tags.slice(0, 4).map((tag, i) =>
            h(
              "div",
              {
                display: "flex",
                padding: "4px 12px",
                border: `3px solid ${INK}`,
                borderRadius: 6,
                backgroundColor: CHIPS[i % CHIPS.length],
                fontFamily: family("Mono"),
                fontSize: 20,
                fontWeight: 700,
                textTransform: "uppercase",
                boxShadow: `3px 3px 0 ${INK}`,
              },
              tag,
            ),
          ),
        ),
    ),
  )
  return toPng(tree, 1200, 630)
}

async function toPng(tree: Node, width: number, height: number): Promise<Buffer> {
  const svg = await satori(tree as unknown as Parameters<typeof satori>[0], { width, height, fonts: loadFonts() })
  // Satori already turned text into paths; scanning system fonts would dominate the render time.
  return new Resvg(svg, { fitTo: { mode: "width", value: width }, font: { loadSystemFonts: false } }).render().asPng()
}

/**
 * A square app icon: the logo on the brand gradient, like the favicon. The
 * logo stays inside the middle 80%, the safe zone of maskable icons.
 */
export function renderIcon(logo: string, size: number): Promise<Buffer> {
  const tree = h(
    "div",
    {
      width: "100%",
      height: "100%",
      alignItems: "center",
      justifyContent: "center",
      backgroundImage: "linear-gradient(135deg, #2d6a4f 0%, #4f8f5b 45%, #b5532c 100%)",
      color: "#fff",
      fontFamily: family("Bricolage"),
      fontSize: Math.round(size * 0.5),
      fontWeight: 800,
    },
    stripEmoji(logo) || "✦",
  )
  return toPng(tree, size, size)
}
