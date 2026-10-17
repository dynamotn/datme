import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fetchNeighbours, findInGarden } from "../src/lib/neighbours"
import { preprocess } from "../src/lib/obsidian"

mock.module("astro:transitions/client", () => ({ navigate: () => {} }))

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "datme-neighbours-"))
let server: ReturnType<typeof Bun.serve>
let up = true
const INDEX = {
  notes: [
    { u: "/Plants/Roses", t: "Roses", a: ["Rosa"], g: [] },
    { u: "/Plants/Compost-heap", t: "Compost heap", g: [] },
  ],
  links: [],
}

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch(req) {
      const url = new URL(req.url)
      if (!up) return new Response("down", { status: 503 })
      if (url.pathname === "/static/contentIndex.en-US.json") return Response.json(INDEX)
      if (url.pathname === "/") return new Response('<html lang="en-US"><body></body></html>', { headers: { "content-type": "text/html" } })
      return new Response("not found", { status: 404 })
    },
  })
})
afterAll(() => {
  server.stop(true)
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe("neighbour gardens", () => {
  test("their index is fetched in our languages, or in the garden's own, and their notes found by title, alias or path", async () => {
    const file = path.join(tmp, "a.json")
    const garden = `http://localhost:${server.port}`
    expect(await fetchNeighbours({ friend: garden }, ["vi-VN"], file, 5)).toEqual([])
    expect(findInGarden("friend", "Roses", "vi-VN", file)).toEqual({ url: `${garden}/Plants/Roses`, title: "Roses" })
    expect(findInGarden("friend", "rosa", "vi-VN", file)?.title).toBe("Roses")
    expect(findInGarden("friend", "Plants/Compost heap", "vi-VN", file)?.url).toBe(`${garden}/Plants/Compost-heap`)
    expect(findInGarden("friend", "Tulips", "vi-VN", file)).toBeNull()
    expect(findInGarden("stranger", "Roses", "vi-VN", file)).toBeUndefined()
  })

  test("a garden out of reach keeps its last known notes", async () => {
    const file = path.join(tmp, "b.json")
    const garden = `http://localhost:${server.port}`
    await fetchNeighbours({ friend: garden }, ["en-US"], file, 1)
    up = false
    try {
      expect(await fetchNeighbours({ friend: garden }, ["en-US"], file, 2)).toEqual(["friend"])
      expect(findInGarden("friend", "Roses", "en-US", file)?.title).toBe("Roses")
    } finally {
      up = true
    }
  })

  test("[[name:Note]] becomes a link to the other garden; a note it lacks is reported", () => {
    const ctx = {
      lang: "en-US",
      dir: "",
      resolveNote: () => undefined,
      resolveAsset: () => undefined,
      gardenLink: (name: string, target: string) =>
        name !== "friend" ? undefined : target === "Roses" ? { url: "https://friend.dev/Plants/Roses", title: "Roses" } : null,
    }
    const out = preprocess("See [[friend:Roses|her roses]], [[friend:Roses#Pruning]] and [[friend:Tulips]].", ctx)
    expect(out.md).toContain('<a href="https://friend.dev/Plants/Roses" class="garden-link" data-garden="friend" rel="noopener">her roses</a>')
    expect(out.md).toContain('href="https://friend.dev/Plants/Roses#pruning"')
    expect(out.md).toContain('<span class="broken-link" title="Not in friend">Tulips</span>')
    expect(out.problems).toEqual([{ kind: "garden", target: "friend:Tulips" }])
    // A colon in a name that is no neighbour stays an ordinary link.
    expect(preprocess("[[other:Thing]]", ctx).problems).toEqual([{ kind: "link", target: "other:Thing" }])
  })

  test("a remote note previews as its title and first paragraphs", async () => {
    const { remotePreview } = await import("../src/scripts/popover")
    expect(remotePreview("# Roses\n\nRoses need **sun** and [[Compost|good soil]].\n\n- Prune in spring\n\n```js\nx\n```\n\nMore.\n\nEven more.")).toEqual({
      title: "Roses",
      text: ["Roses need sun and good soil.", "Prune in spring", "More."],
    })
  })

  test("a vault linking to a neighbour builds the link and check warns of a note the neighbour lacks", async () => {
    const vault = path.join(tmp, "vault")
    fs.mkdirSync(vault, { recursive: true })
    fs.writeFileSync(path.join(vault, "datme.yaml"), `languages: [en-US]\nneighbours:\n  friend: http://localhost:${server.port}\n`)
    fs.writeFileSync(path.join(vault, "Note.md"), "---\npublish: true\n---\nAsk [[friend:Roses]] and [[friend:Tulips]].")
    const root = path.resolve(import.meta.dir, "..")
    const env = { ...process.env, ASTRO_TELEMETRY_DISABLED: "1", DATME_VAULT: "", VAULT_PATH: "", DATME_CACHE: path.join(tmp, "cache") }
    // Not spawnSync: the fake garden answers from this very process.
    const run = async (args: string[]) => {
      const p = Bun.spawn(["bun", "bin/datme.ts", ...args], { cwd: root, env, stdout: "pipe", stderr: "pipe" })
      const [stdout, stderr] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()])
      return { code: await p.exited, stdout, stderr }
    }
    const check = await run(["check", vault, "--verbose"])
    expect(check.stdout).toContain(`link to "Tulips" not found in the garden "friend"`)
    const out = path.join(tmp, "site")
    const build = await run(["build", vault, "--out", out])
    expect(build.code).toBe(0)
    const html = fs.readFileSync(path.join(out, "Note/index.html"), "utf8")
    // The pipeline marks it external, as any link out of the site.
    expect(html).toContain(`<a href="http://localhost:${server.port}/Plants/Roses" class="garden-link external" data-garden="friend"`)
    expect(fs.existsSync(path.join(tmp, "cache", "neighbours.json"))).toBe(true)
  }, 180_000)
})
