// The attribute lets Node load it too, as the CLI runs on both.
import pkg from "../../package.json" with { type: "json" }

const { version } = pkg

/** Hosts `datme deploy` writes a CI configuration for. */
export const TARGETS = ["github", "gitlab", "netlify", "cloudflare"] as const
export type Target = (typeof TARGETS)[number]

export interface DeployFile {
  /** Path relative to the root of the repository. */
  path: string
  content: string
}

export interface DeployOpts {
  /** The vault relative to the repository root, "." when it is the root. */
  vault: string
  /** Branch whose pushes publish the site. */
  branch: string
  /** Cloudflare Pages project name. */
  project: string
  /** Whether the site speaks notes aloud, so the pipeline needs the TTS toolchain. */
  tts?: boolean
}

/** Shell-safe argument, quoted only when needed. */
const arg = (s: string) => (/^[\w./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`)

/**
 * Bun for pipelines that install it themselves. Pipelines pin it and datme's own version, so a
 * build runs what `deploy` was run with, not whatever was published since; bump both to upgrade.
 */
export const BUN_VERSION = "1.4.2"

/** The build command, with the cache kept where CI can save it between runs. */
const build = (o: DeployOpts, out: string) => `bunx @dynamotn/datme@${version} build ${arg(o.vault)} --out ${out}`

const githubCache = (o: DeployOpts) => `      # Rendered notes and social cards from the previous run make the build incremental.
      - uses: actions/cache@v4
        with:
          path: ${o.tts ? `|\n            .datme-cache\n            ${TTS_DIR}` : ".datme-cache"}
          key: datme-\${{ github.sha }}
          restore-keys: datme-`

const UV_INSTALL = "curl -LsSf https://astral.sh/uv/install.sh | sh"

/**
 * uv and the model downloads, cached by CI between runs. Not in .datme-cache: a cache hit
 * leaves their files untouched, so the build's pruning would delete them.
 */
const TTS_DIR = ".datme-tts"
const ttsEnv = (o: DeployOpts, indent: string) => (o.tts ? `${indent}UV_CACHE_DIR: ${TTS_DIR}/uv\n${indent}HF_HOME: ${TTS_DIR}/hf\n` : "")

/** Decodes the voice clip to a file outside the workspace and the published site, refusing an empty secret. */
const decodeVoice = (file: string) => [
  `printf '%s' "$DATME_TTS_VOICE_B64" | base64 -d > ${file}`,
  `test -s ${file} || { echo "DATME_TTS_VOICE_B64 is empty or missing" >&2; exit 1; }`,
  `chmod 600 ${file}`,
]

/** The step that gives a GitHub runner uv and the voice clip, which the repository keeps base64-encoded in a secret. */
const githubTts = (o: DeployOpts) =>
  o.tts
    ? `      # Audio: DATME_TTS_VOICE_B64 is the voice clip, base64-encoded, in the repository secrets.
      - run: |
          ${UV_INSTALL}
          echo "$HOME/.local/bin" >> "$GITHUB_PATH"
${decodeVoice('"$RUNNER_TEMP/voice.ogg"')
  .map((l) => `          ${l}\n`)
  .join("")}          echo "DATME_TTS_VOICE=$RUNNER_TEMP/voice.ogg" >> "$GITHUB_ENV"
        env:
          DATME_TTS_VOICE_B64: \${{ secrets.DATME_TTS_VOICE_B64 }}
`
    : ""

function github(o: DeployOpts): DeployFile[] {
  return [
    {
      path: ".github/workflows/datme.yml",
      content: `# Publishes the vault with datme to GitHub Pages on every push to ${o.branch}.
# Turn it on once: Settings → Pages → Build and deployment → Source: GitHub Actions.
name: datme

on:
  push:
    branches: [${o.branch}]
  # Daily, so notes with a publish_date appear on their day.
  schedule:
    - cron: "17 5 * * *"
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    env:
      ASTRO_TELEMETRY_DISABLED: "1"
      DATME_CACHE: .datme-cache
${ttsEnv(o, "      ")}      # Group passwords (<!--lock:@friends-->) come from repository secrets:
      # DATME_LOCK_FRIENDS: \${{ secrets.DATME_LOCK_FRIENDS }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # the full history gives notes their created and updated dates
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: ${BUN_VERSION}
${githubCache(o)}
${githubTts(o)}      - run: ${build(o, "_site")}
      - uses: actions/upload-pages-artifact@v3
        with:
          path: _site

  deploy:
    needs: build
    runs-on: ubuntu-latest
    # Only the job that publishes may write to Pages.
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
`,
    },
  ]
}

const gitlabTts = `  # Audio: DATME_TTS_VOICE_FILE names the voice clip uploaded under Settings > CI/CD > Secure Files.
  before_script:
    - command -v curl >/dev/null || (apt-get update && apt-get install -y --no-install-recommends curl ca-certificates)
    - ${UV_INSTALL}
    - export PATH="$HOME/.local/bin:$PATH"
`
const SECURE_FILES = '"$CI_API_V4_URL/projects/$CI_PROJECT_ID/secure_files"'
const VOICE = '"/tmp/datme-voice/$DATME_TTS_VOICE_FILE"'
const PICK_VOICE = String.raw`bun -e 'const n = process.env.DATME_TTS_VOICE_FILE; const f = (await Bun.stdin.json()).find((x) => x.name === n); if (!f) { console.error("Secure File \"" + n + "\" not found"); process.exit(1) } console.log(f.id)'`
/** Downloads the voice clip from the project's Secure Files to a path outside the workspace and the published site. Block scalars, because the header holds a colon and a space. */
const gitlabVoice = [
  "mkdir -p -m 700 /tmp/datme-voice",
  `VOICE_LIST=$(curl -sSf --header "JOB-TOKEN: $CI_JOB_TOKEN" ${SECURE_FILES}) || { echo "Could not list Secure Files (check that Secure Files are enabled and the job token can read them)" >&2; exit 1; }`,
  `VOICE_ID=$(printf '%s' "$VOICE_LIST" | ${PICK_VOICE})`,
  `curl -sSf --header "JOB-TOKEN: $CI_JOB_TOKEN" -o ${VOICE} "${SECURE_FILES.slice(1, -1)}/$VOICE_ID/download" || { echo "Could not download Secure File \\"$DATME_TTS_VOICE_FILE\\"" >&2; exit 1; }`,
  `test -s ${VOICE} || { echo "Secure File $DATME_TTS_VOICE_FILE is empty" >&2; exit 1; }`,
  `chmod 600 ${VOICE}`,
  `export DATME_TTS_VOICE=${VOICE}`,
]
  .map((l) => `    - |\n        ${l}\n`)
  .join("")

function gitlab(o: DeployOpts): DeployFile[] {
  return [
    {
      path: ".gitlab-ci.yml",
      content: `# Publishes the vault with datme to GitLab Pages on every push to ${o.branch}.
pages:
  image: oven/bun:${BUN_VERSION}
  variables:
    ASTRO_TELEMETRY_DISABLED: "1"
    GIT_DEPTH: 0 # the full history gives notes their created and updated dates
    DATME_CACHE: .datme-cache
${o.tts ? "    DATME_TTS_VOICE_FILE: voice.wav\n" : ""}${ttsEnv(o, "    ")}  cache:
    key: datme
    paths:
      - .datme-cache
${o.tts ? `      - ${TTS_DIR}\n${gitlabTts}` : ""}  script:
${o.tts ? gitlabVoice : ""}    - ${build(o, "public")}
  artifacts:
    paths:
      - public
  rules:
    - if: $CI_COMMIT_BRANCH == "${o.branch}"
    # Add a daily pipeline schedule (Build → Pipeline schedules) so notes with a publish_date appear on their day.
    - if: $CI_PIPELINE_SOURCE == "schedule"
`,
    },
  ]
}

function netlify(o: DeployOpts): DeployFile[] {
  return [
    {
      path: "netlify.toml",
      content: `# Netlify builds the vault with datme on every push; set the production branch to ${o.branch}.
# For notes with a publish_date, call a build hook daily (Site configuration → Build hooks).
[build.environment]
  ASTRO_TELEMETRY_DISABLED = "1"

[build]
  # Netlify's image has no Bun, so the build installs it first.
  command = "curl -fsSL https://bun.sh/install | bash -s bun-v${BUN_VERSION} && ~/.bun/bin/${build(o, "dist").replace(/"/g, '\\"')}"
  publish = "dist"
