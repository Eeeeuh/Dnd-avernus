/* Règles géométriques partagées client / serveur (UMD).
 * Unités : 1 unité = 1 case = 1,5 m / 5 ft. Cap en degrés : 0 = est, sens horaire (y vers le bas).
 * Repère local d'un véhicule : +x = avant, +y = tribord (droite).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Rules = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const RAD = Math.PI / 180;

  function norm180(a) {
    a = ((a + 180) % 360 + 360) % 360 - 180;
    return a;
  }
  function angDiff(a, b) {
    return norm180(b - a);
  }
  function rot(x, y, deg) {
    const c = Math.cos(deg * RAD), s = Math.sin(deg * RAD);
    return { x: x * c - y * s, y: x * s + y * c };
  }
  // local (avant, tribord) -> monde
  function toWorld(v, lx, ly) {
    const p = rot(lx, ly, v.r);
    return { x: v.x + p.x, y: v.y + p.y };
  }
  // monde -> local
  function toLocal(v, x, y) {
    const p = rot(x - v.x, y - v.y, -v.r);
    return { lx: p.x, ly: p.y };
  }
  // un point est-il sur la coque ? (rectangle len x wid, coins légèrement arrondis)
  function inHull(v, x, y, pad = 0) {
    const l = toLocal(v, x, y);
    return Math.abs(l.lx) <= v.len / 2 + pad && Math.abs(l.ly) <= v.wid / 2 + pad;
  }
  // distance du point au bord de la coque (0 si dedans)
  function hullDist(v, x, y) {
    const l = toLocal(v, x, y);
    const dx = Math.max(Math.abs(l.lx) - v.len / 2, 0);
    const dy = Math.max(Math.abs(l.ly) - v.wid / 2, 0);
    return Math.hypot(dx, dy);
  }
  // distance entre deux jetons (bord à bord, en cases)
  function gap(a, b) {
    const ra = a.kind === 'vehicle' ? null : (a.size || 1) / 2;
    const rb = b.kind === 'vehicle' ? null : (b.size || 1) / 2;
    if (a.kind === 'vehicle' && b.kind === 'vehicle') {
      // échantillonne le contour de b contre la coque de a
      let best = Infinity;
      const pts = hullSamples(b);
      for (const p of pts) best = Math.min(best, hullDist(a, p.x, p.y));
      return best;
    }
    if (a.kind === 'vehicle') return Math.max(hullDist(a, b.x, b.y) - rb, 0);
    if (b.kind === 'vehicle') return Math.max(hullDist(b, a.x, a.y) - ra, 0);
    return Math.max(Math.hypot(a.x - b.x, a.y - b.y) - ra - rb, 0);
  }
  function hullSamples(v) {
    const pts = [];
    const nx = 6, ny = 5;
    for (let i = 0; i <= nx; i++) {
      for (let j = 0; j <= ny; j++) {
        if (i !== 0 && i !== nx && j !== 0 && j !== ny) continue;
        const lx = (i / nx - 0.5) * v.len, ly = (j / ny - 0.5) * v.wid;
        pts.push(toWorld(v, lx, ly));
      }
    }
    return pts;
  }

  /* Coût de déplacement d'un véhicule.
   * Un véhicule roule vers l'avant (ou en marche arrière, coût doublé), jamais en crabe.
   * Chaque tranche de 45° de virage coûte 1 case (au prorata). */
  function vehicleMoveCost(v, nx, ny, nr) {
    const dx = nx - v.x, dy = ny - v.y;
    const dist = Math.hypot(dx, dy);
    const turn = Math.abs(angDiff(v.r, nr));
    const turnCost = turn <= 2 ? 0 : turn / 45;
    if (dist < 0.05) return { ok: true, cost: turnCost, dist: 0, turnCost, dir: 'none' };
    const dirAng = Math.atan2(dy, dx) / RAD;
    const fwd = Math.min(Math.abs(angDiff(dirAng, v.r)), Math.abs(angDiff(dirAng, nr)));
    const back = Math.min(Math.abs(angDiff(dirAng + 180, v.r)), Math.abs(angDiff(dirAng + 180, nr)));
    if (fwd <= 55) return { ok: true, cost: dist + turnCost, dist, turnCost, dir: 'fwd' };
    if (back <= 55) return { ok: true, cost: dist * 2 + turnCost, dist, turnCost, dir: 'back' };
    return { ok: false, cost: dist + turnCost, dist, turnCost, dir: 'side', reason: "Un véhicule ne dérape pas en crabe : avancez dans l'axe ou reculez." };
  }

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  return { RAD, norm180, angDiff, rot, toWorld, toLocal, inHull, hullDist, hullSamples, gap, vehicleMoveCost, dist, clamp };
});
