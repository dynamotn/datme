import { site, type Lang } from "../site.config"

/** Built-in UI strings by base language; "{n}" is replaced by a number. */
const builtin = {
  vi: {
    search: "Tìm kiếm",
    searchPlaceholder: "Tìm ghi chú, thẻ, ý tưởng…",
    searchEmpty: "Không tìm thấy gì",
    searchHint: "để mở tìm kiếm",
    graph: "Đồ thị",
    globalGraph: "Đồ thị toàn cục",
    toc: "Mục lục",
    backlinks: "Liên kết ngược",
    noBacklinks: "Chưa có ghi chú nào trỏ tới đây",
    explorer: "Khám phá",
    tags: "Thẻ",
    links: "liên kết",
    allTags: "Tất cả thẻ",
    created: "Tạo",
    updated: "Cập nhật",
    readingTime: "{n} phút đọc",
    words: "{n} từ",
    notesCount: "{n} ghi chú",
    notes: "ghi chú",
    folder: "Thư mục",
    tag: "Thẻ",
    home: "Trang chủ",
    blog: "Bài viết",
    blogLead: "Những bài viết dài hơn, được viết cho người khác đọc.",
    recent: "Mới chăm sóc",
    recentLead: "Những ghi chú vừa được tưới nước gần đây.",
    maps: "Bản đồ nội dung",
    mapsLead: "Các điểm vào để lạc lối trong khu vườn.",
    garden: "Khu vườn",
    gardenLead: "Mỗi ghi chú lớn lên theo phương pháp Zettelkasten.",
    welcome: "Lời chào",
    readerMode: "Chế độ đọc",
    theme: "Giao diện sáng/tối",
    language: "Ngôn ngữ",
    menu: "Mục lục khu vườn",
    properties: "Thuộc tính",
    aliases: "Tên khác",
    notFound: "Không tìm thấy trang",
    notFoundLead: "Hạt giống này chưa được gieo, hoặc đã được chuyển đi nơi khác.",
    backHome: "Về trang chủ",
    rss: "RSS",
    copy: "Sao chép",
    copied: "Đã sao chép",
    redirecting: "Đang chuyển hướng…",
    seeAll: "Xem tất cả",
    transcludeFrom: "Trích từ",
    navigate: "di chuyển",
    open: "mở",
    close: "đóng",
  },
  en: {
    search: "Search",
    searchPlaceholder: "Search notes, tags, ideas…",
    searchEmpty: "Nothing found",
    searchHint: "to search",
    graph: "Graph",
    globalGraph: "Global graph",
    toc: "On this page",
    backlinks: "Backlinks",
    noBacklinks: "No notes link here yet",
    explorer: "Explorer",
    tags: "Tags",
    links: "links",
    allTags: "All tags",
    created: "Created",
    updated: "Updated",
    readingTime: "{n} min read",
    words: "{n} words",
    notesCount: "{n} notes",
    notes: "notes",
    folder: "Folder",
    tag: "Tag",
    home: "Home",
    blog: "Writing",
    blogLead: "Longer pieces, written for other people to read.",
    recent: "Recently tended",
    recentLead: "Notes that were watered most recently.",
    maps: "Maps of content",
    mapsLead: "Entry points for getting lost in the garden.",
    garden: "The garden",
    gardenLead: "Every note grows through the Zettelkasten stages.",
    welcome: "Welcome",
    readerMode: "Reader mode",
    theme: "Toggle theme",
    language: "Language",
    menu: "Garden explorer",
    properties: "Properties",
    aliases: "Aliases",
    notFound: "Page not found",
    notFoundLead: "This seed has not been planted yet, or it moved somewhere else.",
    backHome: "Back home",
    rss: "RSS",
    copy: "Copy",
    copied: "Copied",
    redirecting: "Redirecting…",
    seeAll: "See all",
    transcludeFrom: "From",
    navigate: "navigate",
    open: "open",
    close: "close",
  },
} satisfies Record<string, Record<string, string>>

export type StringKey = keyof (typeof builtin)["en"]
const COUNTED = ["readingTime", "words", "notesCount"] as const
type Counted = (typeof COUNTED)[number]
export type Strings = Record<Exclude<StringKey, Counted>, string> & Record<Counted, (n: number) => string>

const cache = new Map<Lang, Strings>()

/**
 * UI strings for a language: the built-in set of its base language (English
 * when there is none), overridden by the `strings` section of datme.yaml.
 */
export function t(lang: Lang): Strings {
  let hit = cache.get(lang)
  if (!hit) {
    const base = lang.split("-")[0] as keyof typeof builtin
    const merged: Record<string, string> = { ...builtin.en, ...(builtin[base] ?? {}), ...(site.strings[lang] ?? {}) }
    const out: Record<string, unknown> = { ...merged }
    for (const key of COUNTED) {
      const template = merged[key]
      out[key] = (n: number) => template.replace("{n}", n.toLocaleString(lang))
    }
    hit = out as Strings
    cache.set(lang, hit)
  }
  return hit
}

/** Short code, native name and HTML tag of a language. */
export function langMeta(lang: Lang): { short: string; name: string; html: string } {
  let name = lang
  try {
    name = new Intl.DisplayNames([lang], { type: "language" }).of(lang.split("-")[0]) ?? lang
  } catch {
    // unknown tag: show it as is
  }
  return { short: lang.split("-")[0].toUpperCase(), name: name.charAt(0).toUpperCase() + name.slice(1), html: lang }
}

/** URL prefix of a language: the default language lives at the site root. */
export function langPrefix(lang: Lang): string {
  return lang === site.defaultLang ? "" : `${lang}/`
}

export function formatDate(d: Date | undefined, lang: Lang): string {
  if (!d) return ""
  return d.toLocaleDateString(lang, { year: "numeric", month: "short", day: "numeric" })
}
