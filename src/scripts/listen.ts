/** The ▶ Listen button: plays the note's audio, pauses on a second click, stops when the page changes. */

let player: HTMLAudioElement | undefined
let active: HTMLButtonElement | undefined

function show(button: HTMLButtonElement, playing: boolean) {
  const text = (playing ? button.dataset.pause : button.dataset.label) ?? ""
  button.textContent = `${playing ? "⏸" : "▶"} ${text}`
  button.setAttribute("aria-label", text)
}

const play = (audio: HTMLAudioElement) => audio.play().catch(() => {})

function stop() {
  player?.pause()
  player = undefined
  if (active?.isConnected) show(active, false)
  active = undefined
}

export function setupListen() {
  stop()
  document.querySelectorAll<HTMLButtonElement>("button.listen[data-audio]:not([data-bound])").forEach((button) => {
    button.dataset.bound = ""
    show(button, false)
    button.addEventListener("click", () => {
      if (player && active === button) {
        if (player.paused) void play(player)
        else player.pause()
        return
      }
      stop()
      player = new Audio(button.dataset.audio)
      active = button
      player.addEventListener("play", () => show(button, true))
      player.addEventListener("pause", () => show(button, false))
      player.addEventListener("ended", () => show(button, false))
      void play(player)
    })
  })
}
