/**
 * The VieNeu text-to-speech engine: a long-lived Python helper driven over
 * JSON lines (one request or reply per line, answered in order).
 */
import { spawn } from "node:child_process"
import crypto from "node:crypto"
import fs from "node:fs"
import { createInterface } from "node:readline"
import path from "node:path"
import { PACKAGE_ROOT } from "./package-root"

export const VIENEU_VERSION = "3.7.1"
const LAMEENC_VERSION = "1.8.4"
/** Python packages as they were on this day, so a new release upstream never changes the voice. */
const EXCLUDE_NEWER = "2026-10-18"
const HELPER = path.join(PACKAGE_ROOT, "src", "lib", "tts", "vieneu_helper.py")

export class TtsUnavailable extends Error {
  constructor(reason: string) {
    super(
      `Text-to-speech engine unavailable: ${reason}. ` +
        "Install uv (https://docs.astral.sh/uv/) and set DATME_TTS_VOICE to your voice sample, or set DATME_TTS=off to build without audio.",
    )
    this.name = "TtsUnavailable"
  }
}

export interface TtsEngine {
  synthesize(model: "vieneu", voice: string, chunks: string[]): Promise<Buffer>
  /** False once the helper has exited: every later call fails. */
  readonly alive: boolean
  close(): Promise<void>
}

interface Pending {
  id: number
  resolve(mp3: Buffer): void
  reject(error: Error): void
}

export function defaultCommand(): string[] {
  // --no-project: the vault or datme's own pyproject, if any, never joins the helper's environment.
  return [
    "uv", "run", "--quiet", "--no-project",
    "--with", `vieneu==${VIENEU_VERSION}`, "--with", `lameenc==${LAMEENC_VERSION}`,
    "--exclude-newer", EXCLUDE_NEWER, "python", HELPER,
  ]
}

/** The command to run: DATME_TTS_CMD as a JSON array of strings, else the helper through uv. */
function command(): string[] {
  const override = process.env.DATME_TTS_CMD
  if (!override) return defaultCommand()
  let cmd: unknown
  try {
    cmd = JSON.parse(override)
  } catch {
    // reported below
  }
  if (!Array.isArray(cmd) || !cmd.length || !cmd.every((a) => typeof a === "string")) {
    throw new TtsUnavailable("DATME_TTS_CMD is not a JSON array of strings")
  }
  return cmd
}

/**
 * What makes the audio, for the cache key: the helper's code and pinned packages,
 * or the DATME_TTS_CMD that replaces them, so audio of one never passes for the other's.
 */
export function engineId(): string {
  const h = crypto.createHash("sha256")
  const override = process.env.DATME_TTS_CMD
  if (override) h.update(`cmd:${override}`)
  else h.update(defaultCommand().join(" ")).update(fs.readFileSync(HELPER))
  return h.digest("hex")
}

/** Starts the helper, which enrols the voice before it is ready, so a sample it cannot use fails the start. */
export function startEngine(voice?: string): Promise<TtsEngine> {
  let argv: string[]
  try {
    argv = command()
  } catch (e) {
    return Promise.reject(e)
  }
  const [cmd, ...args] = argv
  const env = voice ? { ...process.env, DATME_TTS_VOICE: voice } : process.env
  const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "inherit"], env })
  const pending: Pending[] = []
  let ready = false
  let dead: string | undefined
  let nextId = 0
  let die: (reason: string) => void

  return new Promise<TtsEngine>((resolve, reject) => {
    const exited = new Promise<void>((done) => {
      die = (reason: string) => {
        if (dead) return
        dead = reason
        if (!ready) reject(new TtsUnavailable(reason))
        for (const p of pending.splice(0)) p.reject(new Error(`TTS engine exited: ${reason}`))
        done()
      }
      const fail = (e: Error) => die(e.message)
      child.on("error", fail)
      child.stdin.on("error", fail)
      child.on("close", (code) => die(`exit code ${code}`))
    })

    const engine: TtsEngine = {
      synthesize(model, voice, chunks) {
        if (dead) return Promise.reject(new Error(`TTS engine exited: ${dead}`))
        return new Promise<Buffer>((res, rej) => {
          const id = ++nextId
          pending.push({ id, resolve: res, reject: rej })
          child.stdin.write(JSON.stringify({ id, model, voice, chunks }) + "\n")
        })
      },
      get alive() {
        return !dead
      },
      async close() {
        child.stdin.end()
        await exited
      },
    }

    createInterface({ input: child.stdout }).on("line", (line) => {
      let msg: unknown
      try {
        msg = JSON.parse(line)
      } catch {
        return
      }
      // Only objects are part of the protocol; any other line is noise, like a log line.
      if (typeof msg !== "object" || msg === null) return
      const { ready: isReady, id, mp3, error } = msg as { ready?: boolean; id?: number; mp3?: string; error?: string }
      if (isReady) {
        ready = true
        return resolve(engine)
      }
      // Answers come in order, so one for another request, or for none, means audio could land on the wrong note.
      const head = pending[0]
      if (!head || id !== head.id) {
        die(`protocol error: reply ${id} does not answer request ${head?.id}`)
        child.kill()
        return
      }
      pending.shift()
      if (error !== undefined) head.reject(new Error(error))
      else if (!mp3) head.reject(new Error("the helper returned no audio"))
      else head.resolve(Buffer.from(mp3, "base64"))
    })
  })
}
