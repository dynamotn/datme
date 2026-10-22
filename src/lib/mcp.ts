/**
 * `datme mcp`: a Model Context Protocol server over stdio, so AI assistants
 * read the garden as the public does and cite it by its public URLs. It sees
 * the published view only: no private, protected or unlisted note, no locked
 * part, no comment. JSON-RPC 2.0, one message per line.
 */
import MiniSearch from "minisearch"
import { site, type Lang } from "../site.config"
import { getVault, type Note } from "./vault"
import { noteMarkdown, plainNotes } from "./llms"
import { relatedNotes } from "./related"
import { renderNote } from "./markdown"
import { absUrl, stripBase } from "./base"

export const PROTOCOL_VERSION = "2025-06-18"

/** The public URL of a note, absolute when the site has a URL. */
const urlOf = (n: Note) => absUrl(n.url)

/** The notes a language offers: the same as its markdown copies. */
const notesOf = (lang: Lang) => plainNotes(lang)

const langOf = (lang: unknown): Lang => (typeof lang === "string" && site.langs.includes(lang) ? lang : site.defaultLang)

/** A note by its URL (full or path), title, alias or vault path. */
export function findNote(ref: string, lang: Lang): Note | undefined {
  const notes = notesOf(lang)
  let path = ref.trim()
  try {
    path = decodeURI(new URL(path, "https://x").pathname)
  } catch {
    // not a URL: a title or a file
  }
  const bare = path.replace(/\/+$/, "").replace(/\.md$/, "")
  const lower = ref.trim().toLowerCase()
  return (
    notes.find((n) => decodeURI(n.url).replace(/\/+$/, "") === bare) ??
    // On a site served under a path, also the path without it.
    notes.find((n) => decodeURI(stripBase(n.url)).replace(/\/+$/, "") === bare) ??
    notes.find((n) => n.title.toLowerCase() === lower) ??
    notes.find((n) => n.aliases.some((a) => a.toLowerCase() === lower)) ??
    notes.find((n) => n.key === ref.trim().replace(/\.md$/, "").replace(/^\/+/, ""))
  )
}

const indexes = new Map<string, Promise<MiniSearch>>()

/** Full-text index of a language's notes: titles, aliases, tags and their markdown. */
function searchIndex(lang: Lang): Promise<MiniSearch> {
  const id = `${getVault().version}:${lang}`
  let hit = indexes.get(id)
  if (!hit) {
    hit = (async () => {
      const ms = new MiniSearch({
        fields: ["title", "aliases", "tags", "text"],
        storeFields: [],
        searchOptions: { boost: { title: 3, aliases: 2, tags: 2 }, prefix: true, fuzzy: 0.2 },
      })
      ms.addAll(notesOf(lang).map((n, id) => ({ id, title: n.title, aliases: n.aliases.join(" "), tags: n.tags.join(" "), text: noteMarkdown(n) })))
      return ms
    })()
    indexes.set(id, hit)
  }
  return hit
}

const TOOLS = [
  {
    name: "search",
    description: "Search the published notes of the garden by words. Returns titles, public URLs to cite and short descriptions.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Words to look for" },
        limit: { type: "number", description: "How many notes at most (default 10)" },
        lang: { type: "string", description: `Language of the notes: ${site.langs.join(", ")} (default ${site.defaultLang})` },
      },
      required: ["query"],
    },
  },
  {
    name: "read_note",
    description: "Read a published note as markdown, by its URL, title, alias or file path. The first line gives its public URL to cite.",
    inputSchema: {
      type: "object",
      properties: { note: { type: "string" }, lang: { type: "string" } },
      required: ["note"],
    },
  },
  {
    name: "backlinks",
    description: "The published notes that link to a note, with the sentence around each link.",
    inputSchema: {
      type: "object",
      properties: { note: { type: "string" }, lang: { type: "string" } },
      required: ["note"],
    },
  },
  {
    name: "related",
    description: "Published notes related to a note: shared tags and links, and closeness in meaning when the site computes it.",
    inputSchema: {
      type: "object",
      properties: { note: { type: "string" }, lang: { type: "string" } },
      required: ["note"],
    },
  },
]

type Args = Record<string, unknown>
const text = (t: string, isError = false) => ({ content: [{ type: "text", text: t }], ...(isError ? { isError: true } : {}) })

