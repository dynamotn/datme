import type { GetStaticPaths } from "astro"
import { site, type Lang } from "~/site.config"
import { getVault } from "~/lib/vault"
import { changesFeed, changesPath, type FeedScope } from "~/lib/feed"
import { hasChanges } from "~/lib/changes"

/** RSS of the garden's changes at /changes.xml, and for every folder and tag; only with `history: true`. */
export const getStaticPaths = (() => {
  const vault = getVault()
  return site.langs.filter(hasChanges).flatMap((lang) => {
    const scopes: FeedScope[] = [
      { kind: "site" },
      ...[...vault.folders[lang].keys()].filter(Boolean).map((dir): FeedScope => ({ kind: "folder", dir })),
      ...[...vault.tags[lang].keys()].map((tag): FeedScope => ({ kind: "tag", tag })),
    ]
    return scopes.map((scope) => ({
      params: { path: changesPath(lang, scope).replace(/\/?changes\.xml$/, "") || undefined },
      props: { lang, scope },
    }))
  })
}) satisfies GetStaticPaths

export const GET = ({ props }: { props: { lang: Lang; scope: FeedScope } }) => changesFeed(props.lang, props.scope)
