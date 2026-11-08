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
  /** Whether related.semantic is on, so the pipeline installs transformers.js next to datme. */
  semantic?: boolean
  /** Whether every merge or pull request is also built as a preview, with its drafts and out of search engines. */
  previews?: boolean
}

/** Shell-safe argument, quoted only when needed. */
const arg = (s: string) => (/^[\w./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`)

/**
 * Bun for pipelines that install it themselves. Pipelines pin it and datme's own version, so a
 * build runs what `deploy` was run with, not whatever was published since; bump both to upgrade.
 */
export const BUN_VERSION = "1.4.2"

/** transformers.js for related.semantic, pinned like datme: the version the search page loads too. */
export const TRANSFORMERS_VERSION = "4.3.1"

/**
 * The build command, with the cache kept where CI can save it between runs; `bun` is the path of
 * Bun where it is not on the PATH. With related.semantic, datme and transformers.js go in one global
 * install: bunx would put each package in a directory of its own, where datme cannot find the other.
 */
const build = (o: DeployOpts, out: string, bun = "") =>
  o.semantic
    ? `${bun}bun add --global @dynamotn/datme@${version} @huggingface/transformers@${TRANSFORMERS_VERSION} && "$(${bun}bun pm bin -g)/datme" build ${arg(o.vault)} --out ${out}`
    : `${bun}bunx @dynamotn/datme@${version} build ${arg(o.vault)} --out ${out}`

/** The build of a preview at `site`: drafts included, every page out of search engines. */
const previewBuild = (o: DeployOpts, out: string, site: string, bun = "") => `${build(o, out, bun)} --drafts --noindex --site ${site}`

const githubCache = (o: DeployOpts) =>
  o.tts
    ? `      # Rendered notes, social cards and the TTS downloads from the previous run make the build incremental.
      # Saved in a separate step that always runs, so a first run that fails or times out keeps its progress.
      - uses: actions/cache/restore@v4
        with:
          path: ${CACHE_PATHS}
          key: ${CACHE_KEY}
          restore-keys: datme-`
    : `      # Rendered notes and social cards from the previous run make the build incremental.
      - uses: actions/cache@v4
        with:
          path: .datme-cache
          key: datme-\${{ github.sha }}
          restore-keys: datme-`

/** Saves the cache after the build even when it failed or was cancelled; only with TTS, whose first run is long. */
const githubCacheSave = (o: DeployOpts) =>
  o.tts
    ? `      - uses: actions/cache/save@v4
        if: always()
        with:
          path: ${CACHE_PATHS}
          key: ${CACHE_KEY}
`
    : ""

/** uv for the TTS toolchain, pinned like Bun so a build does not change with a new release. */
export const UV_VERSION = "0.10.6"
const UV_INSTALL = `curl -LsSf https://astral.sh/uv/${UV_VERSION}/install.sh | sh`

/**
 * uv and the model downloads, cached by CI between runs. Not in .datme-cache: a cache hit
 * leaves their files untouched, so the build's pruning would delete them.
 */
const TTS_DIR = ".datme-tts"
const CACHE_PATHS = `|\n            .datme-cache\n            ${TTS_DIR}`
// biome-ignore lint/suspicious/noTemplateCurlyInString: a GitHub Actions expression, written as it is
const CACHE_KEY = "datme-${{ github.sha }}-${{ github.run_id }}-${{ github.run_attempt }}"
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
  # Daily, so notes with a publish_date appear on their day and appearance.schedule switches styles.
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
${githubCacheSave(o)}      - uses: actions/upload-pages-artifact@v3
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
const SECURE_FILES_LIST = '"$CI_API_V4_URL/projects/$CI_PROJECT_ID/secure_files?per_page=100"'
const VOICE = '"$VOICE_DIR/$DATME_TTS_VOICE_FILE"'
const PICK_VOICE = String.raw`bun -e 'const n = process.env.DATME_TTS_VOICE_FILE; const f = (await Bun.stdin.json()).find((x) => x.name === n); if (!f) { console.error("Secure File \"" + n + "\" not found"); process.exit(1) } console.log(f.id)'`
/** Downloads the voice clip from the project's Secure Files (first 100) to a fresh temporary directory outside the workspace and the published site. Block scalars, because the header holds a colon and a space. */
const gitlabVoice = [
  `VOICE_DIR=$(mktemp -d) && chmod 700 "$VOICE_DIR"`,
  `VOICE_LIST=$(curl -sSf --header "JOB-TOKEN: $CI_JOB_TOKEN" ${SECURE_FILES_LIST}) || { echo "Could not list Secure Files (check that Secure Files are enabled and the job token can read them)" >&2; exit 1; }`,
  `VOICE_ID=$(printf '%s' "$VOICE_LIST" | ${PICK_VOICE})`,
  `curl -sSf --header "JOB-TOKEN: $CI_JOB_TOKEN" -o ${VOICE} "${SECURE_FILES.slice(1, -1)}/$VOICE_ID/download" || { echo "Could not download Secure File \\"$DATME_TTS_VOICE_FILE\\"" >&2; exit 1; }`,
  `test -s ${VOICE} || { echo "Secure File $DATME_TTS_VOICE_FILE is empty" >&2; exit 1; }`,
  `chmod 600 ${VOICE}`,
  `export DATME_TTS_VOICE=${VOICE}`,
]
  .map((l) => `    - |\n        ${l}\n`)
  .join("")

/**
 * Comments the preview's address on the merge request once, with a token from the masked CI/CD variable
 * DATME_PREVIEW_TOKEN, as the job token cannot write notes. A failed comment only warns: the preview still deploys.
 */
const GITLAB_COMMENT = `bun -e 'const api = process.env.CI_API_V4_URL + "/projects/" + process.env.CI_PROJECT_ID + "/merge_requests/" + process.env.CI_MERGE_REQUEST_IID + "/notes"; const headers = { "PRIVATE-TOKEN": process.env.DATME_PREVIEW_TOKEN, "Content-Type": "application/json" }; const body = "Preview at " + process.env.CI_PAGES_URL; const notes = await fetch(api + "?per_page=100", { headers }).then((r) => (r.ok ? r.json() : [])); if (!notes.some((n) => n.body === body)) { const r = await fetch(api, { method: "POST", headers, body: JSON.stringify({ body }) }); if (!r.ok) console.error("Could not comment the preview: HTTP " + r.status) }'`

/** A Pages parallel deployment of every merge request, removed by GitLab when the merge request closes. */
const gitlabPreview = (o: DeployOpts) => `
# Builds every merge request at its own address, with drafts and out of search engines. Needs Pages parallel
# deployments (GitLab Premium or Ultimate). With a project access token (Reporter, api scope) in the masked
# CI/CD variable DATME_PREVIEW_TOKEN, it also comments the address on the merge request.
pages-preview:
  image: oven/bun:${BUN_VERSION}
  variables:
    ASTRO_TELEMETRY_DISABLED: "1"
    GIT_DEPTH: 0
    DATME_CACHE: .datme-cache
${o.tts ? '    DATME_TTS: "off" # previews are published without audio\n' : ""}  cache:
    key: datme
    policy: pull # previews read the published site's cache, and never write it
    paths:
      - .datme-cache
  pages:
    path_prefix: mr-$CI_MERGE_REQUEST_IID
    expire_in: 1 week # without a push for a week; closing the merge request removes it at once
  environment:
    name: preview/mr-$CI_MERGE_REQUEST_IID
    url: $CI_PAGES_URL
  script:
    - ${previewBuild(o, "public", '"$CI_PAGES_URL"')}
    - |
        if [ -n "$DATME_PREVIEW_TOKEN" ]; then ${GITLAB_COMMENT}; fi
  artifacts:
    paths:
      - public
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
`

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
${o.tts ? "    when: always # keep the progress of a first run that fails or times out\n" : ""}    paths:
      - .datme-cache
${o.tts ? `      - ${TTS_DIR}\n${gitlabTts}` : ""}  script:
${o.tts ? gitlabVoice : ""}    - ${build(o, "public")}
  artifacts:
    paths:
      - public
  rules:
    - if: $CI_COMMIT_BRANCH == "${o.branch}"
    # Add a daily pipeline schedule (Build → Pipeline schedules) so notes with a publish_date appear on their day
    # and appearance.schedule switches styles.
    - if: $CI_PIPELINE_SOURCE == "schedule"
${o.previews ? gitlabPreview(o) : ""}`,
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
${o.tts ? '  DATME_TTS = "off" # Netlify builds publish without audio\n' : ""}
[build]
  # Netlify's image has no Bun, so the build installs it first.
  command = "curl -fsSL https://bun.sh/install | bash -s bun-v${BUN_VERSION} && ${build(o, "dist", "~/.bun/bin/").replace(/"/g, '\\"')}"
  publish = "dist"
${
  o.previews
    ? `
# Deploy previews of pull requests show drafts and stay out of search engines; Netlify comments their address itself.
[context.deploy-preview]
  command = "curl -fsSL https://bun.sh/install | bash -s bun-v${BUN_VERSION} && ${previewBuild(o, "dist", '"$DEPLOY_PRIME_URL"', "~/.bun/bin/").replace(/"/g, '\\"')}"
