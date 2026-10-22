import fs from "node:fs"
import { createRequire } from "node:module"
import satori from "satori"
import { renderAsync } from "@resvg/resvg-js"
import type { Style } from "../site.config"
import { contrastRatio, luminance, onAccent, parseColor } from "./contrast"

export interface OgCard {
  title: string
  /** Small line above the title, usually the site name. */
  kicker: string
  /** Line under the title: date, stage, reading time. */
  meta?: string
  tags?: string[]
  logo: string
  /** The note's top folder, the region an atlas letters above it. */
  region?: string
  /** The call number a catalogue card is filed under (src/lib/catalog.ts). */
  callNumber?: string
}

/** The drawings of a card: one per style that has its own, `plain` for the rest. */
export type CardDesign =
  | "notebook"
  | "classic"
  | "garden"
  | "herbarium"
  | "paddy"
  | "terminal"
  | "blueprint"
  | "lacquer"
  | "broadsheet"
  | "manuscript"
  | "darkroom"
  | "eink"
  | "zine"
  | "atlas"
  | "catalog"
  | "plain"

/** How a card is drawn: its design, and the accent of the designs that take one. */
export interface CardSpec {
  design: CardDesign
  accent: string
  /** Text on the accent. */
  onAccent: string
}

const DESIGNS: readonly CardDesign[] = [
  "notebook",
  "classic",
  "garden",
  "herbarium",
  "paddy",
  "terminal",
  "blueprint",
  "lacquer",
  "broadsheet",
  "manuscript",
  "darkroom",
  "eink",
  "zine",
  "atlas",
  "catalog",
]
/** The accent of the styles drawn plain, as their own stylesheets set it. */
const PLAIN_ACCENT: Partial<Record<Style, string>> = { wiki: "#0645ad", resume: "#1f5f8b" }
const DEFAULT_ACCENT = "#2d6a4f"
const PHOSPHOR = "#33ff66"
const SCREEN = "#090c09"

/** A configured accent as the hex Satori reads, or undefined when it is no colour Satori could draw. */
function hexOf(color: string | undefined): string | undefined {
  const rgb = color ? parseColor(color) : undefined
  return (
    rgb &&
    "#" +
      rgb
        .map((c) =>
          Math.round(Math.min(255, Math.max(0, c)))
            .toString(16)
            .padStart(2, "0"),
        )
        .join("")
  )
}

/**
 * The card a page of `style` gets: the style's own drawing, or a plain card in its accent.
 * `accent` is theme.accent (its light value); it tints the plain card and the terminal's
 * phosphor, which keeps its green when the accent would not read on the black screen.
 */
export function cardSpec(style: Style, accent?: string): CardSpec {
  const own = hexOf(accent)
  if (style === "terminal") {
    const glow = own && contrastRatio(luminance(parseColor(own)!), luminance(parseColor(SCREEN)!)) >= 4.5 ? own : PHOSPHOR
    return { design: "terminal", accent: glow, onAccent: SCREEN }
  }
  const design = DESIGNS.find((d) => d === style) ?? "plain"
  const tint = design === "plain" ? (own ?? PLAIN_ACCENT[style] ?? DEFAULT_ACCENT) : DEFAULT_ACCENT
  return { design, accent: tint, onAccent: onAccent(tint)! }
}

const require = createRequire(import.meta.url)
/** The code drawing the cards, so cached cards are redrawn when it changes. */
export const OG_SOURCE = import.meta.url

type Weight = 400 | 700 | 800
let fonts: { name: string; data: Buffer; weight: Weight; style: "normal" }[] | undefined

const SUBSETS = ["latin", "latin-ext", "vietnamese"]
// Satori only falls back between differently named fonts, so each subset gets its own name.
const family = (name: string) => SUBSETS.map((s) => `${name}-${s}`).join(", ")
const SANS = family("Bricolage")
const MONO = family("Mono")

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
    .replace(/\p{Extended_Pictographic}|\u{FE0F}|\u{200D}/gu, "")
    .replace(/\s+/g, " ")
    .trim()

