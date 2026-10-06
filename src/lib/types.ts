import { site, type Lang } from "../site.config"

/** Icon and label of a note type; unknown types get a plain tag icon. */
export function typeInfo(type: string, lang: Lang): { icon: string; label: string } {
  const t = site.types[type]
  return { icon: t?.icon ?? "🏷️", label: t?.label[lang] ?? type }
}
