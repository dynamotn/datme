#!/usr/bin/env bash
# @file release.sh
# @brief Cut a release of datme: check, stamp, commit, tag and push it
# @description
#   One command takes the repository from "the changelog has an `Unreleased`
#   section" to "a signed tag on every remote", in the order that keeps the
#   steps consistent:
#
#   1. Refuse to start on a dirty tree, a detached head, a branch other than the
#      default one (unless confirmed), or a tag that already exists.
#   2. Resolve the version: `--version` wins, then `--bump`, then the commits
#      since the last release tag through `dybatpho::release_next_version`,
#      raised to a major release when the changelog marks a BREAKING change.
#   3. Run the checks CI runs (`astro check`, the tests with their 100%
#      coverage threshold), so a tag never points at a failing tree.
#   4. Stamp `package.json` and promote `## [Unreleased]` in `CHANGELOG.md` to
#      the new version with today's date, leaving a fresh empty `Unreleased`.
#   5. Commit `chore: release v<version>` and tag it, annotated with the
#      changelog entry; Git signs the tag when `tag.gpgSign` is set.
#   6. Push the branch and the tag to every remote. The tag starts the release
#      jobs: GitLab makes its release, GitHub makes its release and publishes
#      the package to npm through trusted publishing (OIDC). A pre-release
#      (`3.0.0-rc.2`) goes to npm's `next` dist-tag.
#
#   Nothing is pushed before the local steps succeed. Run `--dry-run` first: it
#   performs every check and computation, prints the version, the notes and
#   each command it would run, and writes nothing.
#
# @example
#   scripts/release.sh --dry-run --version 3.0.0   # what would happen
#   scripts/release.sh --version 3.0.0             # release 3.0.0
#   scripts/release.sh --version 3.0.0-rc.2        # a pre-release, to npm's `next`
#   scripts/release.sh --bump patch --no-push      # tag locally, push by hand
#
# @env DRY_RUN string When true-like, report every step and change nothing
# @env DYBATPHO_FORCE string When true-like, answer every confirmation with yes
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# The machine's own checkout of dybatpho; DYBATPHO_DIR points elsewhere.
DYBATPHO_DIR="${DYBATPHO_DIR:-${HOME}/Working/personal/tools/dybatpho}"
if [[ ! -f "${DYBATPHO_DIR}/init.sh" ]]; then
  printf 'release.sh: dybatpho not found in %s;\n  clone %s there, or set DYBATPHO_DIR\n' \
    "${DYBATPHO_DIR}" "https://github.com/dynamotn/dybatpho" >&2
  exit 1
fi
# A release is dated on the releaser's calendar, as the changelog always was,
# rather than in dybatpho's default UTC.
export DYBATPHO_DATE_TIMEZONE="${DYBATPHO_DATE_TIMEZONE:-${TZ:-:/etc/localtime}}"
# shellcheck source=/dev/null # the library lives outside the repository
. "${DYBATPHO_DIR}/init.sh" --modules cli release semver safety date git

dybatpho::register_common_handlers

ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
CHANGELOG_FILE="${ROOT_DIR}/CHANGELOG.md"
PACKAGE_FILE="${ROOT_DIR}/package.json"
# Only release tags count when finding the previous release and the next version.
export DYBATPHO_RELEASE_TAG_PATTERN="v[0-9]*"

#######################################
# @description Validator for `--version`, so a typo is rejected before anything
#   in the tree has been touched.
# @arg $1 string Value to check
# @exitcode 0 The value is a valid SemVer version
# @exitcode 1 Otherwise
#######################################
function _is_version {
  local value
  dybatpho::expect_args value -- "$@"
  dybatpho::semver_valid "${value#v}"
}

#######################################
# @description Print the version stamped in `package.json`.
# @noargs
# @stdout The stamped version, without a leading `v`
#######################################
function _current_version {
  bun --print "require(process.argv[1]).version" "${PACKAGE_FILE}"
}

