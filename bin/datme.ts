#!/usr/bin/env bun
import { parseArgs, run } from "../src/cli"

try {
  await run(parseArgs(process.argv.slice(2)))
} catch (e) {
  // Matched by name: config errors may come from the copy of the module Astro loads.
  const name = (e as Error)?.name
  if (name === "CliError" || name === "ConfigError") {
    console.error(`datme: ${(e as Error).message}`)
    process.exit(1)
  }
  throw e
}
