"""Join MovieLens ratings/movies/links with TMDB financials into the site's data files.

Reads:
    data/raw/ml-latest-small/{ratings,movies,links}.csv
    data/raw/tmdb_movies.csv          (from scripts/fetch_tmdb.py)

Writes:
    docs/data/movies.json       one row per movie: attributes + financials
    docs/data/ratings.csv       one row per rating event: userId, movieId, rating, rating_year
    docs/data/report_data.json headline numbers + per-finding aggregates, used by docs/js/report.js
    data/processed/panel.csv   the full joined panel (ratings x movies), for reference/reproducibility
                                (gitignored - regenerate with this script; not published to the site)

Usage:
    uv run python scripts/process_data.py
"""

import json
import math
import re
from pathlib import Path

import pandas as pd


def clean_nans(obj):
    """Recursively replace float NaN with None so json.dump produces valid JSON."""
    if isinstance(obj, float) and math.isnan(obj):
        return None
    if isinstance(obj, dict):
        return {k: clean_nans(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [clean_nans(v) for v in obj]
    return obj

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"
DOCS_DATA = ROOT / "docs" / "data"

MIN_BUDGET_FOR_ROI = 10_000  # below this, budget is treated as "unknown", not "free"

YEAR_RE = re.compile(r"\((\d{4})\)\s*$")


def load_movies() -> pd.DataFrame:
    movies = pd.read_csv(RAW / "ml-latest-small" / "movies.csv")
    links = pd.read_csv(RAW / "ml-latest-small" / "links.csv", dtype={"tmdbId": "Int64"})
    tmdb = pd.read_csv(RAW / "tmdb_movies.csv")

    movies["release_year"] = movies["title"].str.extract(YEAR_RE).astype("Int64")
    movies["clean_title"] = movies["title"].str.replace(YEAR_RE, "", regex=True).str.strip()
    movies["genre_list"] = movies["genres"].apply(
        lambda g: [] if g == "(no genres listed)" else g.split("|")
    )
    movies["primary_genre"] = movies["genre_list"].apply(lambda g: g[0] if g else "Unknown")

    df = movies.merge(links[["movieId", "tmdbId"]], on="movieId", how="left")
    df = df.merge(tmdb.drop(columns=["tmdbId"]), on="movieId", how="left")

    df["budget"] = df["budget"].fillna(0)
    df["revenue"] = df["revenue"].fillna(0)
    df["has_financials"] = (df["budget"] > 0) & (df["revenue"] > 0)
    df["profit"] = df["revenue"] - df["budget"]
    df["roi"] = df.apply(
        lambda r: (r["revenue"] - r["budget"]) / r["budget"]
        if r["budget"] >= MIN_BUDGET_FOR_ROI
        else None,
        axis=1,
    )
    df["decade"] = (df["release_year"] // 10 * 10).astype("Int64")

    return df


def load_ratings() -> pd.DataFrame:
    ratings = pd.read_csv(RAW / "ml-latest-small" / "ratings.csv")
    ratings["rating_date"] = pd.to_datetime(ratings["timestamp"], unit="s")
    ratings["rating_year"] = ratings["rating_date"].dt.year
    return ratings


def main() -> None:
    PROCESSED.mkdir(parents=True, exist_ok=True)
    DOCS_DATA.mkdir(parents=True, exist_ok=True)

    movies = load_movies()
    ratings = load_ratings()

    panel = ratings.merge(movies, on="movieId", how="left")
    panel.to_csv(PROCESSED / "panel.csv", index=False)

    # --- docs/data/movies.json: one row per movie ---
    movie_cols = [
        "movieId",
        "clean_title",
        "genres",
        "primary_genre",
        "release_year",
        "decade",
        "budget",
        "revenue",
        "profit",
        "roi",
        "has_financials",
        "runtime",
        "popularity",
        "vote_average",
        "vote_count",
        "original_language",
    ]
    movies_out = movies[movie_cols].rename(columns={"clean_title": "title"})
    movies_out.to_json(DOCS_DATA / "movies.json", orient="records")

    # --- docs/data/ratings.csv: one row per rating event ---
    ratings_out = ratings[["userId", "movieId", "rating", "rating_year"]]
    ratings_out.to_csv(DOCS_DATA / "ratings.csv", index=False)

    # --- data/processed/summary.json: headline numbers for the report ---
    financial = movies[movies["has_financials"]]
    with_roi = movies[movies["roi"].notna()]

    # Grouped by each movie's single primary genre (first genre MovieLens lists),
    # so genre buckets are mutually exclusive and totals don't double-count
    # multi-genre movies. See docs/index.html closing section for this note.
    genre_counts = (
        panel.groupby("primary_genre")
        .agg(rating_count=("rating", "size"), avg_rating=("rating", "mean"))
        .sort_values("rating_count", ascending=False)
    )

    genre_financials = (
        movies.groupby("primary_genre")
        .agg(
            movie_count=("movieId", "size"),
            total_revenue=("revenue", "sum"),
            avg_budget=("budget", lambda s: s[s > 0].mean()),
            median_roi=("roi", "median"),
            roi_sample_size=("roi", "count"),
        )
        .sort_values("total_revenue", ascending=False)
    )

    ratings_by_year = panel.groupby("rating_year").agg(
        rating_count=("rating", "size"), avg_rating=("rating", "mean")
    )

    revenue_by_decade = (
        movies[movies["has_financials"]]
        .groupby("decade")
        .agg(total_revenue=("revenue", "sum"), avg_budget=("budget", "mean"), movie_count=("movieId", "size"))
    )

    top_roi = with_roi.sort_values("roi", ascending=False).head(10)[
        ["title", "release_year", "primary_genre", "budget", "revenue", "roi"]
    ]
    top_revenue = financial.sort_values("revenue", ascending=False).head(10)[
        ["title", "release_year", "primary_genre", "budget", "revenue", "profit"]
    ]

    summary = {
        "headline": {
            "total_ratings": int(len(ratings)),
            "total_movies": int(movies["movieId"].nunique()),
            "total_users": int(ratings["userId"].nunique()),
            "movies_with_financials": int(movies["has_financials"].sum()),
            "avg_rating_overall": round(float(ratings["rating"].mean()), 3),
            "total_revenue_tracked": int(financial["revenue"].sum()),
            "total_budget_tracked": int(financial["budget"].sum()),
            "median_roi": round(float(with_roi["roi"].median()), 3),
            "year_range": [int(ratings["rating_year"].min()), int(ratings["rating_year"].max())],
            "release_year_range": [
                int(movies["release_year"].min()),
                int(movies["release_year"].max()),
            ],
        },
        "genre_rating_counts": genre_counts.reset_index().to_dict(orient="records"),
        "genre_financials": genre_financials.reset_index().to_dict(orient="records"),
        "ratings_by_year": ratings_by_year.reset_index().to_dict(orient="records"),
        "revenue_by_decade": revenue_by_decade.reset_index().to_dict(orient="records"),
        "top_roi_movies": top_roi.to_dict(orient="records"),
        "top_revenue_movies": top_revenue.to_dict(orient="records"),
    }

    with (DOCS_DATA / "report_data.json").open("w", encoding="utf-8") as f:
        json.dump(clean_nans(summary), f, indent=2, default=str)

    print(f"panel.csv: {len(panel):,} rows")
    print(f"movies.json: {len(movies_out):,} movies")
    print(f"ratings.csv: {len(ratings_out):,} ratings")
    print(f"movies with financials: {int(movies['has_financials'].sum()):,} / {len(movies):,}")


if __name__ == "__main__":
    main()
