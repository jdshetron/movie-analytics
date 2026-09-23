# Movie Analytics

A data website exploring MovieLens user ratings joined with TMDB box-office
financials (budget, revenue, runtime, popularity) for ~9,800 movies. Built for
the Financial Data Analytics course data website project.

- **Report page:** `docs/index.html` — scrollable findings with headline
  numbers and a chart per finding.
- **Dashboard page:** `docs/dashboard.html` — interactive filters over the
  full movie/rating panel, with switchable measures and breakdowns.

## Data sources

- **MovieLens 32M** (GroupLens Research, University of Minnesota): 32,000,204
  ratings across 87,585 movies from 200,948 users, collected March
  1996–October 2023 (released May 2024) — the most recent MovieLens release.
  https://grouplens.org/datasets/movielens/32m/
- **TMDB (The Movie Database)** API: budget, revenue, runtime, popularity,
  vote average/count, release date, per movie, fetched via each movie's
  `tmdbId` from MovieLens's `links.csv`. https://www.themoviedb.org/
  This product uses the TMDB API but is not endorsed or certified by TMDB.

The full 32M-rating release is too large to fetch TMDB financials for (87K
API calls) or load in a browser dashboard, so the site is built on a reduced,
reproducible subset — see `scripts/select_movies.py` and the report's "About
this data" section for the exact method (top 10,000 most-rated movies, then a
fixed-seed 400,000-row random sample of their ratings).

## Repository layout

- `data/raw/ml-32m/` — original MovieLens 32M CSVs, unzipped as downloaded,
  plus two files `scripts/select_movies.py` derives from them:
  - `links_top10k.csv` — movieId/tmdbId for the 10,000 most-rated movies
  - `ratings_sample.csv` — the fixed-seed 400,000-row rating sample
- `data/raw/tmdb_movies.csv` — TMDB financial/metadata fields, fetched by
  `scripts/fetch_tmdb.py`.
- `data/processed/panel.csv` — the full ratings-joined-with-movies panel
  (gitignored, regenerate locally with `scripts/process_data.py` — it's
  fully derived from the other raw files, so it isn't checked in).
- `scripts/select_movies.py` — reduces the full 32M-rating release to the
  browser/TMDB-fetch-friendly subset described above.
- `scripts/fetch_tmdb.py` — pulls budget/revenue/runtime/etc. from the TMDB
  API for every movie in `links_top10k.csv`; resumable, skips movies already
  fetched.
- `scripts/process_data.py` — joins the ratings sample + movies + TMDB data,
  derives genre/decade/year columns, and writes everything `docs/` serves.
- `docs/` — the published GitHub Pages site:
  - `index.html` / `dashboard.html` — the two pages
  - `css/style.css` — shared styles (nav, fonts, colors, both pages)
  - `js/report.js` — fetches `data/report_data.json` and renders the report's
    stat tiles and 8 charts
  - `js/dashboard.js` — loads `data/movies.json` + `data/ratings.csv` and
    does all filtering/aggregation/charting in the browser
  - `data/movies.json` — one row per movie: genre, decade, budget, revenue,
    profit, ROI, runtime, popularity, vote stats, language
  - `data/ratings.csv` — one row per rating event: userId, movieId, rating,
    rating_year
  - `data/report_data.json` — headline numbers and per-finding aggregates
    for the report page
- `pyproject.toml` / `uv.lock` — Python dependencies for the data pipeline
  (managed with `uv`).

## Reproducing the data

```
uv add pandas requests python-dotenv    # already set up
cp .env.example .env                    # then fill in TMDB_API_KEY
uv run python scripts/select_movies.py  # builds data/raw/ml-32m/{links_top10k,ratings_sample}.csv
uv run python scripts/fetch_tmdb.py     # resumable, ~10-15 minutes for 10,000 movies
uv run python scripts/process_data.py   # builds docs/data/* and data/processed/panel.csv
```

## Viewing the site locally

```
cd docs && uv run python -m http.server 8000
```

then open `http://localhost:8000/index.html`.

## Live site

https://jdshetron.github.io/movie-analytics/
