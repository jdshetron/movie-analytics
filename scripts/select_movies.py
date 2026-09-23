"""Reduce the full MovieLens 32M dataset to a browser/TMDB-fetch-friendly subset.

ml-32m has 32,000,204 ratings across 87,585 movies — too large to fetch
financials for (87K TMDB calls) or ship raw to a browser dashboard. This
script keeps only the TOP_N_MOVIES most-rated movies (96.7% of all ratings
at N=10,000), then takes a fixed-seed random sample of SAMPLE_SIZE rows from
the ratings restricted to those movies. Both constants and the seed are
recorded here and in the report's methodology section for reproducibility.

Writes:
    data/raw/ml-32m/links_top10k.csv    movieId, tmdbId — input to fetch_tmdb.py
    data/raw/ml-32m/ratings_sample.csv  userId, movieId, rating, timestamp — input to process_data.py

Usage:
    uv run python scripts/select_movies.py
"""

from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "ml-32m"

TOP_N_MOVIES = 10_000
SAMPLE_SIZE = 400_000
SEED = 42


def main() -> None:
    ratings = pd.read_csv(
        RAW / "ratings.csv",
        dtype={"userId": "int32", "movieId": "int32", "rating": "float32", "timestamp": "int64"},
    )
    links = pd.read_csv(RAW / "links.csv", dtype={"tmdbId": "Int64"})

    counts = ratings["movieId"].value_counts()
    top_movie_ids = set(counts.head(TOP_N_MOVIES).index)
    coverage = counts.head(TOP_N_MOVIES).sum() / len(ratings)
    print(f"top {TOP_N_MOVIES:,} movies cover {coverage * 100:.1f}% of all {len(ratings):,} ratings")

    top_links = links[links["movieId"].isin(top_movie_ids)]
    top_links.to_csv(RAW / "links_top10k.csv", index=False)
    print(f"links_top10k.csv: {len(top_links):,} movies")

    filtered = ratings[ratings["movieId"].isin(top_movie_ids)]
    sample = filtered.sample(n=SAMPLE_SIZE, random_state=SEED)
    sample.to_csv(RAW / "ratings_sample.csv", index=False)
    print(f"ratings_sample.csv: {len(sample):,} rows (seed={SEED}) from {len(filtered):,} candidates")
    print(f"distinct movies in sample: {sample['movieId'].nunique():,}")
    print(f"distinct users in sample: {sample['userId'].nunique():,}")


if __name__ == "__main__":
    main()
