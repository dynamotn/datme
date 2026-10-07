import { beforeAll, describe, expect, test } from "bun:test"
import { Window } from "happy-dom"
import { encrypt } from "../src/lib/encrypt"

// Unlocking runs in a browser; happy-dom stands in for one, Bun's WebCrypto decrypts.
const happy = new Window({ url: "https://garden.example/note" })
// Typed as the DOM the script is written against.
const window = happy as unknown as globalThis.Window & typeof globalThis
const document = window.document
beforeAll(() => {
  Object.assign(globalThis, { document, window, location: window.location, sessionStorage: window.sessionStorage })
})

const form = async (i: number, html: string, pw: string) =>
  `<div class="locked-part" data-lock="${i}"><form class="locked" data-payload="${await encrypt(html, pw, 1000)}" data-iterations="1000"><p>🔒</p><input type="password"><button type="submit">Unlock</button><p class="locked-error" hidden>Wrong</p></form><div class="locked-content" hidden></div></div>`
const submit = (f: HTMLFormElement, pw: string) => {
  f.querySelector("input")!.value = pw
  f.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }))
}
const settle = () => new Promise((r) => setTimeout(r, 300))

describe("unlocking locked parts", () => {
  test("a wrong password says so; the right one opens its part and every other part it fits", async () => {
    const nested = await form(9, "<p>deepest</p>", "pw")
    document.body.innerHTML =
      `<div class="prose">${await form(0, `<p>first</p>${nested}`, "pw")}${await form(1, "<p>second</p>", "pw")}${await form(2, "<p>third</p>", "other")}</div>`
    const { setupLocked } = await import("../src/scripts/locked")
    let revealed = 0
    setupLocked(() => revealed++)
    const first = document.querySelector<HTMLFormElement>("form.locked")!
    submit(first, "nope")
    await settle()
    expect(first.querySelector<HTMLElement>(".locked-error")!.hidden).toBe(false)
    submit(first, "pw")
    await settle()
    const text = document.querySelector(".prose")!.textContent
    expect(text).toContain("first")
    expect(text).toContain("second")
    // Parts inside an opened part are tried with the passwords that worked.
    expect(text).toContain("deepest")
    expect(text).not.toContain("third")
    expect(document.querySelectorAll("form.locked")).toHaveLength(1)
    expect(revealed).toBeGreaterThan(0)
  })

  test("passwords that worked are remembered for the page, alongside the old single one", async () => {
    expect(JSON.parse(window.sessionStorage.getItem("datme:pw:/note")!)).toEqual(["pw"])
    window.sessionStorage.setItem("datme:pw:/note", "other")
    document.body.innerHTML = `<div class="prose">${await form(0, "<p>again</p>", "other")}</div>`
    const { setupLocked } = await import("../src/scripts/locked")
    setupLocked(() => {})
    await settle()
    expect(document.querySelector(".prose")!.textContent).toContain("again")
  })
})