#######################################
# @description Report whether the `Unreleased` section declares a breaking
#   change: a commit written without a `!` still describes a break once its
#   changelog entry says **BREAKING**, and releasing the smaller of the two
#   answers is the one mistake a release cannot take back.
# @noargs
# @exitcode 0 The section marks a breaking change
# @exitcode 1 Otherwise
#######################################
function _changelog_breaking {
  awk '
    /^## \[Unreleased\]/ { capturing = 1; next }
    capturing && /^## \[/ { exit }
    capturing && /BREAKING/ { breaking = 1; exit }
    END { exit breaking ? 0 : 1 }
  ' "${CHANGELOG_FILE}"
}

#######################################
# @description Resolve the version to release into a variable rather than
#   standard output, so a refusal stops the script instead of a subshell.
# @arg $1 string Name of the variable receiving the version, without a leading `v`
# @arg $2 string Value of `--version`, empty when not given
# @arg $3 string Value of `--bump`, empty when not given
# @arg $4 string Currently stamped version
# @set The named variable
# @exitcode 1 Stop the script when no version can be resolved or it doesn't move forward
#######################################
function _resolve_version_into {
  local target requested bump current next
  dybatpho::expect_args target requested bump current -- "$@"
  local -n resolved="${target}"

  if [[ -n "${requested}" ]]; then
    next="${requested#v}"
  elif [[ -n "${bump}" ]]; then
    next="$(dybatpho::semver_bump "${current}" "${bump}")" \
      || dybatpho::die "Cannot bump ${current} by ${bump}"
  else
    next="$(dybatpho::release_next_version "${ROOT_DIR}")" \
      || dybatpho::die "No commit since the last tag calls for a release; pass --version to release anyway"
    # shellcheck disable=SC2310 # the changelog check answers yes or no
    if _changelog_breaking && [[ "${next%%.*}" == "${current%%.*}" ]]; then
      next="$(dybatpho::semver_bump "${current}" major)"
      dybatpho::warn "CHANGELOG.md marks a BREAKING change: releasing ${next} rather than what the commits asked for"
    fi
  fi

  local order
  order="$(dybatpho::semver_compare "${next}" "${current}")"
  [[ "${order}" == "1" ]] \
    || dybatpho::die "Version ${next} doesn't move forward from the stamped ${current}"
  # shellcheck disable=SC2034 # a nameref: the caller reads the variable it names
  resolved="${next}"
}

#######################################
# @description Refuse to release from a tree that would produce a release
#   nobody can reproduce: uncommitted work, the wrong branch, or a tag that
#   already exists here or on a remote.
# @arg $1 string Tag the release will carry
# @exitcode 1 Stop the script when the repository isn't in a releasable state
#######################################
function _preflight {
  local tag
  dybatpho::expect_args tag -- "$@"

  dybatpho::git_is_clean "${ROOT_DIR}" \
    || dybatpho::die "The worktree has uncommitted changes; commit them first"

  local branch default_branch
  branch="$(dybatpho::git_branch "${ROOT_DIR}")"
  default_branch="$(dybatpho::git_default_branch "${ROOT_DIR}")"
  [[ -n "${branch}" ]] || dybatpho::die "HEAD is detached; check out a branch first"
  if [[ "${branch}" != "${default_branch}" ]]; then
    dybatpho::confirm "Release from '${branch}' rather than '${default_branch}'?" \
      || dybatpho::die "Release cancelled"
  fi

  if git -C "${ROOT_DIR}" rev-parse -q --verify "refs/tags/${tag}" > /dev/null; then
    dybatpho::die "Tag ${tag} already exists"
  fi
  local remote
  for remote in "${REMOTES[@]}"; do
    if git -C "${ROOT_DIR}" ls-remote --exit-code --tags "${remote}" "refs/tags/${tag}" > /dev/null 2>&1; then
      dybatpho::die "Tag ${tag} already exists on ${remote}"
    fi
  done
  return 0
}

