export interface IndexNote {
  u: string
  t: string
  a: string[]
  g: string[]
  /** Top-level folder of the note, "" at the vault root. */
  p: string
  /** Types from tags like type/book. */
  y: string[]
  /** Icon of the note's stage, if any. */
  s: string | null
  f: string
  d: string
  c: string
  /** Day the note was created, in days since 1970; null when unknown. */
  k?: number | null
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

export interface NoteFilter {
  folder?: string
  type?: string
  tag?: string
}

/** Whether a note passes every set filter; a tag also matches its nested tags. */
export function matchesFilter(n: IndexNote, f: NoteFilter): boolean {
  if (f.folder && n.p !== f.folder) return false
  if (f.type && !n.y.includes(f.type)) return false
  if (f.tag && !n.g.some((g) => g === f.tag || g.startsWith(f.tag + "/"))) return false
  return true
}

/** Current values of the filter selects of a dialog. */
export function readFilters(root: ParentNode): NoteFilter {
  const value = (kind: string) => root.querySelector<HTMLSelectElement>(`select[data-filter="${kind}"]`)?.value || undefined
  return { folder: value("folder"), type: value("type"), tag: value("tag") }
}
