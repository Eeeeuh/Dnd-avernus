/* Client principal : réseau, caméra, rendu, interactions, effets. */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const R = window.Rules, MG = window.MapGen, FX = window.FX, A = window.AvAudio, UI = window.UI, Sprites = window.Sprites, Terrain = window.Terrain;
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = R.clamp;
  const DOCK_W = 332;

  const App = (window.App = {
    cid: null, you: { role: 'player', slot: null, name: '' }, S: null, who: [], beats: [], weapons: {}, mishaps: [],
    geo: null, terrain: null, mapKey: '', mapBusy: false,
    disp: {}, anim: {}, sel: null, mode: null, hover: null, drag: null, ruler: null, rulerOn: false, tetherSel: null, reaction: false,
    cam: { x: 36, y: 24, z: 18, tx: 36, ty: 24, tz: 18 }, size: { w: innerWidth, h: innerHeight, dpr: 1 }, time: 0, dirty: true, lastUI: 0,
    settings: {}, gmKey: new URLSearchParams(location.search).get('gm'), lastActive: null, sound: false,
  });

  /* ================== utilitaires d'état ================== */
  App.tok = (id) => (App.S && App.S.tokens[id]) || null;
  App.vehicleOf = (t) => (t && t.aboard ? App.tok(t.aboard.v) : null);
  App.crewOf = (vid) => Object.values(App.S.tokens).filter((t) => t.aboard && t.aboard.v === vid);
  App.pilotOf = (v) => App.crewOf(v.id).find((c) => c.aboard.station === 'helm' && !c.dead && !(c.conditions || []).includes('inconscient')) || null;
  App.canControl = (t) => {
    if (!t) return false;
    if (App.you.role === 'gm') return true;
    if (!App.you.slot) return false;
    if (t.owner && t.owner === App.you.slot) return true;
    if (t.kind === 'vehicle') { const p = App.pilotOf(t); return !!(p && p.owner === App.you.slot); }
    return false;
  };
  App.myCrew = (v) => App.crewOf(v.id).filter((c) => App.canControl(c));
  App.vehicleBudget = (v) => {
    let b = v.speed * (v.veh.dashed ? 2 : 1) + (v.veh.overdrive ? 6 : 0);
    if ((v.veh.mishaps || []).some((m) => m.effect === 'slow6')) b -= 6;
    return Math.max(0, b);
  };
  App.myLabel = () => { const t = App.you.slot && App.tok(App.you.slot); return t ? `${t.name} (${App.you.name})` : App.you.name; };
  App.distToSeg = (p, a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2; t = clamp(t, 0, 1);
    return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
  };
  App.saveSettings = () => { try { localStorage.setItem('av.settings', JSON.stringify(App.settings)); } catch (e) { /* ok */ } };
  App.applySettings = () => { FX.reduced = !!App.settings.reduced; };
  try { App.settings = JSON.parse(localStorage.getItem('av.settings') || '{}'); } catch (e) { App.settings = {}; }
  for (const k of ['master', 'music', 'sfx', 'amb']) if (typeof App.settings['vol_' + k] === 'number') A.vol[k] = App.settings['vol_' + k];
  App.applySettings();

  /* ================== réseau ================== */
  App.connect = function (join) {
    const q = new URLSearchParams();
    q.set('name', join.name);
    if (App.gmKey) q.set('gm', App.gmKey); else if (join.slot) q.set('slot', join.slot);
    const es = new EventSource('/events?' + q.toString());
    es.addEventListener('hello', (e) => {
      const d = JSON.parse(e.data);
      App.cid = d.cid; App.you = d.you; App.beats = d.beats; App.weapons = d.weapons; App.mishaps = d.mishaps;
    });
    es.addEventListener('state', (e) => { const d = JSON.parse(e.data); App.who = d.who; App.onState(d.state); });
    es.addEventListener('fx', (e) => App.onFx(JSON.parse(e.data)));
    es.onerror = () => { if (es.readyState === 2) { UI.toast('Connexion perdue. Rechargez la page.', 'err'); } else UI.toast('Reconnexion…', 'err'); };
    es.onopen = () => { if (App.S) UI.toast('Reconnecté', 'ok'); };
  };
  App.act = async function (a) {
    try {
      const r = await fetch('/act', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cid: App.cid, a }) });
      const j = await r.json();
      if (!j.ok) { UI.toast(j.err || 'Action refusée', 'err'); A.play('click'); }
      return j;
    } catch (e) { UI.toast('Connexion perdue', 'err'); return { ok: false }; }
  };

  /* ================== état reçu ================== */
  App.onState = function (s) {
    const first = !App.S;
    const prev = App.S;
    App.S = s;
    document.body.classList.toggle('gm', App.you.role === 'gm');
    if (first) {
      $('#topbar').classList.remove('hidden'); $('#dock').classList.remove('hidden'); $('#bottom').classList.remove('hidden');
      if (innerWidth <= 900) { $('#dock').classList.add('collapsed'); } else document.body.classList.add('dock-open');
      A.setLevel(s.music || 0, true);
      UI.tab = 'combat';
    }
    App.buildMap();
    // jetons : positions affichées
    for (const t of Object.values(s.tokens)) {
      if (!App.disp[t.id]) App.disp[t.id] = { x: t.x, y: t.y, r: t.r, vx: 0, vy: 0, speed: 0, born: App.time };
      if (t.kind === 'vehicle' && !App.anim[t.id]) App.anim[t.id] = { tread: 0, spin: Math.random(), jaw: 0, jawK: 0, swing: 0, swingV: 0, aimL: -1.05, aimR: 1.05, aimLt: null, aimRt: null, fireL: 0, fireR: 0, speed: 0, rpm: 0.1, lastStamp: null };
    }
    for (const id of Object.keys(App.disp)) if (!s.tokens[id]) { delete App.disp[id]; delete App.anim[id]; A.engineStop(id); }
    if (App.sel && !s.tokens[App.sel]) App.sel = null;
    if (prev && prev.music !== s.music) A.setLevel(s.music);
    // tour actif : sélection automatique pour son propre personnage
    if (s.activeId !== App.lastActive) {
      App.lastActive = s.activeId;
      const t = s.tokens[s.activeId];
      if (t && App.canControl(t) && App.you.role !== 'gm') { App.select(t.id, true); }
      App.reaction = false;
    }
    if (App.you.role !== 'gm' && !App.sel && App.you.slot && s.tokens[App.you.slot]) App.sel = App.you.slot;
    App.dirty = true;
  };

  App.buildMap = async function () {
    const m = App.S.map;
    const key = [m.kind, m.seed, m.image, m.cols, m.rows].join(':');
    if (key === App.mapKey || App.mapBusy) return;
    App.mapKey = key; App.mapBusy = true;
    const loader = $('#loader'), fill = $('#loader-fill');
    loader.classList.remove('hidden'); fill.style.width = '2%';
    try {
      if (m.kind === 'procedural') {
        App.geo = MG.generate(m.seed, m.cols, m.rows);
        App.terrain = await Terrain.build(App.geo, m.cols, m.rows, (p) => { fill.style.width = Math.round(p * 100) + '%'; });
      } else {
        App.geo = MG.generate(1, m.cols, m.rows); App.geo.rocks = []; App.geo.lava = []; App.geo.wrecks = [];
        App.terrain = await Terrain.fromImage(m.image, m.cols, m.rows);
      }
    } catch (e) { UI.toast('Carte illisible : ' + e.message, 'err'); }
    App.mapBusy = false; loader.classList.add('hidden');
    App.fit(true);
    // la carte a pu changer pendant le chargement
    if (App.S) { const m2 = App.S.map, k2 = [m2.kind, m2.seed, m2.image, m2.cols, m2.rows].join(':'); if (k2 !== App.mapKey) App.buildMap(); }
  };

  /* ================== caméra ================== */
  App.viewCenter = () => { const dw = !$('#dock').classList.contains('collapsed') && innerWidth > 900 ? DOCK_W : 0; return { x: (App.size.w - dw) / 2, y: App.size.h / 2 + (innerWidth > 640 ? 18 : 0) }; };
  App.w2s = (x, y) => { const c = App.viewCenter(), k = App.cam, so = App._shake || { x: 0, y: 0 }; return [(x - k.x) * k.z + c.x + so.x, (y - k.y) * k.z + c.y + so.y]; };
  App.s2w = (sx, sy) => { const c = App.viewCenter(), k = App.cam; return { x: (sx - c.x) / k.z + k.x, y: (sy - c.y) / k.z + k.y }; };
  App.fit = function (snap) {
    const m = App.S && App.S.map; if (!m) return;
    const c = App.viewCenter();
    const z = Math.min((c.x * 2) / m.cols, (App.size.h - 110) / m.rows) * 0.98;
    App.cam.tz = z; App.cam.tx = m.cols / 2; App.cam.ty = m.rows / 2;
    if (snap) { App.cam.z = z; App.cam.x = App.cam.tx; App.cam.y = App.cam.ty; }
  };
  App.focus = function (id) {
    const t = App.tok(id); if (!t) return;
    const d = tokPos(t);
    App.cam.tx = d.x; App.cam.ty = d.y; if (App.cam.tz < 22) App.cam.tz = 26;
  };
  App.camTo = (x, y, zoomFactor, ms) => {
    const m = App.S.map, fitZ = Math.min((App.viewCenter().x * 2) / m.cols, (App.size.h - 110) / m.rows);
    App.cam.tx = x; App.cam.ty = y; App.cam.tz = clamp(fitZ / (zoomFactor || 1), 8, 90);
    App.camSpeed = ms ? 3.2 : 8;
  };
  App.select = function (id, quiet) { App.sel = id; App.tetherSel = null; App.dirty = true; if (!quiet) A.play('click', { vol: 0.5 }); };

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    App.size = { w: innerWidth, h: innerHeight, dpr };
    const cv = $('#stage'); cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr);
    FX.initEmbers(innerWidth, innerHeight);
    if (App.S && !App._userCam) App.fit(true);
  }
  addEventListener('resize', resize);

  /* ================== modes d'action ================== */
  App.startAttack = function (attacker, x, tetherTarget) {
    if (!x.spec) { UI.toast('Aucune attaque disponible : ajoutez-en une dans la fiche.', 'err'); return; }
    if (tetherTarget) { App.act({ a: 'attack', id: attacker.id, target: tetherTarget, weapon: x.spec, adv: 'none', reaction: App.reaction }); return; }
    const w = x.w || {};
    App.mode = { type: 'attack', attacker: attacker.id, label: x.label, spec: x.spec, w, adv: 'none', mag: w.mag || 'none' };
    $('#stage').classList.add('aim'); UI.renderAttackBar(); UI.toast('Cliquez sur une cible', '');
  };
  App.startRam = function (veh) {
    App.mode = { type: 'ram', veh: veh.id };
    $('#stage').classList.add('aim'); UI.renderAttackBar(); UI.toast('Cliquez la cible à éperonner');
  };
  App.cancelMode = function () { App.mode = null; $('#stage').classList.remove('aim'); UI.renderAttackBar(); };

  // portée utile du mode actif, centrée sur l'attaquant
  function modeRange() {
    const m = App.mode; if (!m) return null;
    if (m.type === 'ram') { const v = App.tok(m.veh); return v ? { from: App.disp[v.id], range: 1.2 + 0, tok: v } : null; }
    const a = App.tok(m.attacker); if (!a) return null;
    const range = m.spec.src === 'station' ? ((App.weapons[(App.vehicleOf(a).veh.stations.find((s) => s.id === a.aboard.station) || {}).weapon] || {}).range || 2) : (m.w.range || 1.6);
    return { from: App.disp[a.id], range, tok: a };
  }
  function gapTo(att, tgt) {
    // distance bord à bord avec les positions logiques du serveur
    return R.gap(att, tgt);
  }

  function clickTarget(hit) {
    const m = App.mode; if (!m || !hit) return;
    if (m.type === 'ram') {
      if (hit.type !== 'token' || hit.id === m.veh) return;
      App.act({ a: 'ram', id: m.veh, target: hit.id }); App.cancelMode(); return;
    }
    const target = hit.type === 'tether' ? 'tether:' + hit.id : hit.id;
    if (hit.type === 'token' && hit.id === m.attacker) return;
    App.act({ a: 'attack', id: m.attacker, target, weapon: m.spec, adv: m.adv, mag: m.mag, reaction: App.reaction });
    App.cancelMode();
  }

  /* ================== tests de sélection ================== */
  function hitTest(wx, wy, forDrag) {
    const S = App.S; if (!S) return null;
    const toks = Object.values(S.tokens);
    // poignée de rotation du véhicule sélectionné
    const sel = App.sel && S.tokens[App.sel];
    if (sel && sel.kind === 'vehicle' && App.canControl(sel) && !App.mode) {
      const d = App.disp[sel.id], p = R.toWorld(d, sel.len / 2 + 1.35, 0);
      if (Math.hypot(wx - p.x, wy - p.y) < 0.7) return { type: 'handle', id: sel.id };
    }
    // créatures (celles à bord d'abord : dessinées au-dessus)
    const cr = toks.filter((t) => t.kind === 'creature').sort((a, b) => (b.aboard ? 1 : 0) - (a.aboard ? 1 : 0));
    for (const t of cr) {
      const p = tokPos(t); const r = 0.55 * (t.size || 1) * (t.aboard ? 0.8 : 1);
      if (Math.hypot(wx - p.x, wy - p.y) < r) return { type: 'token', id: t.id };
    }
    for (const t of toks) {
      if (t.kind !== 'vehicle') continue;
      const d = App.disp[t.id]; if (!d) continue;
      if (R.inHull(Object.assign({}, t, { x: d.x, y: d.y, r: d.r }), wx, wy, 0.2)) return { type: 'token', id: t.id };
    }
    for (const th of S.tethers) {
      const a = App.disp[th.from], b = App.disp[th.to]; if (!a || !b) continue;
      if (App.distToSeg({ x: wx, y: wy }, a, b) < 0.45) return { type: 'tether', id: th.id };
    }
    return null;
  }
  // position affichée d'un jeton (les passagers suivent le véhicule lissé)
  function tokPos(t) {
    if (t.aboard) {
      const v = App.tok(t.aboard.v), d = v && App.disp[v.id];
      if (d) { const p = R.toWorld(d, t.aboard.lx, t.aboard.ly); return { x: p.x, y: p.y, r: d.r }; }
    }
    const d = App.disp[t.id]; return d ? { x: d.x, y: d.y, r: d.r } : { x: t.x, y: t.y, r: t.r };
  }

  /* ================== entrées : souris / tactile ================== */
  const ptrs = new Map();
  let pinch = null, downInfo = null;
  const cv = () => $('#stage');
  function setupInput() {
    const c = cv();
    c.addEventListener('contextmenu', (e) => { e.preventDefault(); if (App.mode) App.cancelMode(); });
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      A.init();
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: App.cam.tz, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; App.drag = null; downInfo = null; return; }
      if (e.button === 2) return;
      const w = App.s2w(e.clientX, e.clientY);
      if (App.rulerOn) { App.ruler = { a: w, b: w, live: true }; return; }
      const hit = hitTest(w.x, w.y);
      if (App.mode) { clickTarget(hit); return; }
      downInfo = { sx: e.clientX, sy: e.clientY, hit, w, moved: false, t: performance.now(), id: e.pointerId, button: e.button };
      if (hit && hit.type === 'tether') { App.tetherSel = hit.id; App.dirty = true; }
      if (hit && (hit.type === 'token')) { App.select(hit.id); const t = App.tok(hit.id); if (t && App.canControl(t) && !t.dead) { const p = tokPos(t); downInfo.grab = { dx: p.x - w.x, dy: p.y - w.y }; downInfo.canDrag = true; } }
      if (hit && hit.type === 'handle') { downInfo.canDrag = true; }
      if (!hit) { App.sel = null; App.tetherSel = null; App.dirty = true; }
    });
    c.addEventListener('pointermove', (e) => {
      if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const w = App.s2w(e.clientX, e.clientY);
      App.mouse = { sx: e.clientX, sy: e.clientY, w };
      if (pinch && ptrs.size >= 2) {
        const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
        App.cam.tz = App.cam.z = clamp(pinch.z * d / pinch.d, zoomMin(), 90); App._userCam = true; return;
      }
      if (App.ruler && App.ruler.live) { App.ruler.b = w; return; }
      if (downInfo && downInfo.id === e.pointerId) {
        const dx = e.clientX - downInfo.sx, dy = e.clientY - downInfo.sy;
        if (!downInfo.moved && Math.hypot(dx, dy) > 6) {
          downInfo.moved = true;
          if (downInfo.canDrag) startDrag(downInfo); else { downInfo.panning = true; c.classList.add('drag'); downInfo.cam0 = { x: App.cam.x, y: App.cam.y }; }
        }
        if (downInfo.moved) {
          if (App.drag) updateDrag(w, e);
          else if (downInfo.panning) { const k = App.cam; k.x = k.tx = downInfo.cam0.x - dx / k.z; k.y = k.ty = downInfo.cam0.y - dy / k.z; App._userCam = true; }
        }
      }
      // survol
      if (!App.drag) { const h = hitTest(w.x, w.y); App.hover = h; c.style.cursor = App.mode ? 'crosshair' : (h ? (h.type === 'handle' ? 'alias' : (h.type === 'token' && App.canControl(App.tok(h.id)) ? 'grab' : 'pointer')) : ''); }
    });
    const up = (e) => {
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) pinch = null;
      if (App.ruler && App.ruler.live) { App.ruler.live = false; setTimeout(() => { App.ruler = null; }, 4000); return; }
      if (App.drag) endDrag(true);
      if (downInfo && downInfo.id === e.pointerId) { c.classList.remove('drag'); downInfo = null; }
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', (e) => { ptrs.delete(e.pointerId); if (App.drag) endDrag(false); downInfo = null; pinch = null; c.classList.remove('drag'); });
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const before = App.s2w(e.clientX, e.clientY);
      const k = App.cam; const nz = clamp(k.tz * Math.exp(-e.deltaY * 0.0014), zoomMin(), 90);
      k.tz = nz; k.z = nz; // zoom immédiat, ancré sur le curseur
      const after = App.s2w(e.clientX, e.clientY);
      k.x += before.x - after.x; k.y += before.y - after.y; k.tx = k.x; k.ty = k.y; App._userCam = true;
    }, { passive: false });
    c.addEventListener('dblclick', (e) => {
      const w = App.s2w(e.clientX, e.clientY), h = hitTest(w.x, w.y);
      if (h && h.type === 'token') { const t = App.tok(h.id); if (App.canControl(t) || App.you.role === 'gm') UI.sheet(h.id); }
    });
  }
  function zoomMin() { const m = App.S ? App.S.map : { cols: 72, rows: 48 }; return Math.min((App.viewCenter().x * 2) / m.cols, (App.size.h - 110) / m.rows) * 0.8; }

  /* ---------- glisser-déposer des jetons ---------- */
  function startDrag(info) {
    const hit = info.hit; const t = App.tok(hit.id);
    if (!t) return;
    const d = App.disp[t.id];
    App.drag = { kind: hit.type === 'handle' ? 'rotate' : t.kind, id: t.id, grab: info.grab || { dx: 0, dy: 0 }, start: { x: t.x, y: t.y, r: t.r }, ghost: { x: t.x, y: t.y, r: t.r }, cost: null, ok: true };
    if (App.drag.kind === 'creature') { const p = tokPos(t); App.drag.ghost = { x: p.x, y: p.y, r: p.r }; App.drag.start = { x: p.x, y: p.y, r: p.r }; }
    cv().classList.add('drag');
  }
  function updateDrag(w, e) {
    const dr = App.drag, t = App.tok(dr.id); if (!t) return;
    if (dr.kind === 'rotate') {
      const d = App.disp[t.id]; let ang = Math.atan2(w.y - d.y, w.x - d.x) / R.RAD;
      if (!e.altKey) ang = Math.round(ang / 15) * 15;
      dr.ghost = { x: t.x, y: t.y, r: R.norm180(ang) };
      dr.cost = R.vehicleMoveCost(t, t.x, t.y, dr.ghost.r);
    } else if (dr.kind === 'vehicle') {
      let nx = w.x + dr.grab.dx, ny = w.y + dr.grab.dy;
      const mv = Math.hypot(nx - t.x, ny - t.y);
      let nr = t.r;
      if (mv > 0.7 && !e.shiftKey) {
        const dir = Math.atan2(ny - t.y, nx - t.x) / R.RAD;
        if (Math.abs(R.angDiff(t.r, dir)) <= 100) nr = dir;
      }
      if (App._rotOffset) nr = R.norm180(nr + App._rotOffset);
      dr.ghost = { x: nx, y: ny, r: R.norm180(nr) };
      dr.cost = R.vehicleMoveCost(t, nx, ny, dr.ghost.r);
    } else {
      dr.ghost = { x: w.x + dr.grab.dx, y: w.y + dr.grab.dy, r: dr.ghost.r };
    }
  }
  function endDrag(commit) {
    const dr = App.drag; App.drag = null; cv().classList.remove('drag'); App._rotOffset = 0;
    if (!dr || !commit) return;
    const t = App.tok(dr.id); if (!t) return;
    const moved = Math.hypot(dr.ghost.x - dr.start.x, dr.ghost.y - dr.start.y) > 0.15 || (dr.kind !== 'creature' && Math.abs(R.angDiff(dr.start.r, dr.ghost.r)) > 2);
    if (!moved) return;
    // petit "snap" sur la grille pour les créatures
    let x = dr.ghost.x, y = dr.ghost.y;
    App.act({ a: 'move', id: t.id, x, y, r: dr.ghost.r }).then((r) => { if (r && r.ok && t.kind === 'creature') A.play('step', { vol: 0.5 }); });
  }

  /* ================== clavier ================== */
  addEventListener('keydown', (e) => {
    if (/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '') || !$('#modal-back').classList.contains('hidden')) return;
    const k = e.key.toLowerCase();
    if (k === 'escape') { if (App.mode) App.cancelMode(); else { App.sel = null; App.rulerOn = false; } }
    else if (k === 'f') { App._userCam = false; App.fit(); }
    else if (k === 'm') { App.rulerOn = !App.rulerOn; UI.toast(App.rulerOn ? 'Règle : glissez pour mesurer (M pour quitter)' : 'Règle désactivée'); }
    else if (k === '?') UI.help();
    else if ((k === 'q' || k === 'e')) {
      const v = App.sel && App.tok(App.sel);
      const veh = v && (v.kind === 'vehicle' ? v : null);
      if (App.drag && App.drag.kind === 'vehicle') { App._rotOffset = (App._rotOffset || 0) + (k === 'q' ? -15 : 15); }
      else if (veh && App.canControl(veh)) App.act({ a: 'move', id: veh.id, x: veh.x, y: veh.y, r: R.norm180(veh.r + (k === 'q' ? -15 : 15)) });
    }
    else if (k === ' ') { e.preventDefault(); const t = App.S && App.tok(App.S.activeId); if (App.S && App.S.phase === 'combat' && t && App.canControl(t)) App.act({ a: 'endTurn' }); }
  });

  /* ================== effets reçus du serveur ================== */
  function pos(id) { const t = App.tok(id); return t ? tokPos(t) : null; }
  function pan(x) { const sx = App.w2s(x, 0)[0]; return clamp((sx / App.size.w - 0.5) * 1.6, -1, 1); }
  function sfx(name, x, vol) {
    const o = { vol: vol === undefined ? 1 : vol };
    if (x !== undefined && App.S) o.pan = pan(x);
    A.play(name, o);
  }
  const TYPE_COL = { feu: '#ff8a3a', froid: '#9fdcff', foudre: '#fff08a', nécrotique: '#8fe0a0', radiant: '#fff4b0', force: '#e7a8ff', psychique: '#ff9ad8', poison: '#7fe06a', acide: '#b8ff5a', tonnerre: '#bfc8ff' };

  App.onFx = function (list) {
    for (const f of list) { try { handleFx(f); } catch (e) { console.warn('fx', f.k, e); } }
  };

  function handleFx(f) {
    const gm = App.you.role === 'gm';
    switch (f.k) {
      case 'init': {
        const p = pos(f.id) || { x: App.cam.x, y: App.cam.y };
        if (!f.silent || gm) { FX.text(p.x, p.y - 1.2, `Init ${f.total}`, { color: f.side === 'enemy' ? '#ff7a6a' : '#7ff7d6', size: 30 }); sfx('init', p.x, 0.8); }
        break;
      }
      case 'phase':
        if (f.phase === 'initiative') { UI.banner('Initiative !', 'Lancez les dés', '', 1900); sfx('round'); FX.shake(6); }
        else if (f.phase === 'combat') { UI.banner('Le combat commence', '', '', 1700); sfx('turn'); }
        break;
      case 'round': if (f.n > 1) { UI.banner('Round ' + f.n, '', '', 1300); sfx('round', undefined, 0.6); } break;
      case 'turn': {
        if (f.hidden && !gm) break;
        const t = App.tok(f.id), mine = t && App.canControl(t) && !gm;
        UI.banner(mine ? `À vous, ${f.name}` : `Tour de ${f.name}`, `Round ${f.round}`, f.side === 'party' ? 'party' : '', 1500);
        sfx(mine ? 'myTurn' : 'turn', undefined, mine ? 1 : 0.8);
        if (t && !App.settings.noCinema) { App.focus(f.id); App.camSpeed = 3.5; }
        break;
      }
      case 'attack': playAttack(f); break;
      case 'dmg': { FX.text(f.x, f.y - 0.5, '−' + f.n, { color: '#ff5a3a', size: 34 }); sfx('hit', f.x); FX.impact(f.x, f.y, 0, {}); break; }
      case 'heal': { FX.text(f.x, f.y - 0.5, '+' + f.n, { color: '#7fe06a', size: 34 }); sfx('heal', f.x); FX.ring(f.x, f.y, 1.6, { c: [127, 224, 106], max: 0.6 }); break; }
      case 'death': { FX.explosion(f.x, f.y, 0.45); sfx('death', f.x); FX.text(f.x, f.y - 0.8, 'ABATTU', { color: '#ff6a4a', size: 30 }); break; }
      case 'down': { const p = pos(f.id); if (p) { FX.text(p.x, p.y - 1, 'À TERRE', { color: '#ff8a7a', size: 30 }); FX.ring(p.x, p.y, 1.8, { c: [255, 70, 50] }); } sfx('down', p ? p.x : undefined); UI.flash('#7a0a10'); break; }
      case 'relentless': { const p = pos(f.id); if (p) { FX.text(p.x, p.y - 1, 'ACHARNEMENT', { color: '#ffd36b', size: 30 }); FX.ring(p.x, p.y, 2.2, { c: [255, 211, 107] }); } sfx('relentless', p ? p.x : undefined); break; }
      case 'destroy': {
        FX.explosion(f.x, f.y, 2.2); sfx('destroy', f.x); UI.flash('#ff7a2a'); UI.banner('Épave', 'La broyeuse explose', '', 2000);
        break;
      }
      case 'bump': FX.impact(f.x, f.y, 0, { n: 14 }); sfx('bump', f.x); FX.shake(5); break;
      case 'ram': {
        const mx = (f.fx + f.tx) / 2, my = (f.fy + f.ty) / 2;
        FX.explosion(mx, my, 0.7); FX.impact(mx, my, 0, { n: 20 }); sfx('ram', mx); FX.shake(f.dmg > 0 ? 16 : 6);
        FX.text(mx, my - 1.2, f.dmg > 0 ? '−' + f.dmg : 'RATÉ', { color: f.dmg > 0 ? '#ff5a3a' : '#c7bba3', size: 42, crit: f.dmg > 0 });
        break;
      }
      case 'mishap': {
        FX.explosion(f.x, f.y, 0.5); sfx('mishap', f.x); FX.shake(10); UI.flash('#ff7a1a');
        UI.toast(`⚙ Avarie : ${f.name} — ${f.text}`, 'err');
        break;
      }
      case 'tether': sfx('tetherHit'); break;
      case 'reel': { sfx('reel'); FX.shake(3); break; }
      case 'cut': FX.spark(f.x, f.y, 24, { speed: 1.3 }); FX.text(f.x, f.y - 0.6, 'CÂBLE TRANCHÉ', { color: '#e8dcc4', size: 28 }); sfx('cut', f.x); break;
      case 'lava': { const p = pos(f.id); if (p) { FX.explosion(p.x, p.y, 0.6); } sfx('lava', p ? p.x : undefined); UI.toast('⚠ Dans la lave !', 'err'); break; }
      case 'dash': { vehicleBurst(f.id); sfx('dash'); FX.shake(3); break; }
      case 'overdrive': { vehicleBurst(f.id, true); sfx('overdrive'); FX.shake(4); const a = App.anim[f.id]; if (a) a.boost = 1.5; break; }
      case 'step': { const p = pos(f.id); if (f.boarded && p) { sfx('metal', p.x, 0.5); FX.spark(p.x, p.y, 6); } else if (p && App.cam.z > 20) sfx('step', p.x, 0.35); break; }
      case 'drive': { const t = App.tok(f.id); if (t && f.cost > 6) sfx('engineSurge', f.to.x, 0.35); break; }
      case 'reveal': {
        for (const id of f.ids) { const p = pos(id); if (p) { FX.flash(p.x, p.y, 2.2, { max: 0.35 }); FX.ring(p.x, p.y, 2.4, { c: [255, 90, 30] }); } }
        break;
      }
      case 'music': A.setLevel(f.level); break;
      case 'map': App.mapKey = ''; App.buildMap(); break;
      case 'gmfx': {
        if (f.name === 'explosion') { FX.explosion(f.x, f.y, 1); sfx('explosion', f.x); UI.flash('#ff7a2a'); }
        else if (f.name === 'roar') sfx('roar'); else if (f.name === 'horn') sfx('horn'); else if (f.name === 'siren') sfx('siren');
        break;
      }
      case 'suggest': UI.suggest(f.beat, f.msg); break;
      case 'dice': {
        if (f.secret && !gm) break;
        UI.lastDiceTotal = f.total; const el = $('#bigroll'); if (el) el.textContent = f.total;
        sfx('dice'); if (f.nat === 20) UI.toast(`${f.who} : 20 naturel !`, 'ok'); else if (f.nat === 1) UI.toast(`${f.who} : 1 naturel…`, 'err');
        break;
      }
      case 'reset': App.disp = {}; App.anim = {}; App.sel = null; App.cancelMode(); break;
      case 'beat': runBeat(f); break;
    }
  }

  function vehicleBurst(id, gold) {
    const t = App.tok(id), d = App.disp[id]; if (!t || !d) return;
    for (const s of [-1, 1]) { const p = R.toWorld(d, -1.9, s * 0.62); FX.fire(p.x, p.y, 14, { vx: Math.cos(d.r * R.RAD) * -3, vy: Math.sin(d.r * R.RAD) * -3, c: gold ? [200, 255, 240] : [255, 190, 70] }); FX.spark(p.x, p.y, 8, { dir: (d.r + 180) * R.RAD, spread: 0.5 }); }
    FX.ring(d.x, d.y, 3.4, { c: gold ? [92, 242, 200] : [255, 160, 70], max: 0.6 });
  }

  /* ---------- séquence d'attaque animée ---------- */
  function playAttack(f) {
    const att = App.tok(f.from);
    const ap = att ? tokPos(att) : { x: f.fx, y: f.fy };
    const tgtTok = f.to ? App.tok(f.to) : null;
    const tp = tgtTok ? tokPos(tgtTok) : { x: f.tx, y: f.ty };
    const ang = Math.atan2(tp.y - ap.y, tp.x - ap.x);
    const dist = Math.hypot(tp.x - ap.x, tp.y - ap.y);
    // animation du véhicule source
    const veh = att && att.aboard ? App.tok(att.aboard.v) : null;
    const an = veh && App.anim[veh.id];
    const st = veh && att.aboard.station;
    if (an && st === 'chomper') an.jawK = 1;
    if (an && st === 'ball') { an.swingV += (st === 'ball' ? 14 : 0); }
    if (an && (st === 'harpoonL' || st === 'harpoonR')) { const lp = R.toLocal(App.disp[veh.id], tp.x, tp.y); const la = Math.atan2(lp.ly - (st === 'harpoonL' ? -0.95 : 0.95), lp.lx + 1.45); if (st === 'harpoonL') { an.aimLt = la; an.fireL = App.time; } else { an.aimRt = la; an.fireR = App.time; } }
    let delay = 0;
    const col = TYPE_COL[f.type] ? TYPE_COL[f.type] : '#ffffff';
    const land = () => impact(f, tp, ang, col);
    if (f.wkind === 'harpoon') { sfx('harpoon', ap.x); FX.projectile({ kind: 'harpoon', from: ap, to: tp, dur: clamp(dist / 38, 0.18, 0.5), onHit: land }); }
    else if (f.wkind === 'spell') {
      if (/Bandeau|rayon/i.test(f.wname)) { sfx('ray', ap.x); FX.ray(ap, tp, { dur: 0.28, onHit: land }); }
      else { sfx('fireball', ap.x); FX.projectile({ kind: 'fireball', from: ap, to: tp, dur: clamp(dist / 28, 0.2, 0.6), onHit: land }); }
    } else if (f.wkind === 'ranged') { sfx('bolt', ap.x); FX.projectile({ kind: 'bolt', from: ap, to: tp, dur: clamp(dist / 45, 0.12, 0.4), onHit: land }); }
    else { // mêlée
      if (st === 'chomper') sfx('metal', ap.x, 0.5); else sfx('slash', ap.x);
      const sl = () => { FX.spark(lerp(ap.x, tp.x, 0.85), lerp(ap.y, tp.y, 0.85), 5, { dir: ang, spread: 0.6 }); };
      setTimeout(() => { sl(); land(); }, st === 'ball' ? 260 : 130);
    }
    // l'attaquant se tourne
    if (att && att.kind === 'creature') { const d = App.disp[att.id]; if (d) d.facing = ang; }
  }
  function impact(f, tp, ang, col) {
    if (f.secret && App.you.role !== 'gm') return;
    const big = f.tkind === 'vehicle';
    if (!f.hit) {
      FX.text(tp.x, tp.y - 0.9, f.fumble ? 'ÉCHEC CRITIQUE' : 'RATÉ', { color: '#bdb29a', size: 24 });
      sfx('miss', tp.x, 0.8);
      if (f.fumble) FX.spark(tp.x, tp.y, 4, { dir: ang + Math.PI });
      return;
    }
    if (f.immune) {
      FX.text(tp.x, tp.y - 0.9, 'IMMUNISÉ', { color: '#8fd4ff', size: 30 }); FX.ring(tp.x, tp.y, 1.4, { c: [140, 210, 255] });
      FX.spark(tp.x, tp.y, 14, { dir: ang + Math.PI, spread: 1.4, c: [190, 230, 255] }); sfx('ricochet', tp.x); return;
    }
    if (f.ricochet) {
      FX.text(tp.x, tp.y - 0.9, 'RICOCHE', { color: '#d8d0bf', size: 28 }); FX.spark(tp.x, tp.y, 16, { dir: ang + Math.PI, spread: 1.2 });
      sfx('ricochet', tp.x); FX.shake(2); return;
    }
    FX.impact(tp.x, tp.y, ang, { n: f.crit ? 22 : 10 });
    if (big) { FX.debris(tp.x, tp.y, f.crit ? 14 : 6); FX.smoke(tp.x, tp.y, 3, { r1: 1.3 }); }
    if (col !== '#ffffff') FX.fire(tp.x, tp.y, 8, { r0: 0.3 });
    FX.text(tp.x, tp.y - 0.9, '−' + f.dmg, { color: f.crit ? '#ffd36b' : (col === '#ffffff' ? '#ff6a4a' : col), size: f.crit ? 40 : 32, crit: f.crit });
    sfx(big ? 'metal' : 'hit', tp.x, 1); if (f.crit) { sfx('crit', tp.x); FX.shake(10); UI.flash('#ffb040'); UI.banner('Coup critique !', '', 'crit', 1100); } else FX.shake(Math.min(10, 2 + f.dmg / 4));
    if (f.mishap) { /* l'avarie a son propre effet */ }
  }

  /* ---------- séquences cinématiques ---------- */
  function runBeat(f) {
    for (const a of f.do) {
      switch (a.t) {
        case 'banner': UI.banner(a.text, a.sub, '', 2600); break;
        case 'speech': UI.speech(a.who, a.text, 6500); break;
        case 'music': A.setLevel(a.level); break;
        case 'sfx': setTimeout(() => A.play(a.name), a.name === 'engineSurge' ? 350 : 0); break;
        case 'shake': FX.shake(a.amp); break;
        case 'flash': UI.flash(a.color); break;
        case 'cam': if (!App.settings.noCinema) { App.camTo(a.x, a.y, 1 / a.zoom * 1.0, a.ms); } break;
        case 'reveal': for (const id of a.ids) { const p = pos(id); if (p) { FX.flash(p.x, p.y, 2.4, { max: 0.4 }); FX.ring(p.x, p.y, 2.6, { c: [255, 90, 30], max: 0.7 }); } } break;
        default: break;
      }
    }
  }

  /* ================== boucle de mise à jour ================== */
  function update(dt) {
    const S = App.S; if (!S) return;
    App.time += dt;
    const k = App.cam;
    const sp = App.camSpeed || 8;
    const f = 1 - Math.exp(-dt * sp);
    k.x = lerp(k.x, k.tx, f); k.y = lerp(k.y, k.ty, f); k.z = lerp(k.z, k.tz, 1 - Math.exp(-dt * 6));
    if (Math.abs(k.x - k.tx) < 0.01 && Math.abs(k.z - k.tz) < 0.01) App.camSpeed = 8;
    // pas de zoom sous le minimum
    k.tz = clamp(k.tz, zoomMin(), 90);
    k.tx = clamp(k.tx, 0, S.map.cols); k.ty = clamp(k.ty, 0, S.map.rows);

    // lissage des positions
    for (const t of Object.values(S.tokens)) {
      const d = App.disp[t.id]; if (!d) continue;
      const px = d.x, py = d.y;
      const rate = t.kind === 'vehicle' ? 5.5 : 12;
      const ff = 1 - Math.exp(-dt * rate);
      d.x = lerp(d.x, t.x, ff); d.y = lerp(d.y, t.y, ff);
      d.r = d.r + R.angDiff(d.r, t.r) * ff;
      d.vx = (d.x - px) / dt; d.vy = (d.y - py) / dt; d.speed = Math.hypot(d.vx, d.vy);
    }

    // animation des véhicules
    for (const t of Object.values(S.tokens)) {
      if (t.kind !== 'vehicle') continue;
      const d = App.disp[t.id], a = App.anim[t.id]; if (!d || !a) continue;
      const dead = t.veh.destroyed;
      const fwd = Math.cos(d.r * R.RAD) * d.vx + Math.sin(d.r * R.RAD) * d.vy;
      a.speed = lerp(a.speed, Math.min(1.5, d.speed / 8), 1 - Math.exp(-dt * 4));
      a.tread += fwd * dt;
      a.spin += dt * (dead ? 0 : 0.7 + a.speed * 1.8 + (a.boost || 0));
      a.boost = (a.boost || 0) * Math.pow(0.2, dt);
      a.jawK *= Math.pow(0.02, dt);
      a.jaw = dead ? 0.6 : 0.12 + 0.1 * Math.sin(App.time * 1.7 + t.x) + a.jawK * 0.9;
      // pendule du boulet
      const target = dead ? 0 : Math.sin(App.time * 1.4) * 0.1 * (0.3 + a.speed);
      a.swingV += (-26 * (a.swing - target) - 3.2 * a.swingV) * dt; a.swing += a.swingV * dt;
      a.swing = clamp(a.swing, -1.5, 1.5);
      // tourelles de harpon : vers la cible ou position de repos
      const restL = -1.05, restR = 1.05;
      a.aimL = lerp(a.aimL, a.aimLt !== null ? a.aimLt : restL, 1 - Math.exp(-dt * 6));
      a.aimR = lerp(a.aimR, a.aimRt !== null ? a.aimRt : restR, 1 - Math.exp(-dt * 6));
      if (a.aimLt !== null && App.time - a.fireL > 1.2) a.aimLt = null;
      if (a.aimRt !== null && App.time - a.fireR > 1.2) a.aimRt = null;

      // empreintes de chenilles
      if (App.terrain && d.speed > 0.4 && !dead) stampTracks(t, d, a);
      else if (a) a.lastStamp = null;

      // fumée, poussière, feu
      if (!dead) {
        if (Math.random() < dt * (14 + a.speed * 26)) for (const s of [-1, 1]) { const p = R.toWorld(d, -1.82, s * 0.62); FX.smoke(p.x, p.y, 1, { vx: -Math.cos(d.r * R.RAD) * 1.2, vy: -Math.sin(d.r * R.RAD) * 1.2, r0: 0.14, r1: 0.7, a: 0.25 + a.speed * 0.15, c: t.side === 'party' ? [62, 74, 76] : [60, 40, 32] }); if (Math.random() < 0.3 + a.speed * 0.3) FX.fire(p.x, p.y, 1, { r0: 0.14, vx: -Math.cos(d.r * R.RAD) * 2, vy: -Math.sin(d.r * R.RAD) * 2 }); }
        if (a.speed > 0.25 && Math.random() < dt * 40 * a.speed) for (const s of [-1, 1]) { const p = R.toWorld(d, -1.9, s * 1.2); FX.dust(p.x, p.y, 1, { a: 0.18 + a.speed * 0.1 }); }
        const hp = t.hp !== undefined ? t.hp / t.maxHp : (t.hpPct || 100) / 100;
        if (hp < 0.5 && Math.random() < dt * (hp < 0.25 ? 30 : 12)) { const p = R.toWorld(d, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 1.6); FX.smoke(p.x, p.y, 1, { c: [20, 16, 14], a: 0.5, r1: 1.1 }); if (hp < 0.25 && Math.random() < 0.5) FX.fire(p.x, p.y, 1, { r0: 0.3 }); }
      } else if (Math.random() < dt * 22) {
        const p = R.toWorld(d, (Math.random() - 0.5) * 3.4, (Math.random() - 0.5) * 2); FX.smoke(p.x, p.y, 1, { c: [18, 14, 12], a: 0.55, r1: 1.4, long: 1.5 }); if (Math.random() < 0.6) FX.fire(p.x, p.y, 1, { r0: 0.32 });
      }
      // moteur sonore
      updateEngine(t, d, a, dead);
    }
    // épaves brûlantes de la carte
    if (App.geo && App.geo.wrecks && Math.random() < dt * 8) for (const w of App.geo.wrecks) if (w.burning && Math.random() < 0.3) { FX.fire(w.x + (Math.random() - 0.5) * 1.1, w.y + (Math.random() - 0.5) * 0.7, 1, { r0: 0.28 }); if (Math.random() < 0.5) FX.smoke(w.x, w.y, 1, { c: [24, 18, 16], a: 0.45, r1: 1.3, long: 1.4 }); }
    // lave : étincelles et bouillonnement
    if (App.geo && App.geo.lava.length && Math.random() < dt * 10) { const l = App.geo.lava[Math.floor(Math.random() * App.geo.lava.length)], p = l[Math.floor(Math.random() * l.length)]; if (p) FX.fire(p.x + (Math.random() - 0.5) * p.w * 0.6, p.y + (Math.random() - 0.5) * p.w * 0.6, 1, { r0: 0.2, vy: -0.6 }); }

    // décalques de brûlure
    while (FX.decals.length && App.terrain) stampScorch(FX.decals.pop());
    FX.update(dt);
    const sa = FX.shakeAmp; App._shake = sa > 0.3 ? FX.shakeOffset() : { x: 0, y: 0 };
  }

  function stampTracks(t, d, a) {
    const tr = App.terrain.tracks; const tp = App.terrain.cp * 0.5;
    const ctx = tr.getContext('2d');
    const cur = { x: d.x, y: d.y, r: d.r };
    const prev = a.lastStamp || cur;
    ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(8,3,2,0.17)'; ctx.lineWidth = 0.46 * tp;
    for (const s of [-1, 1]) {
      const p0 = R.toWorld(prev, 0, s * 1.21), p1 = R.toWorld(cur, 0, s * 1.21);
      ctx.beginPath(); ctx.moveTo(p0.x * tp, p0.y * tp); ctx.lineTo(p1.x * tp, p1.y * tp); ctx.stroke();
    }
    a.lastStamp = cur;
  }
  function stampScorch(dc) {
    const tr = App.terrain.tracks, tp = App.terrain.cp * 0.5, ctx = tr.getContext('2d');
    const g = ctx.createRadialGradient(dc.x * tp, dc.y * tp, 0, dc.x * tp, dc.y * tp, dc.r * tp);
    g.addColorStop(0, 'rgba(4,1,1,0.75)'); g.addColorStop(0.6, 'rgba(10,3,2,0.4)'); g.addColorStop(1, 'rgba(10,3,2,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(dc.x * tp, dc.y * tp, dc.r * tp, 0, 6.2832); ctx.fill();
  }

  function updateEngine(t, d, a, dead) {
    if (!A.on) return;
    if (dead || (t.hidden && App.you.role !== 'gm')) { A.engineStop(t.id); return; }
    if (!A.engines[t.id]) A.engineStart(t.id, t.side);
    const s = App.w2s(d.x, d.y);
    const cx = App.viewCenter();
    const dist = Math.hypot(s[0] - cx.x, s[1] - cx.y) / App.cam.z; // en cases du centre de la vue
    const vol = clamp(1.15 - dist / 40, 0.08, 1) * (t.hidden ? 0.5 : 1);
    const dashed = t.veh.dashed ? 0.2 : 0, od = t.veh.overdrive ? 0.2 : 0;
    const rpm = clamp(0.12 + a.speed * 0.7 + dashed + od + (a.boost || 0) * 0.2, 0, 1);
    A.engineSet(t.id, rpm, vol, clamp((s[0] / App.size.w - 0.5) * 1.6, -1, 1));
  }

  /* ================== rendu ================== */
  let ctx;
  function draw() {
    const S = App.S;
    ctx.setTransform(App.size.dpr, 0, 0, App.size.dpr, 0, 0);
    ctx.fillStyle = '#0a0505'; ctx.fillRect(0, 0, App.size.w, App.size.h);
    if (!S) return;
    const k = App.cam, z = k.z, m = S.map;
    const [ox, oy] = App.w2s(0, 0);
    // terrain
    if (App.terrain) {
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(App.terrain.canvas, ox, oy, m.cols * z, m.rows * z);
      ctx.drawImage(App.terrain.tracks, ox, oy, m.cols * z, m.rows * z);
    }
    // lueur de lave animée
    if (App.geo && App.geo.lava.length) {
      ctx.save(); ctx.beginPath(); ctx.rect(ox, oy, m.cols * z, m.rows * z); ctx.clip(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const pulse = 0.5 + 0.5 * Math.sin(App.time * 1.6);
      for (const [wMul, a0] of [[2.1, 0.035], [1.1, 0.07], [0.5, 0.09]]) {
        ctx.strokeStyle = `rgba(255,${wMul < 1 ? 150 : 70},20,${a0 * (0.6 + pulse * 0.8)})`;
        for (const poly of App.geo.lava) {
          ctx.lineWidth = poly[Math.floor(poly.length / 2)].w * z * wMul;
          ctx.beginPath(); poly.forEach((p, i) => { const s = App.w2s(p.x, p.y); i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]); }); ctx.stroke();
        }
      }
      ctx.restore();
    }
    // grille
    if (m.grid) drawGrid(m, z, ox, oy);

    drawTethers(S);
    drawOverlays(S, z);

    // véhicules, puis créatures
    const toks = Object.values(S.tokens);
    for (const t of toks) if (t.kind === 'vehicle') drawVehicle(t, z);
    for (const t of toks.filter((q) => q.kind === 'creature' && !q.aboard)) drawCreature(t, z);
    for (const t of toks.filter((q) => q.kind === 'creature' && q.aboard)) drawCreature(t, z);

    drawDragGhost(S, z);
    FX.draw(ctx, App.w2s, z);
    drawLabels(S, z);
    drawRuler(z);
    FX.drawEmbers(ctx, App.time);
  }

  function drawGrid(m, z, ox, oy) {
    ctx.save(); ctx.lineWidth = 1;
    const x0 = Math.max(0, Math.floor(App.s2w(0, 0).x)), x1 = Math.min(m.cols, Math.ceil(App.s2w(App.size.w, 0).x));
    const y0 = Math.max(0, Math.floor(App.s2w(0, 0).y)), y1 = Math.min(m.rows, Math.ceil(App.s2w(0, App.size.h).y));
    for (let x = x0; x <= x1; x++) { ctx.strokeStyle = x % 5 === 0 ? 'rgba(255,225,190,0.13)' : 'rgba(255,225,190,0.055)'; const sx = Math.round(ox + x * z) + 0.5; ctx.beginPath(); ctx.moveTo(sx, oy + y0 * z); ctx.lineTo(sx, oy + y1 * z); ctx.stroke(); }
    for (let y = y0; y <= y1; y++) { ctx.strokeStyle = y % 5 === 0 ? 'rgba(255,225,190,0.13)' : 'rgba(255,225,190,0.055)'; const sy = Math.round(oy + y * z) + 0.5; ctx.beginPath(); ctx.moveTo(ox + x0 * z, sy); ctx.lineTo(ox + x1 * z, sy); ctx.stroke(); }
    ctx.restore();
  }

  function drawTethers(S) {
    for (const th of S.tethers) {
      const a = App.disp[th.from], b = App.disp[th.to], ta = App.tok(th.from), tb = App.tok(th.to); if (!a || !b || !ta || !tb) continue;
      // départ : extrémité du canon qui a tiré (la plus proche de la cible)
      const cand = [R.toWorld(a, -1.45, -0.95), R.toWorld(a, -1.45, 0.95)];
      const from = cand.sort((p, q) => Math.hypot(p.x - b.x, p.y - b.y) - Math.hypot(q.x - b.x, q.y - b.y))[0];
      const to = { x: b.x, y: b.y };
      const dist = Math.hypot(to.x - from.x, to.y - from.y);
      const slack = clamp(1 - dist / th.len, 0, 1);
      const sag = slack * 3.2 * (0.7 + 0.3 * Math.sin(App.time * 2 + th.from.length));
      const mx = (from.x + to.x) / 2 - (to.y - from.y) / (dist || 1) * sag, my = (from.y + to.y) / 2 + (to.x - from.x) / (dist || 1) * sag;
      const s0 = App.w2s(from.x, from.y), s1 = App.w2s(mx, my), s2 = App.w2s(to.x, to.y);
      const sel = App.tetherSel === th.id || (App.hover && App.hover.type === 'tether' && App.hover.id === th.id);
      ctx.save(); ctx.lineCap = 'round';
      ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 4;
      ctx.strokeStyle = '#3b2a20'; ctx.lineWidth = Math.max(3, App.cam.z * 0.14);
      ctx.beginPath(); ctx.moveTo(s0[0], s0[1]); ctx.quadraticCurveTo(s1[0], s1[1], s2[0], s2[1]); ctx.stroke();
      ctx.shadowColor = 'transparent'; ctx.strokeStyle = sel ? '#ffd36b' : '#a58a64'; ctx.lineWidth = Math.max(1.5, App.cam.z * 0.06); ctx.setLineDash([App.cam.z * 0.14, App.cam.z * 0.1]);
      ctx.beginPath(); ctx.moveTo(s0[0], s0[1]); ctx.quadraticCurveTo(s1[0], s1[1], s2[0], s2[1]); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#e8dcc0'; ctx.beginPath(); ctx.arc(s2[0], s2[1], Math.max(3, App.cam.z * 0.16), 0, 6.2832); ctx.fill();
      if (sel) { ctx.fillStyle = 'rgba(0,0,0,0.75)'; const lx = s1[0], ly = s1[1] - 14; ctx.font = `600 ${Math.max(11, App.cam.z * 0.4)}px "Barlow Semi Condensed", sans-serif`; ctx.textAlign = 'center'; ctx.fillText(`Câble ${th.hp}/${th.maxHp} PV`, lx, ly); }
      ctx.restore();
    }
  }

  // cercles de portée, zone de mouvement, cibles possibles
  function drawOverlays(S, z) {
    const sel = App.sel && S.tokens[App.sel];
    // budget de mouvement
    if (sel && App.canControl(sel) && !App.drag) {
      let rem = null, d = null;
      if (sel.kind === 'vehicle' && !sel.veh.destroyed) { rem = App.vehicleBudget(sel) - sel.veh.movedTurn; d = App.disp[sel.id]; if (S.phase !== 'combat') rem = App.vehicleBudget(sel); }
      else if (sel.kind === 'creature' && !sel.aboard && S.phase === 'combat' && sel.turn) { rem = sel.speed - sel.turn.moved; d = App.disp[sel.id]; }
      if (rem !== null && rem > 0 && d) { const s = App.w2s(d.x, d.y); ctx.save(); ctx.setLineDash([8, 8]); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(92,242,200,0.4)'; ctx.fillStyle = 'rgba(92,242,200,0.045)'; ctx.beginPath(); ctx.arc(s[0], s[1], rem * z, 0, 6.2832); ctx.fill(); ctx.stroke(); ctx.restore(); }
    }
    // mode ciblage
    const mr = modeRange();
    if (mr && mr.from) {
      const s = App.w2s(mr.from.x, mr.from.y), a = mr.tok;
      const rad = (mr.range + (a.kind === 'vehicle' ? Math.max(a.len, a.wid) / 2 : 0.5)) * z;
      ctx.save(); ctx.fillStyle = 'rgba(255,60,30,0.06)'; ctx.strokeStyle = 'rgba(255,90,50,0.6)'; ctx.lineWidth = 2; ctx.setLineDash([10, 7]);
      ctx.beginPath(); ctx.arc(s[0], s[1], rad, 0, 6.2832); ctx.fill(); ctx.stroke(); ctx.restore();
    }
  }

  function drawVehicle(t, z) {
    const d = App.disp[t.id], a = App.anim[t.id]; if (!d || !a) return;
    const s = App.w2s(d.x, d.y);
    if (s[0] < -6 * z || s[0] > App.size.w + 6 * z || s[1] < -6 * z || s[1] > App.size.h + 6 * z) return;
    const sel = App.sel === t.id, active = App.S.activeId && (App.pilotOf(t) || {}).id === App.S.activeId && App.S.phase === 'combat';
    ctx.save();
    ctx.translate(s[0], s[1]); ctx.rotate(d.r * R.RAD); ctx.scale(z, z);
    if (t.hidden) ctx.globalAlpha = 0.55;
    const hpPct = t.hp !== undefined ? t.hp / t.maxHp * 100 : (t.hpPct || 100);
    Sprites.grinder(ctx, t, { t: App.time, tread: a.tread, spin: a.spin, jaw: a.jaw, swing: a.swing, aimL: a.aimL, aimR: a.aimR, fireL: a.fireL, fireR: a.fireR, speed: a.speed, destroyed: t.veh.destroyed, hpPct, id: t.id });
    // contour de sélection
    const hull = [[-1.95, -1.0], [-1.95, 1.0], [1.15, 1.12], [1.82, 0.64], [1.82, -0.64], [1.15, -1.12]];
    const hov = App.hover && App.hover.type === 'token' && App.hover.id === t.id;
    const targetable = App.mode && isTargetable(t);
    if (sel || active || hov || targetable) {
      ctx.lineWidth = 0.09; ctx.strokeStyle = targetable ? '#ff3b1e' : active ? '#ffb040' : sel ? '#ffffff' : 'rgba(255,255,255,0.45)';
      ctx.shadowColor = targetable ? '#ff3b1e' : active ? '#ff7a1f' : '#fff'; ctx.shadowBlur = 14;
      ctx.beginPath(); hull.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.stroke();
      if (targetable) { ctx.lineWidth = 0.05; ctx.setLineDash([0.3, 0.2]); ctx.beginPath(); ctx.ellipse(0, 0, 3.0, 2.2, 0, 0, 6.2832); ctx.stroke(); }
    }
    // poignée de rotation
    if (sel && App.canControl(t) && !App.mode && !t.veh.destroyed) {
      ctx.shadowBlur = 0; ctx.setLineDash([]);
      const hx = t.len / 2 + 1.35;
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 0.04; ctx.beginPath(); ctx.moveTo(1.9, 0); ctx.lineTo(hx - 0.28, 0); ctx.stroke();
      ctx.fillStyle = 'rgba(14,8,8,0.85)'; ctx.strokeStyle = '#ffb040'; ctx.lineWidth = 0.07; ctx.beginPath(); ctx.arc(hx, 0, 0.3, 0, 6.2832); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#ffb040'; ctx.lineWidth = 0.06; ctx.beginPath(); ctx.arc(hx, 0, 0.15, -2.4, 1.0); ctx.stroke();
    }
    ctx.restore();
  }

  function isTargetable(t) {
    const m = App.mode; if (!m) return false;
    if (m.type === 'ram') { const v = App.tok(m.veh); return v && t.id !== v.id && R.gap(v, t) <= 1.2; }
    const a = App.tok(m.attacker); if (!a || t.id === a.id) return false;
    if (t.dead) return false;
    const mr = modeRange(); if (!mr) return false;
    return R.gap(a, t) <= mr.range + 0.05;
  }

  function drawCreature(t, z) {
    const p = tokPos(t), s = App.w2s(p.x, p.y);
    if (s[0] < -3 * z || s[0] > App.size.w + 3 * z || s[1] < -3 * z || s[1] > App.size.h + 3 * z) return;
    const S = App.S;
    const active = S.activeId === t.id && S.phase === 'combat';
    const sel = App.sel === t.id;
    const hov = App.hover && App.hover.type === 'token' && App.hover.id === t.id;
    const ghosted = App.drag && App.drag.id === t.id;
    Sprites.creature(ctx, t, { x: s[0], y: s[1], z, t: App.time, selected: sel || hov, active, aboard: !!t.aboard, targetable: App.mode && isTargetable(t), dim: ghosted ? 0.3 : (t.hidden ? 0.5 : 1) });
  }

  function drawDragGhost(S, z) {
    const dr = App.drag; if (!dr) return;
    const t = App.tok(dr.id); if (!t) return;
    const g = dr.ghost;
    ctx.save();
    if (t.kind === 'vehicle') {
      const s = App.w2s(g.x, g.y);
      const rem = S.phase === 'combat' ? App.vehicleBudget(t) - t.veh.movedTurn : Infinity;
      const ok = dr.cost && dr.cost.ok && dr.cost.cost <= rem + 1e-6;
      const col = ok ? '92,242,200' : '255,70,50';
      // trajet
      const s0 = App.w2s(t.x, t.y);
      ctx.strokeStyle = `rgba(${col},0.7)`; ctx.lineWidth = 3; ctx.setLineDash([10, 8]); ctx.beginPath(); ctx.moveTo(s0[0], s0[1]); ctx.lineTo(s[0], s[1]); ctx.stroke(); ctx.setLineDash([]);
      ctx.translate(s[0], s[1]); ctx.rotate(g.r * R.RAD); ctx.scale(z, z);
      ctx.globalAlpha = 0.5; ctx.fillStyle = `rgba(${col},0.18)`; ctx.strokeStyle = `rgba(${col},0.95)`; ctx.lineWidth = 0.08;
      const hull = [[-1.95, -1.5], [-1.95, 1.5], [2.28, 1.5], [2.28, -1.5]];
      ctx.beginPath(); hull.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(2.9, 0); ctx.lineTo(2.4, -0.4); ctx.moveTo(2.9, 0); ctx.lineTo(2.4, 0.4); ctx.stroke();
      ctx.restore(); ctx.save();
      const txt = !dr.cost ? '' : (dr.cost.ok ? `${dr.cost.cost.toFixed(1)} / ${isFinite(rem) ? Math.max(rem, 0).toFixed(1) : '∞'}${dr.cost.dir === 'back' ? ' (marche arrière)' : ''}` : 'Pas de dérapage latéral');
      label(s[0], s[1] - 3.3 * z, txt, ok ? '#7ff7d6' : '#ff8a7a', 20);
    } else {
      const s = App.w2s(g.x, g.y), s0 = App.w2s(dr.start.x, dr.start.y);
      const dist = Math.hypot(g.x - dr.start.x, g.y - dr.start.y);
      // départ à bord => la distance compte depuis la position courante, sauf si on reste dans le même véhicule
      const sameVeh = t.aboard && App.tok(t.aboard.v) && R.inHull(Object.assign({}, App.tok(t.aboard.v), { x: App.disp[t.aboard.v].x, y: App.disp[t.aboard.v].y, r: App.disp[t.aboard.v].r }), g.x, g.y, 0);
      const rem = S.phase === 'combat' && t.turn ? t.speed - t.turn.moved : Infinity;
      const ok = sameVeh || dist <= rem + 1e-6;
      ctx.strokeStyle = ok ? 'rgba(92,242,200,0.75)' : 'rgba(255,70,50,0.8)'; ctx.lineWidth = 3; ctx.setLineDash([8, 7]);
      ctx.beginPath(); ctx.moveTo(s0[0], s0[1]); ctx.lineTo(s[0], s[1]); ctx.stroke(); ctx.setLineDash([]);
      ctx.globalAlpha = 0.8;
      Sprites.creature(ctx, t, { x: s[0], y: s[1], z, t: App.time, selected: true, aboard: false });
      ctx.globalAlpha = 1;
      // siège le plus proche
      const veh = Object.values(S.tokens).find((q) => q.kind === 'vehicle' && !q.veh.destroyed && R.inHull(Object.assign({}, q, { x: App.disp[q.id].x, y: App.disp[q.id].y, r: App.disp[q.id].r }), g.x, g.y, 0));
      if (veh) {
        const vd = App.disp[veh.id];
        for (const st of veh.veh.stations) { const w = R.toWorld(vd, st.lx, st.ly); const sp = App.w2s(w.x, w.y); const near = Math.hypot(w.x - g.x, w.y - g.y) < 0.55; ctx.strokeStyle = near ? '#ffb040' : 'rgba(255,255,255,0.4)'; ctx.lineWidth = near ? 3 : 1.5; ctx.beginPath(); ctx.arc(sp[0], sp[1], 0.38 * z, 0, 6.2832); ctx.stroke(); if (near) label(sp[0], sp[1] - 0.7 * z, st.label, '#ffd89a', 17); }
      }
      if (!sameVeh) label(s[0], s[1] - 0.95 * z, `${(dist).toFixed(1)} cases · ${(dist * 5).toFixed(0)} ft`, ok ? '#7ff7d6' : '#ff8a7a', 18);
    }
    ctx.restore();
  }

  function label(x, y, text, color, size = 18) {
    if (!text) return;
    ctx.save(); ctx.font = `600 ${size}px Teko, "Arial Narrow", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(10,3,3,0.9)'; ctx.lineJoin = 'round'; ctx.strokeText(text, x, y); ctx.fillStyle = color; ctx.fillText(text, x, y); ctx.restore();
  }

  function drawLabels(S, z) {
    const showAll = !!App.settings.showNames;
    for (const t of Object.values(S.tokens)) {
      if (t.kind === 'vehicle') {
        const d = App.disp[t.id]; if (!d) continue;
        const s = App.w2s(d.x, d.y - 3.0);
        // barre de PV
        const w = 3.4 * z, h = Math.max(5, z * 0.2), x = s[0] - w / 2, y = s[1];
        const pct = t.hp !== undefined ? t.hp / t.maxHp : (t.hpPct || 0) / 100;
        if (s[0] < -w || s[0] > App.size.w + w) continue;
        ctx.save(); ctx.globalAlpha = t.hidden ? 0.5 : 1;
        ctx.fillStyle = 'rgba(8,3,3,0.85)'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
        ctx.fillStyle = pct > 0.5 ? (t.side === 'party' ? '#5cf2c8' : '#ff7a2f') : pct > 0.25 ? '#ffb040' : '#ff3b1e'; ctx.fillRect(x, y, w * Math.max(0, pct), h);
        if (t.veh.destroyed) { ctx.fillStyle = '#000'; }
        // seuil de dégâts
        ctx.restore();
        if (showAll || App.sel === t.id || (App.hover && App.hover.id === t.id)) label(s[0], y - 12, t.name + (t.hp !== undefined ? `  ${t.hp}/${t.maxHp}` : ''), t.side === 'party' ? '#c8fff1' : '#ffd0b8', 19);
        // pastilles d'avaries
        let i = 0; for (const m of t.veh.mishaps || []) { label(s[0] + (i - 0.5) * 0, y + h + 14 + i * 16, '⚙ ' + m.name, '#ffb040', 15); i++; }
      } else {
        const p = tokPos(t), s = App.w2s(p.x, p.y);
        if (showAll || App.sel === t.id || S.activeId === t.id || (App.hover && App.hover.id === t.id)) label(s[0], s[1] + (t.aboard ? 0.62 : 0.78) * z, t.name, t.side === 'enemy' ? '#ffb8a8' : '#d8fff4', Math.max(15, Math.min(22, z * 0.5)));
      }
    }
  }

  function drawRuler(z) {
    const r = App.ruler; if (!r) return;
    const a = App.w2s(r.a.x, r.a.y), b = App.w2s(r.b.x, r.b.y), d = Math.hypot(r.b.x - r.a.x, r.b.y - r.a.y);
    ctx.save(); ctx.strokeStyle = '#ffd36b'; ctx.lineWidth = 3; ctx.setLineDash([10, 6]); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#ffd36b'; for (const p of [a, b]) { ctx.beginPath(); ctx.arc(p[0], p[1], 5, 0, 6.2832); ctx.fill(); }
    ctx.restore(); label((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 16, `${d.toFixed(1)} cases · ${(d * 5).toFixed(0)} ft`, '#ffe9a8', 22);
  }

  /* ================== boucle principale ================== */
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    update(dt);
    draw();
    if (App.dirty || now - App.lastUI > 250) { App.dirty = false; App.lastUI = now; UI.renderAll(); }
    requestAnimationFrame(frame);
  }

  /* ================== démarrage ================== */
  function boot() {
    const cvs = $('#stage'); ctx = cvs.getContext('2d');
    resize(); setupInput();
    $('#btn-fit').onclick = () => { App._userCam = false; App.fit(); };
    $('#btn-settings').onclick = () => UI.settings();
    $('#btn-help').onclick = () => UI.help();
    $('#dock-toggle').onclick = () => { const d = $('#dock'); d.classList.toggle('collapsed'); document.body.classList.toggle('dock-open', !d.classList.contains('collapsed')); setTimeout(() => { if (!App._userCam) App.fit(); }, 300); };
    UI.lobby((join) => {
      A.init();
      for (const k of ['master', 'music', 'sfx', 'amb']) A.setVol(k, A.vol[k]);
      App.connect(join);
    }, !!App.gmKey);
    requestAnimationFrame(frame);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
