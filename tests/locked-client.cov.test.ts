import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"
import { installDom, settle, type Dom } from "./client-dom"
import { encrypt } from "../src/lib/encrypt"
import { setupLocked } from "../src/scripts/locked"

const ITER = 1000
const KEY = "datme:pw:/en-US/secret"

describe("locked notes in the browser", () => {
  let dom: Dom
  let one: string
  let two: string
  let nested: string
  beforeAll(async () => {
    dom = installDom("https://garden.example/en-US/secret")
    one = await encrypt("<p>first secret</p>", "pw1", ITER)
    two = await encrypt("<p>second secret</p>", "pw2", ITER)
    nested = await encrypt(`<p>outer</p><div class="locked-part">${form(two)}</div>`, "pw1", ITER)
  })
  afterEach(() => sessionStorage.clear())
  afterAll(() => dom.restore())

  function form(payload: string) {
    return `<form class="locked" data-payload="${payload}" data-iterations="${ITER}"><input type="password"><button>Open</button><p class="locked-error" hidden>Wrong</p></form><div class="content" hidden></div>`
  }
  const submit = async (f: HTMLFormElement, password: string) => {
    f.querySelector("input")!.value = password
    f.dispatchEvent(new dom.window.Event("submit", { cancelable: true }) as unknown as Event)
    await waitFor(() => !f.isConnected || !f.querySelector<HTMLElement>(".locked-error")!.hidden)
  }
  const waitFor = async (cond: () => boolean) => {
    for (let i = 0; i < 200 && !cond(); i++) await settle(5)
  }

  test("a page without locked forms does nothing", () => {
    document.body.innerHTML = `<p>open</p>`
    let calls = 0
    setupLocked(() => calls++)
    expect(calls).toBe(0)
  })

  test("a wrong password says so and selects it for retyping", async () => {
    document.body.innerHTML = `<div class="locked-part">${form(one)}</div>`
    setupLocked(() => {})
    const f = document.querySelector<HTMLFormElement>("form.locked")!
    let selected = false
    f.querySelector("input")!.select = () => void (selected = true)
    await submit(f, "nope")
    expect(f.isConnected).toBe(true)
    expect(f.querySelector<HTMLElement>(".locked-error")!.hidden).toBe(false)
    expect(f.querySelector("button")!.disabled).toBe(false)
    expect(selected).toBe(true)
    expect(sessionStorage.getItem(KEY)).toBeNull()
  })

  test("the right password reveals the content, is remembered, and opens other parts too", async () => {
    document.body.innerHTML = `<div class="a">${form(one)}</div><div class="b">${form(one)}</div>`
    let revealed = 0
    setupLocked(() => revealed++)
    const [first] = document.querySelectorAll<HTMLFormElement>("form.locked")
    await submit(first, "pw1")
    await waitFor(() => revealed > 0)
    expect(document.querySelectorAll("form.locked")).toHaveLength(0)
    expect(document.querySelector(".a .content")!.innerHTML).toBe("<p>first secret</p>")
    expect(document.querySelector<HTMLElement>(".b .content")!.hidden).toBe(false)
    expect(revealed).toBe(1)
    expect(JSON.parse(sessionStorage.getItem(KEY)!)).toEqual(["pw1"])
  })

  test("content revealed may hold locked parts of its own, which get bound and tried", async () => {
    sessionStorage.setItem(KEY, JSON.stringify(["pw2"]))
    document.body.innerHTML = `<div class="outer">${form(nested)}</div>`
    let revealed = 0
    setupLocked(() => revealed++)
    // pw2 is tried right away but does not open the outer part.
    await waitFor(() => revealed > 0)
    expect(revealed).toBe(1)
    await submit(document.querySelector<HTMLFormElement>("form.locked")!, "pw1")
    await waitFor(() => !document.querySelector("form.locked"))
    // The inner part opened with the remembered pw2.
    expect(document.querySelector(".outer .content")!.textContent).toContain("second secret")
    expect(JSON.parse(sessionStorage.getItem(KEY)!)).toEqual(["pw2", "pw1"])
  })

  test("a remembered password is not stored twice; a plain one from older versions still works", async () => {
    sessionStorage.setItem(KEY, "pw1")
    document.body.innerHTML = `<div>${form(one)}</div>`
    let revealed = 0
    setupLocked(() => revealed++)
    await waitFor(() => !document.querySelector("form.locked"))
    expect(document.querySelector(".content")!.innerHTML).toBe("<p>first secret</p>")
    expect(sessionStorage.getItem(KEY)).toBe("pw1")

    // Submitting a password already remembered keeps the list as it is.
    sessionStorage.setItem(KEY, JSON.stringify(["pw1", 3]))
    document.body.innerHTML = `<div>${form(two)}</div>`
    setupLocked(() => {})
    await settle(50)
    sessionStorage.setItem(KEY, JSON.stringify(["pw2"]))
    await submit(document.querySelector<HTMLFormElement>("form.locked")!, "pw2")
    expect(JSON.parse(sessionStorage.getItem(KEY)!)).toEqual(["pw2"])
  })

  test("a non-list JSON value is read as a plain password", async () => {
    sessionStorage.setItem(KEY, "42")
    document.body.innerHTML = `<div>${form(one)}</div>`
    let revealed = 0
    setupLocked(() => revealed++)
    await waitFor(() => revealed > 0)
    expect(document.querySelector("form.locked")).not.toBeNull()
  })

  test("blocked storage means nothing is remembered, and the part still opens", async () => {
    const real = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage")!
    const blocked = {
      getItem() {
        throw new Error("blocked")
      },
      setItem() {
        throw new Error("blocked")
      },
      clear() {},
    }
    Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: blocked })
    try {
      document.body.innerHTML = `<div>${form(one)}</div>`
      setupLocked(() => {})
      await submit(document.querySelector<HTMLFormElement>("form.locked")!, "pw1")
      expect(document.querySelector(".content")!.innerHTML).toBe("<p>first secret</p>")
    } finally {
      Object.defineProperty(globalThis, "sessionStorage", real)
    }
  })

  test("a form removed while it decrypts is left alone", async () => {
    document.body.innerHTML = `<div>${form(one)}</div>`
    let revealed = 0
    setupLocked(() => revealed++)
    const f = document.querySelector<HTMLFormElement>("form.locked")!
    const content = document.querySelector<HTMLElement>(".content")!
    f.querySelector("input")!.value = "pw1"
    f.dispatchEvent(new dom.window.Event("submit", { cancelable: true }) as unknown as Event)
    f.remove()
    await waitFor(() => revealed > 0)
    expect(content.hidden).toBe(true)
    expect(content.innerHTML).toBe("")
    // A form that an earlier part replaced while trying passwords counts as done.
    sessionStorage.setItem(KEY, JSON.stringify(["pw1"]))
    document.body.innerHTML = `<div class="a">${form(one)}</div>`
    document.querySelector(".a .content")!.innerHTML = `<div class="inner">${form(two)}</div>`
    let again = 0
    setupLocked(() => again++)
    await waitFor(() => again > 0)
    expect(document.querySelectorAll("form.locked")).toHaveLength(0)
    expect(document.querySelector(".a .content")!.innerHTML).toBe("<p>first secret</p>")
  })
})
