import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"
import { installDom, settle, type Dom } from "./client-dom"

type PageMenu = typeof import("../src/scripts/page-menu")

describe("the markdown menu", () => {
  let dom: Dom
  let menu: PageMenu
  const realFetch = globalThis.fetch
  const realClipboardItem = (globalThis as { ClipboardItem?: unknown }).ClipboardItem
  let written: string[] = []
  let items: unknown[] = []

  const clipboard = (withWrite: boolean) => ({
    writeText: async (t: string) => void written.push(t),
    write: withWrite ? async (list: { blob: Promise<Blob> }[]) => void items.push(await (await list[0].blob).text()) : undefined,
  })
  const setClipboard = (value: unknown) => Object.defineProperty(navigator, "clipboard", { configurable: true, value })

  beforeAll(async () => {
    dom = installDom("https://garden.example/en-US/note")
    globalThis.fetch = (async (url: string) =>
      String(url).includes("missing") ? new Response("no", { status: 404 }) : new Response(`# md of ${url}`)) as unknown as typeof fetch
    menu = await import("../src/scripts/page-menu")
  })
  afterEach(() => {
    written = []
    items = []
    delete (globalThis as { ClipboardItem?: unknown }).ClipboardItem
    if (realClipboardItem) (globalThis as { ClipboardItem?: unknown }).ClipboardItem = realClipboardItem
  })
  afterAll(() => {
    globalThis.fetch = realFetch
    dom.restore()
  })

  test("copyFrom writes plain text where ClipboardItem is missing", async () => {
    delete (globalThis as { ClipboardItem?: unknown }).ClipboardItem
    setClipboard(clipboard(false))
    await menu.copyFrom("/a.md")
    expect(written).toEqual(["# md of /a.md"])
  })

  test("copyFrom hands a ClipboardItem whose text is fetched inside the click", async () => {
    ;(globalThis as { ClipboardItem?: unknown }).ClipboardItem = class {
      blob: Promise<Blob>
      constructor(data: Record<string, Promise<Blob>>) {
        this.blob = data["text/plain"]
      }
    }
    setClipboard(clipboard(true))
    await menu.copyFrom("/b.md")
    expect(items).toEqual(["# md of /b.md"])
    expect(written).toEqual([])
  })

  test("copyFrom fails on a missing file", async () => {
    setClipboard(clipboard(false))
    await expect(menu.copyFrom("/missing.md")).rejects.toThrow("404 /missing.md")
  })

  test("without a clipboard the copy button stays hidden", () => {
    setClipboard(undefined)
    document.body.innerHTML = `<button data-copy-markdown="/a.md" hidden>Copy</button>`
    menu.setupPageMenu()
    expect(document.querySelector("button")!.hidden).toBe(true)
  })

  test("the button shows, copies, says so and goes back to its label", async () => {
    setClipboard(clipboard(false))
    document.body.innerHTML = `<p>text</p><button data-copy-markdown="/a.md" hidden>Copy</button>`
    document.body.dataset.copied = "Done"
    menu.setupPageMenu()
    menu.setupPageMenu()
    const button = document.querySelector("button")!
    expect(button.hidden).toBe(false)
    // A click elsewhere copies nothing.
    document.querySelector("p")!.click()
    await settle()
    expect(written).toEqual([])
    button.click()
    await settle(5)
    // Bound once, so a second setup copies once.
    expect(written).toEqual(["# md of /a.md"])
    expect(button.textContent).toBe("Done")
    await settle(1250)
    expect(button.textContent).toBe("Copy")
    delete document.body.dataset.copied
  })

  test("the label defaults to Copied, and a failed copy leaves the label alone", async () => {
    setClipboard(clipboard(false))
    document.body.innerHTML = `<button id="ok" data-copy-markdown="/a.md">Copy</button><button id="ko" data-copy-markdown="/missing.md">Copy</button>`
    document.getElementById("ok")!.click()
    document.getElementById("ko")!.click()
    await settle(5)
    expect(document.getElementById("ok")!.textContent).toBe("Copied")
    expect(document.getElementById("ko")!.textContent).toBe("Copy")
  })
})
