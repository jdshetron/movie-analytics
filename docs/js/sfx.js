// Sound effects, synthesized live with the Web Audio API (no audio files).
// Off by default; the nav speaker button turns it on and the choice is
// remembered. Pages trigger sounds by dispatching CustomEvents on document.
(function () {
  const STORAGE_KEY = 'movie-analytics-sound';
  let enabled = false;
  try {
    enabled = localStorage.getItem(STORAGE_KEY) === 'on';
  } catch (e) {
    enabled = false;
  }

  let ctx = null;
  let master = null;
  let noiseBuffer = null;

  // Browsers only allow an AudioContext to start inside a user gesture, so
  // this is called lazily from click handlers rather than at page load.
  function ensureContext() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function envelope(gainNode, t0, peak, attack, dur) {
    gainNode.gain.setValueAtTime(0.0001, t0);
    gainNode.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }

  function tone({ freq, type = 'sine', start = 0, dur = 0.3, gain = 0.2, attack = 0.01, glideTo, lowpass }) {
    const t0 = ctx.currentTime + start;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
    const g = ctx.createGain();
    envelope(g, t0, gain, attack, dur);
    let node = osc;
    if (lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lowpass;
      osc.connect(f);
      node = f;
    }
    node.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noise({ start = 0, dur = 0.05, gain = 0.25, filter = 'bandpass', freq = 2000, q = 1, sweepTo, attack = 0.003 }) {
    const t0 = ctx.currentTime + start;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, t0);
    f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
    const g = ctx.createGain();
    envelope(g, t0, gain, attack, dur);
    src.connect(f).connect(g).connect(master);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.02);
  }

  const rand = (a, b) => a + Math.random() * (b - a);

  const sounds = {
    tick() {
      noise({ dur: 0.035, gain: 0.22, freq: 3200, q: 2.5 });
    },
    whoosh() {
      noise({ dur: 0.55, gain: 0.2, filter: 'lowpass', freq: 300, sweepTo: 4200, attack: 0.12 });
    },
    chime() {
      [1046.5, 1318.5, 1568, 2093].forEach((f, i) => tone({ freq: f, type: 'triangle', start: i * 0.07, dur: 0.7, gain: 0.16 }));
    },
    // A lighter "sad trombone": three sliding steps down.
    womp() {
      const steps = [
        [329.6, 311.1, 0],
        [311.1, 293.7, 0.28],
        [293.7, 233.1, 0.56],
      ];
      for (const [from, to, start] of steps) {
        tone({ freq: from, glideTo: to, type: 'sawtooth', start, dur: start === 0.56 ? 0.8 : 0.26, gain: 0.1, lowpass: 950, attack: 0.03 });
      }
    },
    ticket() {
      noise({ dur: 0.3, gain: 0.2, freq: 900, sweepTo: 3600, q: 3 });
      noise({ start: 0.3, dur: 0.04, gain: 0.25, freq: 2600, q: 2 });
    },
    // Projector clatter: a fast run of shutter clicks over a low motor hum.
    projector(duration = 2) {
      for (let t = 0; t < duration; t += 1 / 18) {
        noise({ start: t, dur: 0.02, gain: 0.16 * (1 - (t / duration) * 0.5), freq: rand(1500, 2400), q: 3 });
      }
      tone({ freq: 55, type: 'sawtooth', dur: duration, gain: 0.05, lowpass: 240, attack: 0.15 });
    },
    popcorn(count = 12) {
      for (let i = 0; i < count; i++) {
        noise({ start: rand(0, 1.1), dur: 0.028, gain: rand(0.2, 0.35), freq: rand(1100, 3000), q: 4 });
      }
    },
    fanfare() {
      const notes = [392, 523.25, 659.25, 783.99];
      notes.forEach((f, i) => tone({ freq: f, type: 'sawtooth', start: i * 0.13, dur: 0.22, gain: 0.1, lowpass: 2200 }));
      [523.25, 659.25, 783.99, 1046.5].forEach((f) => tone({ freq: f, type: 'sawtooth', start: 0.55, dur: 1.3, gain: 0.07, lowpass: 2600, attack: 0.04 }));
    },
    applause(duration = 2.4) {
      for (let i = 0; i < 220; i++) {
        const start = rand(0, duration) * Math.sqrt(Math.random());
        const fade = 1 - start / duration;
        noise({ start, dur: rand(0.012, 0.03), gain: 0.18 * fade + 0.02, freq: rand(1200, 4200), q: 1.5 });
      }
    },
  };

  function play(name, ...args) {
    if (!enabled || !ensureContext()) return;
    sounds[name](...args);
  }

  // ---- Nav toggle ----
  const button = document.getElementById('toggle-sound');
  function render() {
    if (!button) return;
    button.setAttribute('aria-pressed', String(enabled));
    button.setAttribute('aria-label', enabled ? 'Sound on — turn off' : 'Sound off — turn on');
    button.title = enabled ? 'Sound on' : 'Sound off';
  }
  render();
  if (button) {
    button.addEventListener('click', () => {
      enabled = !enabled;
      try {
        localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
      } catch (e) {
        // Preference just won't persist.
      }
      render();
      if (enabled) play('chime');
    });
  }

  // ---- Generic UI clicks ----
  document.addEventListener('click', (e) => {
    const target = e.target.closest('button, a');
    if (!target || target.id === 'toggle-sound') return;
    if (target.matches('.btn-primary')) play('whoosh');
    else if (target.matches('.chip, .seg-toggle button, .reset-btn, .quiz-skip, .scene-strip button, .ticket-nav button, #toggle-lights, #spotlight-clear')) play('tick');
  });
  document.addEventListener('change', (e) => {
    if (e.target.matches('select')) play('tick');
  });

  // ---- Page events ----
  document.addEventListener('quiz:answered', (e) => {
    const { correct, skipped, perfect } = e.detail;
    if (skipped) return;
    if (correct) {
      play('chime');
      play('popcorn', 14);
    } else {
      play('womp');
    }
    if (perfect) {
      setTimeout(() => play('fanfare'), 700);
      setTimeout(() => play('applause'), 1500);
    }
  });
  document.addEventListener('ticket:print', () => play('ticket'));
  document.addEventListener('reel:start', (e) => play('projector', e.detail.duration));
  document.addEventListener('projector:roll', () => play('projector', 1.6));
  document.addEventListener('trophy:bow', () => play('applause', 2));

  window.SFX = { play };
})();
