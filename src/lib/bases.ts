/**
 * Obsidian Bases (.base files): YAML views over notes with JavaScript-like
 * filter and formula expressions. Evaluated over published notes only.
 */
import { load as loadYaml } from "js-yaml"
import { compare, type Engine, type Link, type Page, type Value } from "./dataview"

export class BaseError extends Error {}

type Filter = string | { and?: Filter[]; or?: Filter[]; not?: Filter[] }

export interface BaseView {
  type: "table" | "cards" | "list"
  name: string
  filters?: Filter
  order: string[]
  sort: { property: string; direction: "ASC" | "DESC" }[]
  limit?: number
  image?: string
}

export interface BaseFile {
  filters?: Filter
  formulas: Record<string, string>
  displayNames: Record<string, string>
  views: BaseView[]
}

export function parseBase(src: string): BaseFile {
  let raw: Record<string, unknown>
  try {
    raw = (loadYaml(src) ?? {}) as Record<string, unknown>
  } catch (e) {
    throw new BaseError(`invalid YAML: ${(e as Error).message}`)
  }
  const displayNames: Record<string, string> = {}
  for (const [k, v] of Object.entries((raw.properties ?? {}) as Record<string, { displayName?: string }>)) {
    if (v?.displayName) displayNames[k] = v.displayName
  }
  const views = ((raw.views as Record<string, unknown>[] | undefined) ?? [{ type: "table", name: "Table" }]).map(
    (v, i): BaseView => ({
      type: v.type === "cards" ? "cards" : v.type === "list" ? "list" : "table",
      name: String(v.name ?? `View ${i + 1}`),
      filters: v.filters as Filter | undefined,
      order: ((v.order as string[] | undefined) ?? ["file.name"]).map(String),
      sort: ((v.sort as { property: string; direction?: string }[] | undefined) ?? []).map((s) => ({
        property: String(s.property),
        direction: String(s.direction ?? "ASC").toUpperCase() === "DESC" ? "DESC" : "ASC",
      })),
      limit: typeof v.limit === "number" ? v.limit : undefined,
      image: typeof v.image === "string" ? v.image : undefined,
    }),
  )
  return {
    filters: raw.filters as Filter | undefined,
    formulas: Object.fromEntries(Object.entries((raw.formulas ?? {}) as Record<string, unknown>).map(([k, v]) => [k, String(v)])),
    displayNames,
    views,
  }
}

// ---------- expressions ----------

type Tok = { t: "str" | "num" | "id" | "op"; v: string }

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
        if (src[j] === "\\") j++
        v += src[j++]
      }
      if (j >= src.length) throw new BaseError("unterminated string")
      out.push({ t: "str", v })
      i = j + 1
      continue
    }
    const m =
      src.slice(i).match(/^\d+(\.\d+)?/) ??
      src.slice(i).match(/^[\p{L}_$][\p{L}\p{N}_$-]*/u) ??
      src.slice(i).match(/^(==|!=|<=|>=|&&|\|\||[<>+\-*/%!().,[\]])/)
    if (!m) throw new BaseError(`unexpected "${c}"`)
    const v = m[0]
    out.push({ t: /^\d/.test(v) ? "num" : /^[\p{L}_$]/u.test(v) ? "id" : "op", v })
    i += v.length
  }
  return out
}

type Expr =
  | { k: "lit"; v: Value }
  | { k: "var"; name: string }
  | { k: "member"; obj: Expr; name: string }
  | { k: "call"; callee: Expr; args: Expr[] }
  | { k: "un"; op: string; e: Expr }
  | { k: "bin"; op: string; a: Expr; b: Expr }
  | { k: "list"; items: Expr[] }

const PRECEDENCE: Record<string, number> = { "||": 1, "&&": 2, "==": 3, "!=": 3, "<": 4, ">": 4, "<=": 4, ">=": 4, "+": 5, "-": 5, "*": 6, "/": 6, "%": 6 }

