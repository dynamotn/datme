/**
 * The fediverse: a garden that Mastodon and its kin can find and follow.
 * A static site cannot deliver posts to followers, so there are two ways:
 *
 * - `activitypub: bridgy` hands the garden to Bridgy Fed (fed.brid.gy), which
 *   follows its feed and delivers new notes. datme redirects WebFinger there
 *   and marks pages with microformats, which Bridgy Fed reads.
 * - `activitypub: { username }` only publishes the static parts: WebFinger,
 *   an actor and an outbox of recent notes. People can find the garden and
 *   read it from their server, but cannot follow it.
 */
import type { SiteConfig } from "../site.config"
import { escapeAttr } from "./html"

export interface OutboxItem {
  url: string
  title: string
  summary: string
  published: Date
  tags: string[]
}

/** Paths of the static parts, from the site root. */
export const ACTOR_PATH = "/activitypub/actor.json"
export const OUTBOX_PATH = "/activitypub/outbox.json"

const abs = (site: SiteConfig, p: string) => new URL(p, site.url + "/").href
const host = (site: SiteConfig) => new URL(site.url!).host

/** The garden's handle: @username@host. */
export const handle = (site: SiteConfig, username: string) => `@${username}@${host(site)}`

/** /.well-known/webfinger: the one account a static file can describe. */
export function webfinger(site: SiteConfig, username: string): object {
  return {
    subject: `acct:${username}@${host(site)}`,
    aliases: [abs(site, ACTOR_PATH), abs(site, "/")],
    links: [
      { rel: "self", type: "application/activity+json", href: abs(site, ACTOR_PATH) },
      { rel: "http://webfinger.net/rel/profile-page", type: "text/html", href: abs(site, "/") },
    ],
  }
}

/** The garden as an ActivityPub actor. Its inbox answers nothing: following needs Bridgy Fed. */
export function actor(site: SiteConfig, username: string): object {
  const lang = site.defaultLang
  return {
    "@context": ["https://www.w3.org/ns/activitystreams"],
    id: abs(site, ACTOR_PATH),
    type: "Service",
    preferredUsername: username,
    name: site.title[lang],
    summary: site.tagline[lang],
    url: abs(site, "/"),
    inbox: abs(site, "/activitypub/inbox"),
    outbox: abs(site, OUTBOX_PATH),
    icon: { type: "Image", mediaType: "image/png", url: abs(site, "/icon-512.png") },
    ...(site.author ? { attributedTo: site.author } : {}),
  }
}


/** The newest notes as Create activities, newest first. */
export function outbox(site: SiteConfig, items: OutboxItem[]): object {
  const by = abs(site, ACTOR_PATH)
  return {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: abs(site, OUTBOX_PATH),
    type: "OrderedCollection",
    totalItems: items.length,
    orderedItems: items.map((n) => {
      const url = abs(site, n.url)
      const content = `<p><a href="${escapeAttr(url)}">${escapeAttr(n.title)}</a></p>${n.summary ? `<p>${escapeAttr(n.summary)}</p>` : ""}`
      return {
        id: `${url}#create`,
        type: "Create",
        actor: by,
        published: n.published.toISOString(),
        to: ["https://www.w3.org/ns/activitystreams#Public"],
        object: {
          id: url,
          type: "Article",
          name: n.title,
          summary: n.summary,
          content,
          url,
          attributedTo: by,
          published: n.published.toISOString(),
          to: ["https://www.w3.org/ns/activitystreams#Public"],
          tag: n.tags.map((t) => ({ type: "Hashtag", name: `#${t.replace(/\//g, "_")}` })),
        },
      }
    }),
  }
}

/** _redirects lines that hand WebFinger to Bridgy Fed, as its documentation asks. */
export const BRIDGY_REDIRECTS = [
  "/.well-known/host-meta* https://fed.brid.gy/.well-known/host-meta:splat 302",
  "/.well-known/webfinger* https://fed.brid.gy/.well-known/webfinger 302",
]

/** _headers rules that give the static parts their media types, readable from other servers. */
export const STATIC_HEADERS = [
  "/.well-known/webfinger",
  "  Content-Type: application/jrd+json",
  "  Access-Control-Allow-Origin: *",
  "",
  "/activitypub/*",
  "  Content-Type: application/activity+json",
  "  Access-Control-Allow-Origin: *",
  "",
]
