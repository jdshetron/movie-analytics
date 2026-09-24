// 3D set pieces for the report page, built procedurally with three.js (no
// model files): a vintage film projector in the hero that tracks the cursor
// under a moving spotlight, a gold trophy in the credits, and a popcorn burst
// for correct quiz answers. Scenes only render while on screen.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------- stage ---

function makeStage(canvas, { fov = 35, position, lookAt }) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (err) {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 100);
  camera.position.set(...position);
  camera.lookAt(...lookAt);

  const clock = new THREE.Clock();
  const frameFns = [];
  let visible = false;
  let running = false;

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (!running) renderOnce();
  }

  function renderOnce() {
    for (const fn of frameFns) fn(0, clock.elapsedTime);
    renderer.render(scene, camera);
  }

  function loop() {
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    for (const fn of frameFns) fn(dt, clock.elapsedTime);
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }

  function update() {
    const shouldRun = visible && !document.hidden && !REDUCED;
    if (shouldRun && !running) {
      running = true;
      clock.getDelta();
      requestAnimationFrame(loop);
    } else if (!shouldRun) {
      running = false;
    }
  }

  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    update();
    if (visible && REDUCED) renderOnce();
  }).observe(canvas);
  document.addEventListener('visibilitychange', update);
  resize();

  return { scene, camera, renderer, onFrame: (fn) => frameFns.push(fn), renderOnce };
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,236,190,0.6)');
  grad.addColorStop(1, 'rgba(255,220,160,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------ materials ---

const materials = {
  lacquer: () => new THREE.MeshPhysicalMaterial({ color: 0x7d1022, metalness: 0.35, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.15 }),
  blackMetal: () => new THREE.MeshStandardMaterial({ color: 0x17100f, metalness: 0.8, roughness: 0.34 }),
  gold: () => new THREE.MeshPhysicalMaterial({ color: 0xe9b64f, metalness: 1, roughness: 0.2, clearcoat: 0.5, envMapIntensity: 1.6 }),
  marble: () => new THREE.MeshPhysicalMaterial({ color: 0x1c0b0e, metalness: 0.1, roughness: 0.28, clearcoat: 1 }),
};

// ------------------------------------------------------------ projector ---

function makeReel(radius, black, gold) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, radius, 0, Math.PI * 2, false);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const hole = new THREE.Path();
    hole.absarc(Math.cos(a) * radius * 0.56, Math.sin(a) * radius * 0.56, radius * 0.2, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }
  const hubHole = new THREE.Path();
  hubHole.absarc(0, 0, radius * 0.1, 0, Math.PI * 2, true);
  shape.holes.push(hubHole);

  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2, curveSegments: 48 });
  geo.center();

  const reel = new THREE.Group();
  reel.add(new THREE.Mesh(geo, black));
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.15, radius * 0.15, 0.14, 24), gold);
  hub.rotation.x = Math.PI / 2;
  reel.add(hub);
  reel.add(new THREE.Mesh(new THREE.TorusGeometry(radius, 0.018, 8, 64), gold));
  return reel;
}

