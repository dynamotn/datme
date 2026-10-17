import { afterEach, describe, expect, test } from "bun:test"
import { PassThrough } from "node:stream"
import { site } from "../src/site.config"
import { findNote, handle, PROTOCOL_VERSION, serveStdio } from "../src/lib/mcp"

const call = async (method: string, params?: Record<string, unknown>) =>
  (await handle({ jsonrpc: "2.0", id: 7, method, ...(params ? { params } : {}) })) as { id: unknown; result?: any; error?: { code: number; message: string } }
const tool = async (name: string, args?: Record<string, unknown>) => (await call("tools/call", { name, ...(args ? { arguments: args } : {}) }))

const savedUrl = site.url
const savedTagline = { ...site.tagline }
afterEach(() => {
  site.url = savedUrl
  site.tagline = { ...savedTagline }
})

describe("mcp protocol edges", () => {
  test("ping answers empty; initialize without a version offers its own", async () => {
    expect(await call("ping")).toEqual({ jsonrpc: "2.0", id: 7, result: {} } as never)
    const init = (await call("initialize")).result
    expect(init.protocolVersion).toBe(PROTOCOL_VERSION)
    expect(init.serverInfo).toEqual({ name: "datme", title: site.title[site.defaultLang], version: "1" })
    expect(init.instructions).toContain(": A test notebook.")
  })

  test("initialize without a tagline says only the title", async () => {
    site.tagline = { ...site.tagline, [site.defaultLang]: "" }
    const init = (await call("initialize")).result
    expect(init.instructions).toBe(`The published notes of the digital garden "${site.title[site.defaultLang]}". Cite notes by the URLs the tools give.`)
  })

  test("a null id is a notification too", async () => {
    expect(await handle({ jsonrpc: "2.0", id: null, method: "ping" })).toBeUndefined()
  })

  test("an unknown tool on a known note is an invalid-params error", async () => {
    const r = await tool("summarize", { note: "Zettelkasten" })
    expect(r.error).toEqual({ code: -32602, message: 'Unknown tool "summarize"' })
  })

  test("tools/call without arguments asks for a note", async () => {
    const r = (await tool("read_note")).result
    expect(r.isError).toBe(true)
    expect(r.content[0].text).toBe(`No published note "" in ${site.defaultLang}.`)
  })
})

