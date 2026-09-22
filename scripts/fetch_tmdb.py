"""Fetch financial/metadata fields from TMDB for every movie in the MovieLens links table.

Resumable: skips tmdbIds already present in the output CSV, so it is safe to
re-run after a rate-limit pause or interruption.

Usage:
    uv run python scripts/fetch_tmdb.py
"""

import csv
import os
import sys
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
LINKS_CSV = ROOT / "data" / "raw" / "ml-latest-small" / "links.csv"
OUT_CSV = ROOT / "data" / "raw" / "tmdb_movies.csv"

FIELDS = [
    "movieId",
    "tmdbId",
    "budget",
    "revenue",
    "runtime",
    "popularity",
    "vote_average",
    "vote_count",
    "release_date",
    "original_language",
    "status",
]

API_URL = "https://api.themoviedb.org/3/movie/{id}"
REQUEST_DELAY_SECONDS = 0.06  # ~16 req/s, well under TMDB's rate limit


def load_done_ids() -> set[str]:
    if not OUT_CSV.exists():
        return set()
    with OUT_CSV.open(newline="", encoding="utf-8") as f:
        return {row["movieId"] for row in csv.DictReader(f)}


def fetch_one(session: requests.Session, api_key: str, tmdb_id: str) -> dict | None:
    resp = session.get(
        API_URL.format(id=tmdb_id),
        params={"api_key": api_key},
        timeout=15,
    )
    if resp.status_code == 429:
        retry_after = int(resp.headers.get("Retry-After", "2"))
        print(f"  rate limited, sleeping {retry_after}s", file=sys.stderr)
        time.sleep(retry_after)
        return fetch_one(session, api_key, tmdb_id)
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    data = resp.json()
    return {
        "budget": data.get("budget"),
        "revenue": data.get("revenue"),
        "runtime": data.get("runtime"),
        "popularity": data.get("popularity"),
        "vote_average": data.get("vote_average"),
        "vote_count": data.get("vote_count"),
        "release_date": data.get("release_date"),
        "original_language": data.get("original_language"),
        "status": data.get("status"),
    }


def main() -> None:
    load_dotenv(ROOT / ".env")
    api_key = os.environ.get("TMDB_API_KEY")
    if not api_key:
        sys.exit("Set TMDB_API_KEY in .env (see .env.example)")

    with LINKS_CSV.open(newline="", encoding="utf-8") as f:
        links = list(csv.DictReader(f))

    done = load_done_ids()
    print(f"{len(done)} of {len(links)} movies already fetched")

    write_header = not OUT_CSV.exists()
    session = requests.Session()

    with OUT_CSV.open("a", newline="", encoding="utf-8") as out:
        writer = csv.DictWriter(out, fieldnames=FIELDS)
        if write_header:
            writer.writeheader()

        for i, row in enumerate(links, start=1):
            movie_id = row["movieId"]
            tmdb_id = row["tmdbId"].strip()
            if movie_id in done or not tmdb_id:
                continue

            try:
                fields = fetch_one(session, api_key, tmdb_id)
            except requests.RequestException as exc:
                print(f"  error on movieId={movie_id}: {exc}", file=sys.stderr)
                continue

            if fields is None:
                fields = {k: None for k in FIELDS if k not in ("movieId", "tmdbId")}

            writer.writerow({"movieId": movie_id, "tmdbId": tmdb_id, **fields})
            out.flush()

            if i % 500 == 0:
                print(f"  {i}/{len(links)}")

            time.sleep(REQUEST_DELAY_SECONDS)

    print("done")


if __name__ == "__main__":
    main()
