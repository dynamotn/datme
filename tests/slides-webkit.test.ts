import { describe, expect, test } from "bun:test"
import { keepPlaced } from "../src/scripts/slides"

describe("decks in WebKit", () => {
  test("the polyfill's fixes run on the deck every frame, until it leaves the page", () => {
    const host = { isConnected: true }
    const root = {} as ParentNode
    const placed: unknown[] = []
    const frames: (() => void)[] = []
    keepPlaced(host, root, [({ target }) => placed.push(target)], (tick) => frames.push(tick))
    expect(placed).toEqual([root])
    frames.shift()!()
    expect(placed).toEqual([root, root])
    host.isConnected = false
    frames.shift()!()
    expect(placed).toHaveLength(2)
    expect(frames).toHaveLength(0)
  })

  test("outside WebKit there is nothing to fix and no frame is asked for", () => {
    const frames: unknown[] = []
    keepPlaced({ isConnected: true }, {} as ParentNode, [], (tick) => frames.push(tick))
    expect(frames).toEqual([])
  })
})
