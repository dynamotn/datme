import { describe, expect, test } from "bun:test"
import { embedExternal, parseTime, youtube } from "../src/lib/media"
import { preprocess } from "../src/lib/obsidian"

const run = (src: string) =>
  preprocess(src, { lang: "en-US", dir: "", resolveNote: () => undefined, resolveAsset: () => undefined }).md

describe("YouTube", () => {
  test("every URL form gives the video id and start time", () => {
    expect(youtube(new URL("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s"))).toEqual({ id: "dQw4w9WgXcQ", start: 90 })
    expect(youtube(new URL("https://youtu.be/dQw4w9WgXcQ?t=42"))).toEqual({ id: "dQw4w9WgXcQ", start: 42 })
    expect(youtube(new URL("https://youtube.com/shorts/dQw4w9WgXcQ"))?.id).toBe("dQw4w9WgXcQ")
    expect(youtube(new URL("https://m.youtube.com/embed/dQw4w9WgXcQ"))?.id).toBe("dQw4w9WgXcQ")
    expect(youtube(new URL("https://www.youtube.com/@channel"))).toBeUndefined()
  })

  test("times are seconds or h/m/s", () => {
    expect(parseTime("75")).toBe(75)
    expect(parseTime("1h2m3s")).toBe(3723)
    expect(parseTime("soon")).toBeUndefined()
    expect(parseTime("")).toBeUndefined()
  })

  test("embeds through the privacy-enhanced domain, with a link for print", () => {
    const html = embedExternal("Talk", "https://youtu.be/dQw4w9WgXcQ?t=5")!
    expect(html).toContain('src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=5"')
    expect(html).toContain('title="Talk"')
    expect(html).toContain('<a class="media-link" href="https://youtu.be/dQw4w9WgXcQ?t=5">Talk</a>')
  })
})

describe("other embeds", () => {
  test("Vimeo videos", () => {
    expect(embedExternal("", "https://vimeo.com/76979871")).toContain('src="https://player.vimeo.com/video/76979871"')
  })

  test("tweets from twitter.com or x.com", () => {
    const html = embedExternal("", "https://x.com/jack/status/20")!
    expect(html).toContain('<blockquote class="twitter-tweet" data-dnt="true"><a href="https://twitter.com/jack/status/20">@jack</a>')
  })

  test("remote video and audio files", () => {
    expect(embedExternal("", "https://cdn.example/clip.mp4")).toStartWith('<video src="https://cdn.example/clip.mp4" controls')
    expect(embedExternal("", "https://cdn.example/song.mp3?x=1")).toStartWith('<audio src="https://cdn.example/song.mp3?x=1" controls')
  })

  test("Obsidian sizes: alt|640 and |640x360", () => {
    expect(embedExternal("Cat|300", "https://img.example/cat.png")).toBe(
      '<img src="https://img.example/cat.png" alt="Cat" width="300" loading="lazy">',
    )
    expect(embedExternal("|640x360", "https://youtu.be/dQw4w9WgXcQ")).toContain('style="max-width:640px;aspect-ratio:640/360"')
  })

  test("plain images and unknown pages stay markdown", () => {
    expect(embedExternal("Cat", "https://img.example/cat.png")).toBeUndefined()
    expect(embedExternal("Video 2024", "https://example.com/page")).toBeUndefined()
  })

  test("titles and URLs are escaped", () => {
    expect(embedExternal('"><script>', "https://youtu.be/dQw4w9WgXcQ")).not.toContain("<script>")
  })
})

describe("in notes", () => {
  test("embeds replace the image syntax; code and plain links are left alone", () => {
    const md = run("![](https://youtu.be/dQw4w9WgXcQ)\n\n`![](https://youtu.be/dQw4w9WgXcQ)`\n\n[watch](https://youtu.be/dQw4w9WgXcQ)")
    expect(md).toContain('<span class="media-embed"><iframe')
    expect(md).toContain("`![](https://youtu.be/dQw4w9WgXcQ)`")
    expect(md).toContain("[watch](https://youtu.be/dQw4w9WgXcQ)")
  })
})
