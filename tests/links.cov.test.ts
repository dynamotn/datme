import { describe, expect, test } from "bun:test"
import { checkExternal, externalUrls, probe } from "../src/lib/links"

/** A fetch answering each call with the next of some responses (or throwing an error given instead). */
function fakeFetch(answers: (Response | Error | object)[]) {
  const calls: { url: string; method: string }[] = []
  const get = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method ?? "GET" })
    const next = answers.shift()
    if (!next) throw new Error("no more answers")
    if (next instanceof Error) throw next
    return next as Response
  }) as typeof fetch
  return { get, calls }
}

describe("externalUrls edge cases", () => {
  test("trailing punctuation goes, a parenthesis closing one inside the URL stays, and broken URLs are dropped", () => {
    const md = "Go to https://a.example/x). Then (see https://b.example/y_(z)), or https://[broken and https://c.example/q?a=1&amp;b=2!"
    expect(externalUrls(md)).toEqual(["https://a.example/x", "https://b.example/y_(z)", "https://c.example/q?a=1&b=2"])
  })

  test("the same URL linked several ways is listed once", () => {
    expect(externalUrls("[a](https://d.example/) <https://d.example/> https://d.example/")).toEqual(["https://d.example/"])
  })

  test("indented and tilde fences hide their URLs", () => {
    expect(externalUrls("  ~~~js\n  https://hidden.example\n  ~~~\nhttps://shown.example")).toEqual(["https://shown.example/"])
  })
})

describe("probe", () => {
  test("a server refusing HEAD is asked again with GET", async () => {
    const f = fakeFetch([new Response(null, { status: 405 }), new Response("ok", { status: 200 })])
    expect(await probe("https://x.example", { fetch: f.get })).toEqual({ ok: true })
    expect(f.calls.map((c) => c.method)).toEqual(["HEAD", "GET"])
  })

  test("404 and 410 mean the page is gone; other errors only that it could not be verified", async () => {
    const gone = fakeFetch([new Response(null, { status: 404 }), new Response(null, { status: 410 })])
    expect(await probe("https://x.example", { fetch: gone.get })).toEqual({ ok: false, level: "warning", reason: "returned 410" })
    const down = fakeFetch([new Response(null, { status: 503 })])
    expect(await probe("https://x.example", { fetch: down.get })).toEqual({ ok: false, level: "info", reason: "could not be verified (HTTP 503)" })
    // A status HEAD can be trusted with needs no GET.
    expect(down.calls).toHaveLength(1)
  })

  test("a body whose cancel fails does not fail the probe", async () => {
    const res = { ok: true, status: 200, body: { cancel: () => Promise.reject(new Error("already closed")) } }
    const f = fakeFetch([res])
    expect(await probe("https://x.example", { fetch: f.get })).toEqual({ ok: true })
  })

  test("network failures are named, timeouts said so", async () => {
    const refused = Object.assign(new Error("fetch failed"), { cause: { code: "ECONNREFUSED" } })
    expect(await probe("https://x.example", { fetch: fakeFetch([refused, refused]).get })).toEqual({
      ok: false,
      level: "warning",
      reason: "unreachable (ECONNREFUSED)",
    })
    const timeout = new DOMException("timed out", "TimeoutError")
    expect(await probe("https://x.example", { fetch: fakeFetch([timeout, timeout]).get })).toEqual({ ok: false, level: "warning", reason: "timed out" })
    const abort = new DOMException("aborted", "AbortError")
    expect((await probe("https://x.example", { fetch: fakeFetch([abort, abort]).get })).ok).toBe(false)
    const plain = async () => {
      throw "not an error"
    }
    expect(await probe("https://x.example", { fetch: plain as unknown as typeof fetch })).toEqual({ ok: false, level: "warning", reason: "unreachable (error)" })
  })

  test("a HEAD that throws is retried with GET, which may answer", async () => {
    const f = fakeFetch([new Error("HEAD unsupported"), new Response(null, { status: 200 })])
    expect(await probe("https://x.example", { fetch: f.get, timeoutMs: 50 })).toEqual({ ok: true })
  })
})

describe("checkExternal", () => {
  test("only dead links are reported, once per file linking them", async () => {
    const urls = new Map([
      ["https://alive.example", ["a.md"]],
      ["https://dead.example", ["a.md", "b.md"]],
      ["https://flaky.example", ["c.md"]],
    ])
    const get = (async (input: string | URL | Request) => {
      const u = String(input)
      if (u.includes("alive")) return new Response(null, { status: 200 })
      if (u.includes("dead")) return new Response(null, { status: 404 })
      return new Response(null, { status: 500 })
    }) as typeof fetch
    const problems = await checkExternal(urls, { fetch: get, concurrency: 2 })
    expect(problems.sort((a, b) => a.file.localeCompare(b.file))).toEqual([
      { level: "warning", file: "a.md", message: "external link https://dead.example returned 404", url: "https://dead.example" },
      { level: "warning", file: "b.md", message: "external link https://dead.example returned 404", url: "https://dead.example" },
      { level: "info", file: "c.md", message: "external link https://flaky.example could not be verified (HTTP 500)", url: "https://flaky.example" },
    ])
  })

  test("no URLs, no work", async () => {
    expect(await checkExternal(new Map())).toEqual([])
  })
})
