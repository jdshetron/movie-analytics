# Movie Analytics

A data website exploring MovieLens user ratings joined with TMDB box-office
financials (budget, revenue, runtime, popularity) for ~9,700 movies. Built for
the Financial Data Analytics course data website project.

- **Report page:** `site/index.html` — scrollable findings with headline
  numbers and a chart per finding.
- **Dashboard page:** `site/dashboard.html` — interactive filters over the
  full movie/rating panel, with switchable measures and breakdowns.

## Data sources

- **MovieLens `ml-latest-small`** (GroupLens Research, University of
  Minnesota): 100,836 ratings, 9,742 movies, 610 users, timestamped
  1996–2018. https://grouplens.org/datasets/movielens/latest/
- **TMDB (The Movie Database)** API: budget, revenue, runtime, popularity,
  vote average/count, release date, per movie, fetched via each movie's
  `tmdbId` from MovieLens's `links.csv`. https://www.themoviedb.org/
  This product uses the TMDB API but is not endorsed or certified by TMDB.

## Repository layout

- `data/raw/ml-latest-small/` — original MovieLens CSVs (ratings, movies,
  links, tags), unzipped as downloaded.
- `data/raw/tmdb_movies.csv` — TMDB financial/metadata fields, fetched by
  `scripts/fetch_tmdb.py`.
- `data/processed/` — cleaned, joined datasets built by
  `scripts/process_data.py`, consumed by the site.
- `scripts/fetch_tmdb.py` — pulls budget/revenue/runtime/etc. from the TMDB
  API for every movie, resumable.
- `scripts/process_data.py` — joins ratings + movies + links + TMDB data,
  derives genre/decade/year columns, and writes the datasets the site loads.
- `site/` — the published GitHub Pages site (`index.html`, `dashboard.html`,
  shared `css/` and `js/`).
- `pyproject.toml` / `uv.lock` — Python dependencies for the data pipeline
  (managed with `uv`).

## Reproducing the data

```
uv add pandas requests python-dotenv   # already set up
cp .env.example .env                   # then fill in TMDB_API_KEY
uv run python scripts/fetch_tmdb.py    # resumable, several minutes
uv run python scripts/process_data.py  # builds data/processed/*
```

## Live site

TODO: GitHub Pages URL once published.
