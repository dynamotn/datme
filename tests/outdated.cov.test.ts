import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { installDom, type Dom } from "./client-dom"
import { setupOutdated } from "../src/scripts/outdated"

describe("the outdated notice in the browser", () => {
  let dom: Dom
  beforeAll(() => (dom = installDom()))
  afterAll(() => dom.restore())

  test("shows on old notes, hides on recent ones, and leaves bad data alone", () => {
    document.body.innerHTML = `
      <p id="old" data-outdated data-since="2000-01-01" data-after="1" hidden></p>
      <p id="new" data-outdated data-since="${new Date().toISOString()}" data-after="1"></p>
      <p id="bad-date" data-outdated data-since="soon" data-after="1" hidden></p>
      <p id="no-date" data-outdated data-after="1" hidden></p>
      <p id="no-years" data-outdated data-since="2000-01-01" data-after="0" hidden></p>`
    setupOutdated()
    const hidden = (id: string) => document.getElementById(id)!.hidden
    expect(hidden("old")).toBe(false)
    expect(hidden("new")).toBe(true)
    expect(hidden("bad-date")).toBe(true)
    expect(hidden("no-date")).toBe(true)
    expect(hidden("no-years")).toBe(true)
  })
})
