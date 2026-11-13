// A card worker that answers every job with an error.
import { parentPort } from "node:worker_threads"

parentPort?.on("message", (job: { id: number }) => parentPort?.postMessage({ id: job.id, error: "refused" }))
