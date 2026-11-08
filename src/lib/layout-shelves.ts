import { site, type Lang } from "../site.config"
import type { Note } from "./vault"
import { formatDate, t } from "./i18n"
import {
  type Collection,
  STATUSES,
  PRESETS,
  normalize,
  plain,
  field,
  dateOf,
  whenOf,
  priorityOf,
  questionOf,
  collectionKindOf,
  episodeNumber,
  type Ref,
} from "./layout-collections"

// ---------- what a note of a collection shows ----------

/** "2021 – 2023", "2024 – now": the years a project ran, from `start` and `end`. */
export function periodOf(n: Note, lang: Lang): string | undefined {
  const fm = n.source.fm
  const year = (v: unknown) => {
    if (v == null || v === "") return undefined
    const text = plain(v)
    const d = new Date(text)
    return /^\d{4}$/.test(text) ? text : Number.isNaN(d.getTime()) ? text : String(d.getUTCFullYear())
  }
  const start = year(fm.start ?? fm.started)
  const end = year(fm.end ?? fm.finished)
  if (!start) return end
  if (!end) return `${start} – ${t(lang).now}`
  return start === end ? start : `${start} – ${end}`
}

/** A rating out of `scale`, from a number or a run of stars. */
export function parseRating(v: unknown, scale: number): number | undefined {
  if (v == null || v === "") return undefined
  const r = typeof v === "number" ? v : /^[★⭐]+$/u.test(String(v)) ? [...String(v)].length : Number(v)
  return Number.isFinite(r) && r > 0 ? Math.min(scale, r) : undefined
}

/** A note's rating out of conventions.ratingScale. */
export function ratingOf(n: Note): number | undefined {
  return parseRating(n.source.fm.rating, site.conventions.ratingScale)
}

/** The status of a note as its collection names it. */
export function statusLabelOf(n: Note, kind: Collection): string | undefined {
  const value = plain(n.source.fm.status)
  if (!value) return undefined
  const known = (STATUSES[kind] ?? []).find(([, , spellings]) => spellings.includes(normalize(value)))
  return known ? t(n.lang)[known[1]] : value
}

/** Links of a note: a talk's `slides`, `video` and `paper`, then `source`, `repo`, `url`, `website`, `demo` and every URL in `links`. */
export function linksOf(n: Note): { label: string; href: string }[] {
  const fm = n.source.fm
  const s = t(n.lang)
  const out: { label: string; href: string }[] = []
  const add = (label: string, v: unknown) => {
    for (const x of Array.isArray(v) ? v : [v]) {
      const href = typeof x === "string" ? x.trim() : ""
      if (/^https?:\/\//.test(href)) out.push({ label: label || new URL(href).hostname.replace(/^www\./, ""), href })
    }
  }
  add(s.linkSlides, fm.slides)
  add(s.linkVideo, fm.video)
  add(s.linkPaper, fm.paper)
  add("", fm.source)
  add("", fm.repo)
  add("", fm.url)
  add("", fm.website)
  add("", fm.demo)
  const links = fm.links
  if (links && typeof links === "object" && !Array.isArray(links)) {
    for (const [label, v] of Object.entries(links as Record<string, unknown>)) add(label, v)
  } else add("", links)
  return out.filter((l, i) => out.findIndex((o) => o.href === l.href) === i)
}

/** A recipe's facts: how long it takes and how many it feeds. */
export function recipeFacts(n: Note): string[] {
  const time = field(n, "time|total_time|duration")
  const servings = field(n, "servings|serves|yield")
  return [time && `⏱ ${time}`, servings && `🍽 ${servings}`].filter(Boolean)
}

/** How far into a course: `progress` as 0–100, "45%" or "3/10", capped at 100. */
export function progressOf(n: Note): { percent: number; label: string } | undefined {
  const text = plain(n.source.fm.progress)
  const part = text.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/)
  if (part && Number(part[2]) > 0) return { percent: Math.min(100, (Number(part[1]) / Number(part[2])) * 100), label: `${part[1]}/${part[2]}` }
  const pct = text.match(/^(\d+(?:\.\d+)?)\s*%?$/)
  if (!pct) return undefined
  const percent = Math.min(100, Number(pct[1]))
  return { percent, label: `${+percent.toFixed(1)}%` }
}

/** Currencies a price may be written with instead of a `currency`. */
const CURRENCY_SIGNS: Record<string, string> = { $: "USD", "€": "EUR", "£": "GBP", "¥": "JPY", "₫": "VND", "₩": "KRW", "₹": "INR" }

/**
 * The price of a wish: `price` as a number or as written ("1,299.50",
 * "1.299,50", "$12"), in `currency` (an ISO code), else the sign it is written with.
 */