#######################################
# @description Promote `## [Unreleased]` to the release and extract its notes.
# @arg $1 string Version being released
# @arg $2 string Release date, `YYYY-MM-DD`
# @arg $3 path File the rewritten changelog is written to
# @arg $4 path File the release notes are written to
# @exitcode 1 Stop the script when the `Unreleased` section is missing or empty
#######################################
function _render_changelog {
  local version date changelog notes
  dybatpho::expect_args version date changelog notes -- "$@"

  local status=0
  awk -v version="${version}" -v date="${date}" -v notes="${notes}" '
    function flush(   i, start, stop) {
      # Trim the blank lines around the entry, so the notes hold the entry alone
      # and the rewritten file keeps one blank line either side.
      start = 1; stop = count
      while (start <= stop && body[start] ~ /^[[:space:]]*$/) start++
      while (stop >= start && body[stop] ~ /^[[:space:]]*$/) stop--
      if (stop < start) { empty = 1; return }
      print ""
      print "## [" version "] - " date
      print ""
      for (i = start; i <= stop; i++) {
        print body[i]
        print body[i] > notes
      }
      print ""
    }
    /^## \[Unreleased\]/ && !seen { seen = 1; capturing = 1; print; next }
    capturing && /^## \[/ { capturing = 0; flush() }
    capturing { body[++count] = $0; next }
    { print }
    END {
      if (capturing) flush()
      if (!seen) exit 3
      if (empty || !count) exit 4
    }
  ' "${CHANGELOG_FILE}" > "${changelog}" || status=$?
  ((status == 3)) && dybatpho::die "CHANGELOG.md has no '## [Unreleased]' section"
  ((status == 4)) && dybatpho::die "CHANGELOG.md has an empty '## [Unreleased]' section: nothing to release"
  ((status == 0)) || dybatpho::die "Cannot rewrite CHANGELOG.md"
}

#######################################
# @description Run the checks CI runs, from the repository root.
# @noargs
# @exitcode 1 Stop the script when a check fails
#######################################
function _checks {
  dybatpho::progress "Type-checking"
  (cd "${ROOT_DIR}" && bunx astro check) || dybatpho::die "astro check failed"
  dybatpho::progress "Running the tests, with the coverage threshold"
  (cd "${ROOT_DIR}" && bun run test) || dybatpho::die "The tests failed"
}

