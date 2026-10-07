import { describe, expect, test } from "bun:test"
import { clock, mediaFragment, parseClock, parseCues } from "../src/lib/transcripts"
import { preprocess } from "../src/lib/obsidian"

const files: Record<string, string> = {
  "talks/talk.mp4": "talks/talk.mp4",
  "talks/talk.en.vtt": "talks/talk.en.vtt",
  "talks/song.mp3": "talks/song.mp3",
  "talks/song.srt": "talks/song.srt",
  "talks/other.mp4": "talks/other.mp4",
  "talks/clip.mov": "talks/clip.mov",
  "talks/clip.srt": "talks/clip.srt",
  "elsewhere/other.vtt": "elsewhere/other.vtt",
}
const text: Record<string, string> = {
  "talks/talk.en.vtt": "WEBVTT\n\n00:00:01.000 --> 00:00:04.000\n<v Ana>Hello <b>garden</b> & friends\n\n01:30.000 --> 01:35.500 align:start\nSecond cue",
  "talks/song.srt": "1\n00:00:02,500 --> 00:00:05,000\nLa la\nla\n",
  "talks/clip.srt": "1\n00:00:00,000 --> 00:00:01,000\nHi\n",
  "elsewhere/other.vtt": "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nNot mine",
}
const run = (src: string, lang = "en-US") =>
  preprocess(src, {
    lang,
    dir: "talks",
    resolveNote: () => undefined,
    resolveAsset: (t, dir) => {
      const p = t.replace(/^\/+/, "").toLowerCase()
      return files[p] ?? files[`${dir}/${p}`] ?? Object.values(files).find((f) => f.toLowerCase().endsWith("/" + p))
    },
    readText: (rel) => text[rel],
  })

describe("media timestamps", () => {
  test("clock times in every form", () => {
    expect(parseClock("90")).toBe(90)
    expect(parseClock("1:30")).toBe(90)
    expect(parseClock("1:02:03")).toBe(3723)
    expect(parseClock("00:00:02,500")).toBe(2.5)
    expect(parseClock("1m30s")).toBe(90)
    expect(parseClock("soon")).toBeUndefined()
    expect(clock(3723)).toBe("1:02:03")
    expect(clock(90.7)).toBe("1:30")
  })

  test("Obsidian's #t= becomes a media fragment in seconds", () => {
    expect(mediaFragment("t=1:30")).toBe("#t=90")
    expect(mediaFragment("t=1:30,2:00")).toBe("#t=90,120")
    expect(mediaFragment("t=2:00,1:00")).toBe("#t=120")
    expect(mediaFragment("t=later")).toBe("")
    expect(mediaFragment("heading")).toBe("")
  })

  test("an embed starts at its time; markdown embeds too", () => {
    expect(run("![[other.mp4#t=1:30]]").md).toBe('<video src="/assets/talks/other.mp4#t=90" controls></video>')
    expect(run("![](other.mp4#t=10,20)").md).toBe('<video src="/assets/talks/other.mp4#t=10,20" controls></video>')
  })
})

describe("transcripts", () => {
  test("cues of WebVTT and SubRip, with voices and without tags", () => {
    expect(parseCues(text["talks/talk.en.vtt"])).toEqual([
      { start: 1, end: 4, text: "Ana: Hello garden & friends" },
      { start: 90, end: 95.5, text: "Second cue" },
    ])
    expect(parseCues(text["talks/song.srt"])).toEqual([{ start: 2.5, end: 5, text: "La la la" }])
  })

  test("a video gets the captions and transcript of its language's .vtt", () => {
    const { md, assets } = run("![[talk.mp4]]")
    expect(md).toStartWith('<figure class="media-transcript"><video src="/assets/talks/talk.mp4" controls preload="metadata" data-captions-label="Captions" data-captions-lang="en-US">')
    expect(md).toContain('<track kind="captions" src="/assets/talks/talk.en.vtt" srclang="en-US" label="Captions">')
    expect(md).toContain('<summary>Transcript</summary><ol class="cues"><li data-start="1" data-end="4"><button type="button" class="cue-time">0:01</button> <span class="cue-text">Ana: Hello garden &amp; friends</span></li>')
    expect(assets).toEqual(["talks/talk.mp4", "talks/talk.en.vtt"])
  })

  test("another language finds no transcript for it", () => {
    expect(run("![[talk.mp4]]", "vi-VN").md).toBe('<video src="/assets/talks/talk.mp4" controls></video>')
  })

  test("a SubRip transcript stays out of the site; audio gets no captions", () => {
    const { md, assets } = run("![[song.mp3]]")
    expect(md).toContain('<audio src="/assets/talks/song.mp3" controls preload="metadata"')
    expect(md).not.toContain("<track")
    expect(md).not.toContain("data-captions-from-cues")
    expect(md).toContain("La la la")
    expect(assets).toEqual(["talks/song.mp3"])
  })

  test("a video with a SubRip transcript builds its captions in the browser", () => {
    expect(run("![[clip.mov]]").md).toContain('<video src="/assets/talks/clip.mov" controls preload="metadata" data-captions-from-cues ')
  })

  test("a file of the same name in another folder is not the transcript", () => {
    expect(run("![[other.mp4]]").md).not.toContain("Not mine")
  })
})
