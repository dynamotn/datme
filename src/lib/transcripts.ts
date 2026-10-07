import { escapeAttr } from "./obsidian"

/**
 * Timestamps and transcripts of audio and video embeds.
 *
 * `![[talk.mp4#t=1:30]]` starts the player at 1:30 (`#t=90`, `#t=1m30s` and a
 * range `#t=1:30,2:00` work too). A `.vtt` or `.srt` file next to the media,
 * with the same name (`talk.vtt`, or `talk.en.vtt` for one language), becomes
 * its captions and a transcript whose timestamps move the player.
 */

export interface Cue {
  start: number
  end: number
  text: string
}

/** "90", "1:30", "1:02:03", "1:30.5" or "1m30s" in seconds. */
export function parseClock(v: string): number | undefined {
  const s = v.trim()
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s)
  const colon = s.match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2}(?:[.,]\d+)?)$/)
  if (colon) return Number(colon[1] ?? 0) * 3600 + Number(colon[2]) * 60 + Number(colon[3].replace(",", "."))
  const units = s.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?$/)
  if (units && units[0]) return Number(units[1] ?? 0) * 3600 + Number(units[2] ?? 0) * 60 + Number(units[3] ?? 0)
  return undefined
}

/** A media fragment (`#t=90` or `#t=90,120`) from Obsidian's `t=1:30,2:00`; empty when there is none. */
export function mediaFragment(fragment: string): string {
  const m = fragment.match(/^t=([^,&]+)(?:,([^&]+))?/)
  if (!m) return ""
  const start = parseClock(m[1])
  const end = m[2] ? parseClock(m[2]) : undefined
  if (start === undefined) return ""
  return `#t=${start}${end !== undefined && end > start ? `,${end}` : ""}`
}

/** Cues of a WebVTT or SubRip file; styling tags are dropped, voices kept as "Name: ". */
export function parseCues(text: string): Cue[] {
  const cues: Cue[] = []
  for (const block of text.replace(/\r\n?/g, "\n").split(/\n{2,}/)) {
    const lines = block.split("\n")
    const i = lines.findIndex((l) => l.includes("-->"))
    if (i < 0) continue
    const [a, b] = lines[i].split("-->")
    const start = parseClock(a)
    const end = parseClock(b.trim().split(/\s+/)[0])
    if (start === undefined || end === undefined) continue
    const body = lines
      .slice(i + 1)
      .join(" ")
      .replace(/<v(?:\.[\w.]+)?\s+([^>]+)>/g, "$1: ")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim()
    if (body) cues.push({ start, end, text: body })
  }
  return cues
}

/** 90 → "1:30", 3723 → "1:02:03". */
export function clock(seconds: number): string {
  const s = Math.floor(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, "0")
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`
}

/** The transcript under a player: each cue with a button that plays from it. */
export function transcriptHtml(cues: Cue[], title: string): string {
  const items = cues
    .map(
      (c) =>
        `<li data-start="${c.start}" data-end="${c.end}"><button type="button" class="cue-time">${clock(c.start)}</button> <span class="cue-text">${escapeAttr(c.text)}</span></li>`,
    )
    .join("")
  return `<details class="transcript"><summary>${escapeAttr(title)}</summary><ol class="cues">${items}</ol></details>`
}

/** Candidates for the transcript of a media file, most specific first: `talk.en.vtt`, `talk.en.srt`, `talk.vtt`, `talk.srt`. */
export function sidecars(rel: string, lang: string): string[] {
  const base = rel.replace(/\.[^./]+$/, "")
  const short = lang.split("-")[0].toLowerCase()
  return [`${base}.${short}.vtt`, `${base}.${short}.srt`, `${base}.vtt`, `${base}.srt`]
}