`,
    },
  ]
}

function cloudflare(o: DeployOpts): DeployFile[] {
  return [
    {
      path: ".github/workflows/datme-cloudflare.yml",
      content: `# Publishes the vault with datme to Cloudflare Pages on every push to ${o.branch}.
# Needs two repository secrets: CLOUDFLARE_API_TOKEN (with the "Cloudflare Pages: Edit"
# permission) and CLOUDFLARE_ACCOUNT_ID. The Pages project "${o.project}" is created
# on the first deploy if it does not exist.
name: datme-cloudflare

on:
  push:
    branches: [${o.branch}]
  # Daily, so notes with a publish_date appear on their day.
  schedule:
    - cron: "17 5 * * *"
  workflow_dispatch:

permissions:
  contents: read
  deployments: write

jobs:
  deploy:
    runs-on: ubuntu-latest
    env:
      ASTRO_TELEMETRY_DISABLED: "1"
      DATME_CACHE: .datme-cache
${ttsEnv(o, "      ")}      # Group passwords (<!--lock:@friends-->) come from repository secrets:
      # DATME_LOCK_FRIENDS: \${{ secrets.DATME_LOCK_FRIENDS }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # the full history gives notes their created and updated dates
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: ${BUN_VERSION}
${githubCache(o)}
${githubTts(o)}      - run: ${build(o, "dist")}
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: \${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: \${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: pages deploy dist --project-name=${o.project} --branch=${o.branch}
`,
    },
  ]
}

export function deployFiles(target: Target, opts: DeployOpts): DeployFile[] {
  return { github, gitlab, netlify, cloudflare }[target](opts)
}

/** A Cloudflare Pages project name: lowercase letters, digits and dashes. */
export function projectName(s: string): string {
  return (
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 58) || "garden"
  )
}

/** What to do after the files are written. */
export const NEXT_STEPS: Record<Target, string> = {
  github: "Commit and push, then choose Settings → Pages → Source: GitHub Actions.",
  gitlab: "Commit and push; the site appears under Deploy → Pages.",
  netlify: "Commit and push, then import the repository in Netlify.",
  cloudflare: "Add the CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID secrets to the repository, then commit and push.",
}
