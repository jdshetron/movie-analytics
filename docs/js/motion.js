// Shared motion helpers: scroll-reveal and animated counters for stat tiles.
// Respects prefers-reduced-motion throughout.

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function setupReveal(selector = '.reveal') {
  const els = document.querySelectorAll(selector);
  if (REDUCED_MOTION || !('IntersectionObserver' in window)) {
    els.forEach((el) => el.classList.add('in-view'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          io.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
  );
  els.forEach((el) => io.observe(el));
}

// Animates a numeric value from 0 to `target`, re-running `formatFn` each
// frame so compact/currency/percent formatting stays correct mid-count.
function animateCount(el, target, formatFn, duration = 900) {
  if (REDUCED_MOTION || !Number.isFinite(target)) {
    el.textContent = formatFn(target);
    return;
  }
  const start = performance.now();
  function tick(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = formatFn(target * eased);
    if (t < 1) requestAnimationFrame(tick);
    else el.textContent = formatFn(target);
  }
  requestAnimationFrame(tick);
}
