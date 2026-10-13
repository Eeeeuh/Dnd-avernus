/* Génération déterministe du désert d'Averne (UMD, partagée serveur / client).
 * Même graine => même carte partout. Retourne uniquement des données (JSON). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MapGen = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function catmull(pts, per) {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, pts.length - 1)];
      for (let k = 0; k < per; k++) {
        const t = k / per, t2 = t * t, t3 = t2 * t;
        const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        out.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y), w: f(p0.w, p1.w, p2.w, p3.w) });
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  function distToPoly(poly, x, y) {
    let best = Infinity, bw = 0;
    for (let i = 0; i < poly.length - 1; i++) {
      const a = poly[i], b = poly[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y;
      const l2 = dx * dx + dy * dy || 1;
      let t = ((x - a.x) * dx + (y - a.y) * dy) / l2;
      t = Math.max(0, Math.min(1, t));
      const px = a.x + dx * t, py = a.y + dy * t;
      const d = Math.hypot(x - px, y - py);
      const w = a.w + (b.w - a.w) * t;
      if (d - w / 2 < best - bw / 2) { best = d; bw = w; }
    }
    return { d: best, w: bw, edge: best - bw / 2 };
  }

  function generate(seed, cols, rows) {
    const rnd = mulberry32(seed >>> 0);
    const R = (a, b) => a + rnd() * (b - a);
    const C = cols, Rw = rows;

    // --- Rivières de lave ---
    const rawA = [[0.52, -0.06, 3.2], [0.60, 0.10, 3.8], [0.56, 0.22, 3.0], [0.70, 0.31, 4.2], [0.88, 0.27, 3.4], [1.06, 0.36, 3.0]];
    const rawB = [[-0.06, 0.80, 3.0], [0.10, 0.88, 3.8], [0.21, 0.79, 3.2], [0.33, 0.90, 4.4], [0.42, 1.06, 3.2]];
    const lava = [rawA, rawB].map((r) =>
      catmull(r.map((p) => ({ x: p[0] * C + R(-1, 1), y: p[1] * Rw + R(-1, 1), w: p[2] })), 10)
    );

    // --- Rochers (obstacles) ---
    const rocks = [];
    const tooClose = (x, y, rad) =>
      rocks.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + rad + 1.2) ||
      lava.some((l) => distToPoly(l, x, y).edge < rad + 1.5) ||
      // couloirs de départ (carré libre autour des deux points d'apparition)
      Math.hypot(x - C * 0.18, y - Rw * 0.52) < 9 ||
      Math.hypot(x - C * 0.84, y - Rw * 0.46) < 9;
    const mkRock = (x, y, r) => {
      const n = 9 + Math.floor(rnd() * 4);
      const pts = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const rr = r * (0.72 + rnd() * 0.42);
        pts.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr });
      }
      return { x, y, r, pts, seed: Math.floor(rnd() * 1e9) };
    };
    // cadre : éperons le long des bords hauts/bas (canyon)
    for (let i = 0; i < 26; i++) {
      const top = i % 2 === 0;
      const x = R(1, C - 1);
      const y = top ? R(0.4, 2.4) : R(Rw - 2.4, Rw - 0.4);
      const r = R(1.2, 2.6);
      if (!tooClose(x, y, r)) rocks.push(mkRock(x, y, r));
    }
    // cover au centre : à contourner en pleine course
    const fixed = [
      [C * 0.50, Rw * 0.36, 1.7], [C * 0.44, Rw * 0.62, 1.4], [C * 0.58, Rw * 0.66, 2.0],
      [C * 0.34, Rw * 0.30, 1.2], [C * 0.66, Rw * 0.50, 1.5],
    ];
    for (const [x, y, r] of fixed) rocks.push(mkRock(x, y, r));
    for (let i = 0; i < 18; i++) {
      const x = R(2, C - 2), y = R(5, Rw - 5), r = R(0.7, 1.5);
      if (!tooClose(x, y, r)) rocks.push(mkRock(x, y, r));
    }

    // --- Cratères, ossements, épaves, ornières ---
    const craters = [];
    for (let i = 0; i < 14; i++) {
      const x = R(2, C - 2), y = R(3, Rw - 3), r = R(0.9, 2.8);
      if (!rocks.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + r) && lava.every((l) => distToPoly(l, x, y).edge > r))
        craters.push({ x, y, r, seed: Math.floor(rnd() * 1e9) });
    }
    const bones = [];
    for (let i = 0; i < 46; i++) {
      bones.push({ x: R(1, C - 1), y: R(1, Rw - 1), a: R(0, 360), k: Math.floor(rnd() * 4), s: R(0.5, 1.2) });
    }
    const wrecks = [];
    const wreckSpots = [[0.30, 0.18], [0.72, 0.78], [0.47, 0.84], [0.86, 0.62], [0.12, 0.25]];
    for (const [fx, fy] of wreckSpots) {
      const x = fx * C + R(-2, 2), y = fy * Rw + R(-1.5, 1.5);
      if (lava.every((l) => distToPoly(l, x, y).edge > 2.5))
        wrecks.push({ x, y, r: R(0, 360), burning: rnd() < 0.7, seed: Math.floor(rnd() * 1e9) });
    }
    const ruts = [];
    for (let k = 0; k < 3; k++) {
      const y0 = Rw * (0.4 + k * 0.09) + R(-1, 1);
      const pts = [];
      for (let i = 0; i <= 12; i++) pts.push({ x: (i / 12) * C, y: y0 + Math.sin(i * 0.7 + k) * 2.2 + R(-0.3, 0.3), w: 0.35 });
      ruts.push(catmull(pts, 4));
    }

    return {
      seed, cols: C, rows: Rw,
      lava, rocks, craters, bones, wrecks, ruts,
      spawn: { party: { x: C * 0.18, y: Rw * 0.52, r: 0 }, enemy: { x: C * 0.84, y: Rw * 0.46, r: 180 } },
    };
  }

  function inLava(map, x, y, pad = 0) {
    for (const l of map.lava) if (distToPoly(l, x, y).edge < pad) return true;
    return false;
  }
  function hitRock(map, x, y, rad) {
    for (const o of map.rocks) if (Math.hypot(o.x - x, o.y - y) < o.r * 0.82 + rad) return o;
    return null;
  }

  return { generate, mulberry32, inLava, hitRock, distToPoly, catmull };
});
