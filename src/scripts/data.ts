export interface IndexNote {
  u: string
  t: string
  a: string[]
  g: string[]
  /** Icon of the note's stage, if any. */
  s: string | null
  f: string
  d: string
  c: string
}
export interface ContentIndex {
  notes: IndexNote[]
  links: [number, number][]
}

const cache = new Map<string, Promise<ContentIndex>>()

export function loadIndex(lang: string): Promise<ContentIndex> {
  let hit = cache.get(lang)
  if (!hit) {
    hit = fetch(`/static/contentIndex.${lang}.json`).then((r) => r.json())
    cache.set(lang, hit)
  }
  return hit
}

/** Compare URL paths regardless of percent-encoding and trailing slashes. */
export function samePath(a: string, b: string): boolean {
  const norm = (p: string) => {
    try {
      p = decodeURIComponent(p)
    } catch {
      // keep as is
    }
    return p.replace(/\/+$/, "") || "/"
  }
  return norm(a) === norm(b)
}

export const currentLang = () => document.documentElement.dataset.lang ?? "vi-VN"
