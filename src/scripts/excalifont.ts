// As a URL, not a stylesheet import: only pages with a drawing datme drew fetch the font.
import woff2 from "excalifont/fonts/Excalifont-Regular.woff2?url"

/** Excalidraw's other fonts that Google Fonts serves, by the family name drawings use. */
const GOOGLE_FONTS: Record<string, string> = {
  Nunito: "Nunito:wght@400;700",
  "Lilita One": "Lilita+One",
}

/** The fonts of the drawings on the page: Excalifont always, Nunito and Lilita One when used. */
export function loadDrawingFonts(): void {
  if (!("fonts" in document)) return
  if (![...document.fonts].some((f) => f.family === "Excalifont")) {
    const face = new FontFace("Excalifont", `url(${woff2}) format("woff2")`, { display: "swap" })
    document.fonts.add(face)
    void face.load().catch(() => {})
  }
  const used = Object.keys(GOOGLE_FONTS).filter((family) =>
    document.querySelector(`.drawing.generated text[font-family*="${family}"]`),
  )
  if (!used.length || document.querySelector("link[data-drawing-fonts]")) return
  const link = document.createElement("link")
  link.rel = "stylesheet"
  link.href = `https://fonts.googleapis.com/css2?${used.map((f) => `family=${GOOGLE_FONTS[f]}`).join("&")}&display=swap`
  link.dataset.drawingFonts = ""
  document.head.append(link)
}
