import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { installDom, type Dom } from "./client-dom"
import { bindListen, setupListen } from "../src/scripts/listen"

const Native = Event

class FakeAudio extends EventTarget {
  static all: FakeAudio[] = []
  paused = true
  constructor(public src: string) {
    super()
    FakeAudio.all.push(this)
  }
  play() {
    this.paused = false
    this.dispatchEvent(new Native("play"))
    return Promise.resolve()
  }
  pause() {
    this.paused = true
    this.dispatchEvent(new Native("pause"))
  }
}

describe("the Listen button", () => {
  let dom: Dom
  beforeAll(() => {
    dom = installDom("https://garden.example/Podcast/Episode", { Audio: FakeAudio })
  })
  afterAll(() => dom.restore())

  const page = () => {
    document.body.innerHTML = `<button type="button" class="listen" data-audio="/Podcast/Episode.mp3" data-label="Listen" data-pause="Pause">▶ Listen</button>`
    setupListen()
    return document.querySelector<HTMLButtonElement>("button.listen")!
  }

  test("plays one audio element, pauses on a second click and switches the label", () => {
    const button = page()
    expect(button.getAttribute("aria-label")).toBe("Listen")
    button.click()
    expect(FakeAudio.all).toHaveLength(1)
    expect(FakeAudio.all[0].src).toBe("/Podcast/Episode.mp3")
    expect(FakeAudio.all[0].paused).toBe(false)
    expect(button.getAttribute("aria-label")).toBe("Pause")
    expect(button.textContent).toContain("Pause")
    button.click()
    expect(FakeAudio.all[0].paused).toBe(true)
    expect(button.getAttribute("aria-label")).toBe("Listen")
    // The label already says what a click does; a pressed state would contradict it.
    expect(button.hasAttribute("aria-pressed")).toBe(false)
    button.click()
    expect(FakeAudio.all).toHaveLength(1)
    expect(FakeAudio.all[0].paused).toBe(false)
  })

  test("the label returns when the audio ends", () => {
    FakeAudio.all.length = 0
    const button = page()
    button.click()
    FakeAudio.all[0].dispatchEvent(new Native("ended"))
    expect(button.getAttribute("aria-label")).toBe("Listen")
  })

  test("a second setup does not bind the button twice", () => {
    FakeAudio.all.length = 0
    const button = page()
    setupListen()
    button.click()
    expect(FakeAudio.all).toHaveLength(1)
  })

  test("navigating stops the playback", () => {
    FakeAudio.all.length = 0
    const button = page()
    button.click()
    const audio = FakeAudio.all[0]
    document.body.innerHTML = "<p>next page</p>"
    setupListen()
    expect(audio.paused).toBe(true)
    expect(button.isConnected).toBe(false)
  })

  test("a column opened beside the page binds its button and leaves the playback alone", () => {
    FakeAudio.all.length = 0
    const button = page()
    button.click()
    document.body.insertAdjacentHTML(
      "beforeend",
      `<button type="button" class="listen" data-audio="/Other.mp3" data-label="Listen" data-pause="Pause">▶ Listen</button>`,
    )
    bindListen()
    expect(FakeAudio.all[0].paused).toBe(false)
    document.querySelectorAll<HTMLButtonElement>("button.listen")[1].click()
    expect(FakeAudio.all.map((a) => [a.src, a.paused])).toEqual([
      ["/Podcast/Episode.mp3", true],
      ["/Other.mp3", false],
    ])
  })

  test("a refused play() is ignored", async () => {
    const button = page()
    const refuse = FakeAudio.prototype.play
    FakeAudio.prototype.play = () => Promise.reject(new Error("blocked"))
    button.click()
    await Promise.resolve()
    FakeAudio.prototype.play = refuse
    expect(button.getAttribute("aria-label")).toBe("Listen")
  })
})
