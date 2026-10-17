import { describe, expect, test } from "bun:test"
import { outsideHosts, privateLinkText, showsName } from "../src/lib/privacy"

const base = { theme: { fonts: {} as Record<string, string | undefined> }, map: { tiles: "https://tile.example/{z}/{x}/{y}.png" }, linkPreviews: false }
const hostsOf = (config: Parameters<typeof outsideHosts>[0], embedded: string[] = [], hasMap = false) =>
  outsideHosts(config, "https://font.example/mono.css", embedded, hasMap)

describe("outsideHosts", () => {
  test("fonts named in the theme load from Google Fonts", () => {
    const hosts = hostsOf({ ...base, theme: { fonts: { heading: "Fraunces", body: undefined } } })
    expect(hosts.map((h) => h.host)).toEqual(["font.example", "fonts.googleapis.com", "fonts.gstatic.com"])
  })

  test("each analytics provider names its host", () => {
    const of = (analytics: { provider: string; host?: string; id?: string }) =>
      hostsOf({ ...base, analytics }).filter((h) => h.why === "analytics").map((h) => h.host)
    expect(of({ provider: "google" })).toEqual(["www.googletagmanager.com"])
    expect(of({ provider: "plausible" })).toEqual(["plausible.io"])
    expect(of({ provider: "plausible", host: "stats.example" })).toEqual(["stats.example"])
    expect(of({ provider: "umami", host: "https://umami.example/script.js" })).toEqual(["umami.example"])
    expect(of({ provider: "goatcounter", id: "garden" })).toEqual(["garden.goatcounter.com"])
    expect(of({ provider: "none" })).toEqual([])
  })

  test("comments, webmentions and subscribe forms", () => {
    const hosts = (extra: object) => hostsOf({ ...base, ...extra }).filter((h) => h.host !== "font.example")
    expect(hosts({ comments: { provider: "giscus" } })).toEqual([{ host: "giscus.app", why: "comments" }])
    expect(hosts({ comments: { provider: "commento", host: "https://talk.example" } })).toEqual([{ host: "talk.example", why: "comments" }])
    expect(hosts({ webmentions: {} })).toEqual([{ host: "webmention.io", why: "webmentions" }])
    expect(hosts({ subscribe: { provider: "buttondown" } })).toEqual([{ host: "buttondown.com", why: "subscribe form" }])
    expect(hosts({ subscribe: { provider: "form", action: "https://lists.example/join" } })).toEqual([{ host: "lists.example", why: "subscribe form" }])
  })

  test("map tiles in both themes, search by meaning, link previews last", () => {
    const hosts = hostsOf(
      { ...base, map: { tiles: "https://{s}.light.example/{z}.png", darkTiles: "https://dark.example/{z}.png" }, search: { meaning: true }, linkPreviews: true },
      [],
      true,
    )
    expect(hosts).toEqual([
      { host: "a.light.example", why: "map tiles" },
      { host: "cdn.jsdelivr.net", why: "search by meaning, once a reader turns it on" },
      { host: "dark.example", why: "map tiles" },
      { host: "font.example", why: "monospace font of every page" },
      { host: "huggingface.co", why: "search by meaning, once a reader turns it on" },
      { host: "(the linked sites)", why: "images of link preview cards" },
    ])
  })

  test("what is not a URL names no host; the first reason for a host wins", () => {
    const hosts = hostsOf({ ...base, search: { meaning: false } }, ["not a url", "", "https://font.example/embed"])
    expect(hosts).toEqual([{ host: "font.example", why: "monospace font of every page" }])
  })
})

describe("private link words", () => {
  test("text mode without alias shows the bare note name", () => {
    expect(privateLinkText("text", "Folder/Diary.md#Today", undefined, "x")).toBe("Diary")
    expect(privateLinkText("hide", "Diary", "  diary ", "x")).toBe("")
    expect(showsName("Diary.MD", "DIARY")).toBe(true)
  })
})
