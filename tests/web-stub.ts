/**
 * The web as link previews see it, without the network: `node:http` and `node:https` requests are
 * answered by a function of the URL. Each request records the address its socket would connect to,
 * asked of the `lookup` the request was given, as the real clients ask it, so tests see where a
 * connection would go and not only which URL was asked for.
 */
import { spyOn } from "bun:test"
import { EventEmitter } from "node:events"
import http from "node:http"
import https from "node:https"
import { Readable } from "node:stream"

export interface Answer {
  status?: number
  headers?: Record<string, string>
  /** The body, or its chunks; an iterable that never ends stands for a page that goes on. */
  body?: string | Iterable<Uint8Array> | AsyncIterable<Uint8Array>
}

export interface Request {
  url: string
  /** The address the socket would connect to. */
  address: string
  headers: Record<string, string>
  /** The client that made it: TLS, checked against the URL's name, for `https:` only. */
  client: "http" | "https"
}

type Lookup = (host: string, options: { all?: boolean }, done: (err: Error | null, address: unknown, family?: number) => void) => void

/** The address a request's `lookup` gives, in its list form and its single form; they must agree. */
function connectTo(lookup: Lookup, host: string): string {
  let all = ""
  let one = ""
  lookup(host, { all: true }, (_e, list) => {
    all = (list as { address: string }[])[0].address
  })
  lookup(host, {}, (_e, address) => {
    one = address as string
  })
  if (all !== one) throw new Error(`lookup answers ${all} and ${one}`)
  return all
}

export function stubWeb(answer: (url: string) => Answer) {
  const requests: Request[] = []
  const fake = (client: Request["client"]) => (url: URL, options: { lookup: Lookup; headers: Record<string, string> }, callback: (res: Readable) => void) => {
    const req = new EventEmitter() as EventEmitter & { end: () => void }
    req.end = () =>
      queueMicrotask(() => {
        try {
          const address = connectTo(options.lookup, url.hostname.replace(/^\[|\]$/g, ""))
          requests.push({ url: url.href, address, headers: options.headers, client })
          const a = answer(url.href)
          const body = typeof a.body === "string" ? [Buffer.from(a.body)] : (a.body ?? [])
          callback(Object.assign(Readable.from(body), { statusCode: a.status ?? 200, headers: a.headers ?? {} }))
        } catch (err) {
          req.emit("error", err)
        }
      })
    return req
  }
  const spies = [spyOn(http, "request").mockImplementation(fake("http") as never), spyOn(https, "request").mockImplementation(fake("https") as never)]
  return {
    requests,
    /** The URLs asked for, in order. */
    urls: () => requests.map((r) => r.url),
    restore: () => {
      for (const s of spies) s.mockRestore()
    },
  }
}

export const page = (html: string): Answer => ({ headers: { "content-type": "text/html" }, body: html })
export const redirect = (to: string): Answer => ({ status: 302, headers: { location: to } })
export const notFound: Answer = { status: 404, body: "nope" }
