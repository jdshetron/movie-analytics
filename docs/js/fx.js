// Pointer effects shared by both pages: a warm glow that follows the cursor,
// "house lights down" mode (page goes dark except a spotlight at the cursor),
// a stage spotlight inside the hero screen, and 3D tilt on ticket cards.
(function () {
  const root = document.documentElement;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const glow = document.createElement('div');
  glow.className = 'cursor-glow';
  glow.setAttribute('aria-hidden', 'true');
  const houseDark = document.createElement('div');
  houseDark.className = 'house-dark';
  houseDark.setAttribute('aria-hidden', 'true');
  document.body.append(glow, houseDark);

  // ---- Cursor position → CSS variables, batched to one write per frame ----
  let mx = window.innerWidth / 2;
  let my = window.innerHeight / 2;
  let queued = false;
  function paint() {
    queued = false;
    root.style.setProperty('--mx', `${mx}px`);
    root.style.setProperty('--my', `${my}px`);
  }
  paint();

  if (finePointer) {
    window.addEventListener(
      'pointermove',
      (e) => {
        mx = e.clientX;
        my = e.clientY;
        glow.classList.add('on');
        if (!queued) {
          queued = true;
          requestAnimationFrame(paint);
        }
      },
      { passive: true }
    );
    root.addEventListener('mouseleave', () => glow.classList.remove('on'));
  }

  // ---- House lights ----
  const lightsButton = document.getElementById('toggle-lights');
  function setLights(down) {
    root.classList.toggle('lights-down', down);
    if (!lightsButton) return;
    lightsButton.setAttribute('aria-pressed', String(down));
    lightsButton.setAttribute('aria-label', down ? 'Bring the house lights back up' : 'Dim the house lights — a spotlight follows your cursor');
    lightsButton.title = down ? 'House lights down (Esc to restore)' : 'Dim the house lights';
  }
  if (lightsButton) {
    // The spotlight needs a mouse to follow; on touch screens the mode would
    // just darken the page, so the toggle is hidden there.
    if (!finePointer) lightsButton.hidden = true;
    setLights(false);
    lightsButton.addEventListener('click', () => setLights(!root.classList.contains('lights-down')));
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && root.classList.contains('lights-down')) setLights(false);
    });
  }

  // ---- Stage spotlight inside the hero screen ----
  const screen = document.querySelector('.screen-inner');
  if (screen && finePointer) {
    const spot = document.createElement('div');
    spot.className = 'screen-spot';
    spot.setAttribute('aria-hidden', 'true');
    screen.prepend(spot);
    screen.addEventListener('pointermove', (e) => {
      const r = screen.getBoundingClientRect();
      screen.style.setProperty('--sx', `${e.clientX - r.left}px`);
      screen.style.setProperty('--sy', `${e.clientY - r.top}px`);
      screen.classList.add('spot-on');
    });
    screen.addEventListener('pointerleave', () => screen.classList.remove('spot-on'));
  }

  // ---- 3D tilt + glare on ticket-style cards (delegated: tiles re-render) ----
  if (finePointer && !reducedMotion) {
    const TILT_SELECTOR = '.stat-tile, .movie-ticket';
    const MAX_DEG = 9;
    let current = null;

    function reset(el) {
      el.classList.remove('tilting');
      el.style.transition = 'transform 0.45s cubic-bezier(0.22, 1, 0.36, 1)';
      el.style.transform = '';
    }

    document.addEventListener(
      'pointermove',
      (e) => {
        const el = e.target.closest ? e.target.closest(TILT_SELECTOR) : null;
        if (current && current !== el) reset(current);
        current = el;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        el.classList.add('tilting');
        el.style.transition = 'transform 0.08s ease-out';
        el.style.transform = `perspective(700px) rotateX(${(0.5 - py) * MAX_DEG}deg) rotateY(${(px - 0.5) * MAX_DEG}deg) translateY(-4px)`;
        el.style.setProperty('--gx', `${px * 100}%`);
        el.style.setProperty('--gy', `${py * 100}%`);
      },
      { passive: true }
    );
    root.addEventListener('mouseleave', () => {
      if (current) reset(current);
      current = null;
    });
  }
})();