function buildProjector() {
  const lacquer = materials.lacquer();
  const black = materials.blackMetal();
  const gold = materials.gold();
  const g = new THREE.Group();

  g.add(new THREE.Mesh(new RoundedBoxGeometry(1.7, 1.0, 0.85, 4, 0.12), lacquer));
  const band = new THREE.Mesh(new RoundedBoxGeometry(1.74, 0.07, 0.89, 2, 0.03), gold);
  band.position.y = -0.3;
  g.add(band);

  // Lens barrel pointing +x, with a glowing front element.
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.56, 36), black);
  barrel.rotation.z = Math.PI / 2;
  barrel.position.set(1.12, 0.05, 0);
  g.add(barrel);
  const lensRing = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.035, 12, 40), gold);
  lensRing.rotation.y = Math.PI / 2;
  lensRing.position.set(1.4, 0.05, 0);
  g.add(lensRing);
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x1a0d10, emissive: 0xffd9a0, emissiveIntensity: 0.6, metalness: 0.2, roughness: 0.08 });
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.23, 36), glassMat);
  glass.rotation.y = Math.PI / 2;
  glass.position.set(1.405, 0.05, 0);
  g.add(glass);

  // Two film reels on arms.
  const reelA = makeReel(0.52, black, gold);
  reelA.position.set(-0.42, 1.12, 0);
  const reelB = makeReel(0.4, black, gold);
  reelB.position.set(0.5, 0.98, 0);
  g.add(reelA, reelB);
  for (const [x, top] of [[-0.42, 1.12], [0.5, 0.98]]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, top - 0.5, 12), black);
    arm.position.set(x, 0.5 + (top - 0.5) / 2, -0.06);
    g.add(arm);
  }

  // Hand crank on the front face.
  const crank = new THREE.Group();
  const crankDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.05, 28), gold);
  crankDisc.rotation.x = Math.PI / 2;
  const crankArm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.26, 0.04), gold);
  crankArm.position.set(0, 0.13, 0.04);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 16), black);
  knob.position.set(0, 0.26, 0.08);
  crank.add(crankDisc, crankArm, knob);
  crank.position.set(-0.4, -0.02, 0.45);
  g.add(crank);

  // Tripod.
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.22, 20), black);
  head.position.y = -0.61;
  g.add(head);
  for (let i = 0; i < 3; i++) {
    const pivot = new THREE.Group();
    pivot.position.y = -0.7;
    pivot.rotation.y = (i / 3) * Math.PI * 2 + Math.PI / 6;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.022, 1.45, 10), black);
    leg.position.set(0.26, -0.68, 0);
    leg.rotation.z = 0.36;
    pivot.add(leg);
    g.add(pivot);
  }

  // Projector beam: an open cone fading from the lens outward.
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uStrength: { value: 0.28 }, uColor: { value: new THREE.Color(0xffe2b0) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float uStrength; uniform vec3 uColor; varying vec2 vUv; void main(){ gl_FragColor = vec4(uColor, pow(vUv.y, 2.8) * uStrength); }',
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(new THREE.ConeGeometry(1.3, 4.6, 40, 1, true), beamMat);
  beam.rotation.z = Math.PI / 2;
  beam.position.set(1.42 + 2.3, 0.05, 0);
  g.add(beam);

  return { group: g, reels: [reelA, reelB], crank, glassMat, beamMat };
}

