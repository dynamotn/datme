import { describe, expect, test } from "bun:test"
import { groupMentions, type Mention } from "../src/scripts/webmentions"

const m = (prop: string, url: string, published?: string): Mention => ({ "wm-property": prop, url, published })

describe("groupMentions", () => {
  test("likes and bookmarks pile up, reposts apart, replies and mentions in order", () => {
    const g = groupMentions([
      m("like-of", "https://a.example/1"),
      m("bookmark-of", "https://b.example/1"),
      m("repost-of", "https://c.example/1"),
      m("in-reply-to", "https://d.example/2", "2024-05-02T00:00:00Z"),
      m("mention-of", "https://e.example/1", "2024-05-01T00:00:00Z"),
      m("rsvp", "https://f.example/1"),
    ])
    expect(g.likes).toHaveLength(2)
    expect(g.reposts).toHaveLength(1)
    expect(g.replies.map((r) => r.url)).toEqual(["https://e.example/1", "https://d.example/2"])
  })

  test("the same post sent for both forms of the URL counts once", () => {
    expect(groupMentions([m("like-of", "https://a.example/1"), m("like-of", "https://a.example/1")]).likes).toHaveLength(1)
  })
})
