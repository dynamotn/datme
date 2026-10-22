import type { GetStaticPaths } from "astro"
import { site } from "~/site.config"
import { listed, type Note } from "~/lib/vault"
import { digestFeed, digestPath } from "~/lib/feed"

/** A feed of the weeks next to each `digest`: Garden/digest.xml. */
export const getStaticPaths = (() =>
  site.langs.flatMap((lang) =>
    listed(lang)
      .filter((n) => n.layout === "digest" && !n.protected)
      .map((note) => ({ params: { path: digestPath(note).replace(/\/?digest\.xml$/, "") || undefined }, props: { note } })),
  )) satisfies GetStaticPaths

export const GET = ({ props }: { props: { note: Note } }) => digestFeed(props.note)
