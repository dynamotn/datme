/**
 * A subset of the Dataview Query Language, run at build time over the
 * published notes only, so a query can never reveal a private note.
 *
 *   LIST [expr] | TABLE [WITHOUT ID] expr [AS "Name"], ... | TASK
 *   FROM #tag | "folder" | [[note]] combined with AND, OR, -, ! and ( )
 *   WHERE expr · FLATTEN expr [AS name] · GROUP BY expr [AS name]
 *   SORT expr [ASC|DESC], ... · LIMIT n
 */

export interface Link {
  kind: "link"
  key?: string
  title: string
  url?: string
}

export type Value = string | number | boolean | null | Date | Link | Value[] | { [k: string]: Value }

/** A `- [ ] task` line of a note. */
export interface Task {
  /** The line as written after the checkbox, links already turned into HTML. */
  text: string
  /** The character between the brackets: " ", "x", or a custom status such as "/". */
  status: string
  /** 1-based line in the note's published markdown. */
  line: number
  tags: string[]
  /** Dates of the Tasks plugin (📅 due…) and inline [key:: value] fields. */
  fields: Record<string, string>
  /** Text of the heading the task sits under, if any. */
  heading?: string
}

/** Dates written with the emoji of the Obsidian Tasks plugin. */
const TASK_DATES: Record<string, string> = { "📅": "due", "⏳": "scheduled", "🛫": "start", "✅": "completion", "➕": "created" }

