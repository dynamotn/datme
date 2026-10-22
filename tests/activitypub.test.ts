import { afterAll, describe, expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { BRIDGY_REDIRECTS, actor, handle, outbox, webfinger } from "../src/lib/activitypub"
import { headersFile } from "../src/lib/headers"
import { ConfigError, resolveConfig } from "../src/site.config"

const site = resolveConfig({ site: { url: "https://garden.example", title: "Garden", tagline: "Notes" }, activitypub: { username: "notes" } }, "/v")

describe("the fediverse", () => {
  test("WebFinger describes the garden's one account and points at its actor", () => {
    expect(handle(site, "notes")).toBe("@notes@garden.example")
    expect(webfinger(site, "notes")).toEqual({
      subject: "acct:notes@garden.example",
      aliases: ["https://garden.example/activitypub/actor.json", "https://garden.example/"],
      links: [
        { rel: "self", type: "application/activity+json", href: "https://garden.example/activitypub/actor.json" },
        { rel: "http://webfinger.net/rel/profile-page", type: "text/html", href: "https://garden.example/" },
      ],
    })
  })

  test("the actor names the garden and its outbox", () => {
    expect(actor(site, "notes")).toMatchObject({
      id: "https://garden.example/activitypub/actor.json",
      type: "Service",
      preferredUsername: "notes",
      name: "Garden",
      summary: "Notes",
      outbox: "https://garden.example/activitypub/outbox.json",
    })
  })

  test("the outbox holds each recent note as a public article, linking back", () => {
    const box = outbox(site, [
      { url: "/Roses", title: "Roses & <thorns>", summary: "Prune them.", published: new Date("2026-05-01T00:00:00Z"), tags: ["garden/flowers"] },
    ]) as any
    expect(box.totalItems).toBe(1)
    const item = box.orderedItems[0]
    expect(item).toMatchObject({ id: "https://garden.example/Roses#create", type: "Create", published: "2026-05-01T00:00:00.000Z" })
    expect(item.object.content).toBe('<p><a href="https://garden.example/Roses">Roses &amp; &lt;thorns&gt;</a></p><p>Prune them.</p>')
    expect(item.object.tag).toEqual([{ type: "Hashtag", name: "#garden_flowers" }])
  })

  test("static parts are served as JSON other servers may read; Bridgy Fed gets the redirects instead", () => {
    expect(headersFile(site)).toContain("/.well-known/webfinger\n  Content-Type: application/jrd+json")
    expect(headersFile(resolveConfig({ site: { url: "https://g.dev" }, activitypub: "bridgy" }, "/v"))).not.toContain("webfinger")
    expect(BRIDGY_REDIRECTS[1]).toBe("/.well-known/webfinger* https://fed.brid.gy/.well-known/webfinger 302")
  })

  test("needs site.url, and a plain username", () => {
    expect(() => resolveConfig({ activitypub: "bridgy" }, "/v")).toThrow(ConfigError)
    expect(() => resolveConfig({ site: { url: "https://g.dev" }, activitypub: { username: "a b" } }, "/v")).toThrow(ConfigError)
    expect(resolveConfig({}, "/v").activitypub).toBeUndefined()
  })
})

describe("built gardens on the fediverse", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "datme-ap-"))
  afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))
  const build = (name: string, config: string) => {
    const vault = path.join(tmp, name)
    fs.mkdirSync(vault, { recursive: true })
    fs.writeFileSync(path.join(vault, "datme.yaml"), `site:\n  url: https://garden.example\n  author: Ana\nlanguages: [en-US]\n${config}`)
    fs.writeFileSync(path.join(vault, "Roses.md"), "---\npublish: true\ncreated: 2026-05-01\ndescription: Prune them.\n---\nRoses need sun.")
    const out = path.join(tmp, `${name}-site`)
    const p = Bun.spawnSync(["bun", "bin/datme.ts", "build", vault, "--out", out], {
      cwd: path.resolve(import.meta.dir, ".."),
      env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1", DATME_VAULT: "", VAULT_PATH: "", DATME_CACHE: "" },
      stdout: "pipe",
      stderr: "pipe",
    })
    if (p.exitCode !== 0) throw new Error(p.stderr.toString())
    return (f: string) => fs.readFileSync(path.join(out, f), "utf8")
  }

  test("static: WebFinger, actor and outbox are written, and pages carry microformats", () => {
    const read = build("static", "activitypub:\n  username: notes\n")
    expect(JSON.parse(read(".well-known/webfinger")).subject).toBe("acct:notes@garden.example")
    expect(JSON.parse(read("activitypub/actor.json")).preferredUsername).toBe("notes")
    const box = JSON.parse(read("activitypub/outbox.json"))
    expect(box.orderedItems[0].object).toMatchObject({ url: "https://garden.example/Roses", name: "Roses", summary: "Prune them." })
    const note = read("Roses/index.html")
    expect(note).toMatch(/<article[^>]*class="note[^"]* h-entry"/)
    expect(note).toContain('<h1 class="note-title p-name">Roses</h1>')
    expect(note).toContain('class="prose e-content"')
    expect(note).toContain('<data class="u-url" value="https://garden.example/Roses" hidden></data>')
    expect(note).toContain('<a class="p-author h-card" href="https://garden.example/" hidden>Ana</a>')
    expect(read("index.html")).toMatch(/<div class="h-card" hidden>\s*<a class="p-name u-url" href="https:\/\/garden.example\/">Ana<\/a>/)
  }, 180_000)

  test("bridgy: WebFinger goes to Bridgy Fed, and no static actor is written", () => {
    const read = build("bridgy", "activitypub: bridgy\n")
    expect(read("_redirects")).toContain("/.well-known/webfinger* https://fed.brid.gy/.well-known/webfinger 302\n")
    expect(() => read("activitypub/actor.json")).toThrow()
  }, 180_000)
})
