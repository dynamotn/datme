import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { installDom, type Dom } from "./client-dom"
import type { Mention } from "../src/scripts/webmentions"

type Wm = typeof import("../src/scripts/webmentions")
let dom: Dom
let wm: Wm
const realFetch = globalThis.fetch
const feeds = new Map<string, () => Promise<Response>>()
const asked: string[] = []
beforeAll(async () => {
  dom = installDom("https://garden.example/notes/a")
  globalThis.fetch = (async (url: string) => {
    asked.push(String(url))
    const target = new URL(String(url)).searchParams.get("target[]")!
    return feeds.get(target)!()
  }) as unknown as typeof fetch
  wm = await import("../src/scripts/webmentions")
})
afterAll(() => {
  globalThis.fetch = realFetch
  dom.restore()
})

const json = (body: unknown) => () => Promise.resolve(new Response(JSON.stringify(body)))
const section = (target: string) => {
  dom.document.body.innerHTML = `<section data-webmentions="${target}" data-likes="{n} likes" data-reposts="{n} reposts" data-replied="replied" data-mentioned="mentioned" hidden>
    <div class="wm-pile"></div><ul class="wm-list"></ul></section>`
  return dom.document.querySelector<HTMLElement>("section")!
}

describe("webmentions on a note", () => {
  test("likes and reposts pile up as faces, replies and mentions are listed in full", async () => {
    dom.document.documentElement.lang = "en-US"
    const long = "x".repeat(600)
    const mentions: Mention[] = [
      { "wm-property": "like-of", url: "https://social.example/1", author: { name: "Ann", photo: "https://img.example/ann.png", url: "https://ann.example" } },
      { "wm-property": "bookmark-of", url: "https://social.example/2", author: { name: "Bob", photo: "javascript:alert(1)" } },
      { "wm-property": "repost-of", url: "javascript:alert(1)", author: { url: "ftp://nope" } },
      { "wm-property": "in-reply-to", url: "https://blog.example/reply", published: "2024-03-05T10:00:00Z", author: { name: "Cat" }, content: { text: `  ${long}  ` } },
      { "wm-property": "mention-of", url: "https://other.example/post", "wm-received": "2024-01-02T00:00:00Z", content: { text: "  " } },
      { "wm-property": "mention-of", url: "javascript:void 0", published: "not a date", author: { name: "" } },
    ]
    feeds.set("https://garden.example/notes/a", json({ children: mentions }))
    const s = section("https://garden.example/notes/a")
    await wm.setupWebmentions()
    expect(asked[0]).toBe("https://webmention.io/api/mentions.jf2?target%5B%5D=https%3A%2F%2Fgarden.example%2Fnotes%2Fa&target%5B%5D=https%3A%2F%2Fgarden.example%2Fnotes%2Fa%2F&per-page=200")
    expect(s.hidden).toBe(false)

    const pile = s.querySelector(".wm-pile")!
    expect([...pile.children].map((c) => c.textContent)).toEqual(["", "2 likes", "", "1 reposts"])
    const [likes, reposts] = pile.querySelectorAll(".wm-faces")
    const [ann, bob] = likes.children
    expect(ann.tagName).toBe("A")
    expect(ann.getAttribute("href")).toBe("https://ann.example")
    expect(ann.getAttribute("rel")).toBe("noopener noreferrer nofollow ugc")
    expect(ann.querySelector("img")!.getAttribute("src")).toBe("https://img.example/ann.png")
    // Unsafe photos are dropped; without an author URL the post's own is linked.
    expect(bob.getAttribute("href")).toBe("https://social.example/2")
    expect(bob.querySelector("img")!.hasAttribute("src")).toBe(false)
    // With no web link at all, the face is a bare image.
    expect(reposts.firstElementChild!.tagName).toBe("IMG")
    expect(reposts.firstElementChild!.getAttribute("alt")).toBe("")

    const items = [...s.querySelectorAll<HTMLElement>(".wm-item")]
    expect(items).toHaveLength(3)
    const meta = items.map((li) => li.querySelector(".wm-meta")!.textContent)
    // Oldest first; a mention with a bad date sorts first and shows none.
    expect(meta[0]).toBe("garden.example mentioned")
    expect(meta[1]).toBe("other.example mentioned · Jan 2, 2024")
    expect(meta[2]).toBe("Cat replied · Mar 5, 2024")
    expect(items[0].querySelector(".wm-meta a")!.hasAttribute("href")).toBe(false)
    expect(items[2].querySelector(".wm-meta a")!.getAttribute("href")).toBe("https://blog.example/reply")
    const text = items[2].querySelector(".wm-text")!.textContent!
    expect(text).toHaveLength(500)
    expect(text.endsWith("…")).toBe(true)
    expect(items[1].querySelector(".wm-text")).toBeNull()
  })

  test("a short reply is shown whole; only reposts make one pile", async () => {
    feeds.set("https://garden.example/b", json({ children: [{ "wm-property": "repost-of", url: "https://x.example/r" }, { "wm-property": "in-reply-to", url: "https://x.example/p", content: { text: "Nice!" } }] }))
    const s = section("https://garden.example/b")
    await wm.setupWebmentions()
    expect([...s.querySelector(".wm-pile")!.children].map((c) => c.textContent)).toEqual(["", "1 reposts"])
    expect(s.querySelector(".wm-text")!.textContent).toBe("Nice!")
  })

  test("nobody mentioned the note: the section stays hidden", async () => {
    feeds.set("https://garden.example/c", json({ children: [{ "wm-property": "rsvp", url: "https://x.example" }] }))
    const s = section("https://garden.example/c")
    await wm.setupWebmentions()
    expect(s.hidden).toBe(true)
  })

  test("a feed without children, a failed answer or a network error show nothing", async () => {
    feeds.set("https://garden.example/d", json({}))
    feeds.set("https://garden.example/e", () => Promise.resolve(new Response("down", { status: 503 })))
    feeds.set("https://garden.example/f", () => Promise.reject(new Error("offline")))
    for (const t of ["d", "e", "f"]) {
      const s = section(`https://garden.example/${t}`)
      await wm.setupWebmentions()
      expect(s.hidden).toBe(true)
    }
  })

  test("a section is filled once, its mentions fetched once; a page without one does nothing", async () => {
    feeds.set("https://garden.example/g", json({ children: [{ "wm-property": "like-of", url: "https://x.example/l" }] }))
    const before = asked.length
    let s = section("https://garden.example/g")
    await wm.setupWebmentions()
    await wm.setupWebmentions()
    expect(s.querySelectorAll(".wm-faces")).toHaveLength(1)
    s = section("https://garden.example/g")
    await wm.setupWebmentions()
    expect(asked.length - before).toBe(1)
    dom.document.body.innerHTML = ""
    await expect(wm.setupWebmentions()).resolves.toBeUndefined()
  })
})
