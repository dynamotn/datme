import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { installDom, settle, type Dom } from "./client-dom"

type Media = typeof import("../src/scripts/media")

describe("transcripts of audio and video", () => {
  let dom: Dom
  let media: Media
  class FakeCue {
    constructor(
      public startTime: number,
      public endTime: number,
      public text: string,
    ) {}
  }
  beforeAll(async () => {
    dom = installDom("https://garden.example/en-US/talk")
    dom.set("VTTCue", FakeCue)
    ;(dom.window as unknown as Record<string, unknown>).VTTCue = FakeCue
    media = await import("../src/scripts/media")
  })
  afterAll(() => dom.restore())

  const transcript = (player: string) => `<figure class="media-transcript">${player}
    <div class="transcript"><ol class="cues">
      <li data-start="0" data-end="5"><button class="cue-time">0:00</button><span class="cue-text">Hello</span></li>
      <li data-start="5" data-end="9"><button class="cue-time">0:05</button><span class="cue-text">World</span></li>
      <li data-start="9" data-end="12"><button class="cue-time">0:09</button></li>
    </ol></div></figure>`

  test("a timestamp plays the media from there", async () => {
    document.body.innerHTML = transcript(`<audio></audio>`) + `<div class="transcript"><button class="cue-time" id="stray">1:00</button></div><p>x</p>`
    const audio = document.querySelector("audio")!
    let played = 0
    audio.play = () => (played++, Promise.reject(new Error("autoplay blocked")))
    document.querySelectorAll<HTMLButtonElement>(".cue-time")[1].click()
    await settle()
    expect(audio.currentTime).toBe(5)
    expect(played).toBe(1)
    // A timestamp outside a transcript figure, or any other click, plays nothing.
    document.getElementById("stray")!.click()
    document.querySelector("p")!.click()
    expect(played).toBe(1)
  })

  test("the cue being spoken is marked as the media plays", () => {
    document.body.innerHTML = transcript(`<audio></audio>`) + `<figure class="media-transcript"><p>no player</p></figure>`
    media.setupMedia()
    media.setupMedia()
    const audio = document.querySelector("audio")!
    const items = [...document.querySelectorAll("li")]
    const at = (t: number) => {
      audio.currentTime = t
      audio.dispatchEvent(new dom.window.Event("timeupdate") as unknown as Event)
      return items.map((li) => li.getAttribute("aria-current"))
    }
    expect(at(1)).toEqual(["true", null, null])
    expect(at(2)).toEqual(["true", null, null])
    expect(at(6)).toEqual([null, "true", null])
    expect(at(20)).toEqual([null, null, null])
    expect(document.querySelector(".media-transcript")!.hasAttribute("data-bound")).toBe(true)
  })

  test("a video with cues from SubRip gets captions built from them", () => {
    document.body.innerHTML = transcript(`<video data-captions-from-cues data-captions-label="English" data-captions-lang="en"></video>`)
    const video = document.querySelector("video")!
    const tracks: { kind: string; label: string; lang: string; mode: string; cues: FakeCue[] }[] = []
    video.addTextTrack = ((kind: string, label: string, lang: string) => {
      const track = { kind, label, lang, mode: "showing", cues: [] as FakeCue[], addCue: (c: FakeCue) => void track.cues.push(c) }
      tracks.push(track)
      return track
    }) as unknown as HTMLVideoElement["addTextTrack"]
    media.setupMedia()
    expect(tracks).toHaveLength(1)
    expect(tracks[0]).toMatchObject({ kind: "captions", label: "English", lang: "en", mode: "hidden" })
    expect(tracks[0].cues.map((c) => [c.startTime, c.endTime, c.text])).toEqual([
      [0, 5, "Hello"],
      [5, 9, "World"],
      [9, 12, ""],
    ])
  })

  test("captions fall back to a default label and no language", () => {
    document.body.innerHTML = transcript(`<video data-captions-from-cues></video>`) + transcript(`<video></video>`)
    const videos = [...document.querySelectorAll("video")]
    const made: string[][] = []
    for (const v of videos)
      v.addTextTrack = ((kind: string, label: string, lang: string) => (
        made.push([kind, label, lang]), { mode: "", addCue() {} }
      )) as unknown as HTMLVideoElement["addTextTrack"]
    media.setupMedia()
    // Only the video asking for captions gets a track.
    expect(made).toEqual([["captions", "Captions", ""]])
  })
})
