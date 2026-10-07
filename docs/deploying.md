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
pipeline runs the published package with `bunx @dynamotn/datme` on every push;
on GitHub, GitLab and Cloudflare it also keeps the build cache between runs.
`deploy` never overwrites a file, and
`--branch` picks the branch to publish from (by default, the current one).

Notes scheduled with `publish_date` need a build on their day to appear:

- **GitHub** and **Cloudflare**: the workflow also runs once a day.
- **GitLab**: the pipeline is ready for it; add a daily schedule under
  Build → Pipeline schedules.
- **Netlify**: builds run on push only. Add a scheduled build hook if you
  schedule notes.

## By hand

Hand-written equivalents live in [`examples/deploy/`](https://gitlab.com/dynamo-tools/datme/-/tree/main/examples/deploy):

- `gitlab-pages.yml`: copy it to `.gitlab-ci.yml` to publish on GitLab Pages.
- `github-pages.yml`: copy it to `.github/workflows/`, then choose "GitHub
  Actions" as the Pages source.

Both fetch the full git history, so notes without `created` or `updated` get
their real dates.

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
