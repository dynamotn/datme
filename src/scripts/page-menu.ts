/**
 * The markdown menu of a note: copy the note's markdown copy to the clipboard.
 * Its links work without script; the copy button shows only where it can work.
 */

/** Copy the text at a URL. Safari only allows it within the click, so the fetch goes inside the clipboard item. */
export async function copyFrom(url: string): Promise<void> {
  const text = fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${r.status} ${url}`)
    return r.text()
  })
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
    const blob = text.then((t) => new Blob([t], { type: "text/plain" }))
    await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })])
  } else await navigator.clipboard.writeText(await text)
}

let bound = false
export function setupPageMenu(): void {
  if (!navigator.clipboard) return
  document.querySelectorAll<HTMLButtonElement>("[data-copy-markdown]").forEach((b) => (b.hidden = false))
  if (bound) return
  bound = true
  document.addEventListener("click", async (e) => {
    const button = (e.target as Element).closest?.<HTMLButtonElement>("[data-copy-markdown]")
    if (!button) return
    const label = button.textContent
    try {
      await copyFrom(button.dataset.copyMarkdown!)
      button.textContent = document.body.dataset.copied ?? "Copied"
    } catch {
      // No clipboard or no network: the "view as markdown" link next to it still works.
      return
    }
    setTimeout(() => (button.textContent = label), 1200)
  })
}
