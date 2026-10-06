import { site, type Lang, type Stage } from "../site.config"

const strings = {
  "vi-VN": {
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
    readingTime: (n: number) => `${n} phút đọc`,
    words: (n: number) => `${n.toLocaleString("vi-VN")} từ`,
    notesCount: (n: number) => `${n} ghi chú`,
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
  "en-US": {
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
    readingTime: (n: number) => `${n} min read`,
    words: (n: number) => `${n.toLocaleString("en-US")} words`,
    notesCount: (n: number) => `${n} notes`,
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
} satisfies Record<Lang, Record<string, unknown>>

export function t(lang: Lang) {
  return strings[lang]
}

export const langMeta: Record<Lang, { short: string; name: string; html: string }> = {
  "vi-VN": { short: "VI", name: "Tiếng Việt", html: "vi" },
  "en-US": { short: "EN", name: "English", html: "en" },
}

export const stageMeta: Record<Stage, { icon: string; label: Record<Lang, string>; order: number }> = {
  fleeting: { icon: "🌱", order: 1, label: { "vi-VN": "Thoáng qua", "en-US": "Fleeting" } },
  literature: { icon: "📖", order: 2, label: { "vi-VN": "Tài liệu", "en-US": "Literature" } },
  atomic: { icon: "⚛️", order: 3, label: { "vi-VN": "Nguyên tử", "en-US": "Atomic" } },
  permanent: { icon: "🌳", order: 4, label: { "vi-VN": "Vĩnh viễn", "en-US": "Permanent" } },
  structure: { icon: "🗺️", order: 5, label: { "vi-VN": "Cấu trúc", "en-US": "Structure" } },
  reference: { icon: "📚", order: 6, label: { "vi-VN": "Tham khảo", "en-US": "Reference" } },
  project: { icon: "🛠️", order: 7, label: { "vi-VN": "Dự án", "en-US": "Project" } },
}

/** URL prefix of a language: the default language lives at the site root. */
export function langPrefix(lang: Lang): string {
  return lang === site.defaultLang ? "" : `${lang}/`
}

export function formatDate(d: Date | undefined, lang: Lang): string {
  if (!d) return ""
  return d.toLocaleDateString(langMeta[lang].html, { year: "numeric", month: "short", day: "numeric" })
}
