import { afterAll, describe, expect, test } from "bun:test"
import path from "node:path"
import { cardSpec, renderIcon, renderOg, setOgWorkers } from "../src/lib/og"
import { reply } from "../src/lib/og-worker"

const card = { title: "Zettelkasten", kicker: "Garden", meta: "Jan 5, 2026", tags: ["idea"], logo: "✦" }
const fixture = (name: string) => path.join(import.meta.dir, "fixtures/og", name)
afterAll(() => setOgWorkers(0))

describe("social cards drawn in worker threads", () => {
  test("a card drawn by a worker is the card drawn on this thread, byte for byte", async () => {
    setOgWorkers(0)
    const here = await renderOg(card, cardSpec("garden"))
    setOgWorkers(2)
    const cards = await Promise.all([renderOg(card, cardSpec("garden")), renderOg(card, cardSpec("garden")), renderIcon("✦", 64)])
    expect(Buffer.compare(cards[0], here)).toBe(0)
    expect(Buffer.compare(cards[1], here)).toBe(0)
    expect(cards[2].subarray(1, 4).toString()).toBe("PNG")
  }, 30_000)

  test("a worker that answers with an error, or fails to start, leaves the card to this thread", async () => {
    setOgWorkers(0)
    const here = await renderOg(card)
    setOgWorkers(1, fixture("refuses.ts"))
    expect(Buffer.compare(await renderOg(card), here)).toBe(0)
    setOgWorkers(1, fixture("broken.ts"))
    expect(Buffer.compare(await renderOg(card), here)).toBe(0)
    // Once a worker failed, no other starts.
    expect(Buffer.compare(await renderOg(card), here)).toBe(0)
  }, 30_000)

  test("idle workers never keep the process running once its cards are drawn", () => {
    const script = `import { renderIcon, setOgWorkers } from ${JSON.stringify(path.join(import.meta.dir, "../src/lib/og"))}; setOgWorkers(4); await renderIcon("x", 32); console.log("drawn")`
    const p = Bun.spawnSync(["bun", "-e", script], { timeout: 20_000, stdout: "pipe", stderr: "pipe" })
    expect(p.stdout.toString().trim()).toBe("drawn")
    expect(p.exitCode).toBe(0)
  }, 30_000)

  test("the worker answers a job with its PNG, or with why it cannot be drawn", async () => {
    const sent: unknown[] = []
    const port = { postMessage: (m: unknown) => void sent.push(m) }
    await reply(port, { id: 1, tree: { type: "div", props: { style: {} } }, width: 10, height: 10 })
    await reply(port, { id: 2, tree: { type: "div", props: { style: { display: "grid" } } }, width: 10, height: 10 })
    expect(sent[0]).toMatchObject({ id: 1, png: expect.any(Uint8Array) })
    expect(sent[1]).toMatchObject({ id: 2, error: expect.stringContaining("display") })
  })
})
