import { describe, expect, test } from "bun:test"
import path from "node:path"
import { findNote, handle } from "../src/lib/mcp"

const call = async (method: string, params: Record<string, unknown> = {}) =>
  (await handle({ jsonrpc: "2.0", id: 1, method, params })) as { result?: any; error?: { code: number; message: string } }
const tool = async (name: string, args: Record<string, unknown>) => (await call("tools/call", { name, arguments: args })).result

describe("datme mcp", () => {
  test("introduces the garden and its four tools", async () => {
    const init = (await call("initialize", { protocolVersion: "2025-06-18" })).result
    expect(init.protocolVersion).toBe("2025-06-18")
    expect(init.capabilities).toEqual({ tools: {}, resources: {} })
    expect(init.instructions).toContain("Khu vườn thử nghiệm")
    expect((await call("tools/list")).result.tools.map((t: { name: string }) => t.name)).toEqual(["search", "read_note", "backlinks", "related"])
  })

  test("notifications get no answer, unknown methods an error", async () => {
    expect(await handle({ jsonrpc: "2.0", method: "notifications/initialized" })).toBeUndefined()
    expect((await call("nope")).error!.code).toBe(-32601)
  })

  test("search finds published notes and gives their public URLs", async () => {
    const r = await tool("search", { query: "slip box" })
    expect(r.content[0].text).toContain("[Zettelkasten](https://notes.dynamotn.dev/03_Atomic/Zettelkasten)")
  })

  test("read_note gives the markdown copy with its source, found by title, URL or file", async () => {
    for (const ref of ["Zettelkasten", "https://notes.dynamotn.dev/03_Atomic/Zettelkasten/", "03_Atomic/Zettelkasten.md"]) {
      const r = await tool("read_note", { note: ref })
      expect(r.content[0].text).toStartWith("Source: https://notes.dynamotn.dev/03_Atomic/Zettelkasten\n\n# Zettelkasten\n")
    }
    expect((await tool("read_note", { note: "Zettelkasten method", lang: "en-US" })).content[0].text).toContain("/en-US/03_Atomic/Zettelkasten-method")
  })

  test("never shows what the public cannot read: protected, private or unlisted notes, comments", async () => {
    for (const note of ["Secret", "Private", "08_Journal/Unlisted.md"]) {
      const r = await tool("read_note", { note })
      expect(r.isError).toBe(true)
    }
    expect((await tool("read_note", { note: "Zettelkasten" })).content[0].text).not.toContain("a private comment")
    expect((await tool("search", { query: "Secret" })).content[0].text).not.toContain("06_Reference/Secret")
    const resources = (await call("resources/list")).result.resources as { uri: string }[]
    expect(resources.some((r) => r.uri.includes("Secret") || r.uri.includes("Unlisted"))).toBe(false)
  })

  test("backlinks and related notes, with the sentence around each link", async () => {
    const back = (await tool("backlinks", { note: "Niklas Luhmann" })).content[0].text
    expect(back).toMatch(/^- \[[^\]]+\]\(https:\/\/notes\.dynamotn\.dev\//)
    expect((await tool("related", { note: "Zettelkasten" })).content[0].text).toMatch(/^- \[/)
  })

  test("every published note is a resource, readable as markdown", async () => {
    const resources = (await call("resources/list")).result.resources as { uri: string; mimeType: string }[]
    const z = resources.find((r) => r.uri === "https://notes.dynamotn.dev/03_Atomic/Zettelkasten")!
    expect(z.mimeType).toBe("text/markdown")
    const read = (await call("resources/read", { uri: z.uri })).result
    expect(read.contents[0].text).toStartWith("# Zettelkasten\n")
    expect((await call("resources/read", { uri: "https://notes.dynamotn.dev/06_Reference/Secret" })).error!.code).toBe(-32002)
  })

  test("a note that is not published is not found", () => {
    expect(findNote("NoSuchNote", "vi-VN")).toBeUndefined()
  })

  test("over stdio, stdout carries only the protocol, one answer per question, in order", async () => {
    const root = path.resolve(import.meta.dir, "..")
    const proc = Bun.spawn(["bun", "bin/datme.ts", "mcp", "tests/fixtures/vault"], {
      cwd: root,
      env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1", DATME_VAULT: "", VAULT_PATH: "" },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    })
    const lines = [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "read_note", arguments: { note: "Zettelkasten" } } },
    ]
    proc.stdin.write(lines.map((l) => JSON.stringify(l)).join("\n") + "\n")
    proc.stdin.end()
    const out = await new Response(proc.stdout).text()
    await proc.exited
    const answers = out
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l))
    expect(answers.map((a) => a.id)).toEqual([1, 2])
    expect(answers[1].result.content[0].text).toContain("Source: https://notes.dynamotn.dev/03_Atomic/Zettelkasten")
  }, 60_000)
})
