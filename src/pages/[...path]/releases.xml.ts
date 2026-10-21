import type { GetStaticPaths } from "astro"
import { site } from "~/site.config"
import { listed, type Note } from "~/lib/vault"
import { releasesFeed } from "~/lib/feed"
import { releasesUrl } from "~/lib/note-layouts"
import { stripBase } from "~/lib/base"

/** RSS of the versions of every changelog, at releases.xml under its page. */
export const getStaticPaths = (() =>
  site.langs.flatMap((lang) =>
    listed(lang)
      .filter((n) => n.layout === "changelog" && !n.protected)
      .map((note) => ({
        params: { path: decodeURI(stripBase(releasesUrl(note))).replace(/^\/|\/?releases\.xml$/g, "") || undefined },
        props: { note },
      })),
  )) satisfies GetStaticPaths

export const GET = ({ props }: { props: { note: Note } }) => releasesFeed(props.note)
