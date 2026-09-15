#!/usr/bin/env bash
#
# Build the published documentation site.
#
#   ./scripts/build-docs-site.sh            # into ./site
#   ./scripts/build-docs-site.sh /tmp/out   # somewhere else
#
# MkDocs renders `docs/`. It cannot see anything outside that directory, so the two
# normative artefact trees are copied in beside the rendered pages afterwards. That copy is
# the point of this script rather than a detail of it: the canonical `$id` of every schema is
# a URL on the published site, and a site that rendered only the prose would leave every one
# of those URLs returning the hosting provider's 404 page.
#
# Because the copy happens after the build, a relative link such as `../schema/vector.schema.json`
# works in three places from one source: in a checkout, on GitHub, and on the site.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1

OUT="${1:-site}"

say() { printf '%s\n' "$*" >&2; }
die() { say "build-docs-site: $*"; exit 1; }

python3 -c "import mkdocs" 2>/dev/null \
    || die "mkdocs is not installed; run: pip install -r requirements-docs.txt"

# Before anything is rendered. MkDocs validates a relative link against `docs_dir` alone, so
# every correct link to a file at the repository root looks broken to it; that check lives in
# `check-doc-links.py`, which resolves each link against the file that contains it and can see
# the whole repository.
say "build-docs-site: checking the documentation links"
python3 scripts/check-doc-links.py \
    || die "a relative link does not resolve; the site was not built"

say "build-docs-site: rendering docs/ into $OUT"
# `--strict` is set in mkdocs.yml, so a broken internal link or a page missing from the nav
# fails the build rather than being published as a dead link.
mkdocs build --site-dir "$OUT"

# The normative trees. `profiles/` is included as well as `schema/` because a profile's
# documents are what a consumer reads to find out what a requirement says, and a reader who
# arrived at a schema from a link should be able to go and look at a profile that uses it.
for directory in schema profiles; do
    say "build-docs-site: publishing $directory/"
    rm -rf "${OUT:?}/$directory"
    cp -R "$directory" "$OUT/$directory"
done

# The documents that live at the repository root and are linked from `docs/` as `../NAME.md`.
# On GitHub those links resolve against the file's own location; on the site the page is at
# `/repo/page/`, so the same link resolves to `/repo/NAME.md` and the target has to exist
# there. They are served as Markdown rather than rendered, which is a deliberate trade: the
# rendered reading of the same material is the corresponding page under `docs/`, which the
# navigation links to, and a link that opens the exact file it names is better than a link
# that 404s.
for document in "$ROOT"/*.md; do
    name="$(basename "$document")"
    cp "$document" "$OUT/$name"
done
say "build-docs-site: published the repository-root documents beside the site"

# A version stamp, so that a page can be traced back to the revision it was built from when
# it is read from a browser rather than from a checkout. CI passes the commit it built.
if [ -n "${GITHUB_SHA:-}" ]; then
    printf '%s\n' "$GITHUB_SHA" > "$OUT/REVISION"
fi

pages="$(find "$OUT" -name '*.html' | wc -l | tr -d ' ')"
schemas="$(find "$OUT/schema" -name '*.json' | wc -l | tr -d ' ')"
profiles="$(find "$OUT/profiles" -name 'profile.yaml' | wc -l | tr -d ' ')"

# The last two are asserted, because the failure this script exists to prevent is a site that
# builds successfully with the prose present and the normative trees absent -- which would
# leave every canonical `$id` and every profile identity returning a 404.
[ "$pages" -gt 0 ] || die "no pages were rendered"
[ "$schemas" -eq 10 ] || die "expected 10 schemas in the site, found $schemas"
[ "$profiles" -gt 0 ] || die "no profile bundles in the site"

say "build-docs-site: $pages page(s), $schemas schema(s) and $profiles profile(s) in $OUT"
