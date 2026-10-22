/**
 * Select text in a note and copy a link that scrolls to it and highlights it,
 * with the browsers' text fragments (#:~:text=), or keep it as a highlight of
 * your own.
 */
import { highlightSelection } from "./highlights"


/** Percent-encode a fragment part; text fragments also reserve "-", "," and "&". */
const encodePart = (s: string) => encodeURIComponent(s).replace(/-/g, "%2D").replace(/,/g, "%2C").replace(/&/g, "%26")

/** Words kept at each end of a long selection: enough to be unique, short enough to share. */
const EDGE_WORDS = 5

/** The `#:~:text=` directive for a selected passage. */
export function textFragment(selected: string): string {
  const text = selected.replace(/\s+/g, " ").trim()
  if (!text) return ""
  const words = text.split(" ")
  if (words.length <= EDGE_WORDS * 2 + 2) return `#:~:text=${encodePart(text)}`
  const start = words.slice(0, EDGE_WORDS).join(" ")
  const end = words.slice(-EDGE_WORDS).join(" ")
  return `#:~:text=${encodePart(start)},${encodePart(end)}`
}

let bar: HTMLDivElement | undefined

function hideButton() {
  bar?.remove()
  bar = undefined
}

function action(label: string, cls: string, on: (b: HTMLButtonElement) => void): HTMLButtonElement {
  const b = document.createElement("button")
  b.type = "button"
  b.className = cls
  b.textContent = label
  b.onclick = () => on(b)
  return b
}

/** Buttons over a selection in a note: copy a link to it, and highlight it. */
function showButton() {
  const sel = document.getSelection()
  const text = sel?.toString() ?? ""
  const range = sel?.rangeCount ? sel.getRangeAt(0) : undefined
  const at = range && (range.commonAncestorContainer.parentElement ?? (range.commonAncestorContainer as Element))
  const inProse = at?.closest?.(".prose")
  if (!range || !at || !inProse || text.trim().length < 3) return hideButton()
  const labels = document.body.dataset
  bar?.remove()
  bar = document.createElement("div")
  bar.className = "share-bar"
  if (navigator.clipboard) {
    const link = location.origin + location.pathname + textFragment(text)
    bar.append(
      action(labels.sharePassage ?? "Copy link to passage", "share-passage", async (b) => {
        try {
          await navigator.clipboard.writeText(link)
          b.textContent = labels.copied ?? "Copied"
        } catch {
          // No clipboard access: at least show the link in the address bar.
          history.replaceState(history.state, "", link)
        }
        setTimeout(hideButton, 1200)
      }),
    )
  }
  // Highlights belong to the note on show, not to a preview or a stacked note.
  if (at.closest("article.note .prose") && !at.closest("[data-stack-col]:not(:first-child)")) {
    bar.append(action(labels.highlight ?? "Highlight", "share-passage", () => (highlightSelection(), hideButton())))
  }
  if (!bar.childElementCount) return hideButton()
  const r = range.getBoundingClientRect()
  bar.style.left = `${Math.max(8, Math.min(r.left + r.width / 2 - 120, window.innerWidth - 300))}px`
  bar.style.top = `${Math.max(8, r.top - 44)}px`
  document.body.append(bar)
}

let bound = false
export function setupShare(): void {
  if (bound) return
  bound = true
  document.addEventListener("mouseup", (e) => {
    if ((e.target as Element).closest?.(".share-bar")) return
    // After the click that clears a selection, the selection is already empty.
    setTimeout(showButton, 0)
  })
  document.addEventListener("keyup", (e) => {
    if (e.shiftKey || e.key === "Shift") setTimeout(showButton, 0)
  })
  document.addEventListener("scroll", hideButton, { passive: true })
}
