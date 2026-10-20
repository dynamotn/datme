---
title: "Deploying"
---
# Deploying

`datme build` writes a plain static site, so any static host can serve it.

## One command

```bash
bunx @dynamotn/datme deploy github ~/MyVault     # GitHub Pages
bunx @dynamotn/datme deploy gitlab ~/MyVault     # GitLab Pages
bunx @dynamotn/datme deploy netlify ~/MyVault    # Netlify
bunx @dynamotn/datme deploy cloudflare ~/MyVault # Cloudflare Pages, through GitHub Actions
```

`deploy` writes a pipeline at the root of the vault's git repository. The
pipeline runs the published package with `bunx @dynamotn/datme@<version>` on
every push, pinned to the version of datme that wrote it, and pins Bun too, so
a new release never changes your site unasked: bump both versions in the file
to upgrade. On GitHub, GitLab and Cloudflare it also keeps the build cache
between runs, and on GitHub only the deploy job may write to Pages.
When the vault turns on `related.semantic`, the pipeline installs datme and
transformers.js (pinned too) in one global `bun add` and runs that datme, since
`bunx` keeps each package apart.
`deploy` never overwrites a file, and
`--branch` picks the branch to publish from (by default, the current one).

Notes scheduled with `publish_date` need a build on their day to appear:

- **GitHub** and **Cloudflare**: the workflow also runs once a day.
- **GitLab**: the pipeline is ready for it; add a daily schedule under
  Build → Pipeline schedules.
- **Netlify**: builds run on push only. Add a scheduled build hook if you
  schedule notes.

## Audio in CI

When the vault configures `tts`, `deploy` adds the toolchain to the pipeline:
it installs [uv](https://docs.astral.sh/uv/), and keeps uv's downloads
(`UV_CACHE_DIR`) and the model files (`HF_HOME`) under `.datme-tts`, which the
CI cache saves next to `.datme-cache`. They stay out of `.datme-cache` because
each build deletes what it did not touch there, and a cache hit leaves these
files untouched. GitHub and Cloudflare get the same on their workflow. uv is
installed at a pinned version, like Bun, and the model files at pinned commits.

The cache is saved even when the build fails, is cancelled or times out (GitLab
`cache: when: always`; on GitHub and Cloudflare a separate save step that always
runs), so the next run continues where the last one stopped. A first run on a
big vault synthesises every note and can take long: raise the job timeout if it
hits the limit (GitLab: Settings → CI/CD → General pipelines → Timeout).

Netlify builds publish without audio: `deploy netlify` warns and sets
`DATME_TTS = "off"` in `netlify.toml`, so use GitLab or GitHub for audio. The
same variable builds any site without audio, for example locally without uv:
`DATME_TTS=off datme build`.

The build needs a 3-8 s clip of your voice in `DATME_TTS_VOICE`, and the clip
must never enter the repository or the site.

- **GitLab**: upload the clip (WAV is fine, up to 5 MB, 3-8 s) under
  Settings → CI/CD → Secure Files, named `voice.wav` or whatever the
  `DATME_TTS_VOICE_FILE` CI variable says. No base64 and no compression.
  The job finds the file through the Secure Files API with its job token and
  downloads it to a fresh temporary directory (`mktemp -d`, readable only by the
  build), outside the workspace and the published site. A missing or empty file stops the build.
- **GitHub** (and Cloudflare): CI keeps the clip as a secret, encoded in
  base64, named `DATME_TTS_VOICE_B64` (Settings → Secrets and variables →
  Actions → New repository secret). GitHub secrets hold at most 48 KB, so
  compress the clip to mono Ogg Opus at about 32 kbps, which keeps the base64
  well under that:

  ```bash
  ffmpeg -i clip.wav -ac 1 -c:a libopus -b:a 32k voice.ogg
  base64 < voice.ogg | tr -d '\n' > voice.ogg.b64   # paste this file's contents as the secret
  ```

  Check once on your own machine that a build with `DATME_TTS_VOICE=voice.ogg`
  gives good audio: this confirms that VieNeu accepts the Ogg clip. The
  workflow decodes the secret to `voice.ogg` in `$RUNNER_TEMP`, readable only
  by the build, and points `DATME_TTS_VOICE` at it. An empty or missing secret
  stops the build instead of publishing the site without audio.

`datme doctor` reports a missing `uv` or an unset `DATME_TTS_VOICE`, so run it
on the CI machine's environment before the first build.

## By hand

Hand-written equivalents live in [`examples/deploy/`](https://gitlab.com/dynamo-brain/datme/-/tree/main/examples/deploy):

- `gitlab-pages.yml`: copy it to `.gitlab-ci.yml` to publish on GitLab Pages.
- `github-pages.yml`: copy it to `.github/workflows/`, then choose "GitHub
  Actions" as the Pages source.

Both fetch the full git history, so notes without `created` or `updated` get
their real dates.

## Project sites under a path

GitHub and GitLab serve a project's site under its name, as
`https://me.github.io/garden/` or `https://me.gitlab.io/garden/`. Set that
whole address as `site.url`, path included, and datme builds the site for it:
links, assets, feeds, the sitemap, search and offline reading all stay under
`/garden/`. With a custom domain at the root, set `site.url` to the domain
instead.

## Custom domains and host files

- `cname: true` writes a `CNAME` file with the host of `site.url`.
- `redirects: true` (the default) writes `_redirects` for Netlify and
  Cloudflare, with 301s for aliases, permalinks and old URLs.
- `headers` writes `_headers` with safe defaults and caching. Add `csp: true`
  for a Content Security Policy derived from the features in use.

## Preview deploys

Build branches with `--drafts` to see drafts and scheduled notes, and
`--site <url>` (or `$DATME_SITE_URL`) for the preview's own address. Drafts are
marked as such and kept out of search engines.
