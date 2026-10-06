import type { Problem } from "./vault"

/** Code blocks and spans are examples, not links. */
function withoutCode(md: string): string {
  return md
    .replace(/^(\s*)(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\s*\2[^\S\n]*$/gm, "")
    .replace(/(`+)(?!`)[\s\S]*?[^`]\1(?!`)/g, "")
}

const count = (s: string, c: string) => s.split(c).length - 1

/** A bare URL in prose loses its trailing punctuation, as GFM autolinks do. */
function trimTrailing(url: string): string {
  for (;;) {
    const last = url.at(-1) ?? ""
    // A closing parenthesis stays when it closes one inside the URL, as in Wikipedia links.
    if (last === ")" && count(url, "(") >= count(url, ")")) return url
    if (!".,:;!?'\")]*_~".includes(last) || !last) return url
    url = url.slice(0, -1)
  }
}

/** Every distinct http(s) URL a note's markdown links to, in order of appearance. */
export function externalUrls(md: string): string[] {
  const text = withoutCode(md)
  const found = new Set<string>()
  const add = (u: string) => {
    const url = trimTrailing(u.replace(/&amp;/g, "&"))
    try {
      found.add(new URL(url).href)
    } catch {
      // not a URL after all
    }
  }
  for (const m of text.matchAll(/\]\(\s*<?(https?:\/\/[^\s)>]+(?:\([^\s)]*\)[^\s)>]*)*)>?/g)) add(m[1])
  for (const m of text.matchAll(/\b(?:href|src)=["'](https?:\/\/[^"']+)["']/g)) add(m[1])
  for (const m of text.matchAll(/<(https?:\/\/[^\s>]+)>/g)) add(m[1])
  for (const m of text.matchAll(/(?<![("'=<\w])https?:\/\/[^\s<>"'\]]+/g)) add(m[0])
  return [...found]
}

export type LinkStatus = { ok: true } | { ok: false; level: "warning" | "info"; reason: string }

export interface ProbeOpts {
  timeoutMs?: number
  fetch?: typeof fetch
}

/** Whether a URL still answers. Servers that refuse HEAD get a GET. */
export async function probe(url: string, { timeoutMs = 10_000, fetch: get = fetch }: ProbeOpts = {}): Promise<LinkStatus> {
  const attempt = (method: "HEAD" | "GET") =>
    get(url, {
      method,
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "user-agent": "datme-link-check (+https://gitlab.com/dynamo-tools/datme)", accept: "*/*" },
    })
  let res: Response | undefined
  let error: unknown
  for (const method of ["HEAD", "GET"] as const) {
    try {
      res = await attempt(method)
      // The body is not needed; dropping it frees the connection.
      await res.body?.cancel().catch(() => {})
      error = undefined
      if (res.ok || ![403, 404, 405, 410, 429, 501].includes(res.status) || method === "GET") break
    } catch (e) {
      error = e
    }
  }
  if (!res) {
    const cause = (error as { cause?: { code?: string } })?.cause?.code ?? (error as Error)?.name ?? "error"
    const timedOut = cause === "TimeoutError" || cause === "AbortError"
    return { ok: false, level: "warning", reason: timedOut ? "timed out" : `unreachable (${cause})` }
  }
  if (res.ok) return { ok: true }
  if (res.status === 404 || res.status === 410) return { ok: false, level: "warning", reason: `returned ${res.status}` }
  // Logins, rate limits and outages say nothing about whether the page still exists.
  return { ok: false, level: "info", reason: `could not be verified (HTTP ${res.status})` }
}

/** Probe every URL, a few at a time, and report the dead ones against the files linking them. */
export async function checkExternal(
  urls: Map<string, string[]>,
  { concurrency = 8, ...opts }: ProbeOpts & { concurrency?: number } = {},
): Promise<Problem[]> {
  const queue = [...urls.keys()]
  const problems: Problem[] = []
  const worker = async () => {
    for (let url = queue.shift(); url; url = queue.shift()) {
      const status = await probe(url, opts)
      if (status.ok) continue
      for (const file of urls.get(url)!) problems.push({ level: status.level, file, message: `external link ${url} ${status.reason}` })
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker))
  return problems
}
