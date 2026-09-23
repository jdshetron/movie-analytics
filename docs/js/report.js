// Report page: loads the precomputed aggregates and renders stat tiles + 8 charts.
(async function () {
  const style = getComputedStyle(document.documentElement);
  const cssVar = (name) => style.getPropertyValue(name).trim();

  const colors = {
    series1: cssVar('--series-1'),
    series2: cssVar('--series-2'),
    series3: cssVar('--series-3'),
    series4: cssVar('--series-4'),
    series5: cssVar('--series-5'),
    series6: cssVar('--series-6'),
    grid: cssVar('--grid'),
    axis: cssVar('--axis'),
    textSecondary: cssVar('--text-secondary'),
    textMuted: cssVar('--text-muted'),
    surface: cssVar('--surface'),
  };

  Chart.defaults.font.family = "'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', sans-serif";
  Chart.defaults.color = colors.textSecondary;
  Chart.defaults.borderColor = colors.grid;

  function compactNumber(n) {
    return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  }
  function compactCurrency(n) {
    return '$' + compactNumber(n);
  }
  function pct(n) {
    return (n * 100).toFixed(0) + '%';
  }

  let data;
  try {
    const res = await fetch('data/report_data.json');
    data = await res.json();
  } catch (err) {
    document.getElementById('stat-row').textContent = 'Could not load report data.';
    console.error(err);
    return;
  }

  const h = data.headline;

  // ---- Stat tiles (animated count-up) ----
  const stats = [
    { label: 'Ratings analyzed', target: h.total_ratings, format: compactNumber },
    { label: 'Movies covered', target: h.total_movies, format: compactNumber },
    { label: 'Average rating', target: h.avg_rating_overall, format: (v) => v.toFixed(2) + ' / 5' },
    { label: 'Box office revenue tracked', target: h.total_revenue_tracked, format: compactCurrency },
    { label: 'Median ROI (financed titles)', target: h.median_roi, format: pct },
  ];
  const statRow = document.getElementById('stat-row');
  stats.forEach((s, i) => {
    const tile = document.createElement('div');
    tile.className = 'stat-tile';
    tile.style.animationDelay = `${i * 70}ms`;
    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = s.label;
    const value = document.createElement('div');
    value.className = 'value';
    tile.append(label, value);
    statRow.appendChild(tile);
    animateCount(value, s.target, s.format, 1100);
  });

  // ---- In-prose numbers ----
  const genreByVolume = [...data.genre_rating_counts].sort((a, b) => b.rating_count - a.rating_count);
  const genreByRevenue = [...data.genre_financials].sort((a, b) => b.total_revenue - a.total_revenue);
  document.getElementById('stat-top-genre').textContent = genreByVolume[0].primary_genre;
  document.getElementById('stat-fin-count').textContent = compactNumber(h.movies_with_financials);
  document.getElementById('stat-top-revenue-genre').textContent = genreByRevenue[0].primary_genre;
  document.getElementById('stat-no-financials').textContent = compactNumber(h.total_movies - h.movies_with_financials);

  // ---- Shared chart option helpers ----
  function baseOptions(overrides) {
    return Object.assign(
      {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: colors.surface,
            titleColor: cssVar('--text-primary'),
            bodyColor: colors.textSecondary,
            borderColor: colors.grid,
            borderWidth: 1,
            padding: 10,
            displayColors: false,
          },
        },
      },
      overrides
    );
  }

  function barChart(id, labels, values, color, opts) {
    const horizontal = opts && opts.horizontal;
    // Only the value axis gets a tick callback; the category axis must keep
    // Chart.js's own default (which reads data.labels) — even assigning it
    // `callback: undefined` short-circuits that default, so the key is only
    // ever added on the value-axis side.
    const valueAxisTicks = opts.tickFormat ? { callback: (v, i, ticks) => opts.tickFormat(ticks[i].value) } : {};
    new Chart(document.getElementById(id), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            data: values,
            backgroundColor: color,
            borderRadius: 4,
            barThickness: horizontal ? 18 : 22,
            maxBarThickness: 24,
          },
        ],
      },
      options: baseOptions({
        indexAxis: horizontal ? 'y' : 'x',
        scales: {
          x: {
            grid: { color: horizontal ? colors.grid : 'transparent' },
            border: { color: colors.axis },
            ticks: horizontal ? valueAxisTicks : {},
          },
          y: {
            grid: { color: horizontal ? 'transparent' : colors.grid },
            border: { color: colors.axis },
            ticks: !horizontal ? valueAxisTicks : {},
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: Object.assign({}, baseOptions({}).plugins.tooltip, {
            callbacks: opts.tooltipLabel ? { label: opts.tooltipLabel } : undefined,
          }),
        },
      }),
    });
  }

  function lineChart(id, labels, values, color, opts) {
    new Chart(document.getElementById(id), {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            data: values,
            borderColor: color,
            backgroundColor: color + '1a',
            borderWidth: 2,
            fill: true,
            tension: 0.25,
            pointRadius: 3,
            pointBackgroundColor: color,
            pointBorderColor: colors.surface,
            pointBorderWidth: 2,
            pointHoverRadius: 5,
          },
        ],
      },
      options: baseOptions({
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { grid: { display: false }, border: { color: colors.axis } },
          y: {
            grid: { color: colors.grid },
            border: { color: colors.axis },
            ticks: opts && opts.tickFormat ? { callback: (v) => opts.tickFormat(v) } : {},
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: Object.assign({}, baseOptions({}).plugins.tooltip, {
            callbacks: opts && opts.tooltipLabel ? { label: opts.tooltipLabel } : undefined,
          }),
        },
      }),
    });
  }

  // 1. Ratings by genre (volume) — horizontal bar, top 10
  const top10Volume = genreByVolume.slice(0, 10);
  barChart(
    'chart-genre-volume',
    top10Volume.map((d) => d.primary_genre),
    top10Volume.map((d) => d.rating_count),
    colors.series1,
    { horizontal: true, tickFormat: compactNumber }
  );

  // 2. Average rating by genre (min 200 ratings)
  const qualifiedGenres = [...data.genre_rating_counts]
    .filter((d) => d.rating_count >= 200)
    .sort((a, b) => b.avg_rating - a.avg_rating);
  barChart(
    'chart-genre-avg-rating',
    qualifiedGenres.map((d) => d.primary_genre),
    qualifiedGenres.map((d) => Number(d.avg_rating.toFixed(3))),
    colors.series2,
    {
      horizontal: true,
      tickFormat: (v) => v.toFixed(1),
      tooltipLabel: (ctx) => ctx.parsed.x.toFixed(2) + ' / 5',
    }
  );

  // 3. Ratings logged per year
  const byYear = [...data.ratings_by_year].sort((a, b) => a.rating_year - b.rating_year);
  lineChart(
    'chart-ratings-by-year',
    byYear.map((d) => d.rating_year),
    byYear.map((d) => d.rating_count),
    colors.series1,
    { tickFormat: compactNumber, tooltipLabel: (ctx) => compactNumber(ctx.parsed.y) + ' ratings' }
  );

  // 4. Average rating per year
  lineChart(
    'chart-avgrating-by-year',
    byYear.map((d) => d.rating_year),
    byYear.map((d) => Number(d.avg_rating.toFixed(3))),
    colors.series2,
    { tickFormat: (v) => v.toFixed(1), tooltipLabel: (ctx) => ctx.parsed.y.toFixed(2) + ' / 5' }
  );

  // 5. Revenue by genre
  const top10Revenue = genreByRevenue.slice(0, 10);
  barChart(
    'chart-genre-revenue',
    top10Revenue.map((d) => d.primary_genre),
    top10Revenue.map((d) => d.total_revenue),
    colors.series3,
    {
      horizontal: true,
      tickFormat: compactCurrency,
      tooltipLabel: (ctx) => compactCurrency(ctx.parsed.x),
    }
  );

  // 6. ROI by genre (require at least 20 financed titles so one or two outliers can't swing a genre's median)
  const byRoi = [...data.genre_financials]
    .filter((d) => d.median_roi !== null && d.median_roi !== undefined && d.roi_sample_size >= 20)
    .sort((a, b) => b.median_roi - a.median_roi);
  barChart(
    'chart-genre-roi',
    byRoi.map((d) => d.primary_genre),
    byRoi.map((d) => Number((d.median_roi * 100).toFixed(1))),
    colors.series4,
    {
      horizontal: true,
      tickFormat: (v) => v + '%',
      tooltipLabel: (ctx) => ctx.parsed.x.toFixed(0) + '% ROI',
    }
  );

  // 7. Revenue by decade
  const byDecade = [...data.revenue_by_decade]
    .filter((d) => d.decade !== null)
    .sort((a, b) => a.decade - b.decade);
  barChart(
    'chart-decade-revenue',
    byDecade.map((d) => d.decade + 's'),
    byDecade.map((d) => d.total_revenue),
    colors.series5,
    { tickFormat: compactCurrency, tooltipLabel: (ctx) => compactCurrency(ctx.parsed.y) }
  );

  // 8. Top 10 movies by revenue
  const topMovies = data.top_revenue_movies;
  barChart(
    'chart-top-revenue',
    topMovies.map((d) => d.title),
    topMovies.map((d) => d.revenue),
    colors.series6,
    { horizontal: true, tickFormat: compactCurrency, tooltipLabel: (ctx) => compactCurrency(ctx.parsed.x) }
  );

  setupReveal();
})();