export function parseExpr(src: string): Expr {
  const toks = tokenize(src)
  let i = 0
  const peek = () => toks[i]
  const eat = (v: string) => (peek()?.v === v && peek()?.t === "op" ? (i++, true) : false)
  const expect = (v: string) => {
    if (!eat(v)) throw new BaseError(`expected "${v}"`)
  }
  const args = (close: string) => {
    const out: Expr[] = []
    if (!eat(close)) {
      do out.push(binary(0))
      while (eat(","))
      expect(close)
    }
    return out
  }
  function primary(): Expr {
    const t = toks[i++]
    if (!t) throw new BaseError("unexpected end of expression")
    if (t.t === "str") return { k: "lit", v: t.v }
    if (t.t === "num") return { k: "lit", v: Number(t.v) }
    if (t.t === "id") {
      if (t.v === "true" || t.v === "false") return { k: "lit", v: t.v === "true" }
      if (t.v === "null") return { k: "lit", v: null }
      return { k: "var", name: t.v }
    }
    if (t.v === "(") {
      const e = binary(0)
      expect(")")
      return e
    }
    if (t.v === "[") return { k: "list", items: args("]") }
    throw new BaseError(`unexpected "${t.v}"`)
  }
  function postfix(): Expr {
    let e = primary()
    for (;;) {
      if (eat(".")) {
        const t = toks[i++]
        if (t?.t !== "id") throw new BaseError("expected a name after .")
        e = { k: "member", obj: e, name: t.v }
      } else if (eat("(")) e = { k: "call", callee: e, args: args(")") }
      else if (eat("[")) {
        const idx = binary(0)
        expect("]")
        e = { k: "call", callee: { k: "member", obj: e, name: "__index" }, args: [idx] }
      } else return e
    }
  }
  function unary(): Expr {
    if (eat("!")) return { k: "un", op: "!", e: unary() }
    if (eat("-")) return { k: "un", op: "-", e: unary() }
    return postfix()
  }
  function binary(min: number): Expr {
    let a = unary()
    for (;;) {
      const t = peek()
      const p = t?.t === "op" ? PRECEDENCE[t.v] : undefined
      if (p === undefined || p <= min) return a
      i++
      a = { k: "bin", op: t!.v, a, b: binary(p) }
    }
  }
  const e = binary(0)
  if (i < toks.length) throw new BaseError(`unexpected "${toks[i].v}"`)
  return e
}

// ---------- evaluation ----------

interface Ctx {
  page: Page
  engine: Engine
  formulas: Record<string, string>
  depth: number
}

const isLink = (v: unknown): v is Link => typeof v === "object" && v !== null && (v as Link).kind === "link"
const truthy = (v: Value) => !(v == null || v === false || v === "" || v === 0 || (Array.isArray(v) && !v.length))
const str = (v: Value): string => (v == null ? "" : isLink(v) ? v.title : v instanceof Date ? v.toISOString() : Array.isArray(v) ? v.map(str).join(", ") : String(v))

function fileObject(page: Page, engine: Engine): Record<string, Value> {
  const link: Link = { kind: "link", key: page.key, title: page.title, url: page.url }
  const links = page.outlinks
    .map((k) => engine.pages.find((p) => p.key === k))
    .filter((p): p is Page => !!p)
    .map((p): Link => ({ kind: "link", key: p.key, title: p.title, url: p.url }))
  return {
    name: page.stem,
    basename: page.stem,
    path: page.key + ".md",
    folder: page.dir,
    ext: "md",
    link,
    tags: page.tags,
    links,
    ctime: page.created ?? null,
    mtime: page.updated ?? null,
  }
}

function thisObject(page: Page, engine: Engine): Value {
  return { ...Object.fromEntries(Object.keys(page.fields).map((k) => [k, noteValue(page, k)])), file: fileObject(page, engine) }
}

function noteValue(page: Page, name: string): Value {
  const v = page.fields[name] ?? page.fields[name.toLowerCase()]
  if (v == null) return null
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) && !Number.isNaN(Date.parse(v))) return new Date(v)
  return v as Value
}

/** Value of a property id as used in `order` and `sort`: file.x, note.x, formula.x or a bare note property. */
export function property(id: string, page: Page, engine: Engine, formulas: Record<string, string>): Value {
  return evaluate(parseExpr(id), { page, engine, formulas, depth: 0 })
}

