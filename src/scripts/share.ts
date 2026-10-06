/**
 * Select text in a note and copy a link that scrolls to it and highlights it,
 * with the browsers' text fragments (#:~:text=).
 */

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

let button: HTMLButtonElement | undefined

function hideButton() {
  button?.remove()
  button = undefined
}

function showButton() {
  const sel = document.getSelection()
  const text = sel?.toString() ?? ""
  const range = sel && sel.rangeCount ? sel.getRangeAt(0) : undefined
  const inProse = range && (range.commonAncestorContainer.parentElement ?? (range.commonAncestorContainer as Element)).closest?.(".prose")
  if (!range || !inProse || text.trim().length < 3) return hideButton()
  const labels = document.body.dataset
  button ??= document.createElement("button")
  button.type = "button"
  button.className = "share-passage"
  button.textContent = labels.sharePassage ?? "Copy link to passage"
  const link = location.origin + location.pathname + textFragment(text)
  button.onclick = async () => {
    try {
      await navigator.clipboard.writeText(link)
      button!.textContent = labels.copied ?? "Copied"
    } catch {
      // No clipboard access: at least show the link in the address bar.
      history.replaceState(history.state, "", link)
    }
    setTimeout(hideButton, 1200)
  }
  const r = range.getBoundingClientRect()
  button.style.left = `${Math.max(8, Math.min(r.left + r.width / 2 - 80, window.innerWidth - 176))}px`
  button.style.top = `${Math.max(8, r.top - 40)}px`
  document.body.append(button)
}

let bound = false
export function setupShare(): void {
  if (bound || !navigator.clipboard) return
  bound = true
  document.addEventListener("mouseup", (e) => {
    if ((e.target as Element).closest?.(".share-passage")) return
    // After the click that clears a selection, the selection is already empty.
    setTimeout(showButton, 0)
  })
  document.addEventListener("keyup", (e) => {
    if (e.shiftKey || e.key === "Shift") setTimeout(showButton, 0)
  })
  document.addEventListener("scroll", hideButton, { passive: true })
}
