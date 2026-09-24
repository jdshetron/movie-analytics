// Report page: loads the precomputed aggregates, renders stat tiles + 8 charts,
// and wires up the interactive layer (genre spotlight, prediction quizzes,
// movie tickets, decade reel, scene navigator).
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
    textPrimary: cssVar('--text-primary'),
    textSecondary: cssVar('--text-secondary'),
    textMuted: cssVar('--text-muted'),
    surface: cssVar('--surface'),
  };

  const FONT_FAMILY = "'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', sans-serif";
  Chart.defaults.font.family = FONT_FAMILY;
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
  function cleanTitle(title) {
    return String(title).replace(/\s*\(\d{4}\)\s*$/, '');
  }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  // Builds an element from text runs; objects become <strong>. Uses textContent throughout.
  function fillRich(el, parts) {
    el.textContent = '';
    for (const part of parts) {
      if (typeof part === 'string') el.appendChild(document.createTextNode(part));
      else {
        const s = document.createElement('strong');
        s.textContent = part.strong;
        el.appendChild(s);
      }
    }
  }

  setupSceneStrip();
  setupReelProgress();

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

  // ---- Chart helpers ----
  const tooltipStyle = {
    backgroundColor: colors.surface,
    titleColor: colors.textPrimary,
    bodyColor: colors.textSecondary,
    borderColor: colors.grid,
    borderWidth: 1,
    padding: 10,
    displayColors: false,
  };

  function isHighlighted(ctx) {
    return Boolean(ctx.chart.$highlight) && ctx.tick && ctx.tick.label === ctx.chart.$highlight;
  }

  function barChart(id, labels, values, color, opts) {
    const horizontal = Boolean(opts.horizontal);
    // Only the value axis gets a tick callback. The category axis must keep
    // Chart.js's default label lookup — even `callback: undefined` breaks it —
    // so it only ever gets scriptable font/color for highlight emphasis.
    const valueAxisTicks = opts.tickFormat ? { callback: (v, i, ticks) => opts.tickFormat(ticks[i].value) } : {};
    const categoryTicks = {
      font: (ctx) => ({ family: FONT_FAMILY, size: 12, weight: isHighlighted(ctx) ? '700' : '400' }),
      color: (ctx) => (isHighlighted(ctx) ? colors.textPrimary : colors.textSecondary),
    };
    const chart = new Chart(document.getElementById(id), {
      type: 'bar',
      data: {
        labels,
        datasets: [{ data: values, backgroundColor: color, borderRadius: 4, barThickness: horizontal ? 18 : 22, maxBarThickness: 24 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: horizontal ? 'y' : 'x',
        scales: {
          x: {
            grid: { color: horizontal ? colors.grid : 'transparent' },
            border: { color: colors.axis },
            ticks: horizontal ? valueAxisTicks : categoryTicks,
          },
          y: {
            grid: { color: horizontal ? 'transparent' : colors.grid },
            border: { color: colors.axis },
            ticks: horizontal ? categoryTicks : valueAxisTicks,
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: Object.assign({}, tooltipStyle, {
            callbacks: Object.assign(
              {},
              opts.tooltipLabel ? { label: opts.tooltipLabel } : {},
              opts.tooltipAfter ? { afterLabel: opts.tooltipAfter } : {}
            ),
          }),
        },
      },
    });
    chart.$baseColor = color;
    return chart;
  }

  // Emphasizes one bar (full color, bold label) and dims the rest. If the label
  // isn't on this chart, nothing is dimmed — the spotlight note explains why.
  function setHighlight(chart, label) {
    const present = label && chart.data.labels.includes(label);
    chart.$highlight = present ? label : null;
    chart.data.datasets[0].backgroundColor = present
      ? chart.data.labels.map((l) => (l === label ? chart.$baseColor : chart.$baseColor + '38'))
      : chart.$baseColor;
    chart.update();
  }

  function lineChart(id, labels, values, color, opts) {
    return new Chart(document.getElementById(id), {
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
            pointHoverRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { grid: { display: false }, border: { color: colors.axis } },
          y: {
            grid: { color: colors.grid },
            border: { color: colors.axis },
            ticks: opts.tickFormat ? { callback: (v) => opts.tickFormat(v) } : {},
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: Object.assign({}, tooltipStyle, { callbacks: opts.tooltipLabel ? { label: opts.tooltipLabel } : {} }),
        },
      },
    });
  }

  // ---- Scene 1: ratings by genre (volume), top 10 ----
  const top10Volume = genreByVolume.slice(0, 10);
  const volumeChart = barChart(
    'chart-genre-volume',
    top10Volume.map((d) => d.primary_genre),
    top10Volume.map((d) => d.rating_count),
    colors.series1,
    {
      horizontal: true,
      tickFormat: compactNumber,
      tooltipLabel: (ctx) => `${ctx.parsed.x.toLocaleString()} ratings`,
      tooltipAfter: (ctx) => `${((ctx.parsed.x / h.total_ratings) * 100).toFixed(1)}% of all ratings`,
    }
  );

  // ---- Scene 2: average rating by genre (min 200 ratings) ----
  const qualifiedGenres = [...data.genre_rating_counts]
    .filter((d) => d.rating_count >= 200)
    .sort((a, b) => b.avg_rating - a.avg_rating);
  const avgRatingChart = barChart(
    'chart-genre-avg-rating',
    qualifiedGenres.map((d) => d.primary_genre),
    qualifiedGenres.map((d) => Number(d.avg_rating.toFixed(3))),
    colors.series2,
    {
      horizontal: true,
      tickFormat: (v) => v.toFixed(1),
      tooltipLabel: (ctx) => ctx.parsed.x.toFixed(2) + ' / 5',
      tooltipAfter: (ctx) => `from ${qualifiedGenres[ctx.dataIndex].rating_count.toLocaleString()} ratings`,
    }
  );

  // ---- Scenes 3 & 4: ratings per year ----
  const byYear = [...data.ratings_by_year].sort((a, b) => a.rating_year - b.rating_year);
  lineChart(
    'chart-ratings-by-year',
    byYear.map((d) => d.rating_year),
    byYear.map((d) => d.rating_count),
    colors.series1,
    { tickFormat: compactNumber, tooltipLabel: (ctx) => compactNumber(ctx.parsed.y) + ' ratings' }
  );
  lineChart(
    'chart-avgrating-by-year',
    byYear.map((d) => d.rating_year),
    byYear.map((d) => Number(d.avg_rating.toFixed(3))),
    colors.series2,
    { tickFormat: (v) => v.toFixed(1), tooltipLabel: (ctx) => ctx.parsed.y.toFixed(2) + ' / 5' }
  );

  // ---- Scene 5: revenue by genre ----
  const top10Revenue = genreByRevenue.slice(0, 10);
  const revenueChart = barChart(
    'chart-genre-revenue',
    top10Revenue.map((d) => d.primary_genre),
    top10Revenue.map((d) => d.total_revenue),
    colors.series3,
    { horizontal: true, tickFormat: compactCurrency, tooltipLabel: (ctx) => compactCurrency(ctx.parsed.x) }
  );

  // ---- Scene 6: median ROI by genre (min 20 financed titles) ----
  const byRoi = [...data.genre_financials]
    .filter((d) => d.median_roi !== null && d.median_roi !== undefined && d.roi_sample_size >= 20)
    .sort((a, b) => b.median_roi - a.median_roi);
  const roiChart = barChart(
    'chart-genre-roi',
    byRoi.map((d) => d.primary_genre),
    byRoi.map((d) => Number((d.median_roi * 100).toFixed(1))),
    colors.series4,
    {
      horizontal: true,
      tickFormat: (v) => v + '%',
      tooltipLabel: (ctx) => ctx.parsed.x.toFixed(0) + '% median ROI',
      tooltipAfter: (ctx) => `from ${byRoi[ctx.dataIndex].roi_sample_size.toLocaleString()} financed titles`,
    }
  );

  // ---- Scene 7: revenue by decade ----
  const byDecade = [...data.revenue_by_decade].filter((d) => d.decade !== null).sort((a, b) => a.decade - b.decade);
  const decadeChart = barChart(
    'chart-decade-revenue',
    byDecade.map((d) => d.decade + 's'),
    byDecade.map((d) => d.total_revenue),
    colors.series5,
    {
      tickFormat: compactCurrency,
      tooltipLabel: (ctx) => compactCurrency(ctx.parsed.y),
      tooltipAfter: (ctx) => `from ${byDecade[ctx.dataIndex].movie_count.toLocaleString()} financed movies`,
    }
  );

  // ---- Scene 8: top 10 movies by revenue ----
  const topMovies = data.top_revenue_movies;
  const topChart = barChart(
    'chart-top-revenue',
    topMovies.map((d) => d.title),
    topMovies.map((d) => d.revenue),
    colors.series6,
    { horizontal: true, tickFormat: compactCurrency, tooltipLabel: (ctx) => compactCurrency(ctx.parsed.x), tooltipAfter: () => 'Click for the ticket' }
  );

  // Quizzes go first: they lock their charts, which the ticket and spotlight respect.
  setupQuizzes();
  setupTicket();
  setupReel();
  setupSpotlight();
  setupReveal();

  // ================= Genre spotlight =================

  function setupSpotlight() {
    const chartFor = { volume: volumeChart, avgRating: avgRatingChart, revenue: revenueChart, roi: roiChart };
    const genreCharts = Object.values(chartFor);
    const chipRow = document.getElementById('spotlight-chips');
    const pill = document.getElementById('spotlight-pill');
    const totalGenres = genreByVolume.length;
    let current = null;

    const notes = {
      volume: (g) => {
        const i = genreByVolume.findIndex((d) => d.primary_genre === g);
        const d = genreByVolume[i];
        return [
          { strong: g }, ` ranks #${i + 1} of ${totalGenres} genres by rating volume, with `,
          { strong: d.rating_count.toLocaleString() }, ` ratings (${((d.rating_count / h.total_ratings) * 100).toFixed(1)}% of all)`,
          i >= 10 ? ' — outside the top 10 charted below.' : '.',
        ];
      },
      avgRating: (g) => {
        const i = qualifiedGenres.findIndex((d) => d.primary_genre === g);
        if (i === -1) {
          const d = genreByVolume.find((x) => x.primary_genre === g);
          return [{ strong: g }, ` has only ${d.rating_count.toLocaleString()} ratings in the sample, below this chart's 200-rating cutoff.`];
        }
        const d = qualifiedGenres[i];
        return [{ strong: g }, ' averages ', { strong: `${d.avg_rating.toFixed(2)} / 5` }, ` — #${i + 1} of ${qualifiedGenres.length} genres charted.`];
      },
      revenue: (g) => {
        const i = genreByRevenue.findIndex((d) => d.primary_genre === g);
        const d = genreByRevenue[i];
        if (!d || !d.total_revenue) return [{ strong: g }, ' has no tracked box-office revenue in the sample.'];
        return [
          { strong: g }, ' brought in ', { strong: compactCurrency(d.total_revenue) }, ` of tracked box office — #${i + 1} of ${genreByRevenue.length} genres`,
          i >= 10 ? ', outside the top 10 charted below.' : '.',
        ];
      },
      roi: (g) => {
        const i = byRoi.findIndex((d) => d.primary_genre === g);
        if (i === -1) {
          const d = data.genre_financials.find((x) => x.primary_genre === g);
          const n = d ? d.roi_sample_size : 0;
          return [{ strong: g }, ` has only ${n} financed title${n === 1 ? '' : 's'} with a usable budget, below this chart's 20-title cutoff.`];
        }
        const d = byRoi[i];
        return [
          { strong: g }, "'s typical movie returns ", { strong: pct(d.median_roi) }, ' on its budget',
          ` (median of ${d.roi_sample_size} titles) — #${i + 1} of ${byRoi.length} genres.`,
        ];
      },
    };

    function apply(genre) {
      current = genre;
      for (const chip of chipRow.children) chip.setAttribute('aria-pressed', String(chip.dataset.genre === genre));
      for (const chart of genreCharts) {
        if (!chart.$quizLocked) setHighlight(chart, genre);
      }
      for (const note of document.querySelectorAll('.spotlight-note')) {
        // Don't leak a quiz answer (e.g. "#1 of 17") before the reader has guessed.
        if (!genre || chartFor[note.dataset.spotlightFor].$quizLocked) {
          note.hidden = true;
          continue;
        }
        // Wrapped in one span: the note is a flex row (icon + text), and loose
        // text/strong nodes would each become a separately-gapped flex item.
        const text = document.createElement('span');
        fillRich(text, notes[note.dataset.spotlightFor](genre));
        note.replaceChildren(text);
        note.hidden = false;
      }
      pill.hidden = !genre;
      if (genre) document.getElementById('spotlight-pill-name').textContent = genre;
    }

    for (const d of genreByVolume.slice(0, 12)) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.dataset.genre = d.primary_genre;
      chip.textContent = d.primary_genre;
      chip.setAttribute('aria-pressed', 'false');
      chip.addEventListener('click', () => apply(current === d.primary_genre ? null : d.primary_genre));
      chipRow.appendChild(chip);
    }
    document.getElementById('spotlight-clear').addEventListener('click', () => apply(null));

    window.__spotlight = { get current() { return current; }, apply };
  }

  // ================= Place your bets =================

  function setupQuizzes() {
    const quizzes = {
      avgRating: {
        question: 'Which genre earns the highest average rating from users?',
        chart: avgRatingChart,
        answer: qualifiedGenres[0].primary_genre,
        options: (() => {
          const inChart = new Set(qualifiedGenres.map((d) => d.primary_genre));
          // The most-watched genre is the tempting wrong answer — it's the point of this scene.
          const picks = [qualifiedGenres[0].primary_genre, genreByVolume[0].primary_genre, 'Documentary', 'Drama', ...qualifiedGenres.map((d) => d.primary_genre)];
          return [...new Set(picks.filter((g) => inChart.has(g)))].slice(0, 4);
        })(),
        explain: (pick) => {
          const a = qualifiedGenres[0];
          const p = qualifiedGenres.find((d) => d.primary_genre === pick);
          return pick === a.primary_genre
            ? ['Nailed it — ', { strong: a.primary_genre }, ` averages ${a.avg_rating.toFixed(2)} / 5, the best of any genre.`]
            : ['Not quite — ', { strong: a.primary_genre }, ` averages ${a.avg_rating.toFixed(2)} / 5; ${pick} averages ${p.avg_rating.toFixed(2)}.`];
        },
      },
      roi: {
        question: 'Which genre delivers the best typical return on investment?',
        chart: roiChart,
        answer: byRoi[0].primary_genre,
        options: (() => {
          const inChart = new Set(byRoi.map((d) => d.primary_genre));
          const picks = [byRoi[0].primary_genre, genreByRevenue[0].primary_genre, 'Horror', 'Documentary', ...byRoi.map((d) => d.primary_genre)];
          return [...new Set(picks.filter((g) => inChart.has(g)))].slice(0, 4);
        })(),
        explain: (pick) => {
          const a = byRoi[0];
          const p = byRoi.find((d) => d.primary_genre === pick);
          return pick === a.primary_genre
            ? ['Nailed it — ', { strong: a.primary_genre }, ` tops the chart with a ${pct(a.median_roi)} median return.`]
            : ['Not quite — ', { strong: a.primary_genre }, ` tops the chart at ${pct(a.median_roi)}; ${pick}'s typical return is ${pct(p.median_roi)}.`];
        },
      },
      topMovie: {
        question: 'Which movie brought in the most at the box office?',
        chart: topChart,
        answer: topMovies[0].title,
        options: topMovies.slice(0, 4).map((d) => d.title),
        explain: (pick) => {
          const a = topMovies[0];
          const p = topMovies.find((d) => d.title === pick);
          return pick === a.title
            ? ['Nailed it — ', { strong: cleanTitle(a.title) }, ` grossed ${compactCurrency(a.revenue)}.`]
            : ['Not quite — ', { strong: cleanTitle(a.title) }, ` grossed ${compactCurrency(a.revenue)}; ${cleanTitle(pick)} took ${compactCurrency(p.revenue)}.`];
        },
      },
    };

    const score = { guessed: 0, correct: 0, total: Object.keys(quizzes).length, finished: 0 };

    function updateScore() {
      const text = score.guessed ? `${score.correct} of ${score.guessed} called correctly` : '';
      const strip = document.getElementById('scene-score');
      if (strip) strip.textContent = score.guessed ? `Bets\n${score.correct}/${score.guessed}` : '';
      const credits = document.getElementById('credits-score');
      credits.hidden = !score.guessed;
      document.getElementById('credits-score-value').textContent =
        text + (score.finished === score.total && score.correct === score.total ? ' — a perfect critic' : '');
    }

    for (const card of document.querySelectorAll('.chart-card[data-quiz]')) {
      const quiz = quizzes[card.dataset.quiz];
      if (!quiz) continue;
      quiz.chart.$quizLocked = true;

      const overlay = document.createElement('div');
      overlay.className = 'quiz-overlay';
      const box = document.createElement('div');
      box.className = 'quiz-box';
      const kicker = document.createElement('div');
      kicker.className = 'quiz-kicker';
      kicker.textContent = 'Place your bet';
      const q = document.createElement('div');
      q.className = 'quiz-q';
      q.textContent = quiz.question;
      const opts = document.createElement('div');
      opts.className = 'quiz-options';
      for (const option of shuffle(quiz.options)) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'quiz-option';
        btn.textContent = option;
        btn.addEventListener('click', () => reveal(option));
        opts.appendChild(btn);
      }
      const skip = document.createElement('button');
      skip.type = 'button';
      skip.className = 'quiz-skip';
      skip.textContent = 'Skip — just show me the chart';
      skip.addEventListener('click', () => reveal(null));
      box.append(kicker, q, opts, skip);
      overlay.appendChild(box);
      card.appendChild(overlay);

      function reveal(pick) {
        overlay.classList.add('done');
        quiz.chart.$quizLocked = false;
        quiz.chart.reset();
        quiz.chart.update();

        const result = document.createElement('div');
        result.setAttribute('role', 'status');
        result.tabIndex = -1;
        if (pick === null) {
          result.className = 'quiz-result skipped';
          const text = document.createElement('span');
          fillRich(text, ['Skipped. The answer is ', { strong: quiz.answer }, '.']);
          result.appendChild(text);
        } else {
          const correct = pick === quiz.answer;
          score.guessed++;
          if (correct) score.correct++;
          result.className = `quiz-result ${correct ? 'correct' : 'incorrect'}`;
          const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          icon.setAttribute('viewBox', '0 0 24 24');
          icon.setAttribute('aria-hidden', 'true');
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('fill', 'none');
          path.setAttribute('stroke', 'currentColor');
          path.setAttribute('stroke-width', '2.5');
          path.setAttribute('stroke-linecap', 'round');
          path.setAttribute('d', correct ? 'M5 12.5l4.5 4.5L19 7.5' : 'M6 6l12 12M18 6L6 18');
          icon.appendChild(path);
          const text = document.createElement('span');
          fillRich(text, quiz.explain(pick));
          result.append(icon, text);
        }
        score.finished++;
        card.insertAdjacentElement('afterend', result);
        result.focus({ preventScroll: true });
        updateScore();

        if (card.dataset.quiz === 'topMovie') {
          window.__selectTicket(0);
        } else {
          // Re-applying the spotlight refreshes the notes this quiz was hiding;
          // with no spotlight on, light up the answer instead.
          window.__spotlight.apply(window.__spotlight.current);
          if (!window.__spotlight.current) setHighlight(quiz.chart, quiz.answer);
        }
      }
    }
  }

  // ================= Scene 8: movie tickets =================

  function setupTicket() {
    const ticket = document.getElementById('movie-ticket');
    let index = 0;

    function select(i) {
      index = (i + topMovies.length) % topMovies.length;
      const m = topMovies[index];
      document.getElementById('ticket-rank').textContent = `#${index + 1} of ${topMovies.length}`;
      document.getElementById('ticket-title').textContent = cleanTitle(m.title);
      document.getElementById('ticket-meta').textContent = `${m.release_year} · ${m.primary_genre}`;
      document.getElementById('ticket-budget').textContent = m.budget ? compactCurrency(m.budget) : '—';
      document.getElementById('ticket-revenue').textContent = compactCurrency(m.revenue);
      document.getElementById('ticket-profit').textContent = m.budget ? compactCurrency(m.profit) : '—';
      document.getElementById('ticket-roi').textContent = m.budget ? `${(m.revenue / m.budget).toFixed(1)}× budget` : '—';
      ticket.classList.remove('printing');
      void ticket.offsetWidth;
      ticket.classList.add('printing');
      if (!topChart.$quizLocked) setHighlight(topChart, m.title);
    }

    topChart.options.onClick = (evt, elements) => {
      if (elements.length) select(elements[0].index);
    };
    topChart.options.onHover = (evt, elements) => {
      evt.native.target.style.cursor = elements.length ? 'pointer' : 'default';
    };
    topChart.update('none');
    document.getElementById('ticket-prev').addEventListener('click', () => select(index - 1));
    document.getElementById('ticket-next').addEventListener('click', () => select(index + 1));
    select(0);
    window.__selectTicket = select;
  }

  // ================= Scene 7: play the reel =================

  function setupReel() {
    const button = document.getElementById('play-reel');
    const label = button.querySelector('span');
    const readout = document.getElementById('reel-readout');
    const values = byDecade.map((d) => d.total_revenue);
    const peak = byDecade.reduce((a, b) => (b.total_revenue > a.total_revenue ? b : a));

    function showDecade(i) {
      const d = byDecade[i];
      fillRich(readout, [
        'Now showing: ', { strong: `${d.decade}s` }, ' — ', { strong: compactCurrency(d.total_revenue) },
        ` tracked from ${d.movie_count.toLocaleString()} financed movie${d.movie_count === 1 ? '' : 's'}.`,
      ]);
    }

    function finish() {
      decadeChart.data.datasets[0].data = values.slice();
      decadeChart.options.scales.y.max = undefined;
      decadeChart.update();
      fillRich(readout, [
        "That's the full reel. The peak decade is the ", { strong: `${peak.decade}s` }, ' at ',
        { strong: compactCurrency(peak.total_revenue) }, ' — the most recent decade is still being written (the data stops in 2023).',
      ]);
      button.disabled = false;
      label.textContent = 'Replay the reel';
    }

    button.addEventListener('click', () => {
      if (REDUCED_MOTION) return finish();
      button.disabled = true;
      label.textContent = 'Rolling…';
      // Pin the axis to the final peak so it doesn't rescale as each decade
      // lands — otherwise early decades shrink and the growth story disappears.
      decadeChart.options.scales.y.max = decadeChart.scales.y.max;
      decadeChart.data.datasets[0].data = values.map(() => 0);
      decadeChart.update('none');
      values.forEach((v, i) => {
        setTimeout(() => {
          decadeChart.data.datasets[0].data[i] = v;
          decadeChart.update();
          showDecade(i);
          if (i === values.length - 1) setTimeout(finish, 1200);
        }, 350 + i * 520);
      });
    });
  }

  // ================= Scene navigator + reel progress =================

  function setupSceneStrip() {
    const sections = [...document.querySelectorAll('.finding, #credits')];
    const strip = document.createElement('nav');
    strip.className = 'scene-strip';
    strip.setAttribute('aria-label', 'Jump to a scene');
    const buttons = sections.map((section, i) => {
      const isCredits = section.id === 'credits';
      const label = isCredits ? 'Roll credits' : `Scene ${String(i + 1).padStart(2, '0')} · ${section.dataset.scene}`;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = isCredits ? 'End' : String(i + 1).padStart(2, '0');
      btn.dataset.label = label;
      btn.setAttribute('aria-label', label);
      btn.addEventListener('click', () => section.scrollIntoView({ behavior: REDUCED_MOTION ? 'auto' : 'smooth', block: 'start' }));
      strip.appendChild(btn);
      return btn;
    });
    const scoreEl = document.createElement('div');
    scoreEl.className = 'scene-score';
    scoreEl.id = 'scene-score';
    scoreEl.style.whiteSpace = 'pre-line';
    strip.appendChild(scoreEl);
    document.body.appendChild(strip);

    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const i = sections.indexOf(entry.target);
          buttons.forEach((b, j) => {
            b.classList.toggle('active', i === j);
            if (i === j) b.setAttribute('aria-current', 'true');
            else b.removeAttribute('aria-current');
          });
        }
      },
      { rootMargin: '-40% 0px -55% 0px' }
    );
    sections.forEach((s) => io.observe(s));
  }

  function setupReelProgress() {
    const fill = document.getElementById('reel-progress-fill');
    let queued = false;
    function update() {
      queued = false;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      fill.style.width = `${max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0}%`;
    }
    window.addEventListener('scroll', () => {
      if (!queued) {
        queued = true;
        requestAnimationFrame(update);
      }
    }, { passive: true });
    update();
  }
})();
