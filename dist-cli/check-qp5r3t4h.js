// src/site.config.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { load as loadYaml } from "js-yaml";
import { z } from "astro/zod";
var CONFIG_FILES = ["datme.yaml", "datme.yml", ".datme.yaml"];
var DEFAULT_IGNORE = [".git", ".obsidian", ".trash", "node_modules", "private", "templates"];
var STAGE_PRESETS = {
  fleeting: { icon: "\uD83C\uDF31", label: { "vi-VN": "Thoáng qua", "en-US": "Fleeting" } },
  literature: { icon: "\uD83D\uDCD6", label: { "vi-VN": "Tài liệu", "en-US": "Literature" } },
  atomic: { icon: "⚛️", label: { "vi-VN": "Nguyên tử", "en-US": "Atomic" } },
  permanent: { icon: "\uD83C\uDF33", label: { "vi-VN": "Vĩnh viễn", "en-US": "Permanent" } },
  structure: { icon: "\uD83D\uDDFA️", label: { "vi-VN": "Cấu trúc", "en-US": "Structure" } },
  reference: { icon: "\uD83D\uDCDA", label: { "vi-VN": "Tham khảo", "en-US": "Reference" } },
  project: { icon: "\uD83D\uDEE0️", label: { "vi-VN": "Dự án", "en-US": "Project" } }
};
var localized = z.union([z.string(), z.record(z.string(), z.string())]);
var DEFAULT_TYPES = {
  article: "\uD83D\uDCF0",
  blog: "✍️",
  book: "\uD83D\uDCD5",
  composition: "\uD83C\uDFBC",
  example: "\uD83E\uDDEA",
  insight: "\uD83D\uDCA1",
  memorial: "\uD83D\uDD6F️",
  methodology: "\uD83E\uDDED",
  moc: "\uD83D\uDDFA️",
  notion: "\uD83D\uDCAD",
  organization: "\uD83C\uDFE2",
  person: "\uD83D\uDC64",
  place: "\uD83D\uDCCD",
  quote: "\uD83D\uDCAC",
  summary: "\uD83D\uDCDD",
  term: "\uD83D\uDD24",
  thing: "\uD83D\uDCE6",
  tool: "\uD83D\uDD27",
  vault: "\uD83D\uDDC4️",
  video: "\uD83C\uDFAC"
};
var schema = z.object({
  site: z.object({
    title: localized.optional(),
    tagline: localized.optional(),
    url: z.url().optional(),
    author: z.string().optional(),
    logo: z.string().min(1).max(8).optional(),
    me: z.array(z.url()).default([]),
    fediverse: z.string().regex(/^@[^@\s]+@[^@\s]+$/, "expected @user@host").optional()
  }).strict().default({ me: [] }),
  languages: z.array(z.string().min(2)).min(1).default(["en-US"]),
  ignore: z.array(z.string()).default([]),
  stages: z.record(z.string(), z.union([
    z.enum(Object.keys(STAGE_PRESETS)),
    z.object({ icon: z.string(), label: localized }).strict()
  ])).default({}),
  publish: z.enum(["explicit", "all"]).default("explicit"),
  home: z.string().default("index.md"),
  conventions: z.object({
    typePrefix: z.string().default("type/"),
    blogTags: z.array(z.string()).default(["type/blog", "blog"]),
    mapTags: z.array(z.string()).default(["type/moc", "moc"]),
    flashcardTags: z.array(z.string()).default(["flashcards"])
  }).strict().default({
    typePrefix: "type/",
    blogTags: ["type/blog", "blog"],
    mapTags: ["type/moc", "moc"],
    flashcardTags: ["flashcards"]
  }),
  footer: z.record(z.string(), z.string()).default({}),
  nav: z.array(z.union([
    z.enum(["home", "tags", "archive"]),
    z.object({ note: z.string().min(1), label: localized.optional() }).strict(),
    z.object({ url: z.string().min(1), label: localized }).strict()
  ])).default(["home", "tags"]),
  analytics: z.discriminatedUnion("provider", [
    z.object({ provider: z.literal("google"), id: z.string().min(1) }).strict(),
    z.object({ provider: z.literal("plausible"), host: z.string().optional() }).strict(),
    z.object({ provider: z.literal("umami"), id: z.string().min(1), host: z.string().min(1) }).strict(),
    z.object({ provider: z.literal("goatcounter"), id: z.string().min(1) }).strict()
  ]).optional(),
  comments: z.discriminatedUnion("provider", [
    z.object({
      provider: z.literal("giscus"),
      repo: z.string().regex(/^[^/\s]+\/[^/\s]+$/, "expected owner/name"),
      repoId: z.string().min(1),
      category: z.string().min(1),
      categoryId: z.string().min(1),
      mapping: z.enum(["pathname", "url", "title", "og:title"]).default("pathname"),
      reactions: z.boolean().default(true)
    }).strict(),
    z.object({ provider: z.literal("commento"), host: z.string().default("https://cdn.commento.io") }).strict()
  ]).optional(),
  properties: z.object({
    hide: z.array(z.string()).default([])
  }).strict().default({ hide: [] }),
  types: z.record(z.string(), z.object({ icon: z.string().min(1), label: localized.optional() }).strict()).default({}),
  webmentions: z.object({
    domain: z.string().min(1).optional()
  }).strict().optional(),
  stackedPages: z.boolean().default(true),
  offline: z.boolean().default(true),
  ogImages: z.boolean().default(true),
  cname: z.boolean().default(false),
  encryption: z.object({
    iterations: z.number().int().min(1e5).default(600000)
  }).strict().default({ iterations: 600000 }),
  appearance: z.object({
    style: z.enum(["notebook", "classic"]).default("notebook"),
    classic: z.array(z.string()).default([])
  }).strict().default({ style: "notebook", classic: [] }),
  strings: z.record(z.string(), z.record(z.string(), z.string())).default({})
}).strict();
function expandHome(p) {
  return p === "~" || p.startsWith("~/") ? path.join(os.homedir(), p.slice(1)) : p;
}
function localize(v, langs, fallback) {
  const out = {};
  for (const lang of langs) {
    if (typeof v === "string")
      out[lang] = v;
    else if (v) {
      const base = lang.split("-")[0];
      out[lang] = v[lang] ?? Object.entries(v).find(([k]) => k.split("-")[0] === base)?.[1] ?? Object.values(v)[0] ?? fallback;
    } else
      out[lang] = fallback;
  }
  return out;
}

