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
    featured: "Nổi bật",
    archive: "Lưu trữ",
    related: "Ghi chú liên quan",
    unlinkedMentions: "Nhắc tới mà chưa liên kết",
    sharedLinks: "{n} liên kết chung",
    untranslated: "Ghi chú này chưa được dịch sang {lang}, bạn đang đọc bản gốc.",
    readOriginal: "Mở bản gốc",
    stackMode: "Mở ghi chú cạnh nhau",
    activity: "Hoạt động",
    activityCount: "{n} lần gieo hoặc tưới",
    archiveLead: "Mọi ghi chú, theo năm được gieo.",
    canvasFit: "Vừa khung",
    notPublished: "Chưa xuất bản",
    dvEmpty: "Truy vấn không có kết quả nào trong các ghi chú công khai.",
    dvUnsupported: "Truy vấn động chỉ xem được trong Obsidian",
    dvFile: "Ghi chú",
    toggleLeft: "Ẩn/hiện cột trái",
    toggleRight: "Ẩn/hiện cột phải",
    allFolders: "Mọi thư mục",
    allTypes: "Mọi loại",
    allTagsFilter: "Mọi thẻ",
    locked: "Ghi chú này được bảo vệ bằng mật khẩu.",
    password: "Mật khẩu",
    unlock: "Mở khoá",
    wrongPassword: "Sai mật khẩu, thử lại nhé.",
    latest: "Mới nhất trước",
    stagesTitle: "Các tầng ghi chú",
    transcludeFrom: "Trích từ",
    navigate: "di chuyển",
    open: "mở",
    close: "đóng",
    mentions: "Được nhắc đến",
    likes: "{n} lượt thích",
    reposts: "{n} lượt chia sẻ",
    mentionReplied: "đã trả lời",
    mentionMentioned: "đã nhắc đến",
    showAnswer: "Bấm để xem đáp án",
    practiceStart: "🧠 Ôn tập {n} thẻ",
    practiceShow: "Hiện đáp án",
    practiceAgain: "Chưa nhớ",
    practiceGood: "Đã nhớ",
    practiceDone: "Xong! Bạn đã nhớ {n} thẻ. Hẹn gặp lại lần ôn sau.",
    seriesPart: "Phần {n}/{total} của",
    seriesPrev: "Phần trước",
    previous: "Trước",
    sharePassage: "🔗 Chép link đoạn này",
    minutesLeft: "còn {n} phút",
    prefs: "Tuỳ chọn đọc",
    randomNote: "Một ghi chú ngẫu nhiên",
    archivedLink: "Bản lưu trữ, vì trang gốc không còn",
    prefsSize: "Cỡ chữ",
    prefsLegible: "Phông dễ đọc",
    prefsContrast: "Tương phản cao",
    graphColorBy: "Tô màu",
    graphColorNone: "không",
    graphColorType: "loại",
    graphTime: "Theo thời gian",
    references: "Tài liệu tham khảo",
    timeline: "Dòng thời gian",
    timelineLead: "Những sự kiện trong khu vườn, theo thứ tự thời gian.",
    bce: "{n} TCN",
    map: "Bản đồ",
    mapLead: "Những nơi chốn được nhắc tới trong khu vườn.",
    next: "Sau",
    seriesNext: "Phần sau",
    recentChanges: "Mới chăm sóc",
    recentChangesLead: "Những ghi chú vừa được gieo hoặc tưới, mới nhất trước.",
    changeNew: "mới gieo",
    changeUpdated: "vừa tưới",
    offline: "Bạn đang ngoại tuyến",
    offlineLead: "Trang này chưa được lưu để đọc ngoại tuyến. Những ghi chú bạn đã mở vẫn đọc được.",
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
    featured: "Featured",
    archive: "Archive",
    related: "Related notes",
    unlinkedMentions: "Unlinked mentions",
    sharedLinks: "{n} shared links",
    untranslated: "This note has not been translated into {lang} yet; you are reading the original.",
    readOriginal: "Open the original",
    stackMode: "Open notes side by side",
    activity: "Activity",
    activityCount: "{n} notes planted or watered",
    archiveLead: "Every note, by the year it was planted.",
    canvasFit: "Fit to view",
    notPublished: "Not published",
    dvEmpty: "This query has no results among the published notes.",
    dvUnsupported: "Dynamic view, only available in Obsidian",
    dvFile: "Note",
    toggleLeft: "Toggle left sidebar",
    toggleRight: "Toggle right sidebar",
    allFolders: "All folders",
    allTypes: "All types",
    allTagsFilter: "All tags",
    locked: "This note is protected by a password.",
    password: "Password",
    unlock: "Unlock",
    wrongPassword: "Wrong password, try again.",
    latest: "Newest first",
    stagesTitle: "Note stages",
    transcludeFrom: "From",
    navigate: "navigate",
    open: "open",
    close: "close",
    mentions: "Mentions",
    likes: "{n} likes",
    reposts: "{n} reposts",
    mentionReplied: "replied",
    mentionMentioned: "mentioned this",
    showAnswer: "Click to show the answer",
    practiceStart: "🧠 Practice {n} cards",
    practiceShow: "Show answer",
    practiceAgain: "Again",
    practiceGood: "Got it",
    practiceDone: "Done! You remembered {n} cards. See you at the next review.",
    seriesPart: "Part {n} of {total} in",
    seriesPrev: "Previous part",
    previous: "Previous",
    sharePassage: "🔗 Copy link to passage",
    minutesLeft: "{n} min left",
    prefs: "Reading preferences",
    randomNote: "A random note",
    archivedLink: "Archived copy, the original is gone",
    prefsSize: "Text size",
    prefsLegible: "Legible font",
    prefsContrast: "High contrast",
    graphColorBy: "Colour",
    graphColorNone: "none",
    graphColorType: "type",
    graphTime: "Over time",
    references: "References",
    timeline: "Timeline",
    timelineLead: "Events of the garden, in the order they happened.",
    bce: "{n} BCE",
    map: "Map",
    mapLead: "Places the garden talks about.",
    next: "Next",
    seriesNext: "Next part",
    recentChanges: "Recently changed",
    recentChangesLead: "Notes planted or watered lately, newest first.",
    changeNew: "new",
    changeUpdated: "updated",
    offline: "You are offline",
    offlineLead: "This page was not saved for offline reading. The notes you already opened still work.",
  },
} satisfies Record<string, Record<string, string>>

export type StringKey = keyof (typeof builtin)["en"]
const COUNTED = ["readingTime", "words", "notesCount", "activityCount", "sharedLinks", "seriesPart"] as const
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
/** Languages written from right to left, by base tag. */
const RTL = new Set(["ar", "he", "fa", "ur", "ps", "yi", "dv", "ckb", "sd", "ug"])

/** Writing direction of a language, for the dir attribute. */
export function langDir(lang: Lang): "rtl" | "ltr" {
  return RTL.has(lang.split("-")[0].toLowerCase()) ? "rtl" : "ltr"
}

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