function initProjector() {
  const canvas = document.getElementById('projector-canvas');
  if (!canvas) return;
  const stage = makeStage(canvas, { fov: 34, position: [0.55, 0.35, 7.4], lookAt: [0.55, -0.15, 0] });
  if (!stage) {
    canvas.closest('.hero-stage').classList.add('no-webgl');
    return;
  }
  const { scene, onFrame, renderOnce } = stage;
  const projector = buildProjector();
  const BASE_YAW = -0.5;
  projector.group.rotation.y = BASE_YAW;
  scene.add(projector.group);

  scene.add(new THREE.HemisphereLight(0xffd9c0, 0x2a0508, 0.5));
  const rim = new THREE.DirectionalLight(0xff3b52, 2.2);
  rim.position.set(-3, 2.5, -3);
  scene.add(rim);
  // The cursor-following stage light.
  const spot = new THREE.SpotLight(0xffe0b0, 90, 22, 0.42, 0.65, 1.2);
  spot.position.set(1, 2, 5);
  spot.target = projector.group;
  scene.add(spot, spot.target);

  let targetYaw = BASE_YAW;
  let targetPitch = 0;
  let spotX = 1;
  let spotY = 2;
  let reelSpeed = 1.1;
  let boost = 0;

  window.addEventListener(
    'pointermove',
    (e) => {
      const r = canvas.getBoundingClientRect();
      const nx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2)));
      const ny = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (window.innerHeight / 2)));
      targetYaw = BASE_YAW + nx * 0.6;
      targetPitch = ny * 0.22;
      spotX = nx * 4.5;
      spotY = 2 - ny * 3;
      if (REDUCED) {
        projector.group.rotation.set(targetPitch, targetYaw, 0);
        spot.position.set(spotX, spotY, 5);
        renderOnce();
      }
    },
    { passive: true }
  );

  function roll() {
    reelSpeed = 13;
    boost = 1;
    document.dispatchEvent(new CustomEvent('projector:roll'));
  }
  canvas.addEventListener('click', roll);
  document.querySelector('.btn-primary')?.addEventListener('click', roll);

  onFrame((dt, t) => {
    const g = projector.group;
    g.rotation.y += (targetYaw - g.rotation.y) * Math.min(1, dt * 4);
    g.rotation.x += (targetPitch - g.rotation.x) * Math.min(1, dt * 4);
    g.position.y = Math.sin(t * 1.3) * 0.04;
    spot.position.x += (spotX - spot.position.x) * Math.min(1, dt * 5);
    spot.position.y += (spotY - spot.position.y) * Math.min(1, dt * 5);
    spot.position.z = 5;

    reelSpeed += (1.1 - reelSpeed) * Math.min(1, dt * 0.9);
    boost = Math.max(0, boost - dt * 0.7);
    projector.reels[0].rotation.z -= reelSpeed * dt;
    projector.reels[1].rotation.z -= reelSpeed * 1.3 * dt;
    projector.crank.rotation.z -= reelSpeed * 0.8 * dt;

    const flicker = 0.9 + Math.sin(t * 37) * 0.05 + Math.sin(t * 13.3) * 0.05;
    projector.beamMat.uniforms.uStrength.value = (0.26 + boost * 0.5) * flicker;
    projector.glassMat.emissiveIntensity = (0.6 + boost * 2.2) * flicker;
  });
  renderOnce();
}

// -------------------------------------------------------------- trophy ---

