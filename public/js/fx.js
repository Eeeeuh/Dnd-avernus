/* Effets visuels : particules, projectiles, ondes de choc, textes flottants, secousses d'écran.
 * Tout est exprimé en coordonnées monde (cases) ; draw() convertit vers l'écran. */
(function () {
  const MAX = 2200;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const lerp = (a, b, t) => a + (b - a) * t;
  const col = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

  const FX = {
    parts: [], texts: [], proj: [], rings: [], embers: [], decals: [],
    shakeAmp: 0, wind: { x: 0.9, y: -0.35 }, reduced: false, W: 1, H: 1,

    initEmbers(W, H) {
      this.W = W; this.H = H;
      this.embers = [];
      for (let i = 0; i < 70; i++) this.embers.push({ x: Math.random() * W, y: Math.random() * H, s: rnd(0.6, 2.4), v: rnd(10, 40), ph: Math.random() * 6.28 });
    },

    shake(a) { this.shakeAmp = Math.min(40, Math.max(this.shakeAmp, this.reduced ? a * 0.25 : a)); },
    shakeOffset() {
      if (this.shakeAmp < 0.2) return { x: 0, y: 0 };
      return { x: rnd(-1, 1) * this.shakeAmp, y: rnd(-1, 1) * this.shakeAmp };
    },

    push(p) { if (this.parts.length < MAX) this.parts.push(p); },

    smoke(x, y, n = 1, o = {}) {
      for (let i = 0; i < n; i++) this.push({ k: 'smoke', x: x + rnd(-0.1, 0.1), y: y + rnd(-0.1, 0.1), vx: this.wind.x * rnd(0.3, 1) + (o.vx || 0) + rnd(-0.2, 0.2), vy: this.wind.y * rnd(0.3, 1) + (o.vy || 0) + rnd(-0.2, 0.2), life: 0, max: rnd(1.2, 2.2) * (o.long || 1), r0: o.r0 || 0.18, r1: o.r1 || rnd(0.7, 1.2), a0: o.a || 0.38, c: o.c || [46, 40, 38], c1: o.c1 || [10, 8, 8] });
    },
    fire(x, y, n = 1, o = {}) {
      for (let i = 0; i < n; i++) this.push({ k: 'fire', add: true, x: x + rnd(-0.12, 0.12), y: y + rnd(-0.12, 0.12), vx: rnd(-0.5, 0.5) + (o.vx || 0), vy: rnd(-0.6, 0.2) + (o.vy || 0), life: 0, max: rnd(0.35, 0.7), r0: o.r0 || 0.24, r1: 0.03, a0: o.a || 0.9, c: o.c || [255, 190, 70], c1: o.c1 || [220, 40, 10] });
    },
    spark(x, y, n = 6, o = {}) {
      for (let i = 0; i < n; i++) {
        const a = o.dir !== undefined ? o.dir + rnd(-(o.spread || 0.9), (o.spread || 0.9)) : rnd(0, 6.283), s = rnd(3, 9) * (o.speed || 1);
        this.push({ k: 'spark', add: true, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: rnd(0.2, 0.45), len: rnd(0.12, 0.3), a0: 1, c: o.c || [255, 220, 130], drag: 3 });
      }
    },
    dust(x, y, n = 1, o = {}) {
      for (let i = 0; i < n; i++) this.push({ k: 'smoke', x: x + rnd(-0.15, 0.15), y: y + rnd(-0.15, 0.15), vx: this.wind.x * 0.6 + rnd(-0.3, 0.3), vy: this.wind.y * 0.4 + rnd(-0.3, 0.3), life: 0, max: rnd(0.8, 1.5), r0: 0.2, r1: o.r1 || 0.9, a0: o.a || 0.22, c: [150, 82, 52], c1: [120, 60, 40] });
    },
    debris(x, y, n = 8, o = {}) {
      for (let i = 0; i < n; i++) {
        const a = rnd(0, 6.283), s = rnd(2, 8) * (o.speed || 1);
        this.push({ k: 'debris', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: rnd(0.6, 1.3), size: rnd(0.07, 0.2), rot: rnd(0, 6.28), vr: rnd(-12, 12), a0: 1, c: o.c || [rnd(40, 110), rnd(30, 70), rnd(26, 60)], drag: 2.2 });
      }
    },
    ring(x, y, r1 = 3, o = {}) { this.rings.push({ x, y, life: 0, max: o.max || 0.55, r0: o.r0 || 0.2, r1, c: o.c || [255, 170, 80], w: o.w || 0.18 }); },
    flash(x, y, r = 3, o = {}) { this.push({ k: 'flash', add: true, x, y, vx: 0, vy: 0, life: 0, max: o.max || 0.22, r0: r * 0.4, r1: r, a0: o.a || 0.95, c: o.c || [255, 220, 150], c1: o.c1 || [255, 90, 20] }); },

    explosion(x, y, scale = 1) {
      this.flash(x, y, 4.5 * scale, { max: 0.3 });
      this.ring(x, y, 5 * scale, { max: 0.7 });
      this.ring(x, y, 3 * scale, { max: 0.45, c: [255, 240, 200], w: 0.3 });
      this.fire(x, y, Math.round(36 * scale), { r0: 0.55 * scale });
      this.smoke(x, y, Math.round(18 * scale), { r1: 1.8 * scale, a: 0.5, long: 1.8 });
      this.spark(x, y, Math.round(34 * scale), { speed: 1.5 });
      this.debris(x, y, Math.round(26 * scale), { speed: 1.4 });
      this.shake(18 * scale);
      this.decals.push({ x, y, r: 2.3 * scale });
    },
    impact(x, y, dir, o = {}) {
      this.spark(x, y, o.n || 9, { dir, spread: 1.1, c: o.c });
      this.flash(x, y, 1.1, { max: 0.12, a: 0.8 });
      this.debris(x, y, 3, { speed: 0.6 });
      this.ring(x, y, 0.9, { max: 0.25, w: 0.1 });
    },

    text(x, y, str, o = {}) {
      this.texts.push({ x, y, str, life: 0, max: o.max || 1.35, vy: o.vy !== undefined ? o.vy : -1.2, size: o.size || 26, color: o.color || '#fff', outline: o.outline || '#1a0805', crit: !!o.crit, dx: o.dx || rnd(-0.3, 0.3) });
    },

    // projectile : { kind: 'harpoon'|'bolt'|'fireball'|'ram', from, to, dur, onHit }
    projectile(o) {
      this.proj.push(Object.assign({ t: 0, dur: 0.35 }, o));
    },
    ray(from, to, o = {}) { this.proj.push({ kind: 'ray', from, to, t: 0, dur: o.dur || 0.3, onHit: o.onHit, hit: false }); },

    update(dt) {
      this.shakeAmp *= Math.pow(0.0008, dt);
      const ps = this.parts;
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.life += dt;
        if (p.life >= p.max) { ps.splice(i, 1); continue; }
        if (p.drag) { const f = Math.exp(-p.drag * dt); p.vx *= f; p.vy *= f; }
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.vr) p.rot += p.vr * dt;
      }
      for (let i = this.texts.length - 1; i >= 0; i--) { const t = this.texts[i]; t.life += dt; t.y += t.vy * dt; t.x += t.dx * dt; t.vy *= Math.pow(0.35, dt); if (t.life >= t.max) this.texts.splice(i, 1); }
      for (let i = this.rings.length - 1; i >= 0; i--) { const r = this.rings[i]; r.life += dt; if (r.life >= r.max) this.rings.splice(i, 1); }
      for (let i = this.proj.length - 1; i >= 0; i--) {
        const p = this.proj[i];
        p.t += dt;
        const u = Math.min(1, p.t / p.dur);
        p.x = lerp(p.from.x, p.to.x, u); p.y = lerp(p.from.y, p.to.y, u);
        if (p.kind === 'fireball' || p.kind === 'bolt') { this.fire(p.x, p.y, 1, { r0: 0.18 }); if (p.kind === 'fireball') this.smoke(p.x, p.y, 1, { r0: 0.1, r1: 0.5, a: 0.2 }); }
        if (p.kind === 'harpoon') this.spark(p.x, p.y, 1, { dir: Math.atan2(p.from.y - p.to.y, p.from.x - p.to.x), spread: 0.3, speed: 0.5 });
        if (u >= 1 && !p.hit) { p.hit = true; if (p.onHit) p.onHit(); }
        if (p.t >= p.dur + (p.kind === 'ray' ? 0.25 : 0)) this.proj.splice(i, 1);
      }
      for (const e of this.embers) {
        e.x += (e.v * 0.6 + Math.sin(e.ph + e.y * 0.01) * 6) * dt; e.y -= e.v * dt * 0.7;
        if (e.y < -10 || e.x > this.W + 10) { e.x = Math.random() * this.W - 40; e.y = this.H + 10; }
      }
    },

    // dessine les particules en espace écran. w2s(x,y) -> [sx,sy] ; z = px/case
    draw(ctx, w2s, z) {
      // anneaux
      for (const r of this.rings) {
        const u = r.life / r.max, p = w2s(r.x, r.y);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = col(r.c, (1 - u) * 0.85); ctx.lineWidth = Math.max(1, r.w * z * (1 - u * 0.7));
        ctx.beginPath(); ctx.arc(p[0], p[1], Math.max(1, (r.r0 + (r.r1 - r.r0) * (1 - Math.pow(1 - u, 2.2))) * z), 0, 6.2832); ctx.stroke(); ctx.restore();
      }
      // particules
      let add = false;
      for (const pass of [false, true]) {
        ctx.save();
        if (pass) ctx.globalCompositeOperation = 'lighter';
        for (const p of this.parts) {
          if (!!p.add !== pass) continue;
          const u = p.life / p.max, s = w2s(p.x, p.y);
          if (p.k === 'smoke' || p.k === 'fire' || p.k === 'flash') {
            const r = Math.max(0.5, (lerp(p.r0, p.r1, p.k === 'smoke' ? Math.sqrt(u) : u)) * z);
            const c = mixc(p.c, p.c1 || p.c, u);
            const a = p.a0 * (p.k === 'smoke' ? (1 - u) * Math.min(1, u * 8) : (1 - u));
            if (p.k === 'flash') {
              const g = ctx.createRadialGradient(s[0], s[1], 0, s[0], s[1], r);
              g.addColorStop(0, col(c, a)); g.addColorStop(1, col(p.c1, 0)); ctx.fillStyle = g;
            } else ctx.fillStyle = col(c, a);
            ctx.beginPath(); ctx.arc(s[0], s[1], r, 0, 6.2832); ctx.fill();
          } else if (p.k === 'spark') {
            const sp = Math.hypot(p.vx, p.vy) || 1;
            const tail = w2s(p.x - (p.vx / sp) * p.len, p.y - (p.vy / sp) * p.len);
            ctx.strokeStyle = col(p.c, (1 - u) * p.a0); ctx.lineWidth = Math.max(1, 0.05 * z);
            ctx.beginPath(); ctx.moveTo(s[0], s[1]); ctx.lineTo(tail[0], tail[1]); ctx.stroke();
          } else if (p.k === 'debris') {
            ctx.save(); ctx.translate(s[0], s[1]); ctx.rotate(p.rot); ctx.fillStyle = col(p.c, (1 - u * u) * p.a0);
            const sz = p.size * z; ctx.fillRect(-sz / 2, -sz / 3, sz, sz * 0.66); ctx.restore();
          }
        }
        ctx.restore();
      }
      // projectiles
      for (const p of this.proj) {
        const s = w2s(p.x || p.from.x, p.y || p.from.y);
        ctx.save(); ctx.lineCap = 'round';
        if (p.kind === 'harpoon') {
          const a = Math.atan2(p.to.y - p.from.y, p.to.x - p.from.x), tail = w2s(p.x - Math.cos(a) * 1.0, p.y - Math.sin(a) * 1.0);
          ctx.strokeStyle = '#d8ccb0'; ctx.lineWidth = Math.max(2, 0.09 * z); ctx.beginPath(); ctx.moveTo(tail[0], tail[1]); ctx.lineTo(s[0], s[1]); ctx.stroke();
          ctx.fillStyle = '#f3e8cc'; ctx.translate(s[0], s[1]); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(0.2 * z, 0); ctx.lineTo(-0.1 * z, -0.16 * z); ctx.lineTo(-0.1 * z, 0.16 * z); ctx.closePath(); ctx.fill();
        } else if (p.kind === 'bolt') {
          const a = Math.atan2(p.to.y - p.from.y, p.to.x - p.from.x), tail = w2s(p.x - Math.cos(a) * 0.6, p.y - Math.sin(a) * 0.6);
          ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(255,230,160,0.9)'; ctx.lineWidth = Math.max(1.5, 0.06 * z); ctx.beginPath(); ctx.moveTo(tail[0], tail[1]); ctx.lineTo(s[0], s[1]); ctx.stroke();
        } else if (p.kind === 'fireball') {
          ctx.globalCompositeOperation = 'lighter';
          const g = ctx.createRadialGradient(s[0], s[1], 0, s[0], s[1], 0.5 * z); g.addColorStop(0, 'rgba(255,240,180,1)'); g.addColorStop(0.4, 'rgba(255,130,30,0.8)'); g.addColorStop(1, 'rgba(255,40,0,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s[0], s[1], 0.5 * z, 0, 6.2832); ctx.fill();
        } else if (p.kind === 'ray') {
          const a = w2s(p.from.x, p.from.y), b = w2s(p.to.x, p.to.y), u = p.t / (p.dur + 0.25);
          ctx.globalCompositeOperation = 'lighter';
          for (const [w, c] of [[0.5, 'rgba(255,60,10,'], [0.25, 'rgba(255,150,40,'], [0.09, 'rgba(255,245,200,']]) {
            ctx.strokeStyle = c + (1 - u) * 0.9 + ')'; ctx.lineWidth = Math.max(1, w * z * (1 - u * 0.5));
            ctx.beginPath(); ctx.moveTo(a[0], a[1]);
            const n = 7; for (let i = 1; i < n; i++) { const t = i / n; ctx.lineTo(lerp(a[0], b[0], t) + rnd(-0.12, 0.12) * z, lerp(a[1], b[1], t) + rnd(-0.12, 0.12) * z); }
            ctx.lineTo(b[0], b[1]); ctx.stroke();
          }
        }
        ctx.restore();
      }
      // textes flottants
      for (const t of this.texts) {
        const u = t.life / t.max, s = w2s(t.x, t.y);
        const pop = u < 0.12 ? 0.6 + (u / 0.12) * 0.55 : 1.15 - Math.min(0.15, (u - 0.12) * 0.4);
        const size = Math.max(14, t.size * Math.min(1.4, z / 46) * pop) * (t.crit ? 1.35 : 1);
        ctx.save(); ctx.globalAlpha = u > 0.65 ? 1 - (u - 0.65) / 0.35 : 1;
        ctx.font = `700 ${size}px Teko, "Arial Narrow", Impact, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = Math.max(3, size * 0.16); ctx.strokeStyle = t.outline; ctx.lineJoin = 'round';
        ctx.strokeText(t.str, s[0], s[1]); ctx.fillStyle = t.color; ctx.fillText(t.str, s[0], s[1]); ctx.restore();
      }
    },

    drawEmbers(ctx, t) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const e of this.embers) {
        const a = 0.25 + 0.35 * Math.sin(t * 3 + e.ph);
        ctx.fillStyle = `rgba(255,${120 + (e.s * 40) | 0},40,${Math.max(0.05, a)})`;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.s, 0, 6.2832); ctx.fill();
      }
      ctx.restore();
    },
  };
  window.FX = FX;
})();