function evaluate(e: Expr, ctx: Ctx): Value {
  switch (e.k) {
    case "lit":
      return e.v
    case "list":
      return e.items.map((x) => evaluate(x, ctx))
    case "var":
      if (e.name === "file") return fileObject(ctx.page, ctx.engine)
      if (e.name === "note") return Object.fromEntries(Object.keys(ctx.page.fields).map((k) => [k, noteValue(ctx.page, k)]))
      if (e.name === "formula") return { __formulas: true } as unknown as Value
      // `this` is the note holding the base: the one embedding it, or with the ```base block.
      if (e.name === "this") return ctx.engine.current ? thisObject(ctx.engine.current, ctx.engine) : null
      return noteValue(ctx.page, e.name)
    case "member": {
      if (e.obj.k === "var" && e.obj.name === "formula") {
        const src = ctx.formulas[e.name]
        if (src == null) throw new BaseError(`unknown formula ${e.name}`)
        if (ctx.depth > 8) throw new BaseError("formulas refer to each other in a loop")
        return evaluate(parseExpr(src), { ...ctx, depth: ctx.depth + 1 })
      }
      const obj = evaluate(e.obj, ctx)
      if (e.name === "length") return Array.isArray(obj) || typeof obj === "string" ? obj.length : null
      if (obj && typeof obj === "object" && !Array.isArray(obj) && !(obj instanceof Date) && !isLink(obj)) {
        return (obj as Record<string, Value>)[e.name] ?? null
      }
      return null
    }
    case "un": {
      const v = evaluate(e.e, ctx)
      return e.op === "!" ? !truthy(v) : typeof v === "number" ? -v : null
    }
    case "bin": {
      if (e.op === "&&") return truthy(evaluate(e.a, ctx)) && truthy(evaluate(e.b, ctx))
      if (e.op === "||") return truthy(evaluate(e.a, ctx)) || truthy(evaluate(e.b, ctx))
      const a = evaluate(e.a, ctx)
      const b = evaluate(e.b, ctx)
      const num = typeof a === "number" && typeof b === "number"
      switch (e.op) {
        case "==":
          return a == null || b == null ? a == null && b == null : compare(a, b) === 0
        case "!=":
          return a == null || b == null ? !(a == null && b == null) : compare(a, b) !== 0
        case "<":
          return a != null && b != null && compare(a, b) < 0
        case ">":
          return a != null && b != null && compare(a, b) > 0
        case "<=":
          return a != null && b != null && compare(a, b) <= 0
        case ">=":
          return a != null && b != null && compare(a, b) >= 0
        case "+":
          return num ? a + b : str(a) + str(b)
        case "-":
          return num ? a - b : null
        case "*":
          return num ? a * b : null
        case "/":
          return num && b !== 0 ? a / b : null
        case "%":
          return num && b !== 0 ? a % b : null
      }
      return null
    }
    case "call": {
      const args = e.args.map((x) => evaluate(x, ctx))
      if (e.callee.k === "var") return globalFn(e.callee.name, args)
      if (e.callee.k !== "member") throw new BaseError("only functions and methods can be called")
      const self = evaluate(e.callee.obj, ctx)
      return method(e.callee.name, self, args, ctx)
    }
  }
}

function globalFn(name: string, args: Value[]): Value {
  const [a, b, c] = args
  switch (name) {
    case "if":
      return truthy(a) ? b : (c ?? null)
    case "now":
      return new Date()
    case "today": {
      const d = new Date()
      d.setHours(0, 0, 0, 0)
      return d
    }
    case "date":
      return Number.isNaN(Date.parse(str(a))) ? null : new Date(str(a))
    case "number": {
      const n = Number.parseFloat(str(a))
      return Number.isNaN(n) ? null : n
    }
    case "list":
      return Array.isArray(a) ? a : [a]
    case "min":
      return args.reduce<Value>((m, x) => (m == null || compare(x, m) < 0 ? x : m), null)
    case "max":
      return args.reduce<Value>((m, x) => (m == null || compare(x, m) > 0 ? x : m), null)
  }
  throw new BaseError(`unknown function ${name}()`)
}

const FILE_METHODS = new Set(["hasTag", "inFolder", "hasLink", "hasProperty"])