#######################################
# @description Cut the release.
# @noargs
# @exitcode 0 The release was cut, and pushed unless told not to
# @exitcode 1 A precondition, a check or a step failed
#######################################
function _main {
  # shellcheck disable=SC2154 # set by the option spec of this script
  if [[ -n "${RELEASE_VERSION}" && -n "${BUMP}" ]]; then
    dybatpho::die "--version and --bump both choose the version; pass only one of them"
  fi
  dybatpho::require "git"
  dybatpho::require "bun"
  dybatpho::require "npm"

  # shellcheck disable=SC2154 # set by the option spec of this script
  read -r -a REMOTES <<< "${REMOTE_LIST}"
  local remote
  for remote in "${REMOTES[@]}"; do
    git -C "${ROOT_DIR}" remote get-url "${remote}" > /dev/null 2>&1 \
      || dybatpho::die "No remote named ${remote}; pass --remotes with the ones to push to"
  done

  local current version tag
  current="$(_current_version)"
  _resolve_version_into version "${RELEASE_VERSION}" "${BUMP}" "${current}"
  tag="v${version}"
  _preflight "${tag}"

  local previous
  previous="$(dybatpho::git_latest_tag "${ROOT_DIR}" "${DYBATPHO_RELEASE_TAG_PATTERN}" || true)"
  dybatpho::header "Releasing ${tag}"
  dybatpho::info "Previous release: ${previous:-none}"
  dybatpho::info "Stamped version:  ${current}"
  [[ "${version}" == *-* ]] && dybatpho::info "A pre-release: npm publishes it under the 'next' dist-tag"

  local changelog notes message today
  dybatpho::create_temp changelog ".md" "release-changelog"
  dybatpho::create_temp notes ".md" "release-notes"
  today="$(dybatpho::date_today)"
  _render_changelog "${version}" "${today}" "${changelog}" "${notes}"
  dybatpho::print "$(< "${notes}")"
  dybatpho::confirm "Release ${tag} with the entry above?" "yes" \
    || dybatpho::die "Release cancelled"

  # shellcheck disable=SC2154 # set by the option spec of this script
  if dybatpho::is true "${CHECKS}"; then
    _checks
  else
    dybatpho::warn "Skipping the checks; CI still runs them before it publishes"
  fi

  dybatpho::progress "Stamping package.json and CHANGELOG.md"
  dybatpho::dry_run npm --prefix "${ROOT_DIR}" version "${version}" --no-git-tag-version --ignore-scripts
  # shellcheck disable=SC2154 # declared by `process.sh`, a core module, and set by --dry-run
  if dybatpho::is true "${DRY_RUN}"; then
    dybatpho::info "Would promote '## [Unreleased]' of CHANGELOG.md to '## [${version}] - ${today}'"
  else
    dybatpho::file_write_atomic "${CHANGELOG_FILE}" < "${changelog}"
  fi

  dybatpho::progress "Committing and tagging ${tag}"
  dybatpho::dry_run git -C "${ROOT_DIR}" add -- "${PACKAGE_FILE}" "${CHANGELOG_FILE}"
  dybatpho::dry_run git -C "${ROOT_DIR}" commit -m "chore: release ${tag}"
  # The tag message leads with the version, so `git tag -n1` names the release.
  dybatpho::create_temp message ".md" "release-tag"
  {
    printf '%s\n\n' "${tag}"
    cat "${notes}"
  } > "${message}"
  dybatpho::dry_run git -C "${ROOT_DIR}" tag -a "${tag}" -F "${message}"

  # shellcheck disable=SC2154 # set by the option spec of this script
  if dybatpho::is true "${PUSH}"; then
    for remote in "${REMOTES[@]}"; do
      dybatpho::progress "Pushing to ${remote}"
      dybatpho::dry_run git -C "${ROOT_DIR}" push "${remote}" HEAD
      dybatpho::dry_run git -C "${ROOT_DIR}" push "${remote}" "${tag}"
    done
    dybatpho::success "Released ${tag}: CI now makes the releases and publishes to npm"
  else
    dybatpho::success "Tagged ${tag} locally"
    dybatpho::info "Push it with: git push <remote> HEAD && git push <remote> ${tag}, for each of: ${REMOTE_LIST}"
  fi
}

#######################################
# @description CLI specification for this script.
# @noargs
#######################################
function _spec {
  dybatpho::opts::setup "Cut a release of datme: check, stamp, commit, tag and push it" RELEASE_ARGS \
    action:"_main"
  dybatpho::opts::param "Release this exact version instead of deriving one" RELEASE_VERSION --version \
    init:@empty validate:"_is_version \$OPTARG"
  dybatpho::opts::param "Move the stamped version by one level" BUMP --bump \
    init:@empty choices:"major,minor,patch"
  dybatpho::opts::param "Remotes to push the branch and the tag to, space-separated" REMOTE_LIST --remotes \
    init:="'origin gh'"
  # shellcheck disable=SC1083 # `--{no-}name` is dybatpho's toggle-switch syntax
  dybatpho::opts::flag "Run astro check and the tests before stamping" CHECKS --{no-}checks \
    on:true off:false init:="true"
  # shellcheck disable=SC1083
  dybatpho::opts::flag "Push the branch and the tag" PUSH --{no-}push \
    on:true off:false init:="true"
  dybatpho::opts::flag "Report every step and change nothing" DRY_RUN -n --dry-run \
    on:true off:false init:="${DRY_RUN:-false}" export:true
  dybatpho::opts::flag "Answer every confirmation with yes" DYBATPHO_FORCE -y --yes \
    on:true off:false init:="${DYBATPHO_FORCE:-false}" export:true
  dybatpho::opts::disp "Show help" --help -h action:"dybatpho::generate_help _spec"
}

# Run only when executed, so a test can source the script for its functions.
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  dybatpho::generate_from_spec _spec "$@"
fi
