import { describe, expect, test } from "bun:test"
import { embedExternal, parseTime, youtube } from "../src/lib/media"

describe("embedExternal", () => {
  test("something that is not a URL is left to markdown", () => {
    expect(embedExternal("x", "not a url")).toBeUndefined()
    expect(embedExternal("x", "/relative/path.png")).toBeUndefined()
  })

  test("Vimeo plays through its player, with the start time of the URL", () => {
    expect(embedExternal("", "https://vimeo.com/76979871#t=1m5s")).toContain('src="https://player.vimeo.com/video/76979871#t=65s"')
    const plain = embedExternal("Film|640x360", "https://www.vimeo.com/76979871")!
    expect(plain).toContain('src="https://player.vimeo.com/video/76979871"')
    expect(plain).toContain('style="max-width:640px;aspect-ratio:640/360"')
    expect(plain).toContain('title="Film"')
    expect(embedExternal("", "https://vimeo.com/channels/staff")).toBeUndefined()
  })

  test("tweets become a blockquote on twitter.com, named after the alt or the account", () => {
    expect(embedExternal("", "https://x.com/jack/status/20")).toBe(
      '<blockquote class="twitter-tweet" data-dnt="true"><a href="https://twitter.com/jack/status/20">@jack</a></blockquote>',
    )
    expect(embedExternal("First", "https://mobile.twitter.com/jack/status/20")).toContain(">First</a>")
    expect(embedExternal("", "https://twitter.com/jack")).toBeUndefined()
  })

  test("video and audio files play in place", () => {
    expect(embedExternal("|320", "https://cdn.example/clip.mp4")).toBe(
      '<video src="https://cdn.example/clip.mp4" controls preload="metadata" style="max-width:320px"></video>',
    )
    expect(embedExternal("", "https://cdn.example/song.mp3")).toBe('<audio src="https://cdn.example/song.mp3" controls preload="none"></audio>')
  })

  test("a sized image or extensionless URL becomes an img; an unsized one stays markdown", () => {
    expect(embedExternal("Cat|200", "https://cdn.example/cat.png")).toBe('<img src="https://cdn.example/cat.png" alt="Cat" width="200" loading="lazy">')
    expect(embedExternal("200x100", "https://cdn.example/image")).toBe(
      '<img src="https://cdn.example/image" alt="" width="200" height="100" loading="lazy">',
    )
    expect(embedExternal("Cat", "https://cdn.example/cat.png")).toBeUndefined()
    expect(embedExternal("|200", "https://cdn.example/doc.pdf")).toBeUndefined()
  })

  test("the title falls back to the host when the alt is empty", () => {
    expect(embedExternal("", "https://youtu.be/dQw4w9WgXcQ")).toContain('title="youtu.be"')
  })
})

describe("youtube and parseTime edges", () => {
  test("ids that are too short or from other hosts are not videos", () => {
    expect(youtube(new URL("https://youtu.be/abc"))).toBeUndefined()
    expect(youtube(new URL("https://example.com/watch?v=dQw4w9WgXcQ"))).toBeUndefined()
    expect(youtube(new URL("https://www.youtube.com/watch"))).toBeUndefined()
    expect(youtube(new URL("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=7"))).toEqual({ id: "dQw4w9WgXcQ", start: 7 })
  })

  test("times without a value are undefined", () => {
    expect(parseTime(null)).toBeUndefined()
    expect(parseTime("2m")).toBe(120)
  })
})
