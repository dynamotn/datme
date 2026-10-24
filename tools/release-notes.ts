/**
 * Prints the release notes of a tag: its section of `CHANGELOG.md`, without
 * the heading, followed by where to get the package. Both pipelines describe
 * their release with it, so GitLab and GitHub say the same thing, and a tag
 * whose version has no section (or an empty one) fails the release instead
 * of going out without notes. Run with `bun tools/release-notes.ts v3.2.0`.
 */
import fs from "node:fs"
import path from "node:path"

/** The body of `## [version]` in a changelog, trimmed; throws when the version has none or it is empty. */
export function releaseNotes(changelog: string, version: string): string {
  const lines = changelog.split("\n")
  const start = lines.findIndex((line) => line.startsWith(`## [${version}]`))
  if (start < 0) throw new Error(`CHANGELOG.md has no section for ${version}`)
  const end = lines.findIndex((line, i) => i > start && line.startsWith("## ["))
  const body = lines
    .slice(start + 1, end < 0 ? undefined : end)
    .join("\n")
    .trim()
  if (!body) throw new Error(`the section of ${version} in CHANGELOG.md is empty`)
  return body
}

/** Notes for a tag such as `v3.2.0`, with the package's page on npm. */
export function notesForTag(changelog: string, tag: string): string {
  const version = tag.replace(/^v/, "")
  return `${releaseNotes(changelog, version)}\n\n---\n\nnpm: https://www.npmjs.com/package/@dynamotn/datme/v/${version}\n`
}

/** The command: the notes of the tag given, on stdout; an error and exit code 1 otherwise. */
export function cli(args: string[], root = path.resolve(import.meta.dir, "..")): number {
  const [tag] = args
  try {
    if (!tag) throw new Error("usage: bun tools/release-notes.ts <tag>")
    process.stdout.write(notesForTag(fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8"), tag))
    return 0
  } catch (error) {
    console.error((error as Error).message)
    return 1
  }
}

if (import.meta.main) process.exitCode = cli(process.argv.slice(2))
