import type { GetStaticPaths } from "astro"
import { site } from "~/site.config"
import { listed, type Note } from "~/lib/vault"
import { episodesFeed, episodesPath } from "~/lib/feed"

/** A podcast feed next to each `episodes` collection: Podcast/episodes.xml. */
export const getStaticPaths = (() =>
  site.langs.flatMap((lang) =>
    listed(lang)
      .filter((n) => n.layout === "episodes" && !n.protected)
      .map((note) => ({ params: { path: episodesPath(note).replace(/\/?episodes\.xml$/, "") || undefined }, props: { note } })),
  )) satisfies GetStaticPaths

export const GET = ({ props }: { props: { note: Note } }) => episodesFeed(props.note)