async function callTool(name: string, args: Args) {
  const lang = langOf(args.lang)
  if (name === "search") {
    const query = String(args.query ?? "").trim()
    if (!query) return text("Give a query.", true)
    const limit = Math.max(1, Math.min(50, Number(args.limit) || 10))
    const notes = notesOf(lang)
    const hits = (await searchIndex(lang)).search(query).slice(0, limit)
    if (!hits.length) return text(`No published note matches "${query}".`)
    const lines = await Promise.all(
      hits.map(async (h) => {
        const n = notes[h.id as number]
        const { description } = await renderNote(n)
        return `- [${n.title}](${urlOf(n)})${description ? `: ${description}` : ""}`
      }),
    )
    return text(lines.join("\n"))
  }
  const note = findNote(String(args.note ?? ""), lang)
  if (!note) return text(`No published note "${String(args.note ?? "")}" in ${lang}.`, true)
  if (name === "read_note") return text(`Source: ${urlOf(note)}\n\n${noteMarkdown(note)}`)
  if (name === "backlinks") {
    const shown = new Set(notesOf(lang).map((n) => n.key))
    const list = (getVault().backlinks[lang].get(note.key) ?? []).filter((b) => shown.has(b.note.key))
    if (!list.length) return text(`No published note links to "${note.title}".`)
    return text(list.map((b) => `- [${b.note.title}](${urlOf(b.note)})${b.context ? `: ${b.context}` : ""}`).join("\n"))
  }
  if (name === "related") {
    const shown = new Set(notesOf(lang).map((n) => n.key))
    const list = (await relatedNotes(note)).filter((r) => shown.has(r.note.key))
    if (!list.length) return text(`No related published note for "${note.title}".`)
    const why = (r: (typeof list)[number]) =>
      [...r.tags.map((t) => "#" + t), r.links ? `${r.links} shared links` : "", r.similarity ? "similar in meaning" : ""].filter(Boolean).join(", ")
    return text(list.map((r) => `- [${r.note.title}](${urlOf(r.note)}): ${why(r)}`).join("\n"))
  }
  return undefined
}

/** A resource's URI: the note's public URL, or a datme: URI without site.url. */
const uriOf = (n: Note) => (site.url ? urlOf(n) : `datme://${n.lang}${n.url}`)

function resourceByUri(uri: string): Note | undefined {
  for (const lang of site.langs) {
    const n = notesOf(lang).find((x) => uriOf(x) === uri)
    if (n) return n
  }
  return undefined
}

interface Request {
  jsonrpc: "2.0"
  id?: string | number | null
  method: string
  params?: Record<string, unknown>
}

/** The reply to one JSON-RPC message, or undefined for a notification. */
export async function handle(msg: Request): Promise<Record<string, unknown> | undefined> {
  if (msg.id === undefined || msg.id === null) return undefined
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id: msg.id, result })
  const fail = (code: number, message: string) => ({ jsonrpc: "2.0", id: msg.id, error: { code, message } })
  const p = msg.params ?? {}
  switch (msg.method) {
    case "initialize":
      return ok({
        protocolVersion: typeof p.protocolVersion === "string" ? p.protocolVersion : PROTOCOL_VERSION,
        capabilities: { tools: {}, resources: {} },
        serverInfo: { name: "datme", title: site.title[site.defaultLang], version: "1" },
        instructions: `The published notes of the digital garden "${site.title[site.defaultLang]}"${site.tagline[site.defaultLang] ? `: ${site.tagline[site.defaultLang]}` : ""}. Cite notes by the URLs the tools give.`,
      })
    case "ping":
      return ok({})
    case "tools/list":
      return ok({ tools: TOOLS })
    case "tools/call": {
      const result = await callTool(String(p.name), (p.arguments as Args) ?? {})
      return result ? ok(result) : fail(-32602, `Unknown tool "${String(p.name)}"`)
    }
    case "resources/list":
      return ok({
        resources: await Promise.all(
          site.langs.flatMap((lang) =>
            notesOf(lang).map(async (n) => {
              const { description } = await renderNote(n)
              return { uri: uriOf(n), name: n.key, title: n.title, mimeType: "text/markdown", ...(description ? { description } : {}) }
            }),
          ),
        ),
      })
    case "resources/read": {
      const n = resourceByUri(String(p.uri))
      if (!n) return fail(-32002, `Resource not found: ${String(p.uri)}`)
      return ok({ contents: [{ uri: uriOf(n), mimeType: "text/markdown", text: noteMarkdown(n) }] })
    }
    default:
      return fail(-32601, `Method not found: ${msg.method}`)
  }
}

/** Serve on stdin and stdout until stdin closes. Anything else the process prints goes to stderr. */
export async function serveStdio(): Promise<void> {
  console.log = console.error
  let buffer = ""
  let queue = Promise.resolve()
  const reply = (r: unknown) => void process.stdout.write(JSON.stringify(r) + "\n")
  process.stdin.setEncoding("utf8")
  process.stdin.on("data", (chunk: string) => {
    buffer += chunk
    let nl: number
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (!line) continue
      // Answers keep the order of the questions.
      queue = queue.then(async () => {
        let msg: Request
        try {
          msg = JSON.parse(line)
        } catch {
          reply({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })
          return
        }
        try {
          const r = await handle(msg)
          if (r) reply(r)
        } catch (e) {
          reply({ jsonrpc: "2.0", id: msg.id ?? null, error: { code: -32603, message: (e as Error).message } })
        }
      })
    }
  })
  await new Promise<void>((resolve) => process.stdin.on("end", () => void queue.then(resolve)))
}
