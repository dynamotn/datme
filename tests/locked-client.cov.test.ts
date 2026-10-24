import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"
import { installDom, settle, type Dom } from "./client-dom"
import { encrypt } from "../src/lib/encrypt"
import { passwordKey, payloadKey, saltOf } from "../src/scripts/decrypt"
import { forgetPasswords, setupLocked } from "../src/scripts/locked"

const ITER = 1000
const KEY = "datme:keys:/en-US/secret"

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
  afterEach(() => {
    forgetPasswords()
    dom.goto("https://garden.example/en-US/secret")
  })
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
  const keyOf = async (payload: string, password: string) => (await payloadKey(payload, await passwordKey(password), ITER))!
  /** Everything sessionStorage holds, as one string. */
  const stored = () =>
    JSON.stringify(
      Object.fromEntries(Array.from({ length: sessionStorage.length }, (_, i) => [sessionStorage.key(i), sessionStorage.getItem(sessionStorage.key(i)!)])),
    )

  test("a page without locked forms does nothing, but drops the passwords older versions kept", () => {
    sessionStorage.setItem("datme:pw:/en-US/old", JSON.stringify(["pw1"]))
    sessionStorage.setItem("datme:pw:/en-US/older", "pw2")
    sessionStorage.setItem("datme:trail", "kept")
    document.body.innerHTML = `<p>open</p>`
    let calls = 0
    setupLocked(() => calls++)
    expect(calls).toBe(0)
    expect(sessionStorage.getItem("datme:pw:/en-US/old")).toBeNull()
    expect(sessionStorage.getItem("datme:pw:/en-US/older")).toBeNull()
    expect(sessionStorage.getItem("datme:trail")).toBe("kept")
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

  test("the right password reveals the content and opens other parts too; only their keys are stored", async () => {
    const other = await encrypt("<p>same password</p>", "pw1", ITER)
    document.body.innerHTML = `<div class="a">${form(one)}</div><div class="b">${form(other)}</div>`
    let revealed = 0
    setupLocked(() => revealed++)
    const [first] = document.querySelectorAll<HTMLFormElement>("form.locked")
    const input = first.querySelector("input")!
    await submit(first, "pw1")
    await waitFor(() => revealed > 0)
    expect(document.querySelectorAll("form.locked")).toHaveLength(0)
    expect(document.querySelector(".a .content")!.innerHTML).toBe("<p>first secret</p>")
    expect(document.querySelector(".b .content")!.innerHTML).toBe("<p>same password</p>")
    expect(revealed).toBe(1)
    // The password leaves the field, and never reaches storage.
    expect(input.value).toBe("")
    expect(JSON.parse(sessionStorage.getItem(KEY)!)).toEqual({ [saltOf(one)]: await keyOf(one, "pw1"), [saltOf(other)]: await keyOf(other, "pw1") })
    expect(stored()).not.toContain("pw1")
  })

  test("after a reload, the stored keys open the parts opened before, and only those", async () => {
    sessionStorage.setItem(KEY, JSON.stringify({ [saltOf(one)]: await keyOf(one, "pw1") }))
    document.body.innerHTML = `<div class="a">${form(one)}</div><div class="b">${form(two)}</div>`
    let revealed = 0
    setupLocked(() => revealed++)
    await waitFor(() => revealed > 0)
    expect(document.querySelector(".a .content")!.innerHTML).toBe("<p>first secret</p>")
    expect(document.querySelector(".b form.locked")).not.toBeNull()
  })

  test("a password that worked opens the parts of the next pages too, until the tab forgets it", async () => {
    document.body.innerHTML = `<div>${form(one)}</div>`
    setupLocked(() => {})
    await submit(document.querySelector<HTMLFormElement>("form.locked")!, "pw1")
    dom.goto("https://garden.example/en-US/next")
    const next = await encrypt("<p>next page</p>", "pw1", ITER)
    document.body.innerHTML = `<div>${form(next)}</div>`
    let revealed = 0
    setupLocked(() => revealed++)
    await waitFor(() => revealed > 0)
    expect(document.querySelector(".content")!.innerHTML).toBe("<p>next page</p>")
    expect(Object.keys(JSON.parse(sessionStorage.getItem("datme:keys:/en-US/next")!))).toEqual([saltOf(next)])
    // Forgotten, nothing opens by itself.
    forgetPasswords()
    expect(stored()).not.toContain("datme:keys:")
    document.body.innerHTML = `<div>${form(next)}</div>`
    setupLocked(() => revealed++)
    await settle(50)
    expect(document.querySelector("form.locked")).not.toBeNull()
    expect(revealed).toBe(1)
  })

  test("content revealed may hold locked parts of its own, which get bound and tried", async () => {
    // pw2 worked earlier in this tab, on another page.
    dom.goto("https://garden.example/en-US/other")
    document.body.innerHTML = `<div>${form(two)}</div>`
    setupLocked(() => {})
    await submit(document.querySelector<HTMLFormElement>("form.locked")!, "pw2")
    dom.goto("https://garden.example/en-US/secret")
    document.body.innerHTML = `<div class="outer">${form(nested)}</div>`
    let revealed = 0
    setupLocked(() => revealed++)
    // pw2 is tried right away but does not open the outer part.
    await waitFor(() => revealed > 0)
    expect(revealed).toBe(1)
    await submit(document.querySelector<HTMLFormElement>("form.locked")!, "pw1")
    await waitFor(() => !document.querySelector("form.locked"))
    // The inner part opened with pw2.
    expect(document.querySelector(".outer .content")!.textContent).toContain("second secret")
    expect(Object.keys(JSON.parse(sessionStorage.getItem(KEY)!)).sort()).toEqual([saltOf(nested), saltOf(two)].sort())
  })

  test("stored keys that are damaged or do not fit are passed over", async () => {
    for (const value of ["not json", "42", JSON.stringify([await keyOf(one, "pw1")]), JSON.stringify({ [saltOf(one)]: await keyOf(two, "pw2") })]) {
      sessionStorage.setItem(KEY, value)
      document.body.innerHTML = `<div>${form(one)}</div>`
      let revealed = 0
      setupLocked(() => revealed++)
      await settle(30)
      expect(document.querySelector("form.locked")).not.toBeNull()
      await submit(document.querySelector<HTMLFormElement>("form.locked")!, "pw1")
      expect(document.querySelector(".content")!.innerHTML).toBe("<p>first secret</p>")
      forgetPasswords()
    }
  })

  test("a damaged part never opens, and does not stop the others", async () => {
    document.body.innerHTML = `<div>${form(one)}</div>`
    setupLocked(() => {})
    await submit(document.querySelector<HTMLFormElement>("form.locked")!, "pw1")
    document.body.innerHTML = `<div class="bad">${form("not base64!")}</div><div class="good">${form(one)}</div>`
    let revealed = 0
    setupLocked(() => revealed++)
    await waitFor(() => revealed > 0)
    expect(document.querySelector(".bad form.locked")).not.toBeNull()
    expect(document.querySelector(".good .content")!.innerHTML).toBe("<p>first secret</p>")
  })

  test("blocked storage means nothing is kept, and the part still opens", async () => {
    const real = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage")!
    const fail = () => {
      throw new Error("blocked")
    }
    const blocked = { getItem: fail, setItem: fail, removeItem: fail, key: fail, clear() {} }
    Object.defineProperty(blocked, "length", { get: fail })
    Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: blocked })
    try {
      document.body.innerHTML = `<div>${form(one)}</div>`
      setupLocked(() => {})
      await submit(document.querySelector<HTMLFormElement>("form.locked")!, "pw1")
      expect(document.querySelector(".content")!.innerHTML).toBe("<p>first secret</p>")
      forgetPasswords()
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
    // A form that an earlier part replaced while trying keys counts as done.
    forgetPasswords()
    sessionStorage.setItem(KEY, JSON.stringify({ [saltOf(one)]: await keyOf(one, "pw1") }))
    document.body.innerHTML = `<div class="a">${form(one)}</div>`
    document.querySelector(".a .content")!.innerHTML = `<div class="inner">${form(two)}</div>`
    let again = 0
    setupLocked(() => again++)
    await waitFor(() => again > 0)
    expect(document.querySelectorAll("form.locked")).toHaveLength(0)
    expect(document.querySelector(".a .content")!.innerHTML).toBe("<p>first secret</p>")
  })
})
