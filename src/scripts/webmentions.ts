/** A webmention as served by webmention.io in JF2. */
export interface Mention {
  "wm-property"?: string
  url?: string
  published?: string | null
  "wm-received"?: string
  author?: { name?: string; photo?: string; url?: string }
  content?: { text?: string }
}

export interface Grouped {
  likes: Mention[]
  reposts: Mention[]
  /** Replies and plain mentions, oldest first. */
  replies: Mention[]
}

/** Split mentions into reactions, shown as a pile of faces, and replies, shown in full. */
export function groupMentions(list: Mention[]): Grouped {
  const out: Grouped = { likes: [], reposts: [], replies: [] }
  const seen = new Set<string>()
  for (const m of list) {
    // The same post often arrives twice, for the URL with and without a trailing slash.
    const id = `${m["wm-property"]}|${m.url}`
    if (seen.has(id)) continue
    seen.add(id)
    const kind = m["wm-property"]
    if (kind === "like-of" || kind === "bookmark-of") out.likes.push(m)
    else if (kind === "repost-of") out.reposts.push(m)
    else if (kind === "in-reply-to" || kind === "mention-of") out.replies.push(m)
  }
  const time = (m: Mention) => Date.parse(m.published ?? m["wm-received"] ?? "") || 0
  out.replies.sort((a, b) => time(a) - time(b))
  return out
}

/** Only web links: an author URL comes from someone else's page. */
const safeUrl = (u: string | undefined) => (u && /^https?:\/\//i.test(u) ? u : undefined)

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text) e.textContent = text
  return e
}

function avatar(m: Mention): HTMLElement {
  const img = el("img", "wm-avatar")
  img.alt = m.author?.name ?? ""
  img.loading = "lazy"
  img.referrerPolicy = "no-referrer"
  const src = safeUrl(m.author?.photo)
  if (src) img.src = src
  const href = safeUrl(m.author?.url) ?? safeUrl(m.url)
  if (!href) return img
  const a = el("a")
  a.href = href
  a.target = "_blank"
  a.rel = "noopener noreferrer nofollow ugc"
  a.title = m.author?.name ?? ""
  a.append(img)
  return a
}

const loaded = new Map<string, Promise<Mention[]>>()

function fetchMentions(target: string): Promise<Mention[]> {
  let hit = loaded.get(target)
  if (!hit) {
    const q = new URLSearchParams([["target[]", target], ["target[]", target + "/"], ["per-page", "200"]])
    hit = fetch(`https://webmention.io/api/mentions.jf2?${q}`)
      .then((r) => (r.ok ? r.json() : { children: [] }))
      .then((feed: { children?: Mention[] }) => feed.children ?? [])
      .catch(() => [])
    loaded.set(target, hit)
  }
  return hit
}

/** Fill the mentions section of a note page; it stays hidden while nobody mentioned the note. */
export async function setupWebmentions(): Promise<void> {
  const section = document.querySelector<HTMLElement>("[data-webmentions]")
  if (!section || section.dataset.bound) return
  section.dataset.bound = "1"
  const { likes, reposts, replies } = groupMentions(await fetchMentions(section.dataset.webmentions!))
  if (!likes.length && !reposts.length && !replies.length) return
  const lang = document.documentElement.lang

  const pile = section.querySelector(".wm-pile")!
  for (const [list, template] of [
    [likes, section.dataset.likes!],
    [reposts, section.dataset.reposts!],
  ] as const) {
    if (!list.length) continue
    const faces = el("span", "wm-faces")
    faces.append(...list.slice(0, 24).map(avatar))
    pile.append(faces, el("span", undefined, template.replace("{n}", list.length.toLocaleString(lang))))
  }

  const ul = section.querySelector(".wm-list")!
  for (const m of replies) {
    const li = el("li", "wm-item")
    const meta = el("div", "wm-meta")
    const name = el("a", undefined, m.author?.name || new URL(safeUrl(m.url) ?? location.href).host)
    const href = safeUrl(m.url)
    if (href) {
      name.href = href
      name.target = "_blank"
      name.rel = "noopener noreferrer nofollow ugc"
    }
    const verb = m["wm-property"] === "in-reply-to" ? section.dataset.replied! : section.dataset.mentioned!
    meta.append(name, ` ${verb}`)
    const date = m.published ?? m["wm-received"]
    if (date && !Number.isNaN(Date.parse(date))) {
      meta.append(" · ", new Date(date).toLocaleDateString(lang, { year: "numeric", month: "short", day: "numeric" }))
    }
    li.append(avatar(m), meta)
    const text = m.content?.text?.trim()
    if (text) li.append(el("p", "wm-text", text.length > 500 ? text.slice(0, 499) + "…" : text))
    ul.append(li)
  }
  section.hidden = false
}
