/* Sprites dessinés en code : broyeuses de démon, jetons de créatures, icônes.
 * Les véhicules se dessinent en coordonnées locales (1 unité = 1 case, +x = avant, +y = tribord). */
(function () {
  const PAL = {
    party: { base: '#3a4347', mid: '#566266', light: '#8a979b', dark: '#1d2326', trim: '#c79a45', glow: '#5CF2C8', glow2: '#bffff0', mark: '#0f1517' },
    enemy: { base: '#4d1a13', mid: '#74291c', light: '#a9452d', dark: '#26100c', trim: '#dccfae', glow: '#ff6a1f', glow2: '#ffd08a', mark: '#12090a' },
  };

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }

  /* ===================== BROYEUSE DE DÉMON ===================== */
  // anim : { t, tread, spin, jaw, swing, aimL, aimR, fireL, fireR, speed, destroyed, hpPct, id, hit }
  function grinder(ctx, v, anim, opt = {}) {
    const side = v.side === 'party' ? 'party' : 'enemy';
    const P = PAL[side];
    const t = anim.t;
    const dead = anim.destroyed;
    const pulse = 0.5 + 0.5 * Math.sin(t * (3 + anim.speed * 6));

    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';

    // --- chenilles ---
    for (const s of [-1, 1]) {
      const y0 = s < 0 ? -1.52 : 0.9, h = 0.62;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 9; ctx.shadowOffsetX = 3; ctx.shadowOffsetY = 4;
      ctx.fillStyle = dead ? '#120d0c' : '#1a1413';
      rr(ctx, -2.0, y0, 3.95, h, 0.28); ctx.fill();
      ctx.restore();
      if (!dead) {
        ctx.save();
        rr(ctx, -2.0, y0, 3.95, h, 0.28); ctx.clip();
        ctx.strokeStyle = '#3a2f2c'; ctx.lineWidth = 0.09;
        const step = 0.24, off = (anim.tread % step + step) % step;
        for (let x = -2.0 - step + off; x < 2.0; x += step) { ctx.beginPath(); ctx.moveTo(x, y0 + 0.02); ctx.lineTo(x, y0 + h - 0.02); ctx.stroke(); }
        ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 0.05;
        ctx.beginPath(); ctx.moveTo(-1.9, y0 + 0.09); ctx.lineTo(1.8, y0 + 0.09); ctx.stroke();
        ctx.restore();
      }
      // galets
      ctx.fillStyle = dead ? '#2a1d1a' : P.dark;
      for (const x of [-1.62, -0.55, 0.55, 1.62]) { ctx.beginPath(); ctx.arc(x, y0 + h / 2, 0.19, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = P.light; ctx.globalAlpha = 0.5; ctx.lineWidth = 0.035; ctx.stroke(); ctx.globalAlpha = 1; }
    }

    // --- coque ---
    const hull = [[-1.95, -1.0], [-1.95, 1.0], [1.15, 1.12], [1.82, 0.64], [1.82, -0.64], [1.15, -1.12]];
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 11; ctx.shadowOffsetX = 3; ctx.shadowOffsetY = 5;
    const g = ctx.createLinearGradient(0, -1.1, 0, 1.1);
    if (dead) { g.addColorStop(0, '#1d1513'); g.addColorStop(1, '#0d0908'); }
    else { g.addColorStop(0, P.mid); g.addColorStop(0.5, P.base); g.addColorStop(1, P.dark); }
    ctx.fillStyle = g;
    ctx.beginPath(); hull.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = dead ? '#3a2a24' : P.light; ctx.globalAlpha = dead ? 0.5 : 0.55; ctx.lineWidth = 0.05;
    ctx.beginPath(); hull.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.stroke();
    ctx.globalAlpha = 1;

    // plaques et rivets
    ctx.strokeStyle = P.mark; ctx.globalAlpha = 0.6; ctx.lineWidth = 0.035;
    for (const x of [-1.2, -0.25, 0.8]) { ctx.beginPath(); ctx.moveTo(x, -1.02); ctx.lineTo(x, 1.02); ctx.stroke(); }
    for (const y of [-0.5, 0.5]) { ctx.beginPath(); ctx.moveTo(-1.9, y); ctx.lineTo(1.1, y); ctx.stroke(); }
    ctx.globalAlpha = 1;
    ctx.fillStyle = P.trim; ctx.globalAlpha = dead ? 0.25 : 0.8;
    for (let x = -1.8; x <= 1.0; x += 0.38) for (const y of [-0.92, 0.92]) { ctx.beginPath(); ctx.arc(x, y, 0.035, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;

    // liseré de chevrons à l'arrière
    ctx.save();
    ctx.beginPath(); ctx.rect(-1.95, -1.0, 0.42, 2.0); ctx.clip();
    ctx.fillStyle = side === 'party' ? '#b88a3a' : '#d9c9a2'; ctx.globalAlpha = dead ? 0.12 : 0.55;
    for (let y = -1.2; y < 1.2; y += 0.34) { ctx.beginPath(); ctx.moveTo(-1.95, y); ctx.lineTo(-1.5, y + 0.34); ctx.lineTo(-1.5, y + 0.5); ctx.lineTo(-1.95, y + 0.16); ctx.closePath(); ctx.fill(); }
    ctx.restore();

    // pointes sur les flancs (ennemi)
    if (side === 'enemy' && !dead) {
      ctx.fillStyle = P.trim;
      for (const s of [-1, 1]) for (let x = -1.5; x <= 0.9; x += 0.6) { ctx.beginPath(); ctx.moveTo(x - 0.13, s * 1.04); ctx.lineTo(x, s * 1.5); ctx.lineTo(x + 0.13, s * 1.04); ctx.closePath(); ctx.fill(); }
    }

    // --- bloc moteur (arrière) ---
    ctx.fillStyle = dead ? '#120c0b' : P.dark;
    rr(ctx, -1.7, -0.55, 1.35, 1.1, 0.12); ctx.fill();
    ctx.strokeStyle = P.light; ctx.globalAlpha = 0.4; ctx.lineWidth = 0.035; ctx.stroke(); ctx.globalAlpha = 1;
    // grille
    ctx.strokeStyle = '#000'; ctx.globalAlpha = 0.7; ctx.lineWidth = 0.04;
    for (let y = -0.45; y <= 0.45; y += 0.15) { ctx.beginPath(); ctx.moveTo(-1.62, y); ctx.lineTo(-0.43, y); ctx.stroke(); }
    ctx.globalAlpha = 1;
    // cœur d'âmes
    if (!dead) {
      const cx = -1.02, cy = 0;
      const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 0.52);
      rg.addColorStop(0, side === 'party' ? 'rgba(191,255,240,0.95)' : 'rgba(255,220,150,0.95)');
      rg.addColorStop(0.35, side === 'party' ? 'rgba(92,242,200,0.65)' : 'rgba(255,106,31,0.7)');
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.55 + 0.45 * pulse;
      ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(cx, cy, 0.52, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      ctx.fillStyle = P.glow2; ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(cx, cy, 0.1 + 0.03 * pulse, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    }

    // cheminées
    for (const s of [-1, 1]) {
      const cx = -1.82, cy = s * 0.62;
      ctx.fillStyle = dead ? '#0a0605' : '#0d0807'; ctx.beginPath(); ctx.arc(cx, cy, 0.19, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = P.light; ctx.globalAlpha = 0.6; ctx.lineWidth = 0.05; ctx.stroke(); ctx.globalAlpha = 1;
      if (!dead) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const fg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 0.3);
        fg.addColorStop(0, 'rgba(255,170,60,0.85)'); fg.addColorStop(1, 'rgba(255,60,0,0)');
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 17 + s * 2) * 0.5 + anim.speed * 0.3;
        ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(cx, cy, 0.3, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
    }

    // --- poste de pilotage (cabine blindée) ---
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 5; ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 3;
    ctx.fillStyle = dead ? '#17100e' : P.mid;
    ctx.beginPath(); ctx.moveTo(-0.25, -0.62); ctx.lineTo(0.95, -0.5); ctx.lineTo(1.2, -0.28); ctx.lineTo(1.2, 0.28); ctx.lineTo(0.95, 0.5); ctx.lineTo(-0.25, 0.62); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.fillStyle = dead ? '#0a0605' : '#090b0c';
    ctx.beginPath(); ctx.moveTo(0.75, -0.4); ctx.lineTo(1.1, -0.2); ctx.lineTo(1.1, 0.2); ctx.lineTo(0.75, 0.4); ctx.closePath(); ctx.fill();
    if (!dead) { ctx.fillStyle = P.glow; ctx.globalAlpha = 0.22 + 0.12 * pulse; ctx.fill(); ctx.globalAlpha = 1; }

    // emblème sur le toit
    ctx.save(); ctx.translate(0.15, 0); ctx.globalAlpha = dead ? 0.15 : 0.9;
    if (side === 'enemy') { // crâne de sanglier
      ctx.fillStyle = '#e4d6b4';
      ctx.beginPath(); ctx.ellipse(0, 0, 0.2, 0.24, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-0.22, 0.1); ctx.quadraticCurveTo(-0.45, 0.32, -0.3, 0.4); ctx.quadraticCurveTo(-0.28, 0.25, -0.12, 0.18); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-0.22, -0.1); ctx.quadraticCurveTo(-0.45, -0.32, -0.3, -0.4); ctx.quadraticCurveTo(-0.28, -0.25, -0.12, -0.18); ctx.fill();
      ctx.fillStyle = '#1b0907'; ctx.beginPath(); ctx.arc(0.04, -0.09, 0.05, 0, Math.PI * 2); ctx.arc(0.04, 0.09, 0.05, 0, Math.PI * 2); ctx.fill();
    } else { // pièce d'âme
      ctx.strokeStyle = P.trim; ctx.lineWidth = 0.05;
      ctx.beginPath(); ctx.arc(0, 0, 0.23, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = P.glow; ctx.beginPath(); ctx.arc(0, 0, 0.12, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // --- tambour broyeur à l'avant ---
    {
      const x0 = 1.78, x1 = 2.28;
      const dg = ctx.createLinearGradient(x0, 0, x1, 0);
      dg.addColorStop(0, '#2b2422'); dg.addColorStop(0.5, '#6e625c'); dg.addColorStop(1, '#2b2422');
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 8; ctx.shadowOffsetX = 3; ctx.shadowOffsetY = 4;
      ctx.fillStyle = dead ? '#1b1412' : dg; rr(ctx, x0, -1.2, x1 - x0, 2.4, 0.1); ctx.fill();
      ctx.restore();
      if (!dead) {
        ctx.save(); rr(ctx, x0, -1.2, x1 - x0, 2.4, 0.1); ctx.clip();
        ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 0.035;
        for (let k = 0; k < 6; k++) { const x = x0 + (((anim.spin * 2 + k / 6) % 1 + 1) % 1) * (x1 - x0); ctx.beginPath(); ctx.moveTo(x, -1.2); ctx.lineTo(x, 1.2); ctx.stroke(); }
        ctx.fillStyle = P.trim;
        for (let j = -1.1, i = 0; j <= 1.15; j += 0.275, i++) {
          const ph = (((anim.spin + (i % 2) * 0.5) % 1) + 1) % 1;
          const x = x0 + ph * (x1 - x0);
          ctx.beginPath(); ctx.moveTo(x - 0.06, j - 0.07); ctx.lineTo(x + 0.13, j); ctx.lineTo(x - 0.06, j + 0.07); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      }
    }

    // --- mâchoires (Chomper) ---
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.translate(1.82, s * 0.78);
      ctx.rotate(s * (0.12 + anim.jaw * 0.5));
      ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 6; ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 3;
      ctx.fillStyle = dead ? '#1d1513' : P.dark;
      ctx.beginPath(); ctx.moveTo(0, -s * 0.17); ctx.lineTo(1.05, -s * 0.05); ctx.lineTo(1.05, s * 0.05); ctx.lineTo(0, s * 0.19); ctx.closePath(); ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = side === 'party' ? '#d7c9a8' : '#efe3c4';
      for (let i = 0; i < 5; i++) { const x = 0.25 + i * 0.17; ctx.beginPath(); ctx.moveTo(x - 0.05, -s * 0.12); ctx.lineTo(x, -s * 0.34); ctx.lineTo(x + 0.05, -s * 0.12); ctx.closePath(); if (!dead) ctx.fill(); }
      ctx.restore();
    }

    // --- boulet de démolition (tribord) ---
    {
      const px = -0.5, py = 1.02;
      ctx.strokeStyle = dead ? '#1d1513' : '#14100f'; ctx.lineWidth = 0.17;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, 2.0); ctx.stroke();
      ctx.strokeStyle = P.light; ctx.globalAlpha = 0.5; ctx.lineWidth = 0.04; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, 2.0); ctx.stroke(); ctx.globalAlpha = 1;
      const th = Math.PI / 2 + anim.swing;
      const bx = px + Math.cos(th) * 1.0, by = 2.0 + Math.sin(th) * 1.0 - 0.0;
      // chaîne
      ctx.strokeStyle = '#2c2523'; ctx.lineWidth = 0.07; ctx.setLineDash([0.11, 0.06]);
      ctx.beginPath(); ctx.moveTo(px, 2.0); ctx.lineTo(bx, by); ctx.stroke(); ctx.setLineDash([]);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 8; ctx.shadowOffsetX = 3; ctx.shadowOffsetY = 5;
      ctx.translate(bx, by);
      const bg = ctx.createRadialGradient(-0.1, -0.1, 0.03, 0, 0, 0.45);
      bg.addColorStop(0, '#8d8079'); bg.addColorStop(0.6, '#3a312e'); bg.addColorStop(1, '#161110');
      ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(0, 0, 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = '#d6c9aa';
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + th; ctx.beginPath(); ctx.moveTo(Math.cos(a - 0.2) * 0.37, Math.sin(a - 0.2) * 0.37); ctx.lineTo(Math.cos(a) * 0.58, Math.sin(a) * 0.58); ctx.lineTo(Math.cos(a + 0.2) * 0.37, Math.sin(a + 0.2) * 0.37); ctx.closePath(); if (!dead) ctx.fill(); }
      ctx.restore();
    }

    // --- lance-harpons ---
    for (const [sgn, aim, fire] of [[-1, anim.aimL, anim.fireL], [1, anim.aimR, anim.fireR]]) {
      const cx = -1.45, cy = sgn * 0.95;
      ctx.save(); ctx.translate(cx, cy);
      ctx.fillStyle = dead ? '#1a1210' : P.dark; ctx.beginPath(); ctx.arc(0, 0, 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = P.trim; ctx.globalAlpha = 0.7; ctx.lineWidth = 0.04; ctx.stroke(); ctx.globalAlpha = 1;
      ctx.rotate(aim);
      const rec = fire ? Math.max(0, 0.22 * (1 - (t - fire) * 5)) : 0;
      ctx.fillStyle = dead ? '#241a17' : '#2a2321';
      rr(ctx, -0.12 - rec, -0.09, 0.8, 0.18, 0.05); ctx.fill();
      ctx.strokeStyle = P.light; ctx.globalAlpha = 0.5; ctx.lineWidth = 0.03; ctx.stroke(); ctx.globalAlpha = 1;
      if (!dead && !(fire && t - fire < 0.35)) {
        ctx.strokeStyle = '#cfc5ae'; ctx.lineWidth = 0.05; ctx.beginPath(); ctx.moveTo(0.1 - rec, 0); ctx.lineTo(0.78 - rec, 0); ctx.stroke();
        ctx.fillStyle = '#e8dcc0'; ctx.beginPath(); ctx.moveTo(0.78 - rec, -0.08); ctx.lineTo(0.96 - rec, 0); ctx.lineTo(0.78 - rec, 0.08); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }

    // --- stations (sièges) ---
    if (!dead) {
      ctx.strokeStyle = P.glow; ctx.lineWidth = 0.03; ctx.globalAlpha = 0.28;
      for (const st of v.veh.stations) { ctx.beginPath(); ctx.arc(st.lx, st.ly, 0.33, 0, Math.PI * 2); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }

    // --- bandes lumineuses + phares (additif) ---
    if (!dead) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = P.glow; ctx.lineWidth = 0.06; ctx.globalAlpha = 0.35 + 0.25 * pulse;
      ctx.beginPath(); ctx.moveTo(-1.85, -0.9); ctx.lineTo(1.1, -1.02); ctx.moveTo(-1.85, 0.9); ctx.lineTo(1.1, 1.02); ctx.stroke();
      ctx.globalAlpha = 0.16;
      for (const s of [-1, 1]) {
        const lg = ctx.createRadialGradient(1.9, s * 0.4, 0, 1.9, s * 0.4, 3.4);
        lg.addColorStop(0, side === 'party' ? 'rgba(210,255,245,0.9)' : 'rgba(255,190,120,0.9)'); lg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = lg; ctx.beginPath(); ctx.moveTo(1.9, s * 0.4 - 0.1); ctx.lineTo(5.2, s * 0.4 - 1.5); ctx.lineTo(5.2, s * 0.4 + 1.5); ctx.lineTo(1.9, s * 0.4 + 0.1); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }

    // --- dégâts : suie et fissures ---
    const dmg = dead ? 1 : 1 - anim.hpPct / 100;
    if (dmg > 0.12 || dead) {
      const hs = hashStr(String(anim.id));
      ctx.save();
      ctx.beginPath(); hull.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.clip();
      const n = Math.floor(2 + dmg * 7);
      for (let i = 0; i < n; i++) {
        const a = hashStr('s' + i + hs), b = hashStr('t' + i + hs), c = hashStr('u' + i + hs);
        const x = -1.8 + a * 3.4, y = -0.95 + b * 1.9, r = 0.18 + c * 0.45 * dmg + (dead ? 0.15 : 0);
        const sg = ctx.createRadialGradient(x, y, 0, x, y, r);
        sg.addColorStop(0, 'rgba(0,0,0,0.6)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        if (dmg > 0.35) { ctx.strokeStyle = 'rgba(0,0,0,0.65)'; ctx.lineWidth = 0.03; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (a - 0.5) * 0.8, y + (b - 0.5) * 0.8); ctx.lineTo(x + (c - 0.5) * 0.9, y + (a - 0.3) * 0.7); ctx.stroke(); }
      }
      if (dead) { ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(255,100,20,' + (0.35 + 0.25 * Math.sin(t * 5)) + ')'; ctx.lineWidth = 0.05; for (let i = 0; i < 6; i++) { const a = hashStr('c' + i + hs), b = hashStr('d' + i + hs); ctx.beginPath(); ctx.moveTo(-1.8 + a * 3.4, -0.9 + b * 1.8); ctx.lineTo(-1.8 + b * 3.4, -0.9 + a * 1.8); ctx.stroke(); } }
      ctx.restore();
    }
    ctx.restore();
  }

  /* ===================== ICÔNES DE CRÉATURES ===================== */
  function iconBoar(ctx, u, col) {
    ctx.save(); ctx.scale(u, u); ctx.fillStyle = col; ctx.strokeStyle = col;
    // oreilles
    ctx.beginPath(); ctx.moveTo(-0.62, -0.18); ctx.lineTo(-0.46, -0.68); ctx.lineTo(-0.12, -0.38); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0.62, -0.18); ctx.lineTo(0.46, -0.68); ctx.lineTo(0.12, -0.38); ctx.closePath(); ctx.fill();
    // tête
    ctx.beginPath(); ctx.ellipse(0, -0.02, 0.58, 0.5, 0, 0, Math.PI * 2); ctx.fill();
    // groin
    ctx.fillStyle = 'rgba(40,12,8,0.75)'; ctx.beginPath(); ctx.ellipse(0, 0.24, 0.3, 0.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(-0.1, 0.24, 0.045, 0, Math.PI * 2); ctx.arc(0.1, 0.24, 0.045, 0, Math.PI * 2); ctx.fill();
    // défenses
    ctx.strokeStyle = '#fff6df'; ctx.lineWidth = 0.1; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-0.2, 0.34); ctx.quadraticCurveTo(-0.46, 0.46, -0.44, 0.1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0.2, 0.34); ctx.quadraticCurveTo(0.46, 0.46, 0.44, 0.1); ctx.stroke();
    // yeux
    ctx.fillStyle = '#ff3b1e'; ctx.beginPath(); ctx.arc(-0.2, -0.12, 0.07, 0, Math.PI * 2); ctx.arc(0.2, -0.12, 0.07, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function iconRat(ctx, u, col) {
    ctx.save(); ctx.scale(u, u); ctx.fillStyle = col; ctx.strokeStyle = col;
    ctx.beginPath(); ctx.arc(-0.46, -0.4, 0.28, 0, Math.PI * 2); ctx.arc(0.46, -0.4, 0.28, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(40,12,8,0.6)'; ctx.beginPath(); ctx.arc(-0.46, -0.4, 0.15, 0, Math.PI * 2); ctx.arc(0.46, -0.4, 0.15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(-0.5, -0.2); ctx.quadraticCurveTo(-0.55, 0.3, 0, 0.74); ctx.quadraticCurveTo(0.55, 0.3, 0.5, -0.2); ctx.quadraticCurveTo(0, -0.5, -0.5, -0.2); ctx.fill();
    ctx.fillStyle = '#ff3b1e'; ctx.beginPath(); ctx.arc(-0.2, -0.06, 0.07, 0, Math.PI * 2); ctx.arc(0.2, -0.06, 0.07, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3a0f0b'; ctx.beginPath(); ctx.arc(0, 0.62, 0.07, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 0.035; ctx.globalAlpha = 0.8;
    for (const s of [-1, 1]) for (const dy of [-0.05, 0.1, 0.25]) { ctx.beginPath(); ctx.moveTo(s * 0.15, 0.4 + dy * 0.2); ctx.lineTo(s * 0.62, 0.34 + dy); ctx.stroke(); }
    ctx.restore();
  }

  const COND = {
    'à terre': ['T', '#c98a2a'], 'agrippé': ['A', '#9a6bd0'], 'entravé': ['E', '#9a6bd0'], 'empoisonné': ['P', '#5fb64a'],
    'en feu': ['F', '#ff6a1f'], 'étourdi': ['S', '#d0c24a'], 'aveuglé': ['B', '#777'], 'effrayé': ['R', '#d06b9a'], 'inconscient': ['Z', '#b3202a'],
  };

  /* ===================== JETON DE CRÉATURE (coordonnées écran) ===================== */
  // o : { x, y (écran), z (px/case), t, selected, active, hover, aboard, pulse, targetable, dim }
  function creature(ctx, t, o) {
    const size = (t.size || 1) * (o.aboard ? 0.78 : 1);
    const R = 0.46 * size * o.z;
    const enemy = t.side === 'enemy';
    const ring = t.color || (enemy ? '#B3202A' : '#5CF2C8');
    ctx.save();
    ctx.translate(o.x, o.y);
    if (o.dim) ctx.globalAlpha = o.dim;
    // ombre
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.65)'; ctx.shadowBlur = R * 0.5; ctx.shadowOffsetX = R * 0.15; ctx.shadowOffsetY = R * 0.25;
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    // halo d'équipe
    if (o.active) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const hg = ctx.createRadialGradient(0, 0, R * 0.8, 0, 0, R * 2.4);
      hg.addColorStop(0, 'rgba(255,170,60,0.55)'); hg.addColorStop(1, 'rgba(255,90,20,0)');
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(o.t * 5);
      ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(0, 0, R * 2.4, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    // disque
    const bg = ctx.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.1, 0, 0, R);
    if (t.dead) { bg.addColorStop(0, '#3a3331'); bg.addColorStop(1, '#171212'); }
    else if (enemy) { bg.addColorStop(0, '#5a1a14'); bg.addColorStop(1, '#210a08'); }
    else { bg.addColorStop(0, '#2c3a3d'); bg.addColorStop(1, '#0f1517'); }
    ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();

    // icône
    if (t.dead) {
      ctx.strokeStyle = '#9a8f86'; ctx.lineWidth = R * 0.14; ctx.beginPath(); ctx.moveTo(-R * 0.4, -R * 0.4); ctx.lineTo(R * 0.4, R * 0.4); ctx.moveTo(R * 0.4, -R * 0.4); ctx.lineTo(-R * 0.4, R * 0.4); ctx.stroke();
    } else if (t.sprite === 'wereboar') iconBoar(ctx, R * 0.78, '#e9d9b8');
    else if (t.sprite === 'wererat') iconRat(ctx, R * 0.78, '#d9c7a4');
    else {
      ctx.fillStyle = ring; ctx.font = `700 ${Math.round(R * 1.15)}px Teko, "Arial Narrow", Impact, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText((t.name || '?').trim().charAt(0).toUpperCase(), 0, R * 0.06);
    }
    // anneau de PV
    const pct = t.hp !== undefined ? t.hp / t.maxHp : (t.hpPct !== undefined ? t.hpPct / 100 : 1);
    ctx.lineWidth = Math.max(2, R * 0.18); ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.arc(0, 0, R * 0.93, 0, Math.PI * 2); ctx.stroke();
    if (pct > 0 && !t.dead) {
      ctx.strokeStyle = pct > 0.5 ? ring : (pct > 0.25 ? '#ffb020' : '#ff3b1e');
      ctx.beginPath(); ctx.arc(0, 0, R * 0.93, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct); ctx.stroke();
    }
    ctx.lineWidth = Math.max(1, R * 0.06); ctx.strokeStyle = o.selected ? '#fff' : 'rgba(255,255,255,0.22)';
    ctx.beginPath(); ctx.arc(0, 0, R * 1.04, 0, Math.PI * 2); ctx.stroke();
    // anneau tournant du tour actif
    if (o.active) {
      ctx.save(); ctx.rotate(o.t * 1.2); ctx.strokeStyle = '#ffb040'; ctx.lineWidth = Math.max(2, R * 0.1); ctx.setLineDash([R * 0.35, R * 0.25]);
      ctx.beginPath(); ctx.arc(0, 0, R * 1.3, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    if (o.targetable) {
      ctx.save(); ctx.rotate(-o.t * 0.8); ctx.strokeStyle = '#ff3b1e'; ctx.lineWidth = Math.max(2, R * 0.12); ctx.setLineDash([R * 0.5, R * 0.3]);
      ctx.beginPath(); ctx.arc(0, 0, R * 1.45, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    // conditions
    let i = 0;
    ctx.setLineDash([]);
    for (const c of (t.conditions || [])) {
      const d = COND[c]; if (!d) continue;
      const ang = -Math.PI / 4 - i * 0.55, cx = Math.cos(ang) * R * 1.1, cy = Math.sin(ang) * R * 1.1, cr = Math.max(5, R * 0.3);
      ctx.fillStyle = d[1]; ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = `700 ${Math.round(cr * 1.3)}px "Barlow Semi Condensed", Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(d[0], cx, cy + 0.5);
      i++;
    }
    ctx.restore();
  }

  window.Sprites = { grinder, creature, PAL, rr, COND };
})();
