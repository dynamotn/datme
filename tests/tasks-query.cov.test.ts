import { describe, expect, test } from "bun:test"
import { extractTasks } from "../src/lib/dataview"
import { groupOf, parseTasksQuery, runTasksQuery, type TaskItem } from "../src/lib/tasks-query"

const today = new Date(2024, 4, 10)
const items: TaskItem[] = [
  ...extractTasks("## Errands\n- [ ] buy milk 📅 2024-05-09 ⏳ 2024-05-08\n- [X] pay rent ✅ 2024-05-10 #home").map((task) => ({
    task,
    path: "Home/Chores.md",
  })),
  ...extractTasks("- [ ] plan trip 🛫 2024-05-11 ➕ 2024-05-09 🔺\n- [ ] tidy desk ⏬").map((task) => ({ task, path: "Inbox.md" })),
]
const first = (i: TaskItem) => i.task.text.split(" ").slice(0, 2).join(" ")
const run = (q: string) => runTasksQuery(parseTasksQuery(q, today), items).map(first)

describe("Tasks query instructions", () => {
  test("tomorrow and yesterday are days relative to today, and every date field can be compared", () => {
    expect(run("starts on tomorrow")).toEqual(["plan trip"])
    expect(run("due on yesterday")).toEqual(["buy milk"])
    expect(run("scheduled before today")).toEqual(["buy milk"])
    expect(run("done on today")).toEqual(["pay rent"])
    expect(run("created after 2024-05-01")).toEqual(["plan trip"])
    expect(run("has scheduled date")).toEqual(["buy milk"])
    expect(run("no start date\nnot done")).toEqual(["buy milk", "tidy desk"])
    expect(run("has done date")).toEqual(["pay rent"])
  })

  test("priority above and below, headings and tags excluded", () => {
    expect(run("priority is above none")).toEqual(["plan trip"])
    expect(run("priority is lowest")).toEqual(["tidy desk"])
    expect(run("heading does not include errands")).toEqual(["plan trip", "tidy desk"])
    expect(run("tags does not include home")).toEqual(["buy milk", "plan trip", "tidy desk"])
  })
})

describe("sorting", () => {
  test("by description, path, status, scheduled, start and done, with ties kept in source order", () => {
    expect(run("sort by description")).toEqual(["buy milk", "pay rent", "plan trip", "tidy desk"])
    expect(run("sort by path reverse")).toEqual(["plan trip", "tidy desk", "buy milk", "pay rent"])
    expect(run("sort by status reverse")).toEqual(["pay rent", "buy milk", "plan trip", "tidy desk"])
    expect(run("sort by scheduled")).toEqual(["buy milk", "pay rent", "plan trip", "tidy desk"])
    expect(run("sort by start")).toEqual(["plan trip", "buy milk", "pay rent", "tidy desk"])
    expect(run("sort by done\nlimit to 1 task")).toEqual(["pay rent"])
  })
})

describe("groupOf", () => {
  test("every grouping a query can ask for", () => {
    const [milk, rent, trip, tidy] = items
    expect(parseTasksQuery("group by folder").group).toBe("folder")
    expect(groupOf(milk, "path")).toBe("Home/Chores")
    expect(groupOf(milk, "folder")).toBe("Home/")
    expect(groupOf(trip, "folder")).toBe("/")
    expect(groupOf(milk, "filename")).toBe("Chores")
    expect(groupOf(milk, "heading")).toBe("Errands")
    expect(groupOf(trip, "heading")).toBe("")
    expect(groupOf(trip, "priority")).toBe("highest")
    expect(groupOf(tidy, "priority")).toBe("lowest")
    expect(groupOf(rent, "status")).toBe("Done")
    expect(groupOf(milk, "status")).toBe("Todo")
    expect(groupOf(milk, "due")).toBe("2024-05-09")
    expect(groupOf(trip, "due")).toBe("No due date")
  })
})