describe("mcp tools edges", () => {
  test("search wants a query and says when nothing matches", async () => {
    expect((await tool("search", { query: "   " })).result).toEqual({ content: [{ type: "text", text: "Give a query." }], isError: true })
    const none = (await tool("search", { query: "qqqqzzzzxxxx" })).result
    expect(none.content[0].text).toBe('No published note matches "qqqqzzzzxxxx".')
    expect(none.isError).toBeUndefined()
  })

  test("search obeys its limit and the language asked for", async () => {
    const one = (await tool("search", { query: "note", limit: 1, lang: "en-US" })).result.content[0].text as string
    expect(one.split("\n")).toHaveLength(1)
    expect(one).toContain("https://notes.dynamotn.dev/en-US/")
    // An unknown language falls back to the default one.
    const fallback = (await tool("search", { query: "slip box", lang: "xx" })).result.content[0].text as string
    expect(fallback).toContain("/03_Atomic/Zettelkasten)")
  }, 60_000)

  test("backlinks and related say when there are none", async () => {
    const lonely = (await import("../src/lib/llms")).plainNotes("vi-VN")
    const { getVault } = await import("../src/lib/vault")
    const backlinks = getVault().backlinks["vi-VN"]
    const noBacklinks = lonely.find((n) => !(backlinks.get(n.key) ?? []).length)!
    expect((await tool("backlinks", { note: noBacklinks.key })).result.content[0].text).toBe(`No published note links to "${noBacklinks.title}".`)
    const { relatedNotes } = await import("../src/lib/related")
    let noRelated
    for (const n of lonely) {
      if (!(await relatedNotes(n)).length) {
        noRelated = n
        break
      }
    }
    expect(noRelated).toBeDefined()
    expect((await tool("related", { note: noRelated!.key })).result.content[0].text).toBe(`No related published note for "${noRelated!.title}".`)
  })

  test("tools/list offers the four tools; backlinks give the sentence around each link", async () => {
    expect((await call("tools/list")).result.tools).toHaveLength(4)
    const back = (await tool("backlinks", { note: "Niklas Luhmann" })).result.content[0].text as string
    expect(back).toMatch(/^- \[[^\]]+\]\(https:\/\/notes\.dynamotn\.dev\//)
  })

  test("related lists why: tags and shared links", async () => {
    const text = (await tool("related", { note: "Zettelkasten" })).result.content[0].text as string
    expect(text).toMatch(/: (#\S+|\d+ shared links)/)
  })

  test("findNote by alias, and a malformed URL is taken as a title", () => {
    const { getVault } = require("../src/lib/vault") as typeof import("../src/lib/vault")
    const withAlias = getVault().notes["vi-VN"].find((n) => n.aliases.length && !n.unlisted && !n.protected && !n.isHome)!
    expect(findNote(withAlias.aliases[0].toUpperCase(), "vi-VN")?.key).toBe(withAlias.key)
    expect(findNote("%E0%A4%A", "vi-VN")).toBeUndefined()
  })
})

describe("mcp resources without a site URL", () => {
  test("resources use datme: URIs and read back by them", async () => {
    site.url = undefined
    const list = (await call("resources/list")).result.resources as { uri: string; description?: string }[]
    const z = list.find((r) => r.uri === "datme://vi-VN/03_Atomic/Zettelkasten")!
    expect(z).toBeDefined()
    expect(list.some((r) => r.description)).toBe(true)
    const read = (await call("resources/read", { uri: z.uri })).result
    expect(read.contents[0].uri).toBe(z.uri)
    // Resources of the second language are found too.
    const en = list.find((r) => r.uri.startsWith("datme://en-US/"))!
    expect((await call("resources/read", { uri: en.uri })).result.contents[0].uri).toBe(en.uri)
    // read_note gives a relative source then.
    expect((await tool("read_note", { note: "Zettelkasten" })).result.content[0].text).toStartWith("Source: /03_Atomic/Zettelkasten\n")
    expect((await call("resources/read", { uri: "datme://vi-VN/nowhere" })).error).toEqual({ code: -32002, message: "Resource not found: datme://vi-VN/nowhere" })
  }, 60_000)
})

describe("serveStdio", () => {
  test("answers each line in order, skips blanks and notifications, reports parse and internal errors", async () => {
    const stdin = new PassThrough()
    const written: string[] = []
    const realStdin = Object.getOwnPropertyDescriptor(process, "stdin")!
    const realWrite = process.stdout.write
    const realLog = console.log
    Object.defineProperty(process, "stdin", { value: stdin, configurable: true })
    process.stdout.write = ((s: string) => {
      written.push(s)
      return true
    }) as typeof process.stdout.write
    try {
      const done = serveStdio()
      // console.log is redirected so nothing else reaches stdout.
      expect(console.log).toBe(console.error)
      stdin.write('{"jsonrpc":"2.0","id":1,"method":"ping"}\n\n   \n{not json}\n')
      stdin.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n')
      // A message whose params make the handler throw: arguments that are not an object.
      stdin.write('{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"read_note","arguments":{"note":{"toString":1}}}}\n')
      stdin.write('{"jsonrpc":"2.0","method":"tools/call","params":{"name":"read_note","arguments":{"note":{"toString":1}}}}\n')
      stdin.write('{"jsonrpc":"2.0","id":3,"method":"nope"}')
      stdin.end("\n")
      await done
    } finally {
      Object.defineProperty(process, "stdin", realStdin)
      process.stdout.write = realWrite
      console.log = realLog
    }
    const answers = written.map((l) => JSON.parse(l))
    expect(written.every((l) => l.endsWith("\n"))).toBe(true)
    expect(answers[0]).toEqual({ jsonrpc: "2.0", id: 1, result: {} })
    expect(answers[1]).toEqual({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })
    expect(answers[2].id).toBe(2)
    expect(answers[2].error.code).toBe(-32603)
    expect(answers.at(-1)).toEqual({ jsonrpc: "2.0", id: 3, error: { code: -32601, message: "Method not found: nope" } })
    expect(answers).toHaveLength(4)
  })
})
