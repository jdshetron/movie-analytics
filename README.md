# Movie Analytics

A data website exploring MovieLens user ratings joined with TMDB box-office
financials (budget, revenue, runtime, popularity) for ~9,700 movies. Built for
the Financial Data Analytics course data website project.

- **Report page:** `docs/index.html` — scrollable findings with headline
  numbers and a chart per finding.
- **Dashboard page:** `docs/dashboard.html` — interactive filters over the
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
- `data/processed/panel.csv` — the full ratings-joined-with-movies panel
  (gitignored, regenerate locally with `scripts/process_data.py` — it's
  fully derived from the other raw files, so it isn't checked in).
- `scripts/fetch_tmdb.py` — pulls budget/revenue/runtime/etc. from the TMDB
  API for every movie; resumable, skips movies already fetched.
- `scripts/process_data.py` — joins ratings + movies + links + TMDB data,
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
uv add pandas requests python-dotenv   # already set up
cp .env.example .env                   # then fill in TMDB_API_KEY
uv run python scripts/fetch_tmdb.py    # resumable, several minutes
uv run python scripts/process_data.py  # builds docs/data/* and data/processed/panel.csv
```

## Viewing the site locally

```
cd docs && uv run python -m http.server 8000
```

then open `http://localhost:8000/index.html`.

## Live site

TODO: GitHub Pages URL once published.
