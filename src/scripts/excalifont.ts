// As a URL, not a stylesheet import: only pages with a drawing datme drew fetch the font.
import woff2 from "excalifont/fonts/Excalifont-Regular.woff2?url"

/** Excalidraw's hand-drawn font, for the labels of drawings drawn at build time. */
export function loadExcalifont(): void {
  if (!("fonts" in document) || [...document.fonts].some((f) => f.family === "Excalifont")) return
  const face = new FontFace("Excalifont", `url(${woff2}) format("woff2")`, { display: "swap" })
  document.fonts.add(face)
  void face.load().catch(() => {})
}
