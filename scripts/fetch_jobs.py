#!/usr/bin/env python3
"""
Fetch open job postings from the JazzHR API and write them to
jobs.json for the static site to render.

Requires the JAZZHR_API_KEY environment variable (set as a GitHub
Actions secret so the key never appears in client-side code).
"""
import json
import os
import sys
import urllib.request
import urllib.error

API_KEY = os.environ.get("JAZZHR_API_KEY")
COMPANY_BOARD = "emergingtech"  # used to build public apply links
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "..", "jobs.json")


def fetch_jobs():
    if not API_KEY:
        print("ERROR: JAZZHR_API_KEY environment variable is not set.", file=sys.stderr)
        sys.exit(1)

    url = f"https://api.resumatorapi.com/v1/jobs?apikey={API_KEY}"
    req = urllib.request.Request(url, headers={
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; EmergingTechJobsSync/1.0; +https://github.com/wowneutral/emerging-tech-site)",
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        # Status only. The response body is deliberately NOT printed.
        #
        # JazzHR authenticates by query string -- the key is in the URL, which
        # is the vendor's design and not something we can change. That makes
        # any error output a leak risk: an API that echoes the request URL
        # back in its error body would put the key straight into this
        # workflow log, and on a public repository that log is world
        # readable. GitHub masks secrets it recognises, but its own docs are
        # explicit that redaction is best-effort and fails on encoded or
        # partial matches.
        #
        # The status code is enough to tell 401 (bad key) from 429
        # (throttled) from 500 (their end), which is all this needs to say.
        print(f"ERROR: JazzHR API returned HTTP {e.code}", file=sys.stderr)
        sys.exit(1)
    except urllib.error.URLError as e:
        print(f"ERROR: could not reach JazzHR API: {e.reason}", file=sys.stderr)
        sys.exit(1)

    if not isinstance(data, list):
        print(f"ERROR: unexpected response shape from JazzHR API: {data!r}", file=sys.stderr)
        sys.exit(1)

    return data


def clean(jobs):
    out = []
    for j in jobs:
        status = (j.get("status") or "").strip().lower()
        if status != "open":
            continue

        city = (j.get("city") or "").strip()
        state = (j.get("state") or "").strip()
        board_code = j.get("board_code") or j.get("id") or ""
        apply_url = f"https://{COMPANY_BOARD}.applytojob.com/apply/{board_code}" if board_code else None

        out.append({
            "id": j.get("id"),
            "title": (j.get("title") or "").strip(),
            "city": city,
            "state": state,
            "department": (j.get("department") or "").strip(),
            "employment_type": (j.get("employment_type") or "").strip(),
            "url": apply_url,
        })

    # Stable, readable ordering
    out.sort(key=lambda j: j["title"])
    return out


def main():
    jobs = clean(fetch_jobs())
    with open(OUTPUT_PATH, "w") as f:
        json.dump(jobs, f, indent=2)
        f.write("\n")
    print(f"Wrote {len(jobs)} open job(s) to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