function plateTexture(line1, line2) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 144;
  const x = c.getContext('2d');
  const grad = x.createLinearGradient(0, 0, 512, 144);
  grad.addColorStop(0, '#a8741f');
  grad.addColorStop(0.5, '#f6d27a');
  grad.addColorStop(1, '#9c6a1a');
  x.fillStyle = grad;
  x.fillRect(0, 0, 512, 144);
  x.strokeStyle = 'rgba(60, 30, 0, 0.55)';
  x.lineWidth = 6;
  x.strokeRect(9, 9, 494, 126);
  x.fillStyle = '#3a1d05';
  x.textAlign = 'center';
  x.font = '700 46px "Space Grotesk", sans-serif';
  x.fillText(line1, 256, 68);
  x.font = '600 30px "Plus Jakarta Sans", sans-serif';
  x.fillText(line2, 256, 112);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function buildTrophy() {
  const gold = materials.gold();
  const marble = materials.marble();
  const g = new THREE.Group();

  // Base and plinth.
  const base = new THREE.Mesh(new RoundedBoxGeometry(1.2, 0.36, 1.2, 3, 0.05), marble);
  base.position.y = 0.18;
  const plinth = new THREE.Mesh(new RoundedBoxGeometry(0.82, 0.22, 0.82, 3, 0.04), marble);
  plinth.position.y = 0.47;
  g.add(base, plinth);

  const plateMat = new THREE.MeshStandardMaterial({ map: plateTexture('BEST DATA STORY', 'John Shetron'), metalness: 0.6, roughness: 0.35 });
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.253), plateMat);
  plate.position.set(0, 0.18, 0.605);
  g.add(plate);

  // Cup: a lathe-turned profile with an open, hollow bowl.
  const profile = [
    [0, 0], [0.34, 0], [0.34, 0.05], [0.26, 0.09], [0.1, 0.16], [0.07, 0.42], [0.13, 0.5], [0.07, 0.58],
    [0.1, 0.66], [0.3, 0.82], [0.45, 1.05], [0.53, 1.36], [0.56, 1.46], [0.52, 1.46], [0.47, 1.12], [0.3, 0.9], [0, 0.84],
  ].map(([px, py]) => new THREE.Vector2(px, py));
  // Double-sided: looking down into the open bowl shows the lathe's back faces.
  const cupGold = gold.clone();
  cupGold.side = THREE.DoubleSide;
  const cup = new THREE.Mesh(new THREE.LatheGeometry(profile, 72), cupGold);
  cup.position.y = 0.58;
  g.add(cup);

  for (const side of [1, -1]) {
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 12, 32, Math.PI), gold);
    handle.rotation.z = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    handle.position.set(side * 0.47, 1.66, 0);
    g.add(handle);
  }

  // Twinkling sparkles around the cup.
  const count = 70;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 0.6 + Math.random() * 0.8;
    positions[i * 3] = Math.cos(a) * r;
    positions[i * 3 + 1] = 0.3 + Math.random() * 2.3;
    positions[i * 3 + 2] = Math.sin(a) * r;
  }
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const sparkMat = new THREE.PointsMaterial({
    size: 0.09,
    map: glowTexture(),
    color: 0xffe6a0,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const sparkles = new THREE.Points(sparkGeo, sparkMat);

  return { group: g, sparkles, sparkMat, plateMat };
}

function initTrophy() {
  const canvas = document.getElementById('trophy-canvas');
  if (!canvas) return;
  const stage = makeStage(canvas, { fov: 34, position: [0, 1.5, 4.9], lookAt: [0, 1.08, 0] });
  if (!stage) {
    canvas.closest('.trophy-stage').classList.add('no-webgl');
    return;
  }
  const { scene, onFrame, renderOnce } = stage;
  const trophy = buildTrophy();
  scene.add(trophy.group, trophy.sparkles);

  scene.add(new THREE.HemisphereLight(0xfff0d8, 0x2a0508, 0.6));
  const key = new THREE.SpotLight(0xfff0d0, 120, 20, 0.5, 0.6, 1.2);
  key.position.set(1.5, 4.5, 3.5);
  key.target = trophy.group;
  const rim = new THREE.DirectionalLight(0xff3b52, 2.5);
  rim.position.set(-2.5, 2, -2.5);
  const front = new THREE.DirectionalLight(0xfff2e0, 1.4);
  front.position.set(0, 1.5, 5);
  scene.add(key, key.target, rim, front);

  let angle = 0.3;
  let velocity = 0.45;
  let dragging = false;
  let lastX = 0;
  let travelled = 0;
  let sparkBoost = 0;

  function bow() {
    velocity = 9;
    sparkBoost = 1;
    document.dispatchEvent(new CustomEvent('trophy:bow'));
    if (REDUCED) renderOnce();
  }

  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastX = e.clientX;
    travelled = 0;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    travelled += Math.abs(dx);
    angle += dx * 0.012;
    velocity = Math.max(-12, Math.min(12, dx * 0.9));
    if (REDUCED) {
      trophy.group.rotation.y = angle;
      renderOnce();
    }
  });
  canvas.addEventListener('pointerup', () => {
    dragging = false;
    if (travelled < 4) bow();
  });

  document.addEventListener('quiz:answered', (e) => {
    if (!e.detail.perfect) return;
    trophy.plateMat.map = plateTexture('PERFECT CRITIC', 'John Shetron');
    trophy.plateMat.needsUpdate = true;
    velocity = 14;
    sparkBoost = 1.5;
    if (REDUCED) renderOnce();
  });

  onFrame((dt, t) => {
    if (!dragging) {
      angle += velocity * dt;
      velocity += (0.45 - velocity) * Math.min(1, dt * 1.2);
    }
    trophy.group.rotation.y = angle;
    trophy.group.position.y = Math.sin(t * 1.1) * 0.03;
    sparkBoost = Math.max(0, sparkBoost - dt * 0.6);
    trophy.sparkles.rotation.y -= dt * (0.15 + sparkBoost);
    trophy.sparkMat.opacity = 0.45 + Math.sin(t * 3.1) * 0.15 + sparkBoost * 0.4;
    trophy.sparkMat.size = 0.09 + sparkBoost * 0.08;
  });
  trophy.group.rotation.y = angle;
  renderOnce();
}