function method(name: string, self: Value, args: Value[], ctx: Ctx): Value {
  const [a] = args
  // A file method on nothing, as `this.file` where no note holds the base, matches nothing.
  if (self == null && FILE_METHODS.has(name)) return false
  const fileOf = (v: Value) => (v && typeof v === "object" && (v as Record<string, Value>).link ? (v as Record<string, Value>) : null)
  const file = fileOf(self)
  // The page a file method asks about: the row's, or another note's such as `this.file`.
  const key = file && (file.link as Link).key
  const page = key === ctx.page.key ? ctx.page : key ? ctx.engine.pages.find((p) => p.key === key) : undefined
  if (page) {
    switch (name) {
      case "hasTag":
        return args.some((t) => page.tags.some((tag) => tag === str(t).replace(/^#/, "") || tag.startsWith(str(t).replace(/^#/, "") + "/")))
      case "inFolder": {
        const f = str(a).replace(/^\/+|\/+$/g, "")
        return page.dir === f || page.dir.startsWith(f + "/")
      }
      case "hasLink": {
        const link = isLink(a) ? a : (fileOf(a)?.link as Link | undefined)
        const target = link ? link.key : ctx.engine.resolve(str(a))?.key
        return !!target && page.outlinks.includes(target)
      }
      case "hasProperty":
        return page.fields[str(a)] != null
    }
  }
  switch (name) {
    case "__index":
      return Array.isArray(self) && typeof a === "number" ? (self[a] ?? null) : null
    case "contains":
      return Array.isArray(self) ? self.some((x) => str(x) === str(a)) : str(self).includes(str(a))
    case "containsAny":
      return args.some((x) => (Array.isArray(self) ? self.some((y) => str(y) === str(x)) : str(self).includes(str(x))))
    case "containsAll":
      return args.every((x) => (Array.isArray(self) ? self.some((y) => str(y) === str(x)) : str(self).includes(str(x))))
    case "startsWith":
      return str(self).startsWith(str(a))
    case "endsWith":
      return str(self).endsWith(str(a))
    case "isEmpty":
      return !truthy(self)
    case "lower":
      return str(self).toLowerCase()
    case "upper":
      return str(self).toUpperCase()
    case "trim":
      return str(self).trim()
    case "toString":
      return str(self)
    case "join":
      return Array.isArray(self) ? self.map(str).join(a == null ? ", " : str(a)) : str(self)
    case "year":
      return self instanceof Date ? self.getFullYear() : null
    case "round":
      return typeof self === "number" ? Number(self.toFixed(typeof a === "number" ? a : 0)) : null
  }
  throw new BaseError(`unknown method .${name}()`)
}

function passes(filter: Filter | undefined, page: Page, engine: Engine, formulas: Record<string, string>): boolean {
  if (filter == null) return true
  if (typeof filter === "string") return truthy(evaluate(parseExpr(filter), { page, engine, formulas, depth: 0 }))
  if (filter.and) return filter.and.every((f) => passes(f, page, engine, formulas))
  if (filter.or) return filter.or.some((f) => passes(f, page, engine, formulas))
  if (filter.not) return !filter.not.some((f) => passes(f, page, engine, formulas))
  return true
}

export interface ViewResult {
  view: BaseView
  columns: { id: string; name: string }[]
  rows: { page: Page; cells: Value[]; image?: Value }[]
}

/** Default column names: the configured displayName, else the property without its namespace. */
export function columnName(id: string, base: BaseFile): string {
  if (base.displayNames[id]) return base.displayNames[id]
  if (id === "file.name") return "Name"
  return id.replace(/^(note|file|formula)\./, "")
}

export function runView(base: BaseFile, view: BaseView, engine: Engine): ViewResult {
  let pages = engine.pages.filter((p) => passes(base.filters, p, engine, base.formulas) && passes(view.filters, p, engine, base.formulas))
  if (view.sort.length) {
    const keyed = pages.map((p) => ({ p, keys: view.sort.map((s) => property(s.property, p, engine, base.formulas)) }))
    keyed.sort((x, y) => {
      for (let i = 0; i < view.sort.length; i++) {
        const d = compare(x.keys[i], y.keys[i])
        if (d) return view.sort[i].direction === "DESC" ? -d : d
      }
      return 0
    })
    pages = keyed.map((k) => k.p)
  }
  if (view.limit) pages = pages.slice(0, view.limit)
  return {
    view,
    columns: view.order.map((id) => ({ id, name: columnName(id, base) })),
    rows: pages.map((page) => ({
      page,
      cells: view.order.map((id) =>
        id === "file.name" ? ({ kind: "link", key: page.key, title: page.title, url: page.url } as Link) : property(id, page, engine, base.formulas),
      ),
      image: view.image ? property(view.image, page, engine, base.formulas) : undefined,
    })),
  }
}