export function priceOf(n: Note): { amount: number; currency?: string } | undefined {
  const v = n.source.fm.price
  const text = typeof v === "number" ? String(v) : plain(v)
  const digits = text
    .match(/\d[\d.,\s]*/)?.[0]
    .replace(/\s+/g, "")
    .replace(/[.,]$/, "")
  if (!digits) return undefined
  // The last of a dot or a comma followed by one or two digits is the decimal point; the others group thousands.
  const decimal = digits.match(/[.,](\d{1,2})$/)
  const whole = (decimal ? digits.slice(0, -decimal[0].length) : digits).replace(/[.,]/g, "")
  const amount = Number(decimal ? `${whole}.${decimal[1]}` : whole)
  const sign = Object.keys(CURRENCY_SIGNS).find((c) => text.includes(c))
  const currency = plain(n.source.fm.currency).toUpperCase() || (sign && CURRENCY_SIGNS[sign]) || undefined
  return { amount, currency }
}

/** An amount in a language's way, with its currency when it has one; a code Intl does not know is written after it. */
export function formatPrice(amount: number, currency: string | undefined, lang: Lang): string {
  try {
    return new Intl.NumberFormat(lang, currency ? { style: "currency", currency } : { maximumFractionDigits: 2 }).format(amount)
  } catch {
    return `${amount.toLocaleString(lang)} ${currency}`
  }
}

/** What the head of a note's own page shows when it is an item of a collection, or has a cover. */
export interface Item {
  kind?: Collection
  /** Covers of books, films and shelves stand upright; the others lie wide. */
  upright: boolean
  /** A person's picture is round. */
  round?: boolean
  /** Sound of an episode, played at its head. */
  audio?: string
  byline: string[]
  rating?: number
  status?: string
  /** How far into a course. */
  progress?: { percent: number; label: string }
  /** What answers a question. */
  answer?: Ref
  links: { label: string; href: string }[]
}

/** What a note of a collection is, under its title: its author and year, a project's years, an episode's number… */
function bylineOf(n: Note, kind: Collection | undefined): (string | undefined)[] {
  const preset = kind ? PRESETS[kind] : PRESETS.shelf
  const when = whenOf(n)
  const fm = n.source.fm
  switch (kind) {
    case "projects":
      return [periodOf(n, n.lang), plain(fm.role)]
    case "recipes":
      return recipeFacts(n)
    case "talks":
      return [fm.date != null && when ? formatDate(when, n.lang) : "", ...preset.fields.map((f) => field(n, f))]
    case "places":
      return [field(n, "city|region"), field(n, "country"), fm.visited != null && when ? formatDate(when, n.lang) : ""]
    case "bookmarks": {
      const published = dateOf(fm.published)
      return [field(n, "author|authors|byline"), published ? formatDate(published, n.lang) : ""]
    }
    case "snippets":
      return [field(n, "language")]
    case "episodes":
      return [episodeNumber(n) ? `#${field(n, "number|episode|ep")}` : "", formatDate(when, n.lang), field(n, "duration|length"), field(n, "guests|guest")]
    case "courses":
      return [...preset.fields.map((f) => field(n, f)), periodOf(n, n.lang)]
    case "wishlist": {
      const price = priceOf(n)
      return [price && formatPrice(price.amount, price.currency, n.lang), ...preset.fields.map((f) => field(n, f)), priorityOf(n).label]
    }
    case undefined:
      return ["author|authors|director|creator", "year|published|released"].map((f) => field(n, f))
    default:
      return preset.fields.map((f) => field(n, f))
  }
}

export function itemOf(n: Note): Item | undefined {
  // Reading highlights show the book they come from the same way.
  const highlights = n.layout === "highlights"
  if ((n.layout && !highlights) || n.protected) return undefined
  // A day of a journal keeps the usual page, with its links to the days around it.
  const listedIn = highlights ? undefined : collectionKindOf(n)
  const kind = listedIn === "daily" ? undefined : listedIn
  if (!kind && !n.source.fm.cover && !highlights) return undefined
  const preset = kind ? PRESETS[kind] : PRESETS.shelf
  // Where highlights come from: a URL to link, or a name such as Kindle.
  const source = highlights ? plain(n.source.fm.source) : ""
  const sourceUrl = /^https?:\/\//.test(source)
  const question = kind === "questions" ? questionOf(n) : undefined
  const certificate = kind === "courses" && n.certificate ? [{ label: t(n.lang).certificate, href: n.certificate.href }] : []
  return {
    kind,
    upright: preset.look === "shelf",
    round: kind === "people" || undefined,
    audio: kind === "episodes" ? n.audio?.href : undefined,
    byline: [...bylineOf(n, kind), sourceUrl ? "" : source].filter((x): x is string => !!x),
    rating: ratingOf(n),
    status: question ? t(n.lang)[question.answered ? "statusAnswered" : "statusOpen"] : kind ? statusLabelOf(n, kind) : plain(n.source.fm.status) || undefined,
    progress: kind === "courses" ? progressOf(n) : undefined,
    answer: question?.answer,
    links: [...(sourceUrl ? [{ label: new URL(source).hostname.replace(/^www\./, ""), href: source }] : []), ...certificate, ...linksOf(n)].filter(
      (l, i, all) => all.findIndex((o) => o.href === l.href) === i,
    ),
  }
}