// ------------------------------------------------------------- popcorn ---

function lumpyKernel(seed) {
  const geo = new THREE.IcosahedronGeometry(0.22, 4);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  // Displacement is a pure function of position, so vertices shared between
  // faces move together and the surface doesn't crack.
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = Math.sin(v.x * (14 + seed)) * Math.sin(v.y * (12 + seed * 2)) * Math.sin(v.z * (16 - seed));
    v.multiplyScalar(0.82 + 0.38 * (n * 0.5 + 0.5));
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

let popcornLayer = null;

function makePopcornLayer() {
  const canvas = document.createElement('canvas');
  canvas.className = 'popcorn-layer';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (err) {
    canvas.remove();
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const FOV = 50;
  const DIST = 10;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 50);
  camera.position.z = DIST;
  scene.add(new THREE.AmbientLight(0xffffff, 1.3));
  const sun = new THREE.DirectionalLight(0xfff2d8, 2.2);
  sun.position.set(2, 5, 6);
  scene.add(sun);

  const geos = [lumpyKernel(0), lumpyKernel(2), lumpyKernel(4)];
  const mats = [
    new THREE.MeshStandardMaterial({ color: 0xfff4de, roughness: 0.85 }),
    new THREE.MeshStandardMaterial({ color: 0xfff0cf, roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ color: 0xffd46b, roughness: 0.7 }),
  ];
  const kernels = [];
  let running = false;
  let last = 0;

  function resize() {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  function toWorld(px, py) {
    const h = 2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * DIST;
    const w = h * camera.aspect;
    return [(px / window.innerWidth - 0.5) * w, -(py / window.innerHeight - 0.5) * h];
  }

  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    for (let i = kernels.length - 1; i >= 0; i--) {
      const k = kernels[i];
      k.v.y -= 14 * dt;
      k.mesh.position.addScaledVector(k.v, dt);
      k.mesh.rotation.x += k.spin.x * dt;
      k.mesh.rotation.y += k.spin.y * dt;
      k.life += dt;
      if (k.life > 1.9) k.mesh.scale.setScalar(k.size * Math.max(0, 1 - (k.life - 1.9) / 0.5));
      if (k.life > 2.4) {
        scene.remove(k.mesh);
        kernels.splice(i, 1);
      }
    }
    renderer.render(scene, camera);
    if (kernels.length) requestAnimationFrame(frame);
    else running = false;
  }

  return {
    burst(px, py) {
      const [x, y] = toWorld(px, py);
      for (let i = 0; i < 34; i++) {
        const mesh = new THREE.Mesh(geos[i % 3], mats[i % 3]);
        const size = 0.7 + Math.random() * 0.6;
        mesh.scale.setScalar(size);
        mesh.position.set(x + (Math.random() - 0.5) * 0.6, y, (Math.random() - 0.5));
        kernels.push({
          mesh,
          size,
          life: 0,
          v: new THREE.Vector3((Math.random() - 0.5) * 7, 5 + Math.random() * 6, (Math.random() - 0.5) * 3),
          spin: new THREE.Vector2((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10),
        });
        scene.add(mesh);
      }
      if (!running) {
        running = true;
        last = performance.now();
        requestAnimationFrame(frame);
      }
    },
  };
}

document.addEventListener('quiz:answered', (e) => {
  if (REDUCED || !e.detail.correct) return;
  if (!popcornLayer) popcornLayer = makePopcornLayer();
  if (popcornLayer) popcornLayer.burst(e.detail.x, e.detail.y);
});

// ------------------------------------------------------------------ go ---

await document.fonts.ready;
initProjector();
initTrophy();
