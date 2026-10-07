/**
 * Transcripts of audio and video embeds: a timestamp plays from there, the
 * cue being spoken is marked as the media plays, and a video whose transcript
 * came from a SubRip file gets captions built from it.
 */

const playerOf = (el: Element) => el.closest(".media-transcript")?.querySelector<HTMLMediaElement>("audio, video") ?? null

document.addEventListener("click", (e) => {
  const button = (e.target as HTMLElement).closest<HTMLElement>(".transcript .cue-time")
  const player = button && playerOf(button)
  if (!button || !player) return
  player.currentTime = Number(button.closest<HTMLElement>("li")!.dataset.start)
  void player.play().catch(() => {})
})

function follow(player: HTMLMediaElement, cues: HTMLElement[]) {
  let current: HTMLElement | undefined
  player.addEventListener("timeupdate", () => {
    const t = player.currentTime
    const now = cues.find((c) => t >= Number(c.dataset.start) && t < Number(c.dataset.end))
    if (now === current) return
    current?.removeAttribute("aria-current")
    now?.setAttribute("aria-current", "true")
    current = now
  })
}

export function setupMedia() {
  document.querySelectorAll<HTMLElement>(".media-transcript:not([data-bound])").forEach((fig) => {
    fig.dataset.bound = ""
    const player = fig.querySelector<HTMLMediaElement>("audio, video")
    if (!player) return
    const cues = [...fig.querySelectorAll<HTMLElement>(".cues li")]
    follow(player, cues)
    if (player instanceof HTMLVideoElement && player.dataset.captionsFromCues != null && "VTTCue" in window) {
      const track = player.addTextTrack("captions", player.dataset.captionsLabel ?? "Captions", player.dataset.captionsLang ?? "")
      for (const c of cues) {
        track.addCue(new VTTCue(Number(c.dataset.start), Number(c.dataset.end), c.querySelector(".cue-text")?.textContent ?? ""))
      }
      track.mode = "hidden"
    }
  })
}