type Node = { type: string; props: Record<string, unknown> }
type Child = Node | string | undefined | false
const h = (type: string, style: Record<string, unknown>, ...children: Child[]): Node => ({
  type,
  // Satori lays out with flexbox only; every element needs it spelled out.
  props: { style: { display: "flex", ...style }, children: children.filter((c) => c !== undefined && c !== false) },
})
const div = (style: Record<string, unknown>, ...children: Child[]) => h("div", style, ...children)

/** What every design writes: the card's text, emoji dropped, and a title size that fits its length. */
interface Text {
  title: string
  kicker: string
  meta?: string
  tags: string[]
  logo: string
  region?: string
  callNumber?: string
  /** A size for the title at `scale` of the notebook's. */
  size(scale?: number): number
}

function textOf(card: OgCard): Text {
  const title = stripEmoji(card.title)
  const base = title.length > 70 ? 56 : title.length > 40 ? 68 : 84
  return {
    title,
    kicker: stripEmoji(card.kicker),
    meta: card.meta ? stripEmoji(card.meta) : undefined,
    tags: (card.tags ?? []).slice(0, 4),
    logo: stripEmoji(card.logo) || "✦",
    region: card.region ? stripEmoji(card.region) : undefined,
    callNumber: card.callNumber,
    size: (scale = 1) => Math.round(base * scale),
  }
}

/** The title, filling the space left to it. */
const titleBlock = (t: Text, style: Record<string, unknown>) =>
  div({ flex: 1, alignItems: "center", fontWeight: 800, lineHeight: 1.08, letterSpacing: "-0.02em", ...style }, t.title)

/** A row of tags as chips of `style`. */
const tagRow = (t: Text, style: (i: number) => Record<string, unknown>, prefix = "") =>
  t.tags.length > 0 &&
  div(
    { gap: 14, marginTop: 18 },
    ...t.tags.map((tag, i) => div({ padding: "4px 12px", fontFamily: MONO, fontSize: 20, fontWeight: 700, ...style(i) }, prefix + tag)),
  )

const NOTEBOOK_INK = "#050505"
const CHIPS = ["#00ff85", "#ffa3e5", "#ffe800"]

/** A notebook index card on dotted paper. */
function notebook(t: Text): Node {
  return div(
    {
      width: "100%",
      height: "100%",
      padding: 48,
      backgroundColor: "#f5f5f0",
      backgroundImage: "radial-gradient(#cfcfc8 2px, transparent 2px)",
      backgroundSize: "32px 32px",
      fontFamily: SANS,
    },
    div(
      {
        flex: 1,
        flexDirection: "column",
        position: "relative",
        padding: "44px 56px 44px 88px",
        backgroundColor: "#fff",
        border: `6px solid ${NOTEBOOK_INK}`,
        borderRadius: 16,
        boxShadow: `16px 16px 0 ${NOTEBOOK_INK}`,
      },
      // The red margin line of a ruled notebook page.
      div({ position: "absolute", top: 0, bottom: 0, left: 56, width: 3, backgroundColor: "rgba(255,59,40,0.5)" }),
      div(
        { alignItems: "center", gap: 18 },
        div(
          {
            width: 64,
            height: 64,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: NOTEBOOK_INK,
            color: "#ffe800",
            borderRadius: 10,
            fontSize: 38,
            fontWeight: 800,
            boxShadow: "5px 5px 0 #ff3b28",
          },
          t.logo,
        ),
        div(
          {
            padding: "6px 14px",
            backgroundColor: NOTEBOOK_INK,
            color: "#fff",
            borderRadius: 6,
            fontFamily: MONO,
            fontSize: 22,
            fontWeight: 700,
            textTransform: "uppercase",
          },
          t.kicker,
        ),
      ),
      titleBlock(t, { fontSize: t.size(), letterSpacing: "-0.03em", color: NOTEBOOK_INK }),
      t.meta && div({ paddingTop: 14, borderTop: `3px dashed ${NOTEBOOK_INK}`, fontFamily: MONO, fontSize: 24, fontWeight: 700, color: "#4a4a4a" }, t.meta),
      tagRow(t, (i) => ({
        border: `3px solid ${NOTEBOOK_INK}`,
        borderRadius: 6,
        backgroundColor: CHIPS[i % CHIPS.length],
        textTransform: "uppercase",
        boxShadow: `3px 3px 0 ${NOTEBOOK_INK}`,
      })),
    ),
  )
}