class ConfigError extends Error {
  name = "ConfigError";
}
function resolveConfig(raw, vault, env = {}) {
  const parsed = schema.safeParse(raw ?? {});
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`).join(`
`);
    throw new ConfigError(`Invalid datme config in ${vault}:
${issues}`);
  }
  const c = parsed.data;
  const langs = [...new Set(c.languages)];
  const name = path.basename(vault) || "Notes";
  let order = 0;
  const stages = {};
  const url = (env.DATME_SITE_URL ?? c.site.url)?.replace(/\/+$/, "");
  let webmentions;
  if (c.webmentions) {
    const domain = c.webmentions.domain ?? (url ? new URL(url).host : undefined);
    if (!domain)
      throw new ConfigError(`Invalid datme config in ${vault}:
  - webmentions: needs site.url or webmentions.domain`);
    webmentions = { domain };
  }
  for (const [folder, def] of Object.entries(c.stages)) {
    const base = typeof def === "string" ? STAGE_PRESETS[def] : def;
    stages[folder] = { icon: base.icon, label: localize(base.label, langs, folder), order: order++ };
  }
  return {
    vault,
    url,
    title: localize(c.site.title, langs, name),
    tagline: localize(c.site.tagline, langs, ""),
    author: c.site.author ?? "",
    me: c.site.me,
    fediverse: c.site.fediverse,
    webmentions,
    logo: c.site.logo ?? localize(c.site.title, langs, name)[langs[0]].match(/\p{L}/u)?.[0]?.toUpperCase() ?? "✦",
    defaultLang: langs[0],
    langs,
    ignore: [
      ...new Set([...DEFAULT_IGNORE, ...c.ignore, ...env.DATME_IGNORE ? [env.DATME_IGNORE] : []].map((p) => p.replace(/^\/+|\/+$/g, "")))
    ],
    stages,
    publish: c.publish,
    home: c.home.replace(/^\/+/, ""),
    conventions: c.conventions,
    footerLinks: c.footer,
    nav: c.nav.map((item) => typeof item === "string" ? { kind: item } : ("note" in item) ? { kind: "note", target: item.note, label: item.label ? localize(item.label, langs, item.note) : undefined } : { kind: "url", target: item.url, label: localize(item.label, langs, item.url) }),
    encryption: c.encryption,
    analytics: c.analytics,
    comments: c.comments,
    cname: c.cname,
    ogImages: c.ogImages,
    offline: c.offline,
    stackedPages: c.stackedPages,
    properties: c.properties,
    types: Object.fromEntries([...new Set([...Object.keys(DEFAULT_TYPES), ...Object.keys(c.types)])].map((type) => [
      type,
      {
        icon: c.types[type]?.icon ?? DEFAULT_TYPES[type],
        label: localize(c.types[type]?.label, langs, type)
      }
    ])),
    appearance: {
      style: c.appearance.style,
      classic: c.appearance.classic.map((p) => p.replace(/^\/+|\/+$/g, ""))
    },
    strings: c.strings
  };
}
function loadConfig(vault, env = process.env) {
  for (const name of CONFIG_FILES) {
    const file = path.join(vault, name);
    if (!fs.existsSync(file))
      continue;
    let raw;
    try {
      raw = loadYaml(fs.readFileSync(file, "utf8"));
    } catch (e) {
      throw new ConfigError(`Cannot parse ${file}: ${e.message}`);
    }
    return resolveConfig(raw, vault, env);
  }
  return resolveConfig({}, vault, env);
}
function vaultFromEnv(env = process.env) {
  return path.resolve(expandHome(env.DATME_VAULT || env.VAULT_PATH || process.cwd()));
}
var site = loadConfig(vaultFromEnv());

// src/lib/vault.ts
import fs2 from "node:fs";
import path2 from "node:path";
import { execFileSync } from "node:child_process";
import { load as loadYaml2, JSON_SCHEMA } from "js-yaml";

// src/lib/i18n.ts
var builtin = {
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
    offline: "Bạn đang ngoại tuyến",
    offlineLead: "Trang này chưa được lưu để đọc ngoại tuyến. Những ghi chú bạn đã mở vẫn đọc được."
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
    offline: "You are offline",
    offlineLead: "This page was not saved for offline reading. The notes you already opened still work."
  }
};
var COUNTED = ["readingTime", "words", "notesCount", "activityCount"];
var cache = new Map;
function t(lang) {
  let hit = cache.get(lang);
  if (!hit) {
    const base = lang.split("-")[0];
    const merged = { ...builtin.en, ...builtin[base] ?? {}, ...site.strings[lang] ?? {} };
    const out = { ...merged };
    for (const key of COUNTED) {
      const template = merged[key];
      out[key] = (n) => template.replace("{n}", n.toLocaleString(lang));
    }
    hit = out;
    cache.set(lang, hit);
  }
  return hit;
}
function langPrefix(lang) {
  return lang === site.defaultLang ? "" : `${lang}/`;
}

// src/lib/slug.ts
function sluggifySegment(s) {
  return s.replace(/\s/g, "-").replace(/&/g, "-and-").replace(/%/g, "-percent").replace(/\?/g, "").replace(/#/g, "");
}
function sluggify(p) {
  return p.split("/").filter(Boolean).map(sluggifySegment).join("/");
}
function slugTag(tag) {
  return tag.split("/").map((s) => sluggifySegment(s.trim())).join("/");
}
function slugToUrl(slug) {
  if (slug === "" || slug === "index")
    return "/";
  const clean = slug.replace(/\/?index$/, "");
  return "/" + clean.split("/").map(encodeURIComponent).join("/");
}
function folderDisplayName(segment) {
  return segment.replace(/^\d+(\.\d+)*[_\s-]+/, "") || segment;
}

// src/lib/obsidian.ts
import GithubSlugger from "github-slugger";

// src/lib/media.ts
var IMAGE = /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i;
var VIDEO = /\.(mp4|webm|mov|mkv|ogv|m4v)$/i;
var AUDIO = /\.(mp3|wav|ogg|oga|m4a|flac|opus|aac)$/i;
function parseTime(v) {
  if (!v)
    return;
  if (/^\d+$/.test(v))
    return Number(v);
  const m = v.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!m || !m[0])
    return;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}
function youtube(url) {
  const host = url.hostname.replace(/^(www\.|m\.)/, "");
  let id;
  if (host === "youtu.be")
    id = url.pathname.slice(1).split("/")[0];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch")
      id = url.searchParams.get("v") ?? undefined;
    else
      id = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/)?.[1];
  }
  if (!id || !/^[\w-]{6,20}$/.test(id))
    return;
  return { id, start: parseTime(url.searchParams.get("t") ?? url.searchParams.get("start")) };
}
function splitAlt(alt) {
  const m = alt.match(/^(.*?)\|?\s*(\d+)(?:x(\d+))?$/);
  if (m && (alt.includes("|") || m[1] === ""))
    return { text: m[1].trim(), width: m[2], height: m[3] };
  return { text: alt };
}
function embedExternal(alt, href) {
  let url;
  try {
    url = new URL(href);
  } catch {
    return;
  }
  const { text, width, height } = splitAlt(alt);
  const title = escapeAttr(text || url.hostname);
  const size = width ? ` style="max-width:${width}px${height ? `;aspect-ratio:${width}/${height}` : ""}"` : "";
  const link = `<a class="media-link" href="${escapeAttr(url.href)}">${title}</a>`;
  const frame = (src, allow) => `<span class="media-embed"${size}><iframe src="${escapeAttr(src)}" title="${title}" loading="lazy" allow="${allow}" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>${link}</span>`;
  const yt = youtube(url);
  if (yt) {
    return frame(`https://www.youtube-nocookie.com/embed/${yt.id}${yt.start ? `?start=${yt.start}` : ""}`, "accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share");
  }
  const host = url.hostname.replace(/^www\./, "");
  const vimeo = host === "vimeo.com" ? url.pathname.match(/^\/(\d+)/)?.[1] : undefined;
  if (vimeo) {
    const t = parseTime(url.hash.match(/t=([\dhms]+)/)?.[1] ?? null);
    return frame(`https://player.vimeo.com/video/${vimeo}${t ? `#t=${t}s` : ""}`, "fullscreen; picture-in-picture");
  }
  const tweet = /^(twitter\.com|x\.com|mobile\.twitter\.com)$/.test(host) ? url.pathname.match(/^\/(\w+)\/status\/(\d+)/) : null;
  if (tweet) {
    const canonical = `https://twitter.com/${tweet[1]}/status/${tweet[2]}`;
    return `<blockquote class="twitter-tweet" data-dnt="true"><a href="${canonical}">${escapeAttr(text || `@${tweet[1]}`)}</a></blockquote>`;
  }
  if (VIDEO.test(url.pathname))
    return `<video src="${escapeAttr(url.href)}" controls preload="metadata"${size}></video>`;
  if (AUDIO.test(url.pathname))
    return `<audio src="${escapeAttr(url.href)}" controls preload="none"></audio>`;
  if (width && (IMAGE.test(url.pathname) || !url.pathname.includes("."))) {
    return `<img src="${escapeAttr(url.href)}" alt="${escapeAttr(text)}" width="${width}"${height ? ` height="${height}"` : ""} loading="lazy">`;
  }
  return;
}

