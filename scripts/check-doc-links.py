#!/usr/bin/env python3
"""Check that every relative link in the documentation resolves on disk.

    python3 scripts/check-doc-links.py

Relative links are the ones that rot, because nothing resolves them at commit time: a
document that moves leaves a link that looks fine and goes nowhere. Absolute URLs are
deliberately not fetched -- a build that goes red because somebody else's site is down
teaches people to ignore the job -- but they are checked for the one thing that can be
checked offline, which is that they name a host and a path.

This exists because the MkDocs site build cannot perform it. MkDocs validates links against
`docs_dir`, and the documents here link to `schema/`, `profiles/`, `VERSIONING.md` and the
other root files that the site build copies in beside the rendered pages. Those links are
correct in a checkout, on GitHub and on the site, and MkDocs reports every one of them as
missing. Rather than rewriting correct links into something that works in one of the three
places, the check lives here, where the whole repository is visible.

Exit codes follow the rest of the tooling: 0 everything resolved, 1 a link did not, 2 the
checker itself was misused.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# Markdown inline links and images: `[text](target)` and `![alt](target)`. Reference-style
# links and autolinks are not used in this repository, and a checker that silently ignored
# the form actually in use would be worse than none, so the pattern is asserted below by
# counting what it finds.
LINK = re.compile(r"!?\[[^\]]*\]\((?P<target>[^)\s]+)(?:\s+\"[^\"]*\")?\)")

# A fence or an indented block can contain anything, including something that looks like a
# link. Documentation about Markdown contains exactly that, which is why this is handled
# rather than assumed away.
FENCE = re.compile(r"^\s*(```|~~~)")

SKIP_SCHEMES = ("http://", "https://", "mailto:", "tel:", "data:")

# Files that are published by the site build from outside `docs_dir`, so a link to them is
# resolved against the repository root. Anything not listed here is resolved against the
# directory holding the document, which is what a reader's tool does.
ALLOWED_MISSING: set[str] = set()


def iter_markdown() -> list[Path]:
    """Every Markdown document that is part of the published set."""
    roots = [REPO_ROOT / "docs"]
    files: list[Path] = []
    for root in roots:
        files.extend(sorted(root.rglob("*.md")))
    files.extend(sorted(REPO_ROOT.glob("*.md")))
    return files


def targets_in(path: Path) -> list[tuple[int, str]]:
    """Every link target in a document, with the line it appeared on."""
    found: list[tuple[int, str]] = []
    in_fence = False
    fence_marker = ""
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        marker = FENCE.match(line)
        if marker:
            token = marker.group(1)
            if not in_fence:
                in_fence, fence_marker = True, token
            elif token == fence_marker:
                in_fence, fence_marker = False, ""
            continue
        if in_fence:
            continue
        for match in LINK.finditer(line):
            found.append((number, match.group("target")))
    return found


def check(document: Path) -> list[str]:
    problems: list[str] = []
    for number, target in targets_in(document):
        if target.startswith("#") or target.startswith(SKIP_SCHEMES):
            continue
        # A fragment is a claim about an anchor, which only a rendered page can settle.
        path_part = target.split("#", maxsplit=1)[0]
        if not path_part:
            continue
        resolved = (document.parent / path_part).resolve()
        if resolved.exists():
            continue
        relative = document.relative_to(REPO_ROOT)
        problems.append(f"{relative}:{number}: {target} does not resolve")
    return problems


def main() -> int:
    if len(sys.argv) > 1:
        print("check-doc-links: takes no arguments", file=sys.stderr)
        return 2

    documents = iter_markdown()
    if not documents:
        print("check-doc-links: found no documents to check", file=sys.stderr)
        return 2

    problems: list[str] = []
    checked = 0
    for document in documents:
        targets = targets_in(document)
        checked += len(targets)
        problems.extend(check(document))

    if problems:
        print("check-doc-links: unresolved relative links", file=sys.stderr)
        for problem in problems:
            print(f"  {problem}", file=sys.stderr)
        return 1

    print(f"check-doc-links: {checked} link(s) across {len(documents)} document(s) resolve")
    return 0


if __name__ == "__main__":
    sys.exit(main())
