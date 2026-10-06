#!/usr/bin/env node

// src/cli.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs as parseNodeArgs } from "node:util";
import { execFileSync } from "node:child_process";

// src/lib/deploy.ts
var TARGETS = ["github", "gitlab", "netlify", "cloudflare"];
var arg = (s) => /^[\w./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`;
var build = (o, out) => `bunx datme build ${arg(o.vault)} --out ${out}`;
var githubCache = `      # Rendered notes and social cards from the previous run make the build incremental.
      - uses: actions/cache@v4
        with:
          path: .datme-cache
          key: datme-\${{ github.sha }}
          restore-keys: datme-`;
function github(o) {
  return [
    {
      path: ".github/workflows/datme.yml",
      content: `# Publishes the vault with datme to GitHub Pages on every push to ${o.branch}.
# Turn it on once: Settings → Pages → Build and deployment → Source: GitHub Actions.
name: datme

on:
  push:
    branches: [${o.branch}]
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
`
    }
  ];
}
function gitlab(o) {
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
`
    }
  ];
}
function netlify(o) {
  return [
    {
      path: "netlify.toml",
      content: `# Netlify builds the vault with datme on every push; set the production branch to ${o.branch}.
[build.environment]
  ASTRO_TELEMETRY_DISABLED = "1"

[build]
  # Netlify's image has no Bun, so the build installs it first.
  command = "curl -fsSL https://bun.sh/install | bash && ~/.bun/bin/${build(o, "dist").replace(/"/g, "\\\"")}"
  publish = "dist"
`
    }
  ];
}
function cloudflare(o) {
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
`
    }
  ];
}
function deployFiles(target, opts) {
  return { github, gitlab, netlify, cloudflare }[target](opts);
}
function projectName(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 58) || "garden";
}
var NEXT_STEPS = {
  github: "Commit and push, then choose Settings → Pages → Source: GitHub Actions.",
  gitlab: "Commit and push; the site appears under Deploy → Pages.",
  netlify: "Commit and push, then import the repository in Netlify.",
  cloudflare: "Add the CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID secrets to the repository, then commit and push."
};

// src/cli.ts
var PACKAGE_ROOT = path.resolve(import.meta.dirname, "..");
var STAGING = path.join(PACKAGE_ROOT, ".datme", "dist");
var MARKER = ".datme-build";
var CACHE = path.join(PACKAGE_ROOT, ".datme", "cache");
var USAGE = `datme: publish an Obsidian vault as a digital garden

Usage:
  datme dev     [vault] [--port 4321] [--host]   live preview, reloads on note changes
  datme build   [vault] [--out ./dist] [--fresh] build the static site
  datme preview [vault] [--port 4321] [--host]   build, then serve the result
  datme check   [vault] [--verbose]              report broken links and other problems
  datme init    [vault]                          write a starter datme.yaml
  datme deploy  <host> [vault] [--branch main]   write a CI config publishing on every push
                                                 hosts: github, gitlab, netlify, cloudflare

The vault defaults to $DATME_VAULT, then the current directory.
Options:
  --out <dir>    output directory of build (default: ./dist)
  --site <url>   public URL of the site, overrides site.url in datme.yaml
  --port <n>     port of dev and preview
  --host         listen on every network interface
  --fresh        ignore the cache of rendered notes and social cards
  --strict       fail check and build on warnings too, not only on errors
  --verbose      also list links to unpublished notes
  --branch <b>   branch whose pushes publish the site (default: the current one)
  -h, --help     show this help
  -v, --version  show the version`;

class CliError extends Error {
  name = "CliError";
}
function parseArgs(argv) {
  let parsed;
  try {
    parsed = parseNodeArgs({
      args: argv,
      allowPositionals: true,
      options: {
        out: { type: "string", short: "o" },
        site: { type: "string" },
        port: { type: "string", short: "p" },
        host: { type: "boolean" },
        strict: { type: "boolean" },
        fresh: { type: "boolean" },
        branch: { type: "string", short: "b" },
        verbose: { type: "boolean" },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" }
      }
    });
  } catch (e) {
    throw new CliError(e.message);
  }
  const { values, positionals } = parsed;
  if (values.help)
    return { command: "help" };
  if (values.version)
    return { command: "version" };
  const [command = "help", ...operands] = positionals;
  if (!["dev", "build", "preview", "check", "init", "deploy", "help"].includes(command)) {
    throw new CliError(`Unknown command "${command}". Run "datme --help".`);
  }
  let target;
  if (command === "deploy") {
    const host = operands.shift();
    if (!TARGETS.includes(host)) {
      throw new CliError(`${host ? `Unknown host "${host}"` : "Missing host"}; choose one of ${TARGETS.join(", ")}.`);
    }
    target = host;
  }
  const [vault, ...rest] = operands;
  if (rest.length)
    throw new CliError(`Unexpected argument "${rest[0]}".`);
  const port = values.port === undefined ? undefined : Number(values.port);
  if (port !== undefined && !(Number.isInteger(port) && port > 0 && port < 65536)) {
    throw new CliError(`Invalid port "${values.port}".`);
  }
  return {
    command,
    vault,
    ...target ? { target, branch: values.branch } : {},
    out: values.out,
    site: values.site,
    port,
    host: values.host,
    strict: values.strict,
    verbose: values.verbose,
    fresh: values.fresh
  };
}
function expandHome(p) {
  return p === "~" || p.startsWith("~/") ? path.join(os.homedir(), p.slice(1)) : p;
}
function resolveVault(arg, env, cwd) {
  const vault = path.resolve(cwd, expandHome(arg || env.DATME_VAULT || env.VAULT_PATH || "."));
  if (!fs.existsSync(vault) || !fs.statSync(vault).isDirectory()) {
    throw new CliError(`Vault "${vault}" is not a directory.`);
  }
  return vault;
}
function publishOutput(staging, out, vault) {
  const resolved = path.resolve(out);
  const forbidden = [path.parse(resolved).root, os.homedir(), vault, PACKAGE_ROOT].map((p) => path.resolve(p));
  if (forbidden.includes(resolved))
    throw new CliError(`Refusing to write the site into "${resolved}".`);
  if (fs.existsSync(resolved)) {
    const entries = fs.readdirSync(resolved);
    if (entries.length && !entries.includes(MARKER)) {
      throw new CliError(`"${resolved}" is not empty and was not created by datme; choose another --out.`);
    }
    fs.rmSync(resolved, { recursive: true, force: true });
  }
  fs.cpSync(staging, resolved, { recursive: true });
  fs.writeFileSync(path.join(resolved, MARKER), "This directory is replaced on every `datme build`.\n");
}
function pruneCache(root, since) {
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(p);
        if (!fs.readdirSync(p).length)
          fs.rmdirSync(p);
      } else if (fs.statSync(p).mtimeMs < since)
        fs.rmSync(p);
    }
  };
  walk(root);
}
function git(cwd, ...args) {
  try {
    return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || undefined;
  } catch {
    return;
  }
}
function deploy(target, dir, branch) {
  const vault = fs.realpathSync(dir);
  const root = git(vault, "rev-parse", "--show-toplevel") ?? vault;
  if (root === vault && !git(vault, "rev-parse", "--git-dir")) {
    console.warn(`[datme] ${vault} is not a git repository yet; CI builds need one.`);
  }
  const files = deployFiles(target, {
    vault: path.relative(root, vault) || ".",
    branch: branch ?? git(vault, "symbolic-ref", "--short", "HEAD") ?? "main",
    project: projectName(path.basename(root))
  });
  for (const f of files) {
    const file = path.join(root, f.path);
    if (fs.existsSync(file))
      throw new CliError(`${file} already exists; remove it first to regenerate it.`);
  }
  for (const f of files) {
    const file = path.join(root, f.path);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, f.content);
    console.log(`Wrote ${file}`);
  }
  console.log(NEXT_STEPS[target]);
}
function starterConfig(vault) {
  const name = path.basename(vault);
  return `# datme settings: https://gitlab.com/dynamo-tools/datme
site:
  title: ${JSON.stringify(name)}
  tagline: ""
  # Public URL, needed for the sitemap, RSS and social previews.
  # url: https://notes.example.com
  # author: Your name

# The first language is served at /, the others under /<lang>/.
# Mark per-language parts of a note with <!--lang:en-US--> … <!--lang:*-->.
languages: [en-US]

# explicit: only notes with \`publish: true\`; all: every note except \`publish: false\`.
publish: explicit

# Note rendered as the home page.
home: index.md

# Folders never published, on top of .obsidian, .trash, templates and private.
ignore: []

# Top-level folders shown as the maturity stage of a note. Presets:
# fleeting, literature, atomic, permanent, structure, reference, project.
stages: {}
#  Inbox: fleeting
#  Notes: { icon: "\uD83C\uDF3F", label: Evergreen }

footer: {}
#  GitHub: https://github.com/you
`;
}
async function run(args, env = process.env, cwd = process.cwd()) {
  if (args.command === "help")
    return void console.log(USAGE);
  if (args.command === "version") {
    const pkg = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8"));
    return void console.log(pkg.version);
  }
  const vault = resolveVault(args.vault, env, cwd);
  if (args.command === "init") {
    const file = path.join(vault, "datme.yaml");
    if (fs.existsSync(file))
      throw new CliError(`${file} already exists.`);
    fs.writeFileSync(file, starterConfig(vault));
    return void console.log(`Wrote ${file}`);
  }
  if (args.command === "deploy")
    return deploy(args.target, vault, args.branch);
  env.DATME_VAULT = vault;
  if (args.site)
    env.DATME_SITE_URL = args.site;
  const out = path.resolve(cwd, args.out ?? "dist");
  const rel = path.relative(vault, out);
  if (!rel.startsWith("..") && !path.isAbsolute(rel))
    env.DATME_IGNORE = rel;
  if (args.command === "check" || args.command === "build") {
    const { checkVault, countProblems, formatReport, summarize } = await import("./check-qp5r3t4h.js");
    const problems = checkVault();
    const counts = countProblems(problems);
    const failed = counts.error > 0 || args.strict && counts.warning > 0;
    if (args.command === "check") {
      console.log(formatReport(problems, args.verbose));
      if (failed)
        throw new CliError(`check failed: ${summarize(counts)}.`);
      return;
    }
    if (args.strict && (counts.error || counts.warning)) {
      throw new CliError(`${formatReport(problems, args.verbose)}
Build stopped by --strict.`);
    }
    if (counts.error || counts.warning)
      console.warn(`[datme] ${summarize(counts)}; run "datme check" for details`);
  }
  const astro = await import("astro");
  const server = { port: args.port, host: args.host };
  if (args.command === "dev") {
    await astro.dev({ root: PACKAGE_ROOT, server });
    return;
  }
  const cacheDir = env.DATME_CACHE === undefined ? CACHE : env.DATME_CACHE && path.resolve(cwd, env.DATME_CACHE);
  if (cacheDir) {
    if (args.fresh)
      fs.rmSync(cacheDir, { recursive: true, force: true });
    env.DATME_CACHE = cacheDir;
    env.DATME_VERSION = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8")).version;
  }
  const started = Date.now() - 1000;
  await astro.build({ root: PACKAGE_ROOT, outDir: STAGING });
  if (cacheDir)
    pruneCache(cacheDir, started);
  if (args.command === "build") {
    publishOutput(STAGING, out, vault);
    console.log(`Site written to ${out}`);
    return;
  }
  await astro.preview({ root: PACKAGE_ROOT, outDir: STAGING, server });
}

// bin/datme.ts
try {
  await run(parseArgs(process.argv.slice(2)));
} catch (e) {
  const name = e?.name;
  if (name === "CliError" || name === "ConfigError") {
    console.error(`datme: ${e.message}`);
    process.exit(1);
  }
  throw e;
}
