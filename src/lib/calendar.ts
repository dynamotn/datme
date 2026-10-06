/** Local calendar day of a date, as YYYY-MM-DD. */
export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

export interface CalendarDay {
  key: string
  date: Date
  created: string[]
  updated: string[]
  level: 0 | 1 | 2 | 3 | 4
  /** Padding day before or after the year. */
  outside: boolean
}

/**
 * Activity of one calendar year as Monday-first weeks: each day counts the notes
 * created or updated on it. Days outside the year pad the first and last weeks.
 */
export function activityWeeks(notes: { title: string; created?: Date; updated?: Date }[], year: number): CalendarDay[][] {
  const created = new Map<string, string[]>()
  const updated = new Map<string, string[]>()
  for (const n of notes) {
    if (n.created) created.set(dayKey(n.created), [...(created.get(dayKey(n.created)) ?? []), n.title])
    if (n.updated && (!n.created || dayKey(n.updated) !== dayKey(n.created))) {
      updated.set(dayKey(n.updated), [...(updated.get(dayKey(n.updated)) ?? []), n.title])
    }
  }
  const start = new Date(year, 0, 1)
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7)) // back to Monday
  const end = new Date(year, 11, 31)
  end.setDate(end.getDate() + ((7 - end.getDay()) % 7)) // on to Sunday
  const weeks: CalendarDay[][] = []
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = dayKey(d)
    const inYear = d.getFullYear() === year
    const c = inYear ? (created.get(key) ?? []) : []
    const u = inYear ? (updated.get(key) ?? []) : []
    const total = c.length + u.length
    const level = (total === 0 ? 0 : total === 1 ? 1 : total <= 3 ? 2 : total <= 6 ? 3 : 4) as CalendarDay["level"]
    if ((d.getDay() + 6) % 7 === 0) weeks.push([])
    weeks[weeks.length - 1].push({ key, date: new Date(d), created: c, updated: u, level, outside: !inYear })
  }
  return weeks
}

/** Years with any creation or update, newest first. */
export function activeYears(notes: { created?: Date; updated?: Date }[]): number[] {
  const years = new Set<number>()
  for (const n of notes) {
    if (n.created) years.add(n.created.getFullYear())
    if (n.updated) years.add(n.updated.getFullYear())
  }
  return [...years].sort((a, b) => b - a)
}
