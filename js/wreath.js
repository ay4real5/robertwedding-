// The wreath: one leaf per guest. It grows up both sides from a knot at the
// bottom and closes at the top when every seat is taken.

export const SIZE = 320;
const C = SIZE / 2;
const R = 122;
const START_DEG = 7;
const SWEEP_DEG = 163;
const ROWS = [1, -1, 0];
const STEPS = [24, 50, 100, 150, 200, 300, 400, 500, 750, 1000, 1500, 2000, 3000, 5000];

// A leaf with its base at the origin and its tip at x = 1.
export const LEAF_CURVES = [
  [0.26, -0.34, 0.72, -0.3, 1, 0],
  [0.72, 0.2, 0.28, 0.24, 0, 0],
];
const LEAF_PATH = `M0 0C${LEAF_CURVES[0].join(' ')}C${LEAF_CURVES[1].join(' ')}Z`;

const noise = (i, k) => {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

// Without a seat limit the wreath aims for the next round number, then re-lays itself.
export function slotsFor(count, capacity) {
  if (capacity) return Math.max(capacity, count);
  return STEPS.find((s) => s >= count) ?? count;
}

export function leafAt(i, slots) {
  const side = i % 2 ? -1 : 1;
  const perSide = Math.max(1, Math.ceil(slots / 2));
  const k = Math.floor(i / 2);
  const a = ((START_DEG + ((k + 0.5) / perSide) * SWEEP_DEG) * Math.PI) / 180;
  const spacing = (R * (SWEEP_DEG * Math.PI)) / 180 / perSide;
  const length = Math.min(33, Math.max(9, spacing * 3.4));
  // A sparse wreath grows straight off the stem; a crowded one needs extra rows to fit.
  const crowd = Math.min(1, Math.max(0, (perSide - 18) / 50));
  const r = R + crowd * (ROWS[k % 3] * 12 + (noise(i, 1) - 0.5) * 2.4);
  const lean = k % 2 ? -1 : 1;
  const heading = (Math.atan2(-Math.sin(a), side * Math.cos(a)) * 180) / Math.PI;
  const splay = side * (lean * 31 + (noise(i, 3) - 0.5) * 12);
  return {
    x: C + side * r * Math.sin(a),
    y: C + r * Math.cos(a),
    rot: heading + splay,
    len: length * (0.9 + noise(i, 4) * 0.18),
  };
}

const arcPoint = (deg, side) => {
  const a = (deg * Math.PI) / 180;
  return [C + side * R * Math.sin(a), C + R * Math.cos(a)];
};

// The stem as points, for drawing it where SVG paths aren't available.
export function stemPoints(side, grown, steps = 48) {
  const from = START_DEG * 0.2;
  const to = from + (START_DEG + SWEEP_DEG - from) * grown;
  return Array.from({ length: steps + 1 }, (_, n) => arcPoint(from + ((to - from) * n) / steps, side));
}

function stemPath(side) {
  const [x0, y0] = arcPoint(START_DEG * 0.2, side);
  const [x1, y1] = arcPoint(START_DEG + SWEEP_DEG, side);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${R} ${R} 0 0 ${side > 0 ? 0 : 1} ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}, parent) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  parent?.appendChild(el);
  return el;
};

