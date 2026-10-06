import { describe, expect, test } from "bun:test"
import { extractTasks } from "../src/lib/dataview"
import { parseTasksQuery, runTasksQuery, priorityOf, TasksQueryError, type TaskItem } from "../src/lib/tasks-query"

const today = new Date(2024, 4, 10)
const items: TaskItem[] = [
  ...extractTasks("## Errands\n- [ ] buy milk 📅 2024-05-09\n- [x] pay rent ✅ 2024-05-01\n- [ ] call mum ⏫ 📅 2024-05-12 #family").map((task) => ({
    task,
    path: "Home/Chores.md",
  })),
  ...extractTasks("- [ ] write chapter 🔽\n- [ ] review #family/kids").map((task) => ({ task, path: "Work/Book.md" })),
]
const texts = (q: string) => runTasksQuery(parseTasksQuery(q, today), items).map((i) => i.task.text.split(" ").slice(0, 2).join(" "))

describe("Tasks queries", () => {
  test("done, not done and dates relative to today", () => {
    expect(texts("done")).toEqual(["pay rent"])
    expect(texts("not done\ndue before today")).toEqual(["buy milk"])
    expect(texts("due after today")).toEqual(["call mum"])
    expect(texts("due on 2024-05-12")).toEqual(["call mum"])
    expect(texts("not done\nno due date")).toEqual(["write chapter", "review #family/kids"])
    expect(texts("has due date\nnot done")).toEqual(["buy milk", "call mum"])
  })

  test("text, path, heading and tags, with nested tags", () => {
    expect(texts("path includes work")).toEqual(["write chapter", "review #family/kids"])
    expect(texts("description includes milk")).toEqual(["buy milk"])
    expect(texts("heading includes errands\nnot done")).toEqual(["buy milk", "call mum"])
    expect(texts("tag includes #family")).toEqual(["call mum", "review #family/kids"])
    expect(texts("path does not include Home")).toEqual(["write chapter", "review #family/kids"])
  })

  test("priorities by emoji", () => {
    expect(priorityOf(items[2].task)).toEqual({ name: "high", rank: 4 })
    expect(texts("priority is high")).toEqual(["call mum"])
    expect(texts("priority is below none")).toEqual(["write chapter"])
  })

  test("sorting and limits; the default puts open tasks first, by due date", () => {
    expect(texts("")).toEqual(["buy milk", "call mum", "write chapter", "review #family/kids", "pay rent"])
    expect(texts("sort by priority\nlimit 2")).toEqual(["call mum", "buy milk"])
    expect(texts("sort by due reverse\nhas due date\nnot done")).toEqual(["call mum", "buy milk"])
  })

  test("layout instructions are ignored, unknown ones reported", () => {
    expect(texts("hide due date\nshort mode\nnot done\nlimit 1")).toEqual(["buy milk"])
    expect(() => parseTasksQuery("happens whenever")).toThrow(TasksQueryError)
    expect(() => parseTasksQuery("due before someday")).toThrow('unknown date "someday"')
  })
})
