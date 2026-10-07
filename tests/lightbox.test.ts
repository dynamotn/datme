import { beforeAll, describe, expect, test } from "bun:test"
import { Window } from "happy-dom"

// The lightbox runs in a browser; happy-dom stands in for one.
const happy = new Window({ url: "https://garden.example/note" })
// Typed as the DOM the script is written against.
const window = happy as unknown as globalThis.Window & typeof globalThis
const document = window.document
beforeAll(() => {
  Object.assign(globalThis, { document, window, HTMLElement: window.HTMLElement })
})

const dialog = () => document.querySelector<HTMLDialogElement>("dialog.lightbox")!
const click = (el: Element) => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }))

describe("lightbox", () => {
  test("a click on a note image opens its original file, captioned by its alt", async () => {
    document.body.dataset.close = "Đóng"
    document.body.innerHTML = `<div class="prose">
      <img id="a" src="/assets/a.png" srcset="/assets/a.png.w480.webp 480w" alt="First">
      <a href="/x"><img id="linked" src="/assets/l.png"></a>
      <img id="b" src="/assets/b.png" alt="Second">
    </div>`
    const { setupLightbox } = await import("../src/scripts/lightbox")
    setupLightbox()
    click(document.getElementById("a")!)
    const d = dialog()
    expect(d.open).toBe(true)
    expect(d.querySelector("img")!.getAttribute("src")).toBe("/assets/a.png")
    expect(d.querySelector("figcaption")!.textContent).toBe("First")
    expect(d.querySelector(".lightbox-close")!.getAttribute("aria-label")).toBe("Đóng")
  })

  test("arrows move between the images, wrapping around, skipping linked ones", () => {
    const d = dialog()
    click(d.querySelector(".lightbox-next")!)
    expect(d.querySelector("figcaption")!.textContent).toBe("Second")
    d.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }))
    expect(d.querySelector("figcaption")!.textContent).toBe("First")
  })

  test("the close button closes it, and images inside links stay links", () => {
    const d = dialog()
    click(d.querySelector(".lightbox-close")!)
    expect(d.open).toBe(false)
    click(document.getElementById("linked")!)
    expect(d.open).toBe(false)
  })

  test("a drawing opens as a copy of itself, unless one of its links was clicked", () => {
    document.body.innerHTML = `<div class="prose"><span class="drawing generated"><svg role="group" aria-label="Sketch" width="300" height="100" viewBox="0 0 300 100"><a href="/note" class="drawing-link"><rect id="r" width="10" height="10"/></a><circle id="c" r="5"/></svg></span></div>`
    click(document.getElementById("r")!)
    expect(dialog()?.open ?? false).toBe(false)
    click(document.getElementById("c")!)
    const d = dialog()
    expect(d.open).toBe(true)
    const svg = d.querySelector("svg.lightbox-drawing")!
    expect(svg.getAttribute("viewBox")).toBe("0 0 300 100")
    expect(svg.hasAttribute("width")).toBe(false)
    expect(d.querySelector("figcaption")!.textContent).toBe("Sketch")
  })
})