/** Tasks of a note's markdown, outside code blocks. */
export function extractTasks(md: string): Task[] {
  const tasks: Task[] = []
  let fence: string | undefined
  let heading: string | undefined
  md.split("\n").forEach((line, i) => {
    const f = line.match(/^\s*(`{3,}|~{3,})/)
    if (f && (!fence || f[1].startsWith(fence))) {
      fence = fence ? undefined : f[1]
      return
    }
    if (fence) return
    const h = line.match(/^#{1,6}\s+(.*?)\s*#*$/)
    if (h) heading = h[1].replace(/<[^>]+>/g, "")
    const m = line.match(/^\s*(?:[-*+]|\d+[.)])\s+\[(.)\]\s+(.*)$/)
    if (!m) return
    const text = m[2].trim()
    const fields: Record<string, string> = {}
    for (const [emoji, name] of Object.entries(TASK_DATES)) {
      const d = text.match(new RegExp(`${emoji}\\uFE0F?\\s*(\\d{4}-\\d{2}-\\d{2})`, "u"))
      if (d) fields[name] = d[1]
    }
    for (const f of text.matchAll(/[[(]([\p{L}\p{N}_ -]+)::\s*([^\])]*)[\])]/gu)) fields[f[1].trim()] = f[2].trim()
    const tags = [...text.matchAll(/(?:^|[\s>])#([\p{L}_][\p{L}\p{N}_/-]*)/gu)].map((t) => "#" + t[1])
    tasks.push({ text, status: m[1], line: i + 1, tags, fields, ...(heading ? { heading } : {}) })
  })
  return tasks
}

/** What the engine needs to know about a published note. */
export interface Page {
  key: string
  title: string
  url: string
  dir: string
  stem: string
  tags: string[]
  explicitTags: string[]
  created?: Date
  updated?: Date
  fields: Record<string, unknown>
  outlinks: string[]
  inlinks: string[]
  tasks?: Task[]
}

export class DataviewError extends Error {}
export class Unsupported extends Error {}

// ---------- tokens ----------

type Tok =
  | { t: "str"; v: string }
  | { t: "num"; v: number }
  | { t: "id"; v: string }
  | { t: "tag"; v: string }
  | { t: "link"; v: string }
  | { t: "op"; v: string }

const KEYWORDS = new Set(["FROM", "WHERE", "SORT", "LIMIT", "FLATTEN", "GROUP", "AS", "AND", "OR", "ASC", "DESC", "WITHOUT", "ID", "BY"])

function tokenize(src: string): Tok[] {
  const out: Tok[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (/\s/.test(c)) {
      i++
      continue
    }
    if (c === '"' || c === "'") {
      let j = i + 1
      let v = ""
      while (j < src.length && src[j] !== c) {
        if (src[j] === "\\" && j + 1 < src.length) j++
        v += src[j++]
      }
      if (j >= src.length) throw new DataviewError("unterminated string")
      out.push({ t: "str", v })
      i = j + 1
      continue
    }
    if (src.startsWith("[[", i)) {
      const j = src.indexOf("]]", i)
      if (j < 0) throw new DataviewError("unterminated link")
      out.push({ t: "link", v: src.slice(i + 2, j) })
      i = j + 2
      continue
    }
    const tag = src.slice(i).match(/^#[\p{L}\p{N}_/-]+/u)
    if (tag) {
      out.push({ t: "tag", v: tag[0].slice(1) })
      i += tag[0].length
      continue
    }
    const num = src.slice(i).match(/^\d+(\.\d+)?/)
    if (num) {
      out.push({ t: "num", v: Number(num[0]) })
      i += num[0].length
      continue
    }
    const id = src.slice(i).match(/^[\p{L}_][\p{L}\p{N}_-]*/u)
    if (id) {
      out.push({ t: "id", v: id[0] })
      i += id[0].length
      continue
    }
    const op = src.slice(i).match(/^(!=|<=|>=|=|<|>|\+|-|\*|\/|\(|\)|,|!|\.|\[|\]|&|\|)/)
    if (op) {
      out.push({ t: "op", v: op[0] })
      i += op[0].length
      continue
    }
    throw new DataviewError(`unexpected "${c}"`)
  }
  return out
}

// ---------- syntax ----------

type Expr =
  | { k: "lit"; v: Value }
  | { k: "var"; name: string }
  | { k: "member"; obj: Expr; name: string }
  | { k: "index"; obj: Expr; idx: Expr }
  | { k: "call"; fn: string; args: Expr[] }
  | { k: "not"; e: Expr }
  | { k: "neg"; e: Expr }
  | { k: "bin"; op: string; a: Expr; b: Expr }
  | { k: "link"; target: string }

type Source =
  | { k: "tag"; tag: string }
  | { k: "folder"; path: string }
  | { k: "link"; target: string }
  | { k: "not"; s: Source }
  | { k: "and" | "or"; a: Source; b: Source }

type Step =
  | { k: "where"; e: Expr }
  | { k: "flatten"; e: Expr; as: string }
  | { k: "group"; e: Expr; as: string }
  | { k: "sort"; keys: { e: Expr; desc: boolean }[] }
  | { k: "limit"; n: number }

export interface Query {
  type: "list" | "table" | "task"
  withoutId: boolean
  columns: { e: Expr; name: string }[]
  from?: Source
  steps: Step[]
}

class Parser {
  i = 0
  constructor(private toks: Tok[]) {}
  peek(o = 0) {
    return this.toks[this.i + o]
  }
  isKw(word: string, o = 0) {
    const t = this.peek(o)
    return t?.t === "id" && t.v.toUpperCase() === word
  }
  isOp(op: string) {
    const t = this.peek()
    return t?.t === "op" && t.v === op
  }
  eatKw(word: string) {
    if (!this.isKw(word)) return false
    this.i++
    return true
  }
  eatOp(op: string) {
    if (!this.isOp(op)) return false
    this.i++
    return true
  }
  expectOp(op: string) {
    if (!this.eatOp(op)) throw new DataviewError(`expected "${op}"`)
  }
  atClause() {
    return ["FROM", "WHERE", "SORT", "LIMIT", "FLATTEN", "GROUP"].some((w) => this.isKw(w))
  }

  query(): Query {
    const head = this.peek()
    if (head?.t !== "id") throw new DataviewError("a query starts with LIST, TABLE or TASK")
    const type = head.v.toUpperCase()
    this.i++
    if (type !== "LIST" && type !== "TABLE" && type !== "TASK") throw new Unsupported(`${type} queries`)
    const q: Query = { type: type.toLowerCase() as Query["type"], withoutId: false, columns: [], steps: [] }
    if (this.isKw("WITHOUT") && this.isKw("ID", 1)) {
      this.i += 2
      q.withoutId = true
    }
    if (q.type !== "task" && this.peek() && !this.atClause()) {
      do {
        const e = this.expr()
        let name = describe(e)
        if (this.eatKw("AS")) {
          const t = this.peek()
          if (!t || (t.t !== "str" && t.t !== "id")) throw new DataviewError("expected a column name after AS")
          name = String(t.v)
          this.i++
        }
        q.columns.push({ e, name })
      } while (q.type === "table" && this.eatOp(","))
    }
    while (this.peek()) {
      if (this.eatKw("FROM")) q.from = this.sourceOr()
      else if (this.eatKw("WHERE")) q.steps.push({ k: "where", e: this.expr() })
      else if (this.eatKw("FLATTEN")) {
        const e = this.expr()
        const as = this.eatKw("AS") ? String(this.next("id").v) : describe(e)
        q.steps.push({ k: "flatten", e, as })
      } else if (this.eatKw("SORT")) {
        const keys: { e: Expr; desc: boolean }[] = []
        do {
          const e = this.expr()
          const desc = this.eatKw("DESC") || (this.eatKw("DESCENDING") ? true : (this.eatKw("ASC") || this.eatKw("ASCENDING"), false))
          keys.push({ e, desc })
        } while (this.eatOp(","))
        q.steps.push({ k: "sort", keys })
      } else if (this.eatKw("LIMIT")) q.steps.push({ k: "limit", n: Number(this.next("num").v) })
      else if (this.isKw("GROUP") && this.isKw("BY", 1)) {
        this.i += 2
        const e = this.expr()
        const as = this.eatKw("AS") ? String(this.next("id").v) : describe(e)
        q.steps.push({ k: "group", e, as })
      }
      else throw new DataviewError(`unexpected "${String(this.peek()!.v)}"`)
    }
    return q
  }

  next(t: Tok["t"]) {
    const tok = this.peek()
    if (tok?.t !== t) throw new DataviewError(`expected ${t}`)
    this.i++
    return tok
  }

  sourceOr(): Source {
    let a = this.sourceAnd()
    while (this.eatKw("OR")) a = { k: "or", a, b: this.sourceAnd() }
    return a
  }
  sourceAnd(): Source {
    let a = this.sourceUnary()
    while (this.eatKw("AND")) a = { k: "and", a, b: this.sourceUnary() }
    return a
  }
  sourceUnary(): Source {
    if (this.eatOp("-") || this.eatOp("!")) return { k: "not", s: this.sourceUnary() }
    if (this.eatOp("(")) {
      const s = this.sourceOr()
      this.expectOp(")")
      return s
    }
    const t = this.peek()
    this.i++
    if (t?.t === "tag") return { k: "tag", tag: t.v }
    if (t?.t === "str") return { k: "folder", path: t.v }
    if (t?.t === "link") return { k: "link", target: t.v }
    throw new DataviewError("FROM expects #tags, \"folders\" or [[links]]")
  }

  expr(): Expr {
    return this.or()
  }
  or(): Expr {
    let a = this.and()
    while (this.eatKw("OR") || this.eatOp("|")) a = { k: "bin", op: "or", a, b: this.and() }
    return a
  }
  and(): Expr {
    let a = this.not()
    while (this.eatKw("AND") || this.eatOp("&")) a = { k: "bin", op: "and", a, b: this.not() }
    return a
  }
  not(): Expr {
    if (this.eatOp("!")) return { k: "not", e: this.not() }
    return this.compare()
  }
  compare(): Expr {
    let a = this.add()
    for (;;) {
      const t = this.peek()
      if (t?.t === "op" && ["=", "!=", "<", ">", "<=", ">="].includes(t.v)) {
        this.i++
        a = { k: "bin", op: t.v, a, b: this.add() }
      } else return a
    }
  }
  add(): Expr {
    let a = this.mul()
    for (;;) {
      if (this.isOp("+") || this.isOp("-")) {
        const op = String(this.peek()!.v)
        this.i++
        a = { k: "bin", op, a, b: this.mul() }
      } else return a
    }
  }
  mul(): Expr {
    let a = this.unary()
    for (;;) {
      if (this.isOp("*") || this.isOp("/")) {
        const op = String(this.peek()!.v)
        this.i++
        a = { k: "bin", op, a, b: this.unary() }
      } else return a
    }
  }
  unary(): Expr {
    if (this.eatOp("-")) return { k: "neg", e: this.unary() }
    return this.postfix()
  }
  postfix(): Expr {
    let e = this.primary()
    for (;;) {
      if (this.eatOp(".")) {
        const t = this.next("id")
        e = { k: "member", obj: e, name: String(t.v) }
      } else if (this.eatOp("[")) {
        const idx = this.expr()
        this.expectOp("]")
        e = { k: "index", obj: e, idx }
      } else return e
    }
  }
  primary(): Expr {
    const t = this.peek()
    if (!t) throw new DataviewError("unexpected end of query")
    this.i++
    if (t.t === "str") return { k: "lit", v: t.v }
    if (t.t === "num") return { k: "lit", v: t.v }
    if (t.t === "link") return { k: "link", target: t.v }
    if (t.t === "tag") return { k: "lit", v: "#" + t.v }
    if (t.t === "op" && t.v === "(") {
      const e = this.expr()
      this.expectOp(")")
      return e
    }
    if (t.t === "id") {
      const word = t.v.toLowerCase()
      if (word === "true" || word === "false") return { k: "lit", v: word === "true" }
      if (word === "null" || word === "nil") return { k: "lit", v: null }
      if (this.eatOp("(")) {
        const args: Expr[] = []
        if (!this.isOp(")")) {
          do args.push(this.expr())
          while (this.eatOp(","))
        }
        this.expectOp(")")
        return { k: "call", fn: word, args }
      }
      if (KEYWORDS.has(t.v.toUpperCase())) throw new DataviewError(`unexpected ${t.v}`)
      return { k: "var", name: t.v }
    }
    throw new DataviewError(`unexpected "${String(t.v)}"`)
  }
}

function describe(e: Expr): string {
  if (e.k === "var") return e.name
  if (e.k === "member") return `${describe(e.obj)}.${e.name}`
  if (e.k === "call") return `${e.fn}(…)`
  return "value"
}

export function parseQuery(src: string): Query {
  const p = new Parser(tokenize(src))
  return p.query()
}

// ---------- evaluation ----------

type Row = Record<string, Value>

export interface Engine {
  pages: Page[]
  current?: Page
  resolve(target: string): Page | undefined
}

const ISO = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?/

/** Moments date() understands by name; all but `now` are the start of a day. */
const DATE_WORDS = ["today", "tomorrow", "yesterday", "now"]

function linkTo(page: Page): Link {
  return { kind: "link", key: page.key, title: page.title, url: page.url }
}

function toValue(v: unknown, engine: Engine): Value {
  if (v == null) return null
  if (Array.isArray(v)) return v.map((x) => toValue(x, engine))
  if (v instanceof Date) return v
  if (typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toValue(x, engine)]))
  if (typeof v === "string") {
    if (ISO.test(v) && !Number.isNaN(Date.parse(v))) return new Date(v)
    const link = v.match(/^\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]$/)
    if (link) {
      const page = engine.resolve(link[1])
      return page ? { ...linkTo(page), title: link[2] ?? page.title } : { kind: "link", title: link[2] ?? link[1] }
    }
    return v
  }
  return v as Value
}

function rowOf(page: Page, engine: Engine): Row {
  const fields: Row = {}
  for (const [k, v] of Object.entries(page.fields)) {
    fields[k] = toValue(v, engine)
    fields[k.toLowerCase()] ??= fields[k]
  }
  const byKey = (keys: string[]) =>
    keys.map((k) => engine.pages.find((p) => p.key === k)).filter((p): p is Page => !!p).map(linkTo)
  fields.file = {
    name: page.stem,
    path: page.key + ".md",
    folder: page.dir,
    link: linkTo(page),
    tags: page.tags.flatMap((t) => t.split("/").map((_, i, a) => "#" + a.slice(0, i + 1).join("/"))),
    etags: page.explicitTags.map((t) => "#" + t),
    ctime: page.created ?? null,
    cday: page.created ?? null,
    mtime: page.updated ?? null,
    mday: page.updated ?? null,
    outlinks: byKey(page.outlinks),
    inlinks: byKey(page.inlinks),
  }
  return fields
}

function isLink(v: Value): v is Link {
  return typeof v === "object" && v !== null && !Array.isArray(v) && !(v instanceof Date) && (v as Link).kind === "link"
}

function scalar(v: Value): string | number | boolean | null {
  if (v instanceof Date) return v.getTime()
  if (isLink(v)) return v.key ?? v.title
  if (Array.isArray(v) || (typeof v === "object" && v !== null)) return JSON.stringify(v)
  return v
}

function equals(a: Value, b: Value): boolean {
  if (a == null || b == null) return a == null && b == null
  return scalar(a) === scalar(b)
}

export function compare(a: Value, b: Value): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  if (isLink(a) && isLink(b)) return a.title.localeCompare(b.title)
  const x = scalar(a)
  const y = scalar(b)
  if (typeof x === "number" && typeof y === "number") return x - y
  return String(x).localeCompare(String(y), undefined, { numeric: true })
}

const truthy = (v: Value) => !(v == null || v === false || v === "" || v === 0 || (Array.isArray(v) && v.length === 0))

function text(v: Value): string {
  if (v == null) return ""
  if (isLink(v)) return v.title
  if (v instanceof Date) return v.toISOString()
  if (Array.isArray(v)) return v.map(text).join(", ")
  return String(v)
}

function evaluate(e: Expr, row: Row, engine: Engine): Value {
  switch (e.k) {
    case "lit":
      return e.v
    case "var": {
      if (e.name === "this") return engine.current ? (rowOf(engine.current, engine) as Value) : null
      return row[e.name] ?? row[e.name.toLowerCase()] ?? null
    }
    case "link": {
      const page = engine.resolve(e.target.split("|")[0].split("#")[0])
      return page ? linkTo(page) : { kind: "link", title: e.target }
    }
    case "member": {
      const obj = evaluate(e.obj, row, engine)
      if (isLink(obj)) {
        const page = obj.key ? engine.pages.find((p) => p.key === obj.key) : undefined
        // link.file is the linked page's file object, or null when it is not published.
        if (e.name === "file") return page ? (rowOf(page, engine).file as Value) : null
        return page ? (rowOf(page, engine)[e.name] ?? null) : null
      }
      if (Array.isArray(obj)) return obj.map((x) => evaluate({ k: "member", obj: { k: "lit", v: x }, name: e.name }, row, engine))
      if (obj && typeof obj === "object" && !(obj instanceof Date)) {
        const rec = obj as Record<string, Value>
        return rec[e.name] ?? rec[e.name.toLowerCase()] ?? null
      }
      return null
    }
    case "index": {
      const obj = evaluate(e.obj, row, engine)
      const idx = evaluate(e.idx, row, engine)
      if (Array.isArray(obj) && typeof idx === "number") return obj[idx] ?? null
      if (obj && typeof obj === "object" && typeof idx === "string") return (obj as Record<string, Value>)[idx] ?? null
      return null
    }
    case "not":
      return !truthy(evaluate(e.e, row, engine))
    case "neg": {
      const v = evaluate(e.e, row, engine)
      return typeof v === "number" ? -v : null
    }
    case "bin": {
      if (e.op === "and") return truthy(evaluate(e.a, row, engine)) && truthy(evaluate(e.b, row, engine))
      if (e.op === "or") return truthy(evaluate(e.a, row, engine)) || truthy(evaluate(e.b, row, engine))
      const a = evaluate(e.a, row, engine)
      const b = evaluate(e.b, row, engine)
      switch (e.op) {
        case "=":
          return equals(a, b)
        case "!=":
          return !equals(a, b)
        case "<":
          return a != null && b != null && compare(a, b) < 0
        case ">":
          return a != null && b != null && compare(a, b) > 0
        case "<=":
          return a != null && b != null && compare(a, b) <= 0
        case ">=":
          return a != null && b != null && compare(a, b) >= 0
        case "+":
          return typeof a === "number" && typeof b === "number" ? a + b : text(a) + text(b)
        case "-":
          return typeof a === "number" && typeof b === "number" ? a - b : null
        case "*":
          return typeof a === "number" && typeof b === "number" ? a * b : null
        case "/":
          return typeof a === "number" && typeof b === "number" && b !== 0 ? a / b : null
      }
      return null
    }
    case "call": {
      // date(today) names a moment, not a field: Dataview writes it without quotes.
      const [first] = e.args
      if (e.fn === "date" && first?.k === "var" && DATE_WORDS.includes(first.name.toLowerCase())) {
        return call("date", [first.name.toLowerCase()], engine)
      }
      return call(e.fn, e.args.map((a) => evaluate(a, row, engine)), engine)
    }
  }
}

function call(fn: string, args: Value[], engine: Engine): Value {
  const [a, b, c] = args
  const str = (v: Value) => (v == null ? "" : text(v))
  switch (fn) {
    case "contains":
      if (Array.isArray(a)) return a.some((x) => equals(x, b) || (typeof x === "string" && typeof b === "string" && x === b))
      if (typeof a === "string") return a.includes(str(b))
      if (isLink(a) && isLink(b)) return equals(a, b)
      if (a && typeof a === "object" && !(a instanceof Date)) return str(b) in (a as object)
      return false
    case "icontains":
      if (Array.isArray(a)) return a.some((x) => str(x).toLowerCase() === str(b).toLowerCase())
      return str(a).toLowerCase().includes(str(b).toLowerCase())
    case "startswith":
      return str(a).startsWith(str(b))
    case "endswith":
      return str(a).endsWith(str(b))
    case "length":
      return Array.isArray(a) ? a.length : a && typeof a === "object" && !(a instanceof Date) && !isLink(a) ? Object.keys(a).length : str(a).length
    case "lower":
      return str(a).toLowerCase()
    case "upper":
      return str(a).toUpperCase()
    case "default":
      return a ?? b ?? null
    case "choice":
      return truthy(a) ? b : (c ?? null)
    case "join":
      return Array.isArray(a) ? a.map(str).join(b == null ? ", " : str(b)) : str(a)
    case "list":
      return args
    case "number": {
      const n = Number.parseFloat(str(a))
      return Number.isNaN(n) ? null : n
    }
    case "string":
      return str(a)
    case "round":
      return typeof a === "number" ? Number(a.toFixed(typeof b === "number" ? b : 0)) : null
    case "min":
      return (Array.isArray(a) ? a : args).reduce<Value>((m, x) => (m == null || compare(x, m) < 0 ? x : m), null)
    case "max":
      return (Array.isArray(a) ? a : args).reduce<Value>((m, x) => (m == null || compare(x, m) > 0 ? x : m), null)
    case "sum":
      return (Array.isArray(a) ? a : args).reduce<number>((s, x) => s + (typeof x === "number" ? x : 0), 0)
    case "regexmatch":
      try {
        return new RegExp(`^(?:${str(a)})$`).test(str(b))
      } catch {
        return false
      }
    case "date": {
      const word = str(a).toLowerCase()
      if (word === "now") return new Date()
      if (DATE_WORDS.includes(word)) {
        const d = new Date()
        d.setHours(0, 0, 0, 0)
        d.setDate(d.getDate() + (word === "tomorrow" ? 1 : word === "yesterday" ? -1 : 0))
        return d
      }
      return a instanceof Date ? a : Number.isNaN(Date.parse(str(a))) ? null : new Date(str(a))
    }
    case "link": {
      const page = engine.resolve(str(a))
      return page ? linkTo(page) : { kind: "link", title: str(a) }
    }
    case "meta":
      // Obsidian's link metadata (display text, embed) does not exist after publishing.
      return isLink(a) ? { display: null, embed: false, path: a.key ? a.key + ".md" : null } : null
    case "typeof":
      return a == null ? "null" : Array.isArray(a) ? "array" : a instanceof Date ? "date" : isLink(a) ? "link" : typeof a
  }
  throw new DataviewError(`unknown function ${fn}()`)
}

function inSource(page: Page, s: Source, engine: Engine): boolean {
  switch (s.k) {
    case "tag":
      return page.tags.some((t) => t === s.tag || t.startsWith(s.tag + "/"))
    case "folder": {
      const f = s.path.replace(/^\/+|\/+$/g, "")
      return page.dir === f || page.dir.startsWith(f + "/") || page.key === f.replace(/\.md$/, "")
    }
    case "link": {
      const target = engine.resolve(s.target.split("|")[0])
      return !!target && page.outlinks.includes(target.key)
    }
    case "not":
      return !inSource(page, s.s, engine)
    case "and":
      return inSource(page, s.a, engine) && inSource(page, s.b, engine)
    case "or":
      return inSource(page, s.a, engine) || inSource(page, s.b, engine)
  }
}

export interface TaskGroup {
  /** The note of the tasks, or the GROUP BY key. */
  key: Value
  tasks: { text: string; checked: boolean }[]
}

export interface Result {
  type: "list" | "table" | "task"
  headers: string[]
  rows: Value[][]
  /** LIST … GROUP BY without a column: each row is [key, members], shown nested. */
  nested?: boolean
  /** TASK results, by note or by GROUP BY key. */
  groups?: TaskGroup[]
}

/** A task as a row: its own fields over those of its note, as in Dataview. */
function taskRow(page: Page, task: Task, engine: Engine): Row {
  const fields: Row = {}
  for (const [k, v] of Object.entries(task.fields)) fields[k] = toValue(v, engine)
  return {
    ...rowOf(page, engine),
    ...fields,
    text: task.text,
    status: task.status,
    completed: task.status === "x" || task.status === "X",
    checked: task.status !== " ",
    line: task.line,
    path: page.key + ".md",
    link: linkTo(page),
    tags: task.tags,
  }
}

export function runQuery(q: Query, engine: Engine): Result {
  const pages = q.from ? engine.pages.filter((p) => inSource(p, q.from!, engine)) : engine.pages
  let rows: Row[] =
    q.type === "task" ? pages.flatMap((p) => (p.tasks ?? []).map((t) => taskRow(p, t, engine))) : pages.map((p) => rowOf(p, engine))
  let group: string | undefined
  for (const step of q.steps) {
    if (step.k === "where") rows = rows.filter((r) => truthy(evaluate(step.e, r, engine)))
    else if (step.k === "group") {
      // Each group becomes one row: its key, and the rows it gathers under `rows`.
      const groups = new Map<string, { key: Value; rows: Row[] }>()
      for (const r of rows) {
        const key = evaluate(step.e, r, engine)
        const id = JSON.stringify(scalar(key))
        const g = groups.get(id) ?? { key, rows: [] }
        g.rows.push(r)
        groups.set(id, g)
      }
      rows = [...groups.values()]
        .sort((a, b) => compare(a.key, b.key))
        .map((g) => ({ key: g.key, [step.as]: g.key, rows: g.rows as Value }))
      group = step.as
    }
    else if (step.k === "flatten") {
      rows = rows.flatMap((r) => {
        const v = evaluate(step.e, r, engine)
        return (Array.isArray(v) ? v : [v]).map((x) => ({ ...r, [step.as]: x }))
      })
    } else if (step.k === "sort") {
      const keyed = rows.map((r) => ({ r, keys: step.keys.map((k) => evaluate(k.e, r, engine)) }))
      keyed.sort((x, y) => {
        for (let i = 0; i < step.keys.length; i++) {
          const d = compare(x.keys[i], y.keys[i])
          if (d) return step.keys[i].desc ? -d : d
        }
        return 0
      })
      rows = keyed.map((k) => k.r)
    } else rows = rows.slice(0, step.n)
  }
  const file = (r: Row) => (r.file as Record<string, Value>).link
  if (q.type === "task") {
    const view = (r: Row) => ({ text: String(r.text), checked: r.checked === true })
    if (group) return { type: "task", headers: [], rows: [], groups: rows.map((g) => ({ key: g.key, tasks: (g.rows as Row[]).map(view) })) }
    // Without GROUP BY, tasks are listed under their note, as Dataview does.
    const byNote = new Map<string, TaskGroup>()
    for (const r of rows) {
      const link = r.link as Link
      const g = byNote.get(link.key!) ?? { key: link, tasks: [] }
      g.tasks.push(view(r))
      byNote.set(link.key!, g)
    }
    return { type: "task", headers: [], rows: [], groups: [...byNote.values()] }
  }
  if (group) {
    const col = q.columns[0]
    if (q.type === "list") {
      return col
        ? { type: "list", headers: [], rows: rows.map((r) => [r.key, evaluate(col.e, r, engine)]) }
        : { type: "list", headers: [], nested: true, rows: rows.map((r) => [r.key, (r.rows as Row[]).map(file)]) }
    }
    return {
      type: "table",
      headers: [...(q.withoutId ? [] : [group]), ...q.columns.map((c) => c.name)],
      rows: rows.map((r) => [...(q.withoutId ? [] : [r.key]), ...q.columns.map((c) => evaluate(c.e, r, engine))]),
    }
  }
  if (q.type === "list") {
    const col = q.columns[0]
    return {
      type: "list",
      headers: [],
      rows: rows.map((r) => (col ? (q.withoutId ? [evaluate(col.e, r, engine)] : [file(r), evaluate(col.e, r, engine)]) : [file(r)])),
    }
  }
  return {
    type: "table",
    headers: [...(q.withoutId ? [] : ["File"]), ...q.columns.map((c) => c.name)],
    rows: rows.map((r) => [...(q.withoutId ? [] : [file(r)]), ...q.columns.map((c) => evaluate(c.e, r, engine))]),
  }
}
