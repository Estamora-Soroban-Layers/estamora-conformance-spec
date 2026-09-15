#!/usr/bin/env python3
"""Verify that every schema is served at the URL its `$id` claims.

    python3 scripts/verify-published-schemas.py
    python3 scripts/verify-published-schemas.py --base https://example.test/schema/

This is the one check in this repository that fetches something over the network, and the
reason is that it is the check whose absence allowed a defect to ship: all ten schemas once
declared `$id` values under a host with no DNS record, and every offline check in the
repository passed, because every offline check agreed with the same constant. A `$id` is a
claim about the outside world, so only the outside world can settle it.

The opposite convention applies elsewhere -- `check-doc-links.py` deliberately does not
fetch absolute URLs, because a build that fails on somebody else's outage teaches people to
ignore the job. The distinction is ownership: the URLs checked here are this project's own
published artefacts, so a failure is this project's failure and nobody else's.

Exit codes follow the rest of the tooling: 0 every schema is served where it claims, 1 a
schema was not, 2 the checker itself was misused or could not reach anything.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SCHEMA_DIR = REPO_ROOT / "schema"

# A deployment is served from a CDN, so a URL can 404 for a few seconds after the deploy step
# reports success. Failing on the first attempt would make this job flaky for a reason that
# has nothing to do with the schemas, so it retries; a schema that is still missing after
# these attempts is not a propagation delay.
ATTEMPTS = 10
DELAY_SECONDS = 6
TIMEOUT_SECONDS = 20

# The same text the schemas must declare. Kept here rather than imported from the project's
# TypeScript, because this script's whole purpose is to be an independent check of what the
# TypeScript asserts: an expectation read from the thing under test would agree with it by
# construction, which is exactly how the previous base went unnoticed.
EXPECTED_DIALECT = "https://json-schema.org/draft/2020-12/schema"
USER_AGENT = "estamora-spec-verifier (+https://github.com/Estamora-Soroban-Layers/estamora-conformance-spec)"


def canonical_base() -> str:
    """The base URL the repository declares, read from the schemas themselves."""
    names = sorted(SCHEMA_DIR.glob("*.json"))
    if not names:
        raise SystemExit("verify-published-schemas: no schemas found under schema/")
    first = json.loads(names[0].read_text(encoding="utf-8"))
    identifier = first.get("$id")
    if not isinstance(identifier, str):
        raise SystemExit("verify-published-schemas: a schema declares no $id")
    return identifier[: -len(names[0].name)]


def fetch(url: str) -> tuple[int, bytes]:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, b""
    except urllib.error.URLError as error:
        raise SystemExit(f"verify-published-schemas: {url} is unreachable: {error.reason}")


def check(base: str) -> list[str]:
    problems: list[str] = []
    names = sorted(path.name for path in SCHEMA_DIR.glob("*.json"))

    for name in names:
        url = f"{base}{name}"
        expected = f"{base}{name}"

        status, body = 0, b""
        for attempt in range(1, ATTEMPTS + 1):
            status, body = fetch(url)
            if status == 200:
                break
            if attempt < ATTEMPTS:
                time.sleep(DELAY_SECONDS)

        if status != 200:
            problems.append(f"{name}: HTTP {status} at {url} after {ATTEMPTS} attempts")
            continue

        try:
            served = json.loads(body)
        except json.JSONDecodeError as error:
            problems.append(f"{name}: the served document is not JSON ({error})")
            continue

        # The served document must be the one that claims the URL. A 200 is not enough:
        # a copy at a different revision would satisfy the status and still break every
        # consumer resolving a reference into it.
        if served.get("$id") != expected:
            problems.append(
                f"{name}: served at {url} but declares $id {served.get('$id')!r}"
            )
        if served.get("$schema") != EXPECTED_DIALECT:
            problems.append(
                f"{name}: declares $schema {served.get('$schema')!r}, expected {EXPECTED_DIALECT!r}"
            )
        if served.get("$defs") is None and served.get("type") is None:
            problems.append(f"{name}: the served document has neither $defs nor type")

        print(f"  ok   {name}")

    return problems


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--base",
        default=None,
        help="Base URL of the published schemas. Defaults to the base the schemas declare.",
    )
    arguments = parser.parse_args()

    base = arguments.base or canonical_base()
    if not base.endswith("/"):
        base = f"{base}/"

    print(f"verify-published-schemas: checking {base}")
    problems = check(base)

    if problems:
        print("verify-published-schemas: the published schemas do not match their $id", file=sys.stderr)
        for problem in problems:
            print(f"  {problem}", file=sys.stderr)
        return 1

    print(f"verify-published-schemas: every schema is served at the URL it claims")
    return 0


if __name__ == "__main__":
    sys.exit(main())
