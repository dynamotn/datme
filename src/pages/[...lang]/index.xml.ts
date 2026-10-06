import type { GetStaticPaths } from "astro"
import { site, type Lang } from "~/site.config"
import { feed } from "~/lib/feed"

/** One feed per language: /index.xml for the default one, /<lang>/index.xml for the others. */
export const getStaticPaths = (() =>
  site.langs.map((lang) => ({
    params: { lang: lang === site.defaultLang ? undefined : lang },
    props: { lang },
  }))) satisfies GetStaticPaths

export const GET = ({ props }: { props: { lang: Lang } }) => feed(props.lang)