// src/lib/obsidian.ts
var IMAGE2 = /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i;
var AUDIO2 = /\.(mp3|wav|ogg|m4a|flac|webm)$/i;
var VIDEO2 = /\.(mp4|webm|mov|mkv|ogv)$/i;
var PDF = /\.pdf$/i;
var EXCALIDRAW = /\.excalidraw(\.md)?$/i;
var DOC = /\.(canvas|base)$/i;
function docUrl(rel, lang) {
  return slugToUrl(langPrefix(lang) + sluggify(rel));
}
var urlPlaceholder = (key) => `\x01URL:${key}\x01`;
var escapeAttr = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function anchorOf(fragment) {
  if (!fragment)
    return "";
  if (fragment.startsWith("^"))
    return "#" + fragment;
  return "#" + new GithubSlugger().slug(fragment.split("#").pop().trim());
}
function assetUrl(rel) {
  return "/assets/" + rel.split("/").map(encodeURIComponent).join("/");
}
function plainLine(line) {
  return line.replace(/!?\[\[([^\]|]+?)(?:\\?\|([^\]]+))?\]\]/g, (_, t, a) => a ?? t.split("#")[0]).replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/<[^>]+>/g, "").replace(/^\s*(?:[-*+]|\d+\.|>|#+|\|)\s*/g, "").replace(/\[!\w+\][+-]?/g, "").replace(/[*_=`|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 220);
}
function preprocess(src, ctx) {
  const masks = [];
  const mask = (s) => `\x00${masks.push(s) - 1}\x00`;
  let md = src.replace(/^(\s*)(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\s*\2[^\S\n]*$/gm, (m) => mask(m)).replace(/^\$\$[\s\S]*?^\$\$/gm, (m) => mask(m)).replace(/(`+)(?!`)[\s\S]*?[^`]\1(?!`)/g, (m) => mask(m)).replace(/%%[\s\S]*?%%/g, "").replace(/<!--[\s\S]*?-->/g, "");
  const links = [];
  const assets = [];
  const docs = [];
  const problems = [];
  const broken = (kind, target, html) => {
    problems.push({ kind, target });
    return html;
  };
  const lines = md.split(`
`);
  const lineOf = (offset) => {
    let n = 0;
    for (let i = 0;i < lines.length; i++) {
      n += lines[i].length + 1;
      if (offset < n)
        return lines[i];
    }
    return "";
  };
  const internalLink = (src, fragment, text) => `<a href="${urlPlaceholder(src.key)}${escapeAttr(anchorOf(fragment))}" class="internal" data-key="${escapeAttr(src.key)}">${text}</a>`;
  const embedAsset = (rel, alias) => {
    assets.push(rel);
    const url = assetUrl(rel);
    if (IMAGE2.test(rel)) {
      const size = alias?.match(/^(\d+)(?:x(\d+))?$/);
      const alt = size ? "" : alias ?? "";
      const dims = size ? ` width="${size[1]}"${size[2] ? ` height="${size[2]}"` : ""}` : "";
      return `<img src="${url}" alt="${escapeAttr(alt)}"${dims} loading="lazy">`;
    }
    if (AUDIO2.test(rel))
      return `<audio src="${url}" controls></audio>`;
    if (VIDEO2.test(rel))
      return `<video src="${url}" controls></video>`;
    if (PDF.test(rel))
      return `<iframe class="pdf" src="${url}" loading="lazy"></iframe>`;
    return `<a href="${url}" class="attachment">${escapeAttr(alias ?? rel.split("/").pop())}</a>`;
  };
  const embedDrawing = (file, alias) => {
    const base = file.replace(/\.md$/i, "");
    const find = (suffix) => ctx.resolveAsset(base + suffix, ctx.dir);
    const light = find(".light.svg") ?? find(".svg") ?? find(".light.png") ?? find(".png");
    const dark = find(".dark.svg") ?? find(".dark.png");
    const name = escapeAttr(base.split("/").pop().replace(EXCALIDRAW, ""));
    if (!light && !dark) {
      problems.push({ kind: "drawing", target: file });
      return `<span class="drawing-missing">✏️ ${name}: export the drawing as SVG in the Excalidraw plugin to publish it</span>`;
    }
    const img = (rel, cls) => {
      assets.push(rel);
      return `<img class="${cls}" src="${assetUrl(rel)}" alt="${name}" loading="lazy">`;
    };
    const width = alias?.match(/^\d+$/) ? ` style="max-width:${alias}px"` : "";
    const pics = light && dark ? img(light, "drawing-light") + img(dark, "drawing-dark") : img(light ?? dark, "");
    return `<span class="drawing"${width}>${pics}</span>`;
  };
  md = md.replace(/(!?)\[\[([^[\]\n]+?)\]\]/g, (_m, bang, inner, offset) => {
    const raw = inner.replace(/\\\|/g, "|");
    const pipe = raw.indexOf("|");
    const target = pipe >= 0 ? raw.slice(0, pipe) : raw;
    const alias = pipe >= 0 ? raw.slice(pipe + 1).trim() : undefined;
    const hash = target.indexOf("#");
    const file = (hash >= 0 ? target.slice(0, hash) : target).trim();
    const fragment = hash >= 0 ? target.slice(hash + 1).trim() : "";
    if (bang && EXCALIDRAW.test(file))
      return embedDrawing(file, alias);
    if (DOC.test(file)) {
      const rel = ctx.resolveAsset(file, ctx.dir);
      const name = escapeAttr(alias ?? file.split("/").pop().replace(DOC, ""));
      if (!rel)
        return broken(bang ? "embed" : "link", file, `<span class="broken-link">${name}</span>`);
      docs.push(rel);
      const url = docUrl(rel, ctx.lang);
      if (bang && /\.base$/i.test(rel)) {
        return `<span class="base-ph" data-rel="${escapeAttr(rel)}" data-view="${escapeAttr(fragment)}"></span>`;
      }
      if (bang)
        return `<a class="doc-card internal" href="${url}">\uD83D\uDDC2️ ${name}</a>`;
      return `<a href="${url}" class="internal doc">${name}</a>`;
    }
    if (bang) {
      const note = file ? ctx.resolveNote(file, ctx.dir) : undefined;
      if (note && !IMAGE2.test(file)) {
        links.push({ key: note.key, context: plainLine(lineOf(offset)) });
        return `<span class="transclude-ph" data-key="${escapeAttr(note.key)}" data-fragment="${escapeAttr(fragment)}"></span>`;
      }
      const asset = file ? ctx.resolveAsset(file, ctx.dir) : undefined;
      if (asset)
        return embedAsset(asset, alias);
      return broken("embed", file, `<span class="broken-link">${escapeAttr(alias ?? file)}</span>`);
    }
    const text = alias ?? (fragment && !file ? fragment : file.split("/").pop());
    if (!file)
      return `<a href="${escapeAttr(anchorOf(fragment))}" class="internal anchor">${text}</a>`;
    const note = ctx.resolveNote(file, ctx.dir);
    if (!note) {
      const asset = ctx.resolveAsset(file, ctx.dir);
      if (asset) {
        assets.push(asset);
        return `<a href="${assetUrl(asset)}" class="attachment">${text}</a>`;
      }
      return broken("link", file, `<span class="broken-link" title="Not published">${text}</span>`);
    }
    links.push({ key: note.key, context: plainLine(lineOf(offset)) });
    return internalLink(note, fragment, text);
  });
  md = md.replace(/!\[([^\]\n]*)\]\((https?:\/\/[^)\s]+)\)/g, (m, alt, href) => embedExternal(alt, href) ?? m);
  md = md.replace(/(!?)\[([^\]\n]*)\]\((?!https?:|mailto:|#|\/)([^)\s]+?)(#[^)\s]*)?\)/g, (m, bang, text, target, frag, offset) => {
    let decoded = target;
    try {
      decoded = decodeURI(target);
    } catch {}
    if (!bang && /\.md$/i.test(decoded)) {
      const note = ctx.resolveNote(decoded, ctx.dir);
      if (!note)
        return broken("link", decoded, `<span class="broken-link">${text}</span>`);
      links.push({ key: note.key, context: plainLine(lineOf(offset)) });
      return internalLink(note, (frag ?? "").slice(1), text);
    }
    const asset = ctx.resolveAsset(decoded, ctx.dir);
    if (!asset)
      return /\.\w+$/.test(decoded) ? broken(bang ? "embed" : "link", decoded, m) : m;
    if (bang)
      return embedAsset(asset, text || undefined);
    assets.push(asset);
    return `<a href="${assetUrl(asset)}" class="attachment">${text}</a>`;
  });
  md = md.replace(/(<img\b[^>]*?\bsrc=)(["'])(?!https?:|\/|data:)([^"']+)\2/g, (m, pre, q, target) => {
    const asset = ctx.resolveAsset(target, ctx.dir);
    if (!asset)
      return m;
    assets.push(asset);
    return `${pre}${q}${assetUrl(asset)}${q}`;
  });
  md = md.replace(/==([^=\n]+)==/g, "<mark>$1</mark>").replace(/(^|[\s(])#([\p{L}_][\p{L}\p{N}_/-]*)/gu, (_m, pre, tag) => {
    const url = slugToUrl(langPrefix(ctx.lang) + "tags/" + slugTag(tag));
    return `${pre}<a href="${url}" class="tag-link">#${tag}</a>`;
  }).replace(/[^\S\n]\^([A-Za-z0-9-]+)$/gm, ' <span class="block-id" id="^$1"></span>');
  md = md.replace(/\u0000(\d+)\u0000/g, (_m, i) => masks[Number(i)]);
  return { md, links, assets, docs, problems };
}

// src/lib/canvas.ts
function parseCanvas(src) {
  const data = JSON.parse(src);
  const num = (v) => typeof v === "number" && Number.isFinite(v) ? v : 0;
  const nodes = (data.nodes ?? []).filter((n) => n && typeof n.id === "string" && ["text", "file", "link", "group"].includes(n.type)).map((n) => ({ ...n, x: num(n.x), y: num(n.y), width: Math.max(1, num(n.width)), height: Math.max(1, num(n.height)) }));
  const ids = new Set(nodes.map((n) => n.id));
  const edges = (data.edges ?? []).filter((e) => e && ids.has(e.fromNode) && ids.has(e.toNode));
  return { nodes, edges };
}

// src/lib/flashcards.ts
function isDeck(tags, body, deckTags) {
  const lower = deckTags.map((t) => t.toLowerCase());
  if (tags.some((t) => lower.some((d) => t.toLowerCase() === d || t.toLowerCase().startsWith(d + "/"))))
    return true;
  return lower.some((d) => new RegExp(`(^|\\s)#${d.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:/[\\w/-]*)?(?=\\s|$)`, "im").test(body));
}
var block = (q, a, hint) => `<details class="flashcard">
<summary data-hint="${hint}">

${q.trim()}

</summary>
<div class="flashcard-answer">

${a.trim()}

</div>
</details>`;
var inline = (q, a, hint) => `<details class="flashcard"><summary data-hint="${hint}">${q.trim()}</summary><div class="flashcard-answer">${a.trim()}</div></details>`;
var maskCode = (line) => line.replace(/(`+)[^`]*?\1/g, (s) => "\x01".repeat(s.length));
function flashcards(md, hint) {
  const hintAttr = hint.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const lines = md.split(`
`);
  const out = [];
  let fence;
  for (let i = 0;i < lines.length; i++) {
    const line = lines[i];
    const f = line.match(/^\s*(`{3,}|~{3,})/);
    if (f && (!fence || f[1].startsWith(fence))) {
      fence = fence ? undefined : f[1];
      out.push(line);
      continue;
    }
    if (fence || /^\s*(#|>|\||\$\$)/.test(line)) {
      out.push(line);
      continue;
    }
    const sep = line.trim();
    if ((sep === "?" || sep === "??") && out.length && out[out.length - 1].trim()) {
      let start = out.length;
      while (start > 0 && out[start - 1].trim())
        start--;
      const question = out.splice(start).join(`
`);
      const answer = [];
      while (i + 1 < lines.length && lines[i + 1].trim())
        answer.push(lines[++i]);
      out.push(block(question, answer.join(`
`), hintAttr));
      if (sep === "??")
        out.push("", block(answer.join(`
`), question, hintAttr));
      continue;
    }
    const masked = maskCode(line);
    const m = masked.match(/^(\s*(?:[-*+]|\d+[.)])\s+)?(.*?)(:{2,3})(?!:)(.*)$/);
    const bullet = m?.[1];
    const at = m ? (bullet?.length ?? 0) + m[2].length : -1;
    const q = m ? line.slice(bullet?.length ?? 0, at) : "";
    const a = m ? line.slice(at + m[3].length) : "";
    if (!m || !q.trim() || !a.trim() || /:$/.test(q)) {
      out.push(line);
      continue;
    }
    const reversed = m[3] === ":::";
    if (bullet || /^\s/.test(line)) {
      const cards = [inline(q, a, hintAttr), ...reversed ? [inline(a, q, hintAttr)] : []];
      out.push((bullet ?? "") + cards.join(" "));
    } else {
      out.push("", block(q, a, hintAttr), ...reversed ? ["", block(a, q, hintAttr)] : [], "");
    }
  }
  return out.join(`
`);
}

// src/lib/vault.ts
var MD_EXT = /\.md$/i;
function isIgnored(rel) {
  return site.ignore.some((ig) => rel === ig || rel.startsWith(ig + "/"));
}
function walk(dir, out, rel = "") {
  for (const entry of fs2.readdirSync(dir, { withFileTypes: true })) {
    const childRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (isIgnored(childRel) || entry.name.startsWith("."))
      continue;
    const abs = path2.join(dir, entry.name);
    let isDir = entry.isDirectory();
    if (entry.isSymbolicLink()) {
      try {
        isDir = fs2.statSync(abs).isDirectory();
      } catch {
        continue;
      }
    }
    if (isDir)
      walk(abs, out, childRel);
    else if (MD_EXT.test(entry.name))
      out.md.push(childRel);
    else
      out.files.push(childRel);
  }
}
var FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
function parseFrontmatter(src) {
  const m = src.match(FM_RE);
  if (!m)
    return { fm: {}, body: src };
  let fm = {};
  let error;
  try {
    const parsed = loadYaml2(m[1], { schema: JSON_SCHEMA });
    if (parsed && typeof parsed === "object")
      fm = parsed;
  } catch (e) {
    error = e.message.split(`
`)[0];
  }
  return { fm, body: src.slice(m[0].length), error };
}
function toArray(v) {
  if (v == null)
    return [];
  if (Array.isArray(v))
    return v.filter((x) => x != null).map(String);
  if (typeof v === "string")
    return v.split(",").map((s) => s.trim()).filter(Boolean);
  return [String(v)];
}
function toDate(v) {
  if (v == null || v === "")
    return;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? undefined : d;
}
function isPublished(fm, mode) {
  const flag = (v) => v === true || v === "true" ? true : v === false || v === "false" ? false : undefined;
  if (flag(fm.draft) === true)
    return false;
  const publish = flag(fm.publish);
  return mode === "explicit" ? publish === true : publish !== false;
}
function filterLanguage(src, lang) {
  let inFence = false;
  let inLang = false;
  let inThisLang = false;
  const out = [];
  for (let line of src.split(`
`)) {
    line = line.replace(/[\t\r ]*$/, "");
    if (line.includes("```"))
      inFence = !inFence;
    if (!inFence) {
      const m = line.match(/<!--lang:(.*)-->/);
      if (m) {
        if (m[1] === "*") {
          inLang = false;
          inThisLang = false;
        } else {
          inLang = true;
          inThisLang = m[1] === lang;
        }
        continue;
      }
      if (inLang && !inThisLang)
        continue;
    }
    out.push(line);
  }
  return out.join(`
`);
}
function gitDates() {
  const dates = new Map;
  try {
    const top = execFileSync("git", ["-C", site.vault, "rev-parse", "--show-toplevel"], {
      encoding: "utf8"
    }).trim();
    const prefix = path2.relative(top, site.vault);
    const log = execFileSync("git", ["-C", site.vault, "-c", "core.quotepath=off", "log", "--format=%x00%ct", "--name-only", "--", "*.md"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    let ts = 0;
    for (const line of log.split(`
`)) {
      if (line.startsWith("\x00")) {
        ts = Number(line.slice(1)) * 1000;
        continue;
      }
      if (!line)
        continue;
      const rel = prefix ? path2.relative(prefix, line) : line;
      const d = new Date(ts);
      const cur = dates.get(rel);
      if (!cur)
        dates.set(rel, { created: d, updated: d });
      else
        cur.created = d;
    }
  } catch {}
  return dates;
}
function buildVault(version) {
  const found = { md: [], files: [] };
  walk(site.vault, found);
  const assetByPath = new Map;
  const assetByName = new Map;
  for (const rel of found.files) {
    assetByPath.set(rel.toLowerCase(), rel);
    const name = path2.posix.basename(rel).toLowerCase();
    assetByName.set(name, [...assetByName.get(name) ?? [], rel]);
  }
  const problems = [];
  const report = (level, file, message) => void problems.push({ level, file, message });
  const anyNote = new Set;
  for (const rel of found.md) {
    const key = rel.replace(MD_EXT, "").toLowerCase();
    anyNote.add(key);
    anyNote.add(path2.posix.basename(key));
  }
  const sources = new Map;
  let homeTarget;
  for (const rel of found.md) {
    const abs = path2.join(site.vault, rel);
    const src = fs2.readFileSync(abs, "utf8");
    const { fm, body, error } = parseFrontmatter(src);
    if (error)
      report("warning", rel, `frontmatter is not valid YAML, so it is ignored: ${error}`);
    if (!isPublished(fm, site.publish))
      continue;
    const password = fm.password != null && fm.password !== "" ? String(fm.password) : undefined;
    delete fm.password;
    const key = rel.replace(MD_EXT, "");
    const isHome = rel.toLowerCase() === site.home.toLowerCase();
    if (isHome) {
      try {
        homeTarget = path2.relative(site.vault, fs2.realpathSync(abs)).replace(MD_EXT, "");
      } catch {}
    }
    sources.set(key, {
      key,
      file: abs,
      stem: path2.posix.basename(key),
      dir: path2.posix.dirname(rel) === "." ? "" : path2.posix.dirname(rel),
      fm,
      raw: body,
      isHome,
      password
    });
  }
  const home = [...sources.values()].find((s) => s.isHome);
  if (home && homeTarget && homeTarget !== home.key)
    sources.delete(homeTarget);
  const byPath = new Map;
  const byStem = new Map;
  const byAlias = new Map;
  for (const s of sources.values()) {
    byPath.set(s.key.toLowerCase(), s);
    const stem = s.stem.toLowerCase();
    byStem.set(stem, [...byStem.get(stem) ?? [], s]);
  }
  for (const s of sources.values()) {
    for (const a of toArray(s.fm.aliases ?? s.fm.alias)) {
      const lower = a.toLowerCase();
      const other = byAlias.get(lower) ?? byStem.get(lower)?.find((o) => o !== s);
      if (other && other !== s) {
        report("warning", s.key + ".md", `alias "${a}" is also the name or an alias of ${other.key}.md, so links to it are ambiguous`);
      }
      byAlias.set(lower, s);
    }
  }
  if (home && homeTarget && homeTarget !== home.key) {
    const stem = path2.posix.basename(homeTarget).toLowerCase();
    byStem.set(stem, [home, ...byStem.get(stem) ?? []]);
  }
  function resolveNote(target, fromDir) {
    const t = target.trim().replace(MD_EXT, "").replace(/^\/+/, "");
    if (!t)
      return;
    const lower = t.toLowerCase();
    const relative = path2.posix.normalize(path2.posix.join(fromDir, t)).toLowerCase();
    const hit = byPath.get(relative) ?? byPath.get(lower);
    if (hit)
      return hit;
    if (!lower.includes("/")) {
      const cands = byStem.get(lower);
      if (cands?.length)
        return [...cands].sort((a, b) => a.key.length - b.key.length)[0];
    } else {
      for (const [k, s] of byPath)
        if (k.endsWith("/" + lower))
          return s;
    }
    return byAlias.get(lower);
  }
  function resolveAsset(target, fromDir) {
    const t = decodeURI(target.trim()).replace(/^\/+/, "");
    const relative = path2.posix.normalize(path2.posix.join(fromDir, t)).toLowerCase();
    const hit = assetByPath.get(relative) ?? assetByPath.get(t.toLowerCase());
    if (hit)
      return hit;
    const cands = assetByName.get(path2.posix.basename(t).toLowerCase());
    return cands?.length ? [...cands].sort((a, b) => a.length - b.length)[0] : undefined;
  }
  const seenProblems = new Set;
  function linkProblem(file, p) {
    const id = `${file}\x00${p.kind}\x00${p.target}`;
    if (seenProblems.has(id))
      return;
    seenProblems.add(id);
    const t = p.target.trim().replace(/^\/+/, "");
    const isNote = !/\.\w+$/.test(t) || MD_EXT.test(t);
    const name = t.replace(MD_EXT, "").toLowerCase();
    const relative = path2.posix.normalize(path2.posix.join(path2.posix.dirname(file), name));
    if (p.kind === "drawing") {
      report("warning", file, `drawing "${t}" has no exported SVG or PNG next to it, so it is not shown`);
    } else if (isNote && (anyNote.has(name) || anyNote.has(relative))) {
      report("info", file, `${p.kind} to unpublished note "${t}" is shown as plain text`);
    } else if (isNote) {
      report("error", file, `${p.kind} to missing note "${t}"`);
    } else {
      report("error", file, `${p.kind} to missing file "${t}"`);
    }
  }
  const git = gitDates();
  const assets = new Set;
  const docRefs = new Set(site.publish === "all" ? found.files.filter((f) => DOC.test(f)) : []);
  const notes = {};
  const byKey = {};
  for (const lang of site.langs) {
    notes[lang] = [];
    byKey[lang] = new Map;
    for (const s of sources.values()) {
      const titleField = s.fm.title;
      const titleMap = titleField && typeof titleField === "object" ? titleField : undefined;
      const langTitle = titleMap?.[lang];
      const title = langTitle ?? (typeof titleField === "string" ? titleField : s.stem);
      const slugBase = s.isHome ? "index" : sluggify(path2.posix.join(s.dir, langTitle ?? s.stem));
      const slug = langPrefix(lang) + slugBase;
      const tags = [...new Set(toArray(s.fm.tags ?? s.fm.tag).map((x) => slugTag(x.replace(/^#/, ""))))];
      const relFile = s.key + ".md";
      const stat = fs2.statSync(s.file);
      const created = toDate(s.fm.created ?? s.fm.date) ?? git.get(relFile)?.created ?? stat.birthtime;
      const updated = toDate(s.fm.updated ?? s.fm.modified ?? s.fm.lastmod) ?? git.get(relFile)?.updated ?? stat.mtime;
      let banner;
      if (typeof s.fm.banner === "string" && s.fm.banner) {
        const b = s.fm.banner.replace(/^!?\[\[|\]\]$/g, "");
        if (/^https?:\/\//.test(b))
          banner = b;
        else {
          const asset = resolveAsset(b, s.dir);
          if (asset) {
            assets.add(asset);
            banner = assetUrl2(asset);
          } else if (lang === site.defaultLang)
            report("error", relFile, `banner "${b}" is not in the vault`);
        }
      }
      const pos = (v) => v != null && v !== "" ? `${Number(v) * 100}%` : "50%";
      const body = filterLanguage(s.raw, lang);
      const deck = isDeck(tags, body, site.conventions.flashcardTags);
      const pre = preprocess(deck ? flashcards(body, t(lang).showAnswer) : body, {
        lang,
        dir: s.dir,
        resolveNote,
        resolveAsset
      });
      pre.assets.forEach((a) => assets.add(a));
      pre.docs.forEach((d) => docRefs.add(d));
      for (const p of pre.problems)
        linkProblem(relFile, p);
      const { typePrefix, blogTags, mapTags } = site.conventions;
      const types = tags.filter((x) => x.startsWith(typePrefix)).map((x) => x.slice(typePrefix.length));
      const note = {
        key: s.key,
        lang,
        slug,
        url: slugToUrl(slug),
        title,
        aliases: toArray(s.fm.aliases ?? s.fm.alias),
        tags,
        created,
        updated,
        banner,
        bannerPos: `${pos(s.fm.banner_x)} ${pos(s.fm.banner_y)}`,
        cssclasses: toArray(s.fm.cssclasses ?? s.fm.cssclass),
        description: typeof s.fm.description === "string" ? s.fm.description : undefined,
        stage: site.stages[s.dir.split("/")[0]] ? s.dir.split("/")[0] : undefined,
        types,
        isBlog: tags.some((x) => blogTags.includes(x)),
        isMoc: tags.some((x) => mapTags.includes(x)),
        isHome: s.isHome,
        unlisted: s.fm.unlisted === true,
        protected: s.password != null,
        dir: s.dir,
        md: pre.md,
        links: pre.links,
        source: s
      };
      notes[lang].push(note);
      byKey[lang].set(s.key, note);
    }
  }
  function noteUrl(key, lang) {
    return byKey[lang]?.get(key)?.url ?? "#";
  }
  const docs = new Map;
  for (const rel of docRefs) {
    const src = fs2.readFileSync(path2.join(site.vault, rel), "utf8");
    const dir = path2.posix.dirname(rel) === "." ? "" : path2.posix.dirname(rel);
    const kind = rel.toLowerCase().endsWith(".canvas") ? "canvas" : "base";
    const doc = { rel, kind, name: path2.posix.basename(rel).replace(DOC, ""), dir, src, texts: {} };
    if (kind === "canvas") {
      try {
        doc.canvas = parseCanvas(src);
      } catch {
        console.warn(`[datme] skipped ${rel}: not a valid canvas`);
        report("error", rel, "not a valid canvas, so it is not published");
        continue;
      }
      for (const lang of site.langs) {
        doc.texts[lang] = {};
        for (const node of doc.canvas.nodes) {
          if (node.type === "text" && node.text) {
            const pre = preprocess(filterLanguage(node.text, lang), { lang, dir, resolveNote, resolveAsset });
            pre.assets.forEach((a) => assets.add(a));
            doc.texts[lang][node.id] = pre.md;
          } else if (node.type === "file" && node.file && !resolveNote(node.file, "")) {
            const asset = resolveAsset(node.file, "");
            if (asset && !DOC.test(asset))
              assets.add(asset);
          }
        }
      }
    }
    docs.set(rel, doc);
  }
  const fillUrls = (md, lang) => md.replace(/\u0001URL:([^\u0001]+)\u0001/g, (_, k) => noteUrl(k, lang));
  for (const lang of site.langs) {
    for (const n of notes[lang])
      n.md = fillUrls(n.md, lang);
    for (const d of docs.values()) {
      for (const id of Object.keys(d.texts[lang] ?? {}))
        d.texts[lang][id] = fillUrls(d.texts[lang][id], lang);
    }
  }
  for (const lang of site.langs) {
    const byUrl = new Map;
    for (const n of notes[lang]) {
      const other = byUrl.get(n.url.toLowerCase());
      if (other)
        report("error", n.key + ".md", `has the same URL ${n.url} as ${other.key}.md, so only one of them is published`);
      else
        byUrl.set(n.url.toLowerCase(), n);
    }
  }
  const backlinks = {};
  const tags = {};
  const trees = {};
  const folders = {};
  for (const lang of site.langs) {
    const bl = new Map;
    const tg = new Map;
    for (const n of notes[lang]) {
      const seen = new Set;
      for (const l of n.protected ? [] : n.links) {
        if (l.key === n.key || seen.has(l.key))
          continue;
        seen.add(l.key);
        bl.set(l.key, [...bl.get(l.key) ?? [], { note: n, context: l.context }]);
      }
      if (n.unlisted)
        continue;
      for (const tag of n.tags) {
        const parts = tag.split("/");
        for (let i = 1;i <= parts.length; i++) {
          const t = parts.slice(0, i).join("/");
          tg.set(t, [...tg.get(t) ?? [], n]);
        }
      }
    }
    backlinks[lang] = bl;
    tags[lang] = new Map([...tg].sort(([a], [b]) => a.localeCompare(b)));
    const { root, all } = buildTree(notes[lang].filter((n) => !n.unlisted && !n.isHome), lang);
    trees[lang] = root;
    folders[lang] = all;
  }
  if (sources.size === 0) {
    console.warn(site.publish === "explicit" ? `[datme] no note in ${site.vault} has \`publish: true\`; add it to the notes to share, or set \`publish: all\` in datme.yaml` : `[datme] no publishable note found in ${site.vault}`);
  }
  return {
    version,
    problems,
    docs,
    home,
    sources,
    notes,
    byKey,
    backlinks,
    tags,
    trees,
    folders,
    assets,
    resolveNote,
    resolveAsset
  };
}
function buildTree(list, lang) {
  const mk = (dir) => {
    const segment = dir.split("/").pop() ?? "";
    return {
      segment,
      name: folderDisplayName(segment),
      dir,
      url: slugToUrl(langPrefix(lang) + sluggify(dir)) + (dir ? "/" : ""),
      folders: [],
      notes: []
    };
  };
  const root = mk("");
  const all = new Map([["", root]]);
  const ensure = (dir) => {
    const hit = all.get(dir);
    if (hit)
      return hit;
    const node = mk(dir);
    all.set(dir, node);
    const parent = ensure(dir.includes("/") ? dir.slice(0, dir.lastIndexOf("/")) : "");
    parent.folders.push(node);
    return node;
  };
  for (const n of list) {
    const folder = ensure(n.dir);
    if (n.dir && n.source.stem === folder.segment)
      folder.folderNote = n;
    else
      folder.notes.push(n);
  }
  const collator = new Intl.Collator(lang, { numeric: true });
  for (const f of all.values()) {
    f.folders.sort((a, b) => collator.compare(a.segment, b.segment));
    f.notes.sort((a, b) => collator.compare(a.title, b.title));
  }
  return { root, all };
}
function assetUrl2(rel) {
  return "/assets/" + rel.split("/").map(encodeURIComponent).join("/");
}
var cached;
function getVault() {
  const version = globalThis.__vaultVersion ?? 0;
  if (!cached || cached.version !== version)
    cached = buildVault(version);
  return cached;
}

// src/lib/check.ts
function checkVault() {
  const vault = getVault();
  const problems = [...vault.problems];
  for (const item of site.nav) {
    if (item.kind !== "note")
      continue;
    const source = vault.resolveNote(item.target, "");
    if (!source)
      problems.push({ level: "warning", file: "datme.yaml", message: `nav: no published note matches "${item.target}"` });
  }
  const rank = { error: 0, warning: 1, info: 2 };
  return problems.sort((a, b) => a.file.localeCompare(b.file) || rank[a.level] - rank[b.level]);
}
function countProblems(problems) {
  const counts = { error: 0, warning: 0, info: 0 };
  for (const p of problems)
    counts[p.level]++;
  return counts;
}
var plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
function summarize(c) {
  const parts = [plural(c.error, "error"), plural(c.warning, "warning")];
  if (c.info)
    parts.push(`${plural(c.info, "link")} to unpublished notes`);
  return parts.join(", ");
}
function formatReport(problems, verbose = false) {
  const shown = verbose ? problems : problems.filter((p) => p.level !== "info");
  const lines = [];
  let file = "";
  for (const p of shown) {
    if (p.file !== file) {
      file = p.file;
      lines.push("", file);
    }
    lines.push(`  ${p.level.padEnd(7)} ${p.message}`);
  }
  const counts = countProblems(problems);
  lines.push("", summarize(counts));
  if (!verbose && counts.info)
    lines.push('Links to unpublished notes are expected in a private vault; "--verbose" lists them.');
  return lines.join(`
`).replace(/^\n/, "");
}
export {
  checkVault,
  countProblems,
  formatReport,
  summarize
};
