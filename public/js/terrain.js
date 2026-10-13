/* Rendu du terrain d'Averne : désert rouge fissuré, lave, rochers, ossements, épaves.
 * Généré une fois dans un canvas hors-écran (async, par tranches pour ne pas figer l'écran). */
(function () {
  const CP = 52;      // pixels par case dans le canvas final
  const LOW = 0.5;    // facteur de résolution du bruit de fond

  function hash(x, y, s) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 2147483647);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = h ^ (h >>> 16);
    return (h >>> 0) / 4294967296;
  }
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  function vnoise(x, y, s) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
    const u = fade(xf), v = fade(yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, s) {
    return vnoise(x, y, s) * 0.5 + vnoise(x * 2.03, y * 2.03, s + 7) * 0.25 + vnoise(x * 4.1, y * 4.1, s + 13) * 0.15 + vnoise(x * 8.3, y * 8.3, s + 29) * 0.1;
  }
  // Worley : F2 - F1 (arêtes de cellules => fissures)
  function worleyEdge(x, y, s) {
    const xi = Math.floor(x), yi = Math.floor(y);
    let f1 = 9, f2 = 9;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = xi + i, cy = yi + j;
      const px = cx + hash(cx, cy, s), py = cy + hash(cx, cy, s + 91);
      const d = Math.hypot(px - x, py - y);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
    }
    return f2 - f1;
  }
  const mix = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  function pathPoly(ctx, pts, ox, oy, k = 1) {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(ox + p.x * k, oy + p.y * k) : ctx.moveTo(ox + p.x * k, oy + p.y * k)));
    ctx.closePath();
  }

  async function build(geo, cols, rows, onProgress) {
    const W = Math.round(cols * CP), H = Math.round(rows * CP);
    const out = document.createElement('canvas');
    out.width = W; out.height = H;
    const ctx = out.getContext('2d');

    // 1. sol : bruit + fissures, à demi-résolution
    const lw = Math.round(W * LOW), lh = Math.round(H * LOW);
    const low = document.createElement('canvas');
    low.width = lw; low.height = lh;
    const lctx = low.getContext('2d');
    const img = lctx.createImageData(lw, lh);
    const d = img.data;
    const cellLow = CP * LOW;
    const S = geo.seed || 1;
    const rowsPerChunk = 24;
    for (let y0 = 0; y0 < lh; y0 += rowsPerChunk) {
      const y1 = Math.min(lh, y0 + rowsPerChunk);
      for (let y = y0; y < y1; y++) {
        for (let x = 0; x < lw; x++) {
          const wx = x / cellLow, wy = y / cellLow; // coordonnées en cases
          const n = fbm(wx * 0.18, wy * 0.18, S);
          const dune = 0.5 + 0.5 * Math.sin(wx * 0.55 + wy * 0.22 + fbm(wx * 0.12, wy * 0.12, S + 3) * 9);
          const crack = sstep(0.02, 0.2, worleyEdge(wx * 0.34, wy * 0.34, S + 5));
          const fine = vnoise(wx * 5, wy * 5, S + 41);
          let t = 0.28 + n * 0.55 + dune * 0.17;
          // palette : cendre rouge sombre -> terre brûlée -> crêtes de braise
          let r, g, b;
          if (t < 0.55) { const u = t / 0.55; r = mix(58, 128, u); g = mix(20, 40, u); b = mix(16, 28, u); }
          else { const u = Math.min(1, (t - 0.55) / 0.45); r = mix(128, 196, u); g = mix(40, 84, u); b = mix(28, 44, u); }
          const k = 0.5 + 0.5 * crack;
          r *= k; g *= k; b *= k;
          // lueur dans les fissures
          const glow = (1 - crack) * 0.55;
          r += glow * 70; g += glow * 22;
          const sp = (fine - 0.5) * 22;
          const i = (y * lw + x) * 4;
          d[i] = Math.max(0, Math.min(255, r + sp));
          d[i + 1] = Math.max(0, Math.min(255, g + sp * 0.4));
          d[i + 2] = Math.max(0, Math.min(255, b + sp * 0.3));
          d[i + 3] = 255;
        }
      }
      if (onProgress) onProgress(y1 / lh * 0.8);
      await new Promise((r) => setTimeout(r, 0));
    }
    lctx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(low, 0, 0, W, H);

    const rnd = rng(S * 7 + 3);
    const px = (v) => v * CP;

    // 2. taches de suie
    for (let i = 0; i < 70; i++) {
      const x = rnd() * W, y = rnd() * H, r = (0.8 + rnd() * 2.8) * CP;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(10,4,3,0.32)'); g.addColorStop(1, 'rgba(10,4,3,0)');
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    // 3. ornières (pistes de véhicules)
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const rut of geo.ruts) {
      for (const off of [-0.55, 0.55]) {
        ctx.beginPath();
        rut.forEach((p, i) => (i ? ctx.lineTo(px(p.x), px(p.y + off)) : ctx.moveTo(px(p.x), px(p.y + off))));
        ctx.strokeStyle = 'rgba(22,8,5,0.30)'; ctx.lineWidth = CP * 0.26; ctx.stroke();
        ctx.strokeStyle = 'rgba(255,160,90,0.05)'; ctx.lineWidth = CP * 0.1; ctx.stroke();
      }
    }
    ctx.restore();

    // 4. cratères
    for (const c of geo.craters) {
      const x = px(c.x), y = px(c.y), r = px(c.r);
      const g = ctx.createRadialGradient(x, y, r * 0.15, x, y, r);
      g.addColorStop(0, 'rgba(8,3,2,0.78)'); g.addColorStop(0.7, 'rgba(26,10,6,0.55)'); g.addColorStop(1, 'rgba(26,10,6,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.92, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,150,90,0.16)'; ctx.lineWidth = CP * 0.07;
      ctx.beginPath(); ctx.ellipse(x - r * 0.04, y - r * 0.05, r * 0.82, r * 0.76, 0, Math.PI * 1.05, Math.PI * 1.75); ctx.stroke();
    }
    if (onProgress) onProgress(0.86);
    await new Promise((r) => setTimeout(r, 0));

    // 5. lave : croûte sombre, cœur incandescent
    for (const poly of geo.lava) {
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const strokeVar = (k, color, blur, glowColor) => {
        ctx.shadowBlur = blur; ctx.shadowColor = glowColor || 'transparent'; ctx.strokeStyle = color;
        for (let i = 0; i < poly.length - 1; i++) {
          const a = poly[i], b = poly[i + 1];
          ctx.lineWidth = px((a.w + b.w) / 2 * k);
          ctx.beginPath(); ctx.moveTo(px(a.x), px(a.y)); ctx.lineTo(px(b.x), px(b.y)); ctx.stroke();
        }
      };
      strokeVar(1.55, 'rgba(255,90,20,0.10)', CP * 1.6, 'rgba(255,90,20,0.55)');
      strokeVar(1.28, '#150605', CP * 0.4, '#000');
      strokeVar(1.02, '#6c1604', 0);
      strokeVar(0.82, '#c63a0a', CP * 0.35, 'rgba(255,110,20,0.8)');
      strokeVar(0.52, '#ff7a14', CP * 0.25, 'rgba(255,170,40,0.9)');
      strokeVar(0.22, '#ffd36b', CP * 0.18, 'rgba(255,230,140,0.9)');
      ctx.restore();
      // plaques de croûte qui flottent
      for (let i = 0; i < poly.length; i += 2) {
        const p = poly[i];
        for (let k = 0; k < 3; k++) {
          const ox = (rnd() - 0.5) * p.w * 0.9, oy = (rnd() - 0.5) * p.w * 0.9;
          const rr = (0.18 + rnd() * 0.38) * CP;
          ctx.fillStyle = `rgba(${28 + rnd() * 20},${8 + rnd() * 8},4,${0.55 + rnd() * 0.3})`;
          ctx.beginPath();
          const n = 6 + Math.floor(rnd() * 3);
          for (let j = 0; j < n; j++) { const a = (j / n) * Math.PI * 2, r2 = rr * (0.7 + rnd() * 0.5); const X = px(p.x + ox) + Math.cos(a) * r2, Y = px(p.y + oy) + Math.sin(a) * r2; j ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }
          ctx.closePath(); ctx.fill();
        }
      }
    }

    // 6. ossements
    for (const b of geo.bones) {
      ctx.save();
      ctx.translate(px(b.x), px(b.y)); ctx.rotate(b.a * Math.PI / 180); ctx.scale(b.s * CP / 40, b.s * CP / 40);
      ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 5; ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 3;
      ctx.fillStyle = '#d9cbac'; ctx.strokeStyle = '#d9cbac'; ctx.lineCap = 'round';
      if (b.k === 0) { // crâne
        ctx.beginPath(); ctx.ellipse(0, 0, 9, 8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.rect(-5, 6, 10, 6); ctx.fill();
        ctx.shadowColor = 'transparent'; ctx.fillStyle = '#1a0c08';
        ctx.beginPath(); ctx.ellipse(-3.5, -0.5, 2.4, 3, 0, 0, Math.PI * 2); ctx.ellipse(3.5, -0.5, 2.4, 3, 0, 0, Math.PI * 2); ctx.fill();
      } else if (b.k === 1) { // côtes
        ctx.lineWidth = 2.6;
        for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(i * 4, -9); ctx.quadraticCurveTo(i * 4 + 3, 0, i * 4, 9); ctx.stroke(); }
        ctx.lineWidth = 3.4; ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(14, 0); ctx.stroke();
      } else if (b.k === 2) { // os long
        ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(14, 0); ctx.stroke();
        for (const s of [-1, 1]) for (const t of [-2.4, 2.4]) { ctx.beginPath(); ctx.arc(s * 14, t, 2.6, 0, Math.PI * 2); ctx.fill(); }
      } else { // éclats
        ctx.lineWidth = 3; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(i * 6 - 10, (i % 2) * 5 - 3); ctx.lineTo(i * 6 - 5, (i % 2) * -4 + 3); ctx.stroke(); }
      }
      ctx.restore();
    }

    // 7. épaves
    for (const w of geo.wrecks) {
      ctx.save();
      ctx.translate(px(w.x), px(w.y)); ctx.rotate(w.r * Math.PI / 180);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, CP * 2.4);
      g.addColorStop(0, 'rgba(0,0,0,0.6)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, CP * 2.4, 0, Math.PI * 2); ctx.fill();
      const L = CP * 1.5, Wd = CP * 0.95;
      ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 10; ctx.shadowOffsetX = 4; ctx.shadowOffsetY = 5;
      ctx.fillStyle = '#2b2321'; ctx.fillRect(-L / 2, -Wd / 2, L, Wd);
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = '#3d312d'; ctx.fillRect(-L / 2 + 4, -Wd / 2 + 4, L * 0.45, Wd - 8);
      ctx.fillStyle = '#16100e'; for (const [wx, wy] of [[-0.35, -0.55], [0.3, -0.55], [-0.35, 0.55], [0.3, 0.55]]) { ctx.beginPath(); ctx.arc(wx * L, wy * Wd, CP * 0.22, 0, Math.PI * 2); ctx.fill(); }
      ctx.strokeStyle = '#6b3b22'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-L * 0.1, -Wd * 0.4); ctx.lineTo(L * 0.3, Wd * 0.3); ctx.stroke();
      ctx.restore();
    }

    // 8. rochers : ombre, corps facetté, éclat de lumière
    for (const o of geo.rocks) { // ombres d'abord
      ctx.save(); ctx.translate(px(o.x) + CP * 0.28, px(o.y) + CP * 0.36);
      pathPoly(ctx, o.pts, 0, 0, CP); ctx.fillStyle = 'rgba(8,3,2,0.5)'; ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 14; ctx.fill(); ctx.restore();
    }
    for (const o of geo.rocks) {
      const rr = rng(o.seed);
      ctx.save(); ctx.translate(px(o.x), px(o.y));
      const R = px(o.r);
      const g = ctx.createLinearGradient(-R, -R, R, R);
      g.addColorStop(0, '#6b5248'); g.addColorStop(0.5, '#3b2a26'); g.addColorStop(1, '#1b110f');
      pathPoly(ctx, o.pts, 0, 0, CP); ctx.fillStyle = g; ctx.fill();
      ctx.save(); pathPoly(ctx, o.pts, 0, 0, CP); ctx.clip();
      // facettes
      for (let i = 0; i < 6; i++) {
        const a1 = rr() * Math.PI * 2, a2 = a1 + 0.5 + rr();
        ctx.fillStyle = i % 2 ? 'rgba(255,200,160,0.07)' : 'rgba(0,0,0,0.18)';
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a1) * R * 1.2, Math.sin(a1) * R * 1.2); ctx.lineTo(Math.cos(a2) * R * 1.2, Math.sin(a2) * R * 1.2); ctx.closePath(); ctx.fill();
      }
      // fissures
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      for (let i = 0; i < 4; i++) { let x = (rr() - 0.5) * R, y = (rr() - 0.5) * R; ctx.beginPath(); ctx.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (rr() - 0.5) * R * 0.6; y += (rr() - 0.2) * R * 0.5; ctx.lineTo(x, y); } ctx.stroke(); }
      // reflet de braise venu du bas
      const gl = ctx.createLinearGradient(0, -R, 0, R);
      gl.addColorStop(0, 'rgba(255,230,200,0.10)'); gl.addColorStop(0.55, 'rgba(0,0,0,0)'); gl.addColorStop(1, 'rgba(255,90,30,0.10)');
      ctx.fillStyle = gl; ctx.fillRect(-R, -R, R * 2, R * 2);
      ctx.restore();
      pathPoly(ctx, o.pts, 0, 0, CP); ctx.strokeStyle = 'rgba(255,190,150,0.22)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.restore();
    }

    // 9. bords du canyon : voile sombre
    const edge = ctx.createLinearGradient(0, 0, 0, CP * 2.2);
    edge.addColorStop(0, 'rgba(6,2,2,0.78)'); edge.addColorStop(1, 'rgba(6,2,2,0)');
    ctx.fillStyle = edge; ctx.fillRect(0, 0, W, CP * 2.2);
    const edge2 = ctx.createLinearGradient(0, H, 0, H - CP * 2.2);
    edge2.addColorStop(0, 'rgba(6,2,2,0.78)'); edge2.addColorStop(1, 'rgba(6,2,2,0)');
    ctx.fillStyle = edge2; ctx.fillRect(0, H - CP * 2.2, W, CP * 2.2);

    if (onProgress) onProgress(1);

    // couche d'empreintes dynamique (demi-résolution)
    const tracks = document.createElement('canvas');
    tracks.width = Math.round(W * 0.5); tracks.height = Math.round(H * 0.5);
    return { canvas: out, tracks, cp: CP, w: W, h: H };
  }

  // image fournie par le MJ
  function fromImage(url, cols, rows) {
    return new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => {
        const W = im.naturalWidth, H = im.naturalHeight;
        const tracks = document.createElement('canvas');
        tracks.width = Math.round(W * 0.5); tracks.height = Math.round(H * 0.5);
        resolve({ canvas: im, tracks, cp: W / cols, w: W, h: H, image: true });
      };
      im.onerror = () => reject(new Error('Image de carte illisible'));
      im.src = url;
    });
  }

  window.Terrain = { build, fromImage, CP };
})();
