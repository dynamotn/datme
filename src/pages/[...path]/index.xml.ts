import type { GetStaticPaths } from "astro"
import { site, type Lang } from "~/site.config"
import { getVault } from "~/lib/vault"
import { feed, feedPath, type FeedScope } from "~/lib/feed"

/** RSS for each language at /index.xml or /<lang>/index.xml, and for every folder and tag below it. */
export const getStaticPaths = (() => {
  const vault = getVault()
  return site.langs.flatMap((lang) => {
    const scopes: FeedScope[] = [
      { kind: "site" },
      ...[...vault.folders[lang].keys()].filter(Boolean).map((dir): FeedScope => ({ kind: "folder", dir })),
      ...[...vault.tags[lang].keys()].map((tag): FeedScope => ({ kind: "tag", tag })),
    ]
    return scopes.map((scope) => ({
      params: { path: feedPath(lang, scope).replace(/\/?index\.xml$/, "") || undefined },
      props: { lang, scope },
    }))
  })
}) satisfies GetStaticPaths

export const GET = ({ props }: { props: { lang: Lang; scope: FeedScope } }) => feed(props.lang, props.scope)
