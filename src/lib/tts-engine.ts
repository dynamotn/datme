/**
 * The VieNeu text-to-speech engine: a long-lived Python helper driven over
 * JSON lines (one request or reply per line, answered in order).
 */
import { spawn } from "node:child_process"
import { createInterface } from "node:readline"
import path from "node:path"
import { PACKAGE_ROOT } from "./package-root"

export const VIENEU_VERSION = "3.7.1"
const LAMEENC_VERSION = "1.8.4"

export class TtsUnavailable extends Error {
  constructor(reason: string) {
    super(
      `Text-to-speech engine unavailable: ${reason}. ` +
        "Install uv (https://docs.astral.sh/uv/) and set DATME_TTS_VOICE to your voice sample.",
    )
    this.name = "TtsUnavailable"
  }
}

export interface TtsEngine {
  synthesize(model: "vieneu", voice: string, chunks: string[]): Promise<Buffer>
  close(): Promise<void>
}

interface Pending {
  id: number
  resolve(mp3: Buffer): void
  reject(error: Error): void
}

export function defaultCommand(): string[] {
  const script = path.join(PACKAGE_ROOT, "src", "lib", "tts", "vieneu_helper.py")
  // --no-project: the vault or datme's own pyproject, if any, never joins the helper's environment.
  return ["uv", "run", "--quiet", "--no-project", "--with", `vieneu==${VIENEU_VERSION}`, "--with", `lameenc==${LAMEENC_VERSION}`, "python", script]
}

export function startEngine(): Promise<TtsEngine> {
  const override = process.env.DATME_TTS_CMD
  const [cmd, ...args] = override ? (JSON.parse(override) as string[]) : defaultCommand()
  const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "inherit"] })
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
      async close() {
        child.stdin.end()
        await exited
      },
    }

    createInterface({ input: child.stdout }).on("line", (line) => {
      let msg: { ready?: boolean; id?: number; mp3?: string; error?: string }
      try {
        msg = JSON.parse(line)
      } catch {
        return
      }
      if (msg.ready) {
        ready = true
        return resolve(engine)
      }
      // Answers come in order, so one for another request means audio could land on the wrong note.
      if (msg.id !== pending[0]?.id) {
        die(`protocol error: reply ${msg.id} does not answer request ${pending[0]?.id}`)
        child.kill()
        return
      }
      const p = pending.shift()!
      if (msg.error !== undefined) p.reject(new Error(msg.error))
      else if (!msg.mp3) p.reject(new Error("the helper returned no audio"))
      else p.resolve(Buffer.from(msg.mp3, "base64"))
    })
  })
}