`
    : ""
}`,
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
  # Daily, so notes with a publish_date appear on their day and appearance.schedule switches styles.
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
${githubCacheSave(o)}      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: \${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: \${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: pages deploy dist --project-name=${o.project} --branch=${o.branch}
`,
    },
  ]
}

/** A Cloudflare Pages preview of every pull request, at the alias of a branch named after it. */
const cloudflarePreview = (o: DeployOpts): DeployFile => ({
  path: ".github/workflows/datme-preview.yml",
  content: `# Builds every pull request as a Cloudflare Pages preview, with drafts and out of search engines, and comments
# its address on the pull request. Uses the secrets of datme-cloudflare.yml, which pull requests from forks do
# not get, so those have no preview. The address assumes the project's subdomain is ${o.project}.pages.dev.
name: datme-preview

on:
  pull_request:

permissions:
  contents: read
  deployments: write
  pull-requests: write

concurrency:
  group: preview-\${{ github.event.number }}
  cancel-in-progress: true

jobs:
  preview:
    if: github.event.pull_request.head.repo.full_name == github.repository
    runs-on: ubuntu-latest
    env:
      ASTRO_TELEMETRY_DISABLED: "1"
      DATME_CACHE: .datme-cache
${o.tts ? '      DATME_TTS: "off" # previews are published without audio\n' : ""}      PREVIEW_URL: https://pr-\${{ github.event.number }}.${o.project}.pages.dev
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: ${BUN_VERSION}
      - uses: actions/cache/restore@v4
        with:
          path: .datme-cache
          key: datme-\${{ github.sha }}
          restore-keys: datme-
      - run: ${previewBuild(o, "dist", '"$PREVIEW_URL"')}
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: \${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: \${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: pages deploy dist --project-name=${o.project} --branch=pr-\${{ github.event.number }}
      - run: gh pr comment "$PR" --body "Preview at $PREVIEW_URL" --edit-last --create-if-none
        env:
          GH_TOKEN: \${{ github.token }}
          GH_REPO: \${{ github.repository }}
          PR: \${{ github.event.number }}
`,
})

export function deployFiles(target: Target, opts: DeployOpts): DeployFile[] {
  const files = { github, gitlab, netlify, cloudflare }[target](opts)
  return opts.previews && target === "cloudflare" ? [...files, cloudflarePreview(opts)] : files
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
