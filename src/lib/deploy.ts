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
}

/** Shell-safe argument, quoted only when needed. */
const arg = (s: string) => (/^[\w./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`)

/** The build command, with the cache kept where CI can save it between runs. */
const build = (o: DeployOpts, out: string) => `bunx @dynamotn/datme build ${arg(o.vault)} --out ${out}`

const githubCache = `      # Rendered notes and social cards from the previous run make the build incremental.
      - uses: actions/cache@v4
        with:
          path: .datme-cache
          key: datme-\${{ github.sha }}
          restore-keys: datme-`

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
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    env:
      ASTRO_TELEMETRY_DISABLED: "1"
      DATME_CACHE: .datme-cache
      # Group passwords (<!--lock:@friends-->) come from repository secrets:
      # DATME_LOCK_FRIENDS: \${{ secrets.DATME_LOCK_FRIENDS }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # the full history gives notes their created and updated dates
      - uses: oven-sh/setup-bun@v2
${githubCache}
      - run: ${build(o, "_site")}
      - uses: actions/upload-pages-artifact@v3
        with:
          path: _site

  deploy:
    needs: build
    runs-on: ubuntu-latest
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

function gitlab(o: DeployOpts): DeployFile[] {
  return [
    {
      path: ".gitlab-ci.yml",
      content: `# Publishes the vault with datme to GitLab Pages on every push to ${o.branch}.
pages:
  image: oven/bun:1
  variables:
    ASTRO_TELEMETRY_DISABLED: "1"
    GIT_DEPTH: 0 # the full history gives notes their created and updated dates
    DATME_CACHE: .datme-cache
  cache:
    key: datme
    paths:
      - .datme-cache
  script:
    - ${build(o, "public")}
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
  command = "curl -fsSL https://bun.sh/install | bash && ~/.bun/bin/${build(o, "dist").replace(/"/g, '\\"')}"
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
      # Group passwords (<!--lock:@friends-->) come from repository secrets:
      # DATME_LOCK_FRIENDS: \${{ secrets.DATME_LOCK_FRIENDS }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # the full history gives notes their created and updated dates
      - uses: oven-sh/setup-bun@v2
${githubCache}
      - run: ${build(o, "dist")}
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