const FILL = { coming: 'url(#leaf-gold)', waiting: 'url(#leaf-sage)', over: 'url(#leaf-rose)' };
const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function createWreath(host) {
  const svg = svgEl('svg', { viewBox: `0 0 ${SIZE} ${SIZE}`, class: 'wreath-svg', 'aria-hidden': 'true' });
  const defs = svgEl('defs', {}, svg);
  const gradient = (id, stops) => {
    const g = svgEl('linearGradient', { id, x1: '0', y1: '0', x2: '1', y2: '0.25' }, defs);
    stops.forEach(([offset, color]) => svgEl('stop', { offset, 'stop-color': color }, g));
  };
  gradient('leaf-gold', [['0', '#8f6f2c'], ['0.5', '#e4c777'], ['1', '#b8924a']]);
  gradient('leaf-sage', [['0', '#3f6350'], ['1', '#6d9079']]);
  gradient('leaf-rose', [['0', '#a8405a'], ['1', '#ec9fae']]);

  svgEl('circle', { cx: C, cy: C, r: R, class: 'wreath-track' }, svg);
  const stems = [1, -1].map((side) => svgEl('path', { d: stemPath(side), class: 'wreath-stem', pathLength: '1' }, svg));
  const leavesLayer = svgEl('g', {}, svg);
  const fallingLayer = svgEl('g', {}, svg);
  const knot = svgEl('g', { class: 'wreath-knot' }, svg);
  svgEl('path', { d: `M${C} ${C + R}c-9 -7 -19 -6 -19 0s10 7 19 0c9 -7 19 -6 19 0s-10 7 -19 0Z` }, knot);
  svgEl('path', { d: `M${C - 2} ${C + R + 1}l-8 15M${C + 2} ${C + R + 1}l8 15`, class: 'wreath-tails' }, knot);
  host.prepend(svg);

  const leaves = [];
  let lastSlots = 0;

  const place = (g, spot) => {
    g.style.transform = `translate(${spot.x.toFixed(2)}px,${spot.y.toFixed(2)}px) rotate(${spot.rot.toFixed(1)}deg) scale(${spot.len.toFixed(2)})`;
  };

  const shed = (node) => {
    node.remove();
    if (reducedMotion() || !node.animate) return;
    const start = node.style.transform;
    fallingLayer.appendChild(node);
    node.style.transition = 'none';
    const drift = (Math.random() - 0.5) * 50;
    const anim = node.animate(
      [
        { transform: start, opacity: 1 },
        { transform: `translate(${drift}px,${90 + Math.random() * 50}px) ${start} rotate(${80 + Math.random() * 120}deg)`, opacity: 0 },
      ],
      { duration: 800 + Math.random() * 400, easing: 'cubic-bezier(.45,.05,.8,.5)', fill: 'forwards' }
    );
    anim.onfinish = () => node.remove();
  };

  return {
    // count: people to show, coming: how many are gold, capacity: seats or null.
    update({ count, coming, capacity }) {
      const slots = Math.max(slotsFor(count, capacity), 1);
      const relay = slots !== lastSlots && lastSlots !== 0;
      const shown = Math.min(count, 5000);

      // Falling first, so the removed leaves leave from where they were.
      while (leaves.length > shown) shed(leaves.pop().g);

      const fresh = shown - leaves.length;
      const stagger = fresh > 1 ? Math.min(14, 900 / fresh) : 0;
      let born = 0;
      while (leaves.length < shown) {
        const g = svgEl('g', { class: 'leaf' }, leavesLayer);
        const blade = svgEl('path', { d: LEAF_PATH, class: 'blade' }, g);
        place(g, leafAt(leaves.length, slots));
        if (fresh > 400) blade.style.animation = 'none'; // past this, phones would stutter
        else if (!reducedMotion()) blade.style.animationDelay = `${born * stagger}ms`;
        leaves.push({ g, blade, fill: '' });
        born += 1;
      }

      leaves.forEach((leaf, i) => {
        if (relay) place(leaf.g, leafAt(i, slots));
        const kind = capacity && i >= capacity ? 'over' : i < coming ? 'coming' : 'waiting';
        if (leaf.fill !== kind) {
          leaf.blade.setAttribute('fill', FILL[kind]);
          leaf.fill = kind;
        }
      });

      const grown = Math.min(1, shown / slots);
      stems.forEach((s) => {
        s.style.strokeDashoffset = String(1 - grown);
      });
      host.classList.toggle('is-full', !!capacity && count === capacity);
      host.classList.toggle('is-over', !!capacity && count > capacity);
      lastSlots = slots;
    },
  };
}

// The little digit reels. Two of these show the same number: big and in the bar.
export function createOdometer(host) {
  const reels = [];

  const addReel = () => {
    const digit = document.createElement('span');
    digit.className = 'odo-digit';
    const reel = document.createElement('span');
    reel.className = 'odo-reel';
    for (let n = 0; n <= 9; n++) {
      const face = document.createElement('span');
      face.textContent = n;
      reel.appendChild(face);
    }
    digit.appendChild(reel);
    host.prepend(digit);
    return { digit, reel, value: 0 };
  };

  return {
    set(value) {
      const digits = String(Math.max(0, value)).split('').reverse().map(Number);
      while (reels.length < digits.length) reels.push(addReel());
      while (reels.length > digits.length) reels.pop().digit.remove();
      host.dataset.len = String(digits.length);
      digits.forEach((d, i) => {
        reels[i].reel.style.transform = `translateY(${-d * 10}%)`;
        reels[i].value = d;
      });
    },
  };
}
