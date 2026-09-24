// Dashboard: loads ratings + movie data, then filters/aggregates entirely in the browser.
(function () {
  const style = getComputedStyle(document.documentElement);
  const cssVar = (name) => style.getPropertyValue(name).trim();
  const colors = {
    series1: cssVar('--series-1'),
    series2: cssVar('--series-2'),
    series3: cssVar('--series-3'),
    series4: cssVar('--series-4'),
    series5: cssVar('--series-5'),
    series6: cssVar('--series-6'),
    series7: cssVar('--series-7'),
    series8: cssVar('--series-8'),
    grid: cssVar('--grid'),
    axis: cssVar('--axis'),
    textSecondary: cssVar('--text-secondary'),
    textPrimary: cssVar('--text-primary'),
    surface: cssVar('--surface'),
  };
  const PALETTE = [colors.series1, colors.series2, colors.series3, colors.series4, colors.series5, colors.series6, colors.series7, colors.series8];

  Chart.defaults.font.family = "'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', sans-serif";
  Chart.defaults.color = colors.textSecondary;
  Chart.defaults.borderColor = colors.grid;

  const MEASURES = {
    count: { label: 'Number of ratings', kind: 'rating', format: compactNumber },
    avg_rating: { label: 'Average rating', kind: 'rating', format: (v) => v.toFixed(2) },
    total_revenue: { label: 'Total box-office revenue', kind: 'financial', field: 'revenue', agg: 'sum', requires: 'has_financials', format: compactCurrency },
    avg_budget: { label: 'Average budget', kind: 'financial', field: 'budget', agg: 'avg', requires: 'has_financials', format: compactCurrency },
    median_roi: { label: 'Median ROI', kind: 'financial', field: 'roi', agg: 'median', requires: 'roi', format: (v) => (v * 100).toFixed(0) + '%' },
  };
  const BREAKDOWNS = {
    primary_genre: 'Genre',
    decade: 'Release decade',
    original_language: 'Original language',
    rating_year: 'Rating year',
  };

  // Weighted ("Bayesian") rating, same idea as IMDb's Top 250: a movie's average
  // is pulled toward the view's overall average by WEIGHT_PRIOR phantom ratings,
  // so a film with three 5-star ratings can't outrank one with thousands.
  const WEIGHT_PRIOR = 25;
  const TMDB_MIN_VOTES = 500;
  let topRatedSource = 'movielens';

  function compactNumber(n) {
    return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  }
  function compactCurrency(n) {
    return '$' + compactNumber(n);
  }
  function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function bucketLabel(key, value) {
    if (key === 'decade') return value === null || value === undefined ? 'Unknown' : value + 's';
    if (value === null || value === undefined || value === '') return 'Unknown';
    return String(value);
  }

  let ratings = [];
  let movieMap = new Map();
  let charts = {};

  Promise.all([
    fetch('data/movies.json').then((r) => r.json()),
    fetch('data/ratings.csv').then((r) => r.text()),
  ])
    .then(([movies, ratingsText]) => {
      for (const m of movies) movieMap.set(m.movieId, m);
      ratings = parseRatingsCsv(ratingsText);
      init();
    })
    .catch((err) => {
      document.getElementById('loading-note').textContent = 'Could not load the dashboard data.';
      console.error(err);
    });

  function parseRatingsCsv(text) {
    const lines = text.split('\n');
    const out = new Array(lines.length - 1);
    let n = 0;
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const parts = line.split(',');
      out[n++] = {
        userId: +parts[0],
        movieId: +parts[1],
        rating: +parts[2],
        rating_year: +parts[3],
      };
    }
    out.length = n;
    return out;
  }

  function init() {
    document.getElementById('loading-note').style.display = 'none';
    document.getElementById('dash-stat-row').style.display = '';
    document.getElementById('chart-grid').style.display = '';
    document.getElementById('table-card').style.display = '';

    populateFilterOptions();
    bindControls();
    render();
  }

  function populateFilterOptions() {
    const years = [...new Set(ratings.map((r) => r.rating_year))].sort((a, b) => a - b);
    const yearSelect = document.getElementById('f-year');
    for (const y of years) yearSelect.appendChild(new Option(y, y));

    const genres = new Set();
    const decades = new Set();
    const languages = new Set();
    for (const m of movieMap.values()) {
      if (m.primary_genre) genres.add(m.primary_genre);
      if (m.decade !== null && m.decade !== undefined) decades.add(m.decade);
      if (m.original_language) languages.add(m.original_language);
    }
    const genreSelect = document.getElementById('f-genre');
    [...genres].sort().forEach((g) => genreSelect.appendChild(new Option(g, g)));
    const decadeSelect = document.getElementById('f-decade');
    [...decades].sort((a, b) => a - b).forEach((d) => decadeSelect.appendChild(new Option(d + 's', d)));
    const langSelect = document.getElementById('f-language');
    [...languages].sort().forEach((l) => langSelect.appendChild(new Option(l, l)));

    const movieOptions = document.getElementById('movie-options');
    const movieByLabel = new Map();
    for (const m of movieMap.values()) {
      const label = m.title + (m.release_year ? ` (${m.release_year})` : '');
      movieByLabel.set(label, m.movieId);
      movieOptions.appendChild(new Option(label));
    }
    document.getElementById('f-movie')._movieByLabel = movieByLabel;
  }

  function bindControls() {
    const ids = ['f-year', 'f-movie', 'f-genre', 'f-decade', 'f-language', 'measure-select', 'breakdown-select'];
    for (const id of ids) {
      document.getElementById(id).addEventListener('change', render);
    }
    document.getElementById('f-movie').addEventListener('input', debounce(render, 200));
    document.getElementById('reset-btn').addEventListener('click', () => {
      document.getElementById('f-year').value = '';
      document.getElementById('f-movie').value = '';
      document.getElementById('f-genre').value = '';
      document.getElementById('f-decade').value = '';
      document.getElementById('f-language').value = '';
      document.getElementById('measure-select').value = 'count';
      document.getElementById('breakdown-select').value = 'primary_genre';
      setTopRatedSource('movielens');
      render();
    });
    for (const btn of document.querySelectorAll('.seg-toggle button')) {
      btn.addEventListener('click', () => {
        setTopRatedSource(btn.dataset.source);
        render();
      });
    }
  }

  function setTopRatedSource(source) {
    topRatedSource = source;
    for (const btn of document.querySelectorAll('.seg-toggle button')) {
      const active = btn.dataset.source === source;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    }
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  function currentFilters() {
    const year = document.getElementById('f-year').value;
    const movieLabel = document.getElementById('f-movie').value;
    const movieByLabel = document.getElementById('f-movie')._movieByLabel;
    const movieId = movieByLabel && movieByLabel.has(movieLabel) ? movieByLabel.get(movieLabel) : null;
    const genre = document.getElementById('f-genre').value;
    const decade = document.getElementById('f-decade').value;
    const language = document.getElementById('f-language').value;
    return {
      year: year ? +year : null,
      movieId,
      genre: genre || null,
      decade: decade ? +decade : null,
      language: language || null,
    };
  }

  function filterRatings(filters) {
    const out = [];
    for (const r of ratings) {
      if (filters.year !== null && r.rating_year !== filters.year) continue;
      if (filters.movieId !== null && r.movieId !== filters.movieId) continue;
      const m = movieMap.get(r.movieId);
      if (!m) continue;
      if (filters.genre && m.primary_genre !== filters.genre) continue;
      if (filters.decade !== null && m.decade !== filters.decade) continue;
      if (filters.language && m.original_language !== filters.language) continue;
      out.push(r);
    }
    return out;
  }

  // Groups filtered rating rows into buckets by breakdownKey, then computes the
  // selected measure per bucket. Financial measures aggregate over the distinct
  // movies within each bucket (not over rating rows), since budget/revenue are
  // per-movie, not per-rating.
  function aggregateByBucket(filteredRatings, breakdownKey, measureKey) {
    const measure = MEASURES[measureKey];
    const buckets = new Map(); // bucketValue -> { ratingRows: [] }

    for (const r of filteredRatings) {
      let bucketValue;
      if (breakdownKey === 'rating_year') {
        bucketValue = r.rating_year;
      } else {
        const m = movieMap.get(r.movieId);
        bucketValue = m ? m[breakdownKey] : null;
      }
      // "Unknown" (no genre listed) isn't a real genre — leave it out of genre breakdowns.
      if (breakdownKey === 'primary_genre' && bucketValue === 'Unknown') continue;
      const key = bucketValue === null || bucketValue === undefined ? '__unknown__' : bucketValue;
      if (!buckets.has(key)) buckets.set(key, { value: bucketValue, ratingRows: [] });
      buckets.get(key).ratingRows.push(r);
    }

    const result = [];
    for (const [, bucket] of buckets) {
      if (measure.kind === 'rating') {
        const rows = bucket.ratingRows;
        const value = measureKey === 'count' ? rows.length : rows.reduce((s, r) => s + r.rating, 0) / rows.length;
        result.push({ bucket: bucket.value, value, ratingCount: rows.length, movieCount: new Set(rows.map((r) => r.movieId)).size });
      } else {
        const movieIds = new Set(bucket.ratingRows.map((r) => r.movieId));
        const movies = [...movieIds].map((id) => movieMap.get(id)).filter((m) => m && m[measure.requires]);
        if (!movies.length) continue;
        const values = movies.map((m) => m[measure.field]);
        const value =
          measure.agg === 'sum'
            ? values.reduce((a, b) => a + b, 0)
            : measure.agg === 'median'
            ? median(values)
            : values.reduce((a, b) => a + b, 0) / values.length;
        result.push({ bucket: bucket.value, value, ratingCount: bucket.ratingRows.length, movieCount: movies.length });
      }
    }
    return result;
  }

  function aggregateByYear(filteredRatings, measureKey) {
    return aggregateByBucket(filteredRatings, 'rating_year', measureKey).sort((a, b) => a.bucket - b.bucket);
  }

  function ratingsByMovie(filteredRatings) {
    const byMovie = new Map();
    let total = 0;
    for (const r of filteredRatings) {
      if (!byMovie.has(r.movieId)) byMovie.set(r.movieId, { count: 0, sum: 0 });
      const s = byMovie.get(r.movieId);
      s.count++;
      s.sum += r.rating;
      total += r.rating;
    }
    const overallAvg = filteredRatings.length ? total / filteredRatings.length : 0;
    for (const s of byMovie.values()) {
      s.avg = s.sum / s.count;
      s.weighted = (s.count * s.avg + WEIGHT_PRIOR * overallAvg) / (s.count + WEIGHT_PRIOR);
    }
    return { byMovie, overallAvg };
  }

  function perMovieStats(filteredRatings, measureKey) {
    const measure = MEASURES[measureKey];
    const { byMovie } = ratingsByMovie(filteredRatings);
    const out = [];
    for (const [movieId, s] of byMovie) {
      const m = movieMap.get(movieId);
      if (!m) continue;
      let value;
      let rank;
      if (measure.kind === 'rating') {
        value = measureKey === 'count' ? s.count : s.avg;
        // Rank averages by weighted score so one lone 5-star rating can't top the list.
        rank = measureKey === 'count' ? s.count : s.weighted;
      } else {
        if (!m[measure.requires]) continue;
        value = m[measure.field];
        rank = value;
      }
      out.push({ title: m.title, value, rank, ratingCount: s.count });
    }
    return out.sort((a, b) => b.rank - a.rank);
  }

  function topRatedMovies(filteredRatings, distinctMovies) {
    if (topRatedSource === 'tmdb') {
      const rows = [];
      for (const id of distinctMovies) {
        const m = movieMap.get(id);
        if (!m || !(m.vote_count >= TMDB_MIN_VOTES) || m.vote_average == null) continue;
        rows.push({ title: m.title, year: m.release_year, value: m.vote_average, detail: `${m.vote_count.toLocaleString()} TMDB votes` });
      }
      return { rows: rows.sort((a, b) => b.value - a.value).slice(0, 10) };
    }
    const { byMovie, overallAvg } = ratingsByMovie(filteredRatings);
    const rows = [];
    for (const [movieId, s] of byMovie) {
      const m = movieMap.get(movieId);
      if (!m) continue;
      rows.push({
        title: m.title,
        year: m.release_year,
        value: s.weighted,
        detail: `raw average ${s.avg.toFixed(2)} from ${s.count.toLocaleString()} rating${s.count === 1 ? '' : 's'}`,
      });
    }
    return { rows: rows.sort((a, b) => b.value - a.value).slice(0, 10), overallAvg };
  }

  function render() {
    const grid = document.getElementById('chart-grid');
    if (grid.style.display !== 'none') {
      grid.style.opacity = '0.55';
      requestAnimationFrame(() => requestAnimationFrame(() => { grid.style.opacity = '1'; }));
    }

    const filters = currentFilters();
    const measureKey = document.getElementById('measure-select').value;
    const breakdownKey = document.getElementById('breakdown-select').value;
    const measure = MEASURES[measureKey];
    const breakdownLabel = BREAKDOWNS[breakdownKey];

    const filtered = filterRatings(filters);
    const distinctMovies = new Set(filtered.map((r) => r.movieId));

    document.getElementById('result-count').textContent =
      `${compactNumber(filtered.length)} ratings across ${compactNumber(distinctMovies.size)} movies`;

    renderStatTiles(filtered, distinctMovies);

    let byBucket = aggregateByBucket(filtered, breakdownKey, measureKey).sort((a, b) => b.value - a.value);
    byBucket = byBucket.map((b) => ({ ...b, label: bucketLabel(breakdownKey, b.bucket) }));
    const top = byBucket.slice(0, 12);

    document.getElementById('title-bucket-bar').textContent = `${measure.label}, by ${breakdownLabel.toLowerCase()}`;
    renderBucketBar(top, measure);

    document.getElementById('title-trend').textContent = `${measure.label}, by rating year`;
    const yearSeries = aggregateByYear(filtered, measureKey);
    renderTrend(yearSeries, measure);

    document.getElementById('title-composition').textContent = `Share of ${measure.label.toLowerCase()}, by ${breakdownLabel.toLowerCase()}`;
    renderComposition(byBucket, measure);

    document.getElementById('title-top-movies').textContent = `Top 10 movies, by ${measure.label.toLowerCase()}`;
    const topMovies = perMovieStats(filtered, measureKey).slice(0, 10);
    renderTopMovies(topMovies, measure);

    renderTopRated(topRatedMovies(filtered, distinctMovies));

    document.getElementById('title-table').textContent = `${measure.label} by ${breakdownLabel.toLowerCase()} — numbers behind the current view`;
    renderTable(byBucket, measure, breakdownLabel);
  }

  function renderStatTiles(filtered, distinctMovies) {
    const avgRating = filtered.length ? filtered.reduce((s, r) => s + r.rating, 0) / filtered.length : 0;
    const financedMovies = [...distinctMovies].map((id) => movieMap.get(id)).filter((m) => m && m.has_financials);
    const totalRevenue = financedMovies.reduce((s, m) => s + m.revenue, 0);
    const roiMovies = [...distinctMovies].map((id) => movieMap.get(id)).filter((m) => m && m.roi !== null && m.roi !== undefined);
    const avgRoi = roiMovies.length ? roiMovies.reduce((s, m) => s + m.roi, 0) / roiMovies.length : null;

    const tiles = [
      { label: 'Ratings in view', target: filtered.length, format: compactNumber },
      { label: 'Movies in view', target: distinctMovies.size, format: compactNumber },
      { label: 'Average rating', target: avgRating, format: (v) => (filtered.length ? v.toFixed(2) + ' / 5' : '—') },
      {
        label: 'Box-office revenue in view',
        target: totalRevenue,
        format: (v) => (financedMovies.length ? compactCurrency(v) : '—'),
      },
    ];
    const row = document.getElementById('dash-stat-row');
    const isFirstRender = row.childElementCount === 0;
    row.textContent = '';
    for (const t of tiles) {
      const tile = document.createElement('div');
      tile.className = 'stat-tile';
      const label = document.createElement('div');
      label.className = 'label';
      label.textContent = t.label;
      const value = document.createElement('div');
      value.className = 'value';
      tile.append(label, value);
      animateCount(value, t.target, t.format, isFirstRender ? 1000 : 450);
      row.appendChild(tile);
    }
  }

  // Long movie titles would otherwise be clipped at the chart's left edge;
  // the tooltip title still shows the full label.
  function truncatingTick(maxChars) {
    return function (value) {
      const label = String(this.getLabelForValue(value));
      return label.length > maxChars ? label.slice(0, maxChars - 1) + '…' : label;
    };
  }
  const truncatedCategoryTick = truncatingTick(30);

  function baseBarOptions(measure, horizontal) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: horizontal ? 'y' : 'x',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: colors.surface,
          titleColor: colors.textPrimary,
          bodyColor: colors.textSecondary,
          borderColor: colors.grid,
          borderWidth: 1,
          padding: 10,
          displayColors: false,
          callbacks: { label: (ctx) => measure.format(horizontal ? ctx.parsed.x : ctx.parsed.y) },
        },
      },
      scales: {
        x: {
          grid: { color: horizontal ? colors.grid : 'transparent' },
          border: { color: colors.axis },
          ticks: horizontal ? { callback: (v, i, ticks) => measure.format(ticks[i].value) } : {},
        },
        y: {
          grid: { color: horizontal ? 'transparent' : colors.grid },
          border: { color: colors.axis },
          ticks: !horizontal ? { callback: (v, i, ticks) => measure.format(ticks[i].value) } : { callback: truncatedCategoryTick },
        },
      },
    };
  }

  function upsertChart(key, config) {
    if (charts[key]) {
      charts[key].data = config.data;
      charts[key].options = config.options;
      charts[key].config.type = config.type;
      charts[key].update();
    } else {
      charts[key] = new Chart(document.getElementById(config.canvasId), config);
    }
  }

  function renderBucketBar(top, measure) {
    upsertChart('bucketBar', {
      canvasId: 'chart-bucket-bar',
      type: 'bar',
      data: {
        labels: top.map((d) => d.label),
        datasets: [{ data: top.map((d) => d.value), backgroundColor: colors.series1, borderRadius: 4, barThickness: 16, maxBarThickness: 20 }],
      },
      options: baseBarOptions(measure, true),
    });
  }

  function renderTrend(series, measure) {
    upsertChart('trend', {
      canvasId: 'chart-trend',
      type: 'line',
      data: {
        labels: series.map((d) => d.bucket),
        datasets: [
          {
            data: series.map((d) => d.value),
            borderColor: colors.series2,
            backgroundColor: colors.series2 + '1a',
            borderWidth: 2,
            fill: true,
            tension: 0.25,
            pointRadius: 3,
            pointBackgroundColor: colors.series2,
            pointBorderColor: colors.surface,
            pointBorderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: colors.surface,
            titleColor: colors.textPrimary,
            bodyColor: colors.textSecondary,
            borderColor: colors.grid,
            borderWidth: 1,
            padding: 10,
            displayColors: false,
            callbacks: { label: (ctx) => measure.format(ctx.parsed.y) },
          },
        },
        scales: {
          x: { grid: { display: false }, border: { color: colors.axis } },
          y: { grid: { color: colors.grid }, border: { color: colors.axis }, ticks: { callback: (v, i, ticks) => measure.format(ticks[i].value) } },
        },
      },
    });
  }

  function renderComposition(byBucket, measure) {
    const top = byBucket.slice(0, 6);
    const otherValue = byBucket.slice(6).reduce((s, d) => s + d.value, 0);
    const labels = top.map((d) => d.label);
    const values = top.map((d) => d.value);
    if (otherValue > 0) {
      labels.push('Other');
      values.push(otherValue);
    }
    upsertChart('composition', {
      canvasId: 'chart-composition',
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data: values, backgroundColor: labels.map((_, i) => PALETTE[i % PALETTE.length]), borderColor: colors.surface, borderWidth: 2 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { color: colors.textSecondary, boxWidth: 12, padding: 12 } },
          tooltip: {
            backgroundColor: colors.surface,
            titleColor: colors.textPrimary,
            bodyColor: colors.textSecondary,
            borderColor: colors.grid,
            borderWidth: 1,
            padding: 10,
            callbacks: { label: (ctx) => ` ${ctx.label}: ${measure.format(ctx.parsed)}` },
          },
        },
      },
    });
  }

  function renderTopMovies(topMovies, measure) {
    const options = baseBarOptions(measure, true);
    options.plugins.tooltip.callbacks.afterLabel = (ctx) => {
      const n = topMovies[ctx.dataIndex].ratingCount;
      return `${n.toLocaleString()} rating${n === 1 ? '' : 's'} in view`;
    };
    upsertChart('topMovies', {
      canvasId: 'chart-top-movies',
      type: 'bar',
      data: {
        labels: topMovies.map((d) => d.title),
        datasets: [{ data: topMovies.map((d) => d.value), backgroundColor: colors.series6, borderRadius: 4, barThickness: 16, maxBarThickness: 20 }],
      },
      options,
    });
  }

  function renderTopRated({ rows, overallAvg }) {
    const isTmdb = topRatedSource === 'tmdb';
    const scale = isTmdb ? 10 : 5;
    const format = (v) => `${v.toFixed(2)} / ${scale}`;

    document.getElementById('title-top-rated').textContent = isTmdb
      ? 'Highest-rated movies, by TMDB voter score'
      : 'Highest-rated movies, by MovieLens users (weighted)';
    document.getElementById('note-top-rated').textContent = isTmdb
      ? `TMDB's 0–10 average from its own voters, limited to movies with at least ${TMDB_MIN_VOTES} TMDB votes. ` +
        'Like MovieLens, this is audience voting — neither dataset includes professional critic scores.'
      : `Each movie's average is blended with the average across this view (${overallAvg ? overallAvg.toFixed(2) : '—'}) ` +
        `as if it had ${WEIGHT_PRIOR} extra ratings at that average, so movies with only a handful of ratings ` +
        "can't outrank ones with thousands. Hover a bar for the raw average and rating count.";

    const empty = rows.length === 0;
    document.getElementById('empty-top-rated').hidden = !empty;
    document.getElementById('chart-top-rated').style.display = empty ? 'none' : '';

    const options = baseBarOptions({ format }, true);
    options.scales.x.min = 0;
    options.scales.x.max = scale;
    options.scales.x.ticks = { stepSize: isTmdb ? 2 : 1 };
    options.scales.y.ticks = { callback: truncatingTick(48) };
    options.plugins.tooltip.callbacks.afterLabel = (ctx) => rows[ctx.dataIndex].detail;

    upsertChart('topRated', {
      canvasId: 'chart-top-rated',
      type: 'bar',
      data: {
        labels: rows.map((d) => (d.year ? `${d.title} (${d.year})` : d.title)),
        datasets: [{ data: rows.map((d) => d.value), backgroundColor: colors.series8, borderRadius: 4, barThickness: 18, maxBarThickness: 22 }],
      },
      options,
    });
  }

  function renderTable(byBucket, measure, breakdownLabel) {
    const table = document.getElementById('data-table');
    const thead = table.querySelector('thead tr');
    const tbody = table.querySelector('tbody');
    thead.textContent = '';
    tbody.textContent = '';

    const headers = [breakdownLabel, measure.label, 'Ratings', 'Movies'];
    for (const h of headers) {
      const th = document.createElement('th');
      th.textContent = h;
      thead.appendChild(th);
    }

    let rows = byBucket.slice();
    let sortState = { col: 1, dir: -1 };
    function draw() {
      tbody.textContent = '';
      for (const row of rows) {
        const tr = document.createElement('tr');
        const cells = [row.label, measure.format(row.value), compactNumber(row.ratingCount), compactNumber(row.movieCount)];
        for (const c of cells) {
          const td = document.createElement('td');
          td.textContent = c;
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
    }
    const sortKeys = [(r) => r.label, (r) => r.value, (r) => r.ratingCount, (r) => r.movieCount];
    Array.from(thead.children).forEach((th, i) => {
      th.addEventListener('click', () => {
        sortState.dir = sortState.col === i ? -sortState.dir : -1;
        sortState.col = i;
        rows.sort((a, b) => {
          const av = sortKeys[i](a);
          const bv = sortKeys[i](b);
          if (typeof av === 'string') return sortState.dir * av.localeCompare(bv);
          return sortState.dir * (av - bv);
        });
        draw();
      });
    });
    draw();
  }
})();
