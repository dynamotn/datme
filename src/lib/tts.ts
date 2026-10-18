import type { Note } from "./vault"
import type { TtsConfig } from "../site.config"

export function ttsModel(lang: string, tts: TtsConfig): "vieneu" | undefined {
  return tts.models[lang] ?? tts.models[lang.split("-")[0]]
}

export function ttsSelected(n: Note, tts: TtsConfig): boolean {
  if (n.protected) return false
  const dir = n.source.dir
  if (tts.folders.some((f) => dir === f || dir.startsWith(f + "/"))) return true
  return Object.entries(tts.frontmatter).some(([key, want]) => {
    if (key === "tags") {
      const w = String(want)
      return n.tags.some((t) => t === w || t.startsWith(w + "/"))
    }
    const have = n.source.fm[key]
    return Array.isArray(have) ? have.includes(want) : have === want
  })
}