/** The quiet blog: a page of cream paper between two rules. */
function classic(t: Text): Node {
  const ink = "#1d1b17"
  return div(
    { width: "100%", height: "100%", flexDirection: "column", padding: "64px 96px", backgroundColor: "#f6f3ec", fontFamily: SANS, color: ink },
    div({ borderTop: `2px solid ${ink}`, paddingTop: 6, borderBottom: "1px solid #cfc7b6" }),
    div({ marginTop: 34, fontFamily: MONO, fontSize: 22, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#2d6a4f" }, t.kicker),
    titleBlock(t, { fontSize: t.size(0.95), fontWeight: 400, letterSpacing: "-0.01em", lineHeight: 1.15 }),
    t.meta && div({ fontSize: 26, color: "#5f5a50" }, t.meta),
    div({ marginTop: 30, borderTop: "1px solid #cfc7b6" }),
  )
}

/** A tile of the garden bed, leaves at its corner, tags as earth-coloured pills. */
function garden(t: Text): Node {
  const ink = "#26281c"
  const leaf = (style: Record<string, unknown>) => div({ position: "absolute", width: 120, height: 120, borderRadius: "0 100% 0 100%", ...style })
  return div(
    {
      width: "100%",
      height: "100%",
      padding: 56,
      backgroundColor: "#f7f3e8",
      backgroundImage: "radial-gradient(circle at 88% 0%, rgba(70,111,51,0.22), rgba(70,111,51,0) 55%)",
      fontFamily: SANS,
      color: ink,
    },
    div(
      { flex: 1, flexDirection: "column", padding: "40px 52px", backgroundColor: "#e9ead6", borderRadius: "44px 30px 48px 26px" },
      div(
        { alignItems: "center", gap: 14 },
        div({ padding: "6px 16px", borderRadius: 999, backgroundColor: "#466f33", color: "#fff", fontSize: 24, fontWeight: 800 }, t.kicker),
      ),
      titleBlock(t, { fontSize: t.size(), maxWidth: 900 }),
      t.meta && div({ fontSize: 26, color: "#5d5a48" }, t.meta),
      tagRow(t, () => ({ borderRadius: 999, backgroundColor: "#f7f3e8", color: "#7f5527" }), "#"),
    ),
    leaf({ right: 28, top: 22, backgroundColor: "#6d8f45" }),
    leaf({ right: 120, top: 70, width: 72, height: 72, backgroundColor: "#466f33", transform: "rotate(80deg)" }),
  )
}

/** A specimen sheet taped to the cabinet, its label card in the corner. */
function herbarium(t: Text): Node {
  const ink = "#2a2619"
  const tape = (style: Record<string, unknown>) =>
    div({ position: "absolute", top: 34, width: 150, height: 34, backgroundColor: "rgba(214,199,158,0.85)", ...style })
  return div(
    { width: "100%", height: "100%", padding: "52px 64px", backgroundColor: "#e7e0cd", fontFamily: SANS, color: ink, position: "relative" },
    div(
      { flex: 1, flexDirection: "column", padding: "52px 60px 40px", backgroundColor: "#f8f3e3", border: "2px solid #d9cfb5" },
      div(
        { fontFamily: MONO, fontSize: 20, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#40632b" },
        t.tags.join(" · ") || " ",
      ),
      titleBlock(t, { fontSize: t.size(0.92), fontWeight: 400, letterSpacing: "-0.01em", maxWidth: 760 }),
      div(
        { alignSelf: "flex-end", flexDirection: "column", width: 400, padding: "14px 20px", backgroundColor: "#fffdf5", border: "2px solid #bfb291" },
        div({ fontSize: 22, fontWeight: 800, paddingBottom: 6, borderBottom: "1px solid #d9cfb5" }, t.kicker),
        t.meta && div({ marginTop: 8, fontFamily: MONO, fontSize: 18, fontWeight: 700, color: "#5c5541" }, t.meta),
      ),
    ),
    tape({ left: 200, transform: "rotate(-3deg)" }),
    tape({ right: 200, transform: "rotate(2.5deg)" }),
  )
}

/** Terraced rice fields below the sky, their colours through the year mirrored in the water. */
function paddy(t: Text): Node {
  const ink = "#1d2719"
  const rice = ["#dcae32", "#a9ad35", "#5c9e3c", "#a6d36a"]
  const terrace = (color: string, i: number) =>
    div({
      height: 46,
      marginLeft: -40 + i * 30,
      marginRight: -40 + i * 18,
      marginTop: -14,
      backgroundColor: color,
      borderRadius: "50% 50% 0 0 / 40px 40px 0 0",
    })
  return div(
    {
      width: "100%",
      height: "100%",
      flexDirection: "column",
      backgroundColor: "#eef3e6",
      backgroundImage: "linear-gradient(180deg, #eef3e6 0%, #dbe9e0 100%)",
      fontFamily: SANS,
      color: ink,
    },
    div(
      { flex: 1, flexDirection: "column", padding: "56px 72px 30px" },
      div({ fontSize: 26, fontWeight: 800, color: "#2f6328" }, t.kicker),
      titleBlock(t, { fontSize: t.size(0.92), maxWidth: 1000 }),
      t.meta && div({ fontFamily: MONO, fontSize: 22, fontWeight: 700, color: "#4f5c47" }, t.meta),
    ),
    div({ flexDirection: "column" }, ...rice.map(terrace)),
    // The water: the same fields upside down, paler, under lines of light.
    div(
      { flexDirection: "column", position: "relative", backgroundColor: "#c9dfe0" },
      ...[...rice].reverse().map((color) => div({ height: 16, backgroundColor: color, opacity: 0.45 })),
      div({
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        backgroundImage:
          "repeating-linear-gradient(0deg, rgba(255,255,255,0) 0px, rgba(255,255,255,0) 6px, rgba(255,255,255,0.75) 6px, rgba(255,255,255,0.75) 8px)",
      }),
    ),
  )
}

/** A screen of phosphor: the title after a prompt, a cursor after it. */
function terminal(t: Text, spec: CardSpec): Node {
  const glow = spec.accent
  return div(
    {
      width: "100%",
      height: "100%",
      flexDirection: "column",
      padding: "56px 72px",
      backgroundColor: SCREEN,
      backgroundImage:
        "repeating-linear-gradient(0deg, rgba(255,255,255,0) 0px, rgba(255,255,255,0) 3px, rgba(255,255,255,0.04) 3px, rgba(255,255,255,0.04) 4px)",
      fontFamily: MONO,
      fontWeight: 700,
      color: glow,
    },
    div({ fontSize: 26, opacity: 0.75 }, `${t.kicker.toLowerCase().replace(/\s+/g, "-")}:~$ cat note.md`),
    div(
      { flex: 1, alignItems: "center" },
      div(
        { flexWrap: "wrap", alignItems: "flex-end", fontSize: t.size(0.78), lineHeight: 1.15 },
        `$ ${t.title}`,
        div({ width: t.size(0.42), height: t.size(0.78), marginLeft: 12, backgroundColor: glow }),
      ),
    ),
    t.meta && div({ fontSize: 24, opacity: 0.75 }, `# ${t.meta}`),
    tagRow(t, () => ({ padding: "2px 10px", border: `2px dashed ${glow}`, fontSize: 20 }), "#"),
  )
}

/** Blue drawing paper with its grid, the note in the title block of the drawing. */
function blueprint(t: Text): Node {
  const line = "rgba(255,255,255,0.14)"
  return div(
    {
      width: "100%",
      height: "100%",
      padding: 36,
      backgroundColor: "#0e3a72",
      backgroundImage: `linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, transparent 1px)`,
      backgroundSize: "40px 40px",
      fontFamily: SANS,
      color: "#fff",
    },
    div(
      { flex: 1, flexDirection: "column", padding: "40px 48px", border: "3px solid #fff" },
      div({ fontFamily: MONO, fontSize: 20, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#bcd6f5" }, t.tags.join(" / ") || " "),
      titleBlock(t, { fontSize: t.size(0.92), maxWidth: 820 }),
      div(
        { alignSelf: "flex-end", flexDirection: "column", width: 520, border: "3px solid #fff", fontFamily: MONO, fontWeight: 700, fontSize: 20 },
        div({ padding: "8px 14px", borderBottom: "3px solid #fff" }, t.kicker.toUpperCase()),
        div({ padding: "8px 14px", color: "#bcd6f5" }, t.meta || " "),
      ),
    ),
  )
}

/** Black lacquer framed in gold leaf, the kicker in vermilion. */
function lacquer(t: Text): Node {
  const gold = "#d4a94f"
  return div(
    {
      width: "100%",
      height: "100%",
      padding: 30,
      backgroundColor: "#120b08",
      backgroundImage: "radial-gradient(circle at 12% 0%, rgba(210,68,44,0.28), rgba(210,68,44,0) 60%)",
      fontFamily: SANS,
      color: "#f1e7d3",
    },
    div(
      { flex: 1, padding: 10, border: `2px solid ${gold}` },
      div(
        { flex: 1, flexDirection: "column", alignItems: "center", padding: "40px 64px", border: `1px solid ${gold}`, textAlign: "center" },
        div({ fontSize: 26, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: "#e8553c" }, t.kicker),
        titleBlock(t, { fontSize: t.size(0.92), fontWeight: 400, justifyContent: "center" }),
        div(
          { alignItems: "center", gap: 18, color: gold, fontSize: 22 },
          div({ width: 160, height: 2, backgroundColor: gold }),
          // The lozenge at the heart of the gold rule; the bundled fonts have no ◆.
          div({ width: 14, height: 14, backgroundColor: gold, transform: "rotate(45deg)" }),
          div({ width: 160, height: 2, backgroundColor: gold }),
        ),
        t.meta && div({ marginTop: 18, fontSize: 24, color: "#b4a58b" }, t.meta),
      ),
    ),
  )
}

/** The front page: a masthead between heavy rules, the note as its headline. */
function broadsheet(t: Text): Node {
  const ink = "#141311"
  return div(
    { width: "100%", height: "100%", flexDirection: "column", padding: "40px 64px", backgroundColor: "#f4f1ea", fontFamily: SANS, color: ink },
    div({ justifyContent: "center", paddingBottom: 10, borderBottom: `6px solid ${ink}`, fontSize: 64, fontWeight: 800, letterSpacing: "-0.02em" }, t.kicker),
    div(
      {
        justifyContent: "space-between",
        padding: "8px 0",
        borderBottom: `2px solid ${ink}`,
        fontFamily: MONO,
        fontSize: 18,
        fontWeight: 700,
        textTransform: "uppercase",
      },
      div({}, t.meta || " "),
      div({}, t.tags.join(" · ")),
    ),
    titleBlock(t, { fontSize: t.size(0.95), letterSpacing: "-0.025em" }),
    div(
      { gap: 28, height: 70 },
      ...[0, 1, 2].map(() =>
        div(
          { flex: 1, flexDirection: "column", gap: 12, borderTop: `2px solid ${ink}`, paddingTop: 14 },
          div({ height: 8, backgroundColor: "#c9c3b5" }),
          div({ height: 8, width: "70%", backgroundColor: "#c9c3b5" }),
        ),
      ),
    ),
  )
}

/** A book page: the title in its text column, the note's details as a sidenote in the margin. */
function manuscript(t: Text): Node {
  const ink = "#111"
  return div(
    { width: "100%", height: "100%", padding: "72px 72px 72px 96px", backgroundColor: "#fffff8", fontFamily: SANS, color: ink },
    div(
      { flex: 1, flexDirection: "column", paddingRight: 48, borderRight: "1px solid #d8d4c4" },
      div({ fontSize: 24, letterSpacing: "0.14em", textTransform: "uppercase", color: "#555" }, t.kicker),
      titleBlock(t, { fontSize: t.size(0.95), fontWeight: 400, letterSpacing: "-0.01em", lineHeight: 1.12 }),
    ),
    div(
      { width: 280, flexDirection: "column", justifyContent: "flex-end", paddingLeft: 32, fontSize: 22, color: "#555", lineHeight: 1.4 },
      div({ fontSize: 30, color: "#a00000" }, "¹"),
      t.meta && div({}, t.meta),
      ...t.tags.map((tag) => div({ fontSize: 20 }, tag)),
    ),
  )
}

/** A print on the wall at night, between two strips of film. */
function darkroom(t: Text): Node {
  const strip = () =>
    div(
      { height: 46, alignItems: "center", justifyContent: "space-around", backgroundColor: "#1c1c1c" },
      ...Array.from({ length: 22 }, () => div({ width: 26, height: 18, borderRadius: 4, backgroundColor: "#0b0b0b" })),
    )
  return div(
    { width: "100%", height: "100%", flexDirection: "column", backgroundColor: "#0b0b0b", fontFamily: SANS, color: "#eee" },
    strip(),
    div(
      { flex: 1, padding: "34px 80px" },
      div(
        { flex: 1, flexDirection: "column", padding: "30px 44px", border: "14px solid #f4f2ee", backgroundColor: "#181818" },
        div({ fontFamily: MONO, fontSize: 20, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#a8a8a8" }, t.kicker),
        titleBlock(t, { fontSize: t.size(0.86), fontWeight: 400 }),
        t.meta && div({ fontFamily: MONO, fontSize: 20, fontWeight: 700, color: "#a8a8a8" }, t.meta),
      ),
    ),
    strip(),
  )
}

/** The page of an e-reader: black on grey, large type, the place in the book at its foot. */
function eink(t: Text): Node {
  const ink = "#111"
  return div(
    { width: "100%", height: "100%", padding: 40, backgroundColor: "#d6d6d6", fontFamily: SANS, color: ink },
    div(
      { flex: 1, flexDirection: "column", padding: "48px 64px 32px", backgroundColor: "#f4f4f4", border: `4px solid ${ink}`, borderRadius: 18 },
      div({ fontSize: 26, color: "#4d4d4d" }, t.kicker),
      titleBlock(t, { fontSize: t.size(0.95), fontWeight: 800 }),
      t.meta && div({ fontSize: 26, color: "#2b2b2b" }, t.meta),
      // How far through the book: the start, as a card opens on the first page.
      div({ marginTop: 22, height: 6, backgroundColor: "#c8c8c8" }, div({ width: "12%", backgroundColor: ink })),
    ),
  )
}

/** A photocopied zine: the title on a cut-out strip held by tape, pasted boxes askew, grain over all. */
function zine(t: Text): Node {
  const ink = "#141414"
  return div(
    {
      width: "100%",
      height: "100%",
      flexDirection: "column",
      padding: "56px 72px",
      backgroundColor: "#ecebe6",
      // The photocopier's grain: specks of toner in two sizes.
      backgroundImage: "radial-gradient(rgba(20,20,20,0.10) 1px, transparent 1px), radial-gradient(rgba(20,20,20,0.06) 1.5px, transparent 1.5px)",
      backgroundSize: "7px 7px, 13px 13px",
      fontFamily: SANS,
      color: ink,
    },
    div(
      {
        alignSelf: "flex-start",
        padding: "6px 18px",
        backgroundColor: "#b8174a",
        color: "#fff",
        fontFamily: MONO,
        fontSize: 24,
        fontWeight: 700,
        textTransform: "uppercase",
        transform: "rotate(-2deg)",
      },
      t.kicker,
    ),
    div(
      { flex: 1, alignItems: "center", position: "relative" },
      div(
        {
          maxWidth: 980,
          padding: "18px 30px",
          backgroundColor: "#fff0a0",
          boxShadow: `6px 7px 0 ${ink}`,
          fontSize: t.size(0.9),
          fontWeight: 800,
          lineHeight: 1.08,
          transform: "rotate(-1.5deg)",
        },
        t.title,
      ),
      div({ position: "absolute", top: 46, left: -24, width: 130, height: 34, backgroundColor: "rgba(236,226,178,0.85)", transform: "rotate(-24deg)" }),
    ),
    div(
      { gap: 16, alignItems: "center" },
      t.meta && div({ padding: "6px 14px", backgroundColor: "#d3e4ff", fontFamily: MONO, fontSize: 20, fontWeight: 700, transform: "rotate(1deg)" }, t.meta),
      ...t.tags.map((tag, i) =>
        div(
          {
            padding: "4px 10px",
            backgroundColor: ["#ffd6e4", "#d8f0d0"][i % 2],
            fontFamily: MONO,
            fontSize: 18,
            fontWeight: 700,
            transform: `rotate(${i % 2 ? 2 : -2}deg)`,
          },
          tag,
        ),
      ),
    ),
  )
}

/** A sheet of an old atlas: contour lines under the text, a compass rose, the region lettered above the title. */
function atlas(t: Text): Node {
  const brown = "#7a5a24"
  const contour = (size: number, top: number, left: number) =>
    div({
      position: "absolute",
      top: top - size / 2,
      left: left - size * 0.65,
      width: size * 1.3,
      height: size,
      borderRadius: "50%",
      border: `2px solid rgba(122,90,36,0.22)`,
    })
  return div(
    { width: "100%", height: "100%", position: "relative", padding: "64px 80px", backgroundColor: "#eadcb8", fontFamily: SANS, color: "#2b2214" },
    ...[340, 260, 180, 100].map((size) => contour(size, 470, 980)),
    ...[300, 210, 120].map((size) => contour(size, 90, 160)),
    // The compass rose: a ring, its needle and the north it points to.
    div(
      {
        position: "absolute",
        top: 48,
        right: 64,
        width: 120,
        height: 150,
        flexDirection: "column",
        alignItems: "center",
        color: brown,
        fontFamily: MONO,
        fontSize: 22,
        fontWeight: 700,
      },
      "N",
      div(
        {
          position: "relative",
          width: 110,
          height: 110,
          marginTop: 6,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 999,
          border: `3px solid ${brown}`,
        },
        div({ position: "absolute", width: 12, height: 96, borderRadius: 999, backgroundColor: "#8c3410" }),
        div({ position: "absolute", width: 8, height: 70, borderRadius: 999, backgroundColor: brown, transform: "rotate(90deg)" }),
      ),
    ),
    div(
      { flex: 1, flexDirection: "column", maxWidth: 900 },
      div({ fontSize: 26, fontWeight: 800, letterSpacing: "0.3em", textTransform: "uppercase", color: "#8c3410" }, t.region ?? t.kicker),
      titleBlock(t, { fontSize: t.size(0.95), fontWeight: 400, letterSpacing: "-0.01em" }),
      div({ height: 2, width: 260, backgroundColor: brown, marginBottom: 16 }),
      t.meta && div({ fontFamily: MONO, fontSize: 22, fontWeight: 700, color: "#5e4d30" }, t.meta),
      t.region && div({ marginTop: 6, fontSize: 22, color: "#5e4d30" }, t.kicker),
    ),
  )
}

/** A typed card of a library catalogue: its call number, a red rule, the hole punched for the drawer's rod. */
function catalog(t: Text): Node {
  const ink = "#1f1d1a"
  return div(
    { width: "100%", height: "100%", padding: "40px 90px", backgroundColor: "#e4d6bb", fontFamily: MONO, fontWeight: 700, color: ink },
    div(
      {
        flex: 1,
        flexDirection: "column",
        position: "relative",
        padding: "34px 48px 70px",
        backgroundColor: "#fdfaf1",
        border: "1px solid #d9ceb6",
        boxShadow: "0 10px 24px rgba(60,40,10,0.25)",
        // The faint ruled lines of a printed card.
        backgroundImage:
          "repeating-linear-gradient(180deg, rgba(43,88,133,0) 0px, rgba(43,88,133,0) 43px, rgba(43,88,133,0.14) 43px, rgba(43,88,133,0.14) 44px)",
      },
      div(
        { justifyContent: "space-between", fontSize: 24, paddingBottom: 10, borderBottom: "4px solid #c0392b" },
        div({ color: "#9e2a20" }, t.callNumber ?? t.logo),
        div({ color: "#5b554a" }, t.kicker),
      ),
      titleBlock(t, { fontFamily: SANS, fontSize: t.size(0.86), fontWeight: 400, letterSpacing: "-0.01em" }),
      t.meta && div({ fontSize: 22, color: "#3a3630" }, t.meta),
      t.tags.length > 0 && div({ marginTop: 10, fontSize: 20, color: "#5b554a" }, t.tags.map((tag, i) => `${i + 1}. ${tag}`).join("   ")),
      // The hole at the foot of the card.
      div({ position: "absolute", bottom: 18, left: 494, width: 34, height: 34, borderRadius: 999, backgroundColor: "#e4d6bb", border: "2px solid #c9b994" }),
    ),
  )
}

/** Any other style: a white card in the style's accent, or theme.accent. */
function plain(t: Text, spec: CardSpec): Node {
  const ink = "#1d1b17"
  return div(
    { width: "100%", height: "100%", backgroundColor: "#fff", fontFamily: SANS, color: ink },
    div({ width: 28, backgroundColor: spec.accent }),
    div(
      { flex: 1, flexDirection: "column", padding: "56px 72px" },
      div(
        { alignItems: "center", gap: 18 },
        div(
          {
            width: 60,
            height: 60,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 12,
            backgroundColor: spec.accent,
            color: spec.onAccent,
            fontSize: 34,
            fontWeight: 800,
          },
          t.logo,
        ),
        div({ fontSize: 28, fontWeight: 800, color: spec.accent }, t.kicker),
      ),
      titleBlock(t, { fontSize: t.size() }),
      t.meta && div({ fontFamily: MONO, fontSize: 22, fontWeight: 700, color: "#5f5a50" }, t.meta),
      tagRow(t, () => ({ border: `2px solid ${spec.accent}`, borderRadius: 8, color: spec.accent })),
    ),
  )
}

const DRAW: Record<CardDesign, (t: Text, spec: CardSpec) => Node> = {
  notebook,
  classic,
  garden,
  herbarium,
  paddy,
  terminal,
  blueprint,
  lacquer,
  broadsheet,
  manuscript,
  darkroom,
  eink,
  zine,
  atlas,
  catalog,
  plain,
}

/** A 1200×630 social card in the design of `spec` (a notebook index card by default), as a PNG. */
export async function renderOg(card: OgCard, spec: CardSpec = cardSpec("notebook")): Promise<Buffer> {
  return toPng(DRAW[spec.design](textOf(card), spec), 1200, 630)
}

async function toPng(tree: Node, width: number, height: number): Promise<Buffer> {
  const svg = await satori(tree as unknown as Parameters<typeof satori>[0], { width, height, fonts: loadFonts() })
  // Satori already turned text into paths; scanning system fonts would dominate the render time.
  // Rendered off the main thread, so pages built concurrently rasterize their cards in parallel.
  const png = await renderAsync(svg, { fitTo: { mode: "width", value: width }, font: { loadSystemFonts: false } })
  return png.asPng()
}

/**
 * A square app icon: the logo on the brand gradient, like the favicon. The
 * logo stays inside the middle 80%, the safe zone of maskable icons.
 */
export function renderIcon(logo: string, size: number): Promise<Buffer> {
  const tree = div(
    {
      width: "100%",
      height: "100%",
      alignItems: "center",
      justifyContent: "center",
      backgroundImage: "linear-gradient(135deg, #2d6a4f 0%, #4f8f5b 45%, #b5532c 100%)",
      color: "#fff",
      fontFamily: SANS,
      fontSize: Math.round(size * 0.5),
      fontWeight: 800,
    },
    stripEmoji(logo) || "✦",
  )
  return toPng(tree, size, size)
}
