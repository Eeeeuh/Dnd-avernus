'use strict';
const fs = require('fs');
const path = require('path');
const Dice = require('./dice');
const Enc = require('./encounter');
const MapGen = require('../public/js/mapgen.js');
const R = require('../public/js/rules.js');

const SAVE_FILE = path.join(__dirname, '..', 'data', 'state.json');
const MAP_SEED = 66666;
const COLS = 72, ROWS = 48;
const PHYS = ['contondant', 'perforant', 'tranchant'];
const CONDITIONS = ['à terre', 'agrippé', 'entravé', 'empoisonné', 'en feu', 'étourdi', 'aveuglé', 'effrayé', 'inconscient'];
const TETHER_AC = 14, TETHER_HP = 12;

class Game {
  constructor() {
    this.fx = [];
    this.saveTimer = null;
    this.fxId = 1;
    if (!this.load()) this.reset();
  }

  /* ---------- état ---------- */
  fresh() {
    const geo = MapGen.generate(MAP_SEED, COLS, ROWS);
    const tokens = Enc.initialTokens(geo);
    const s = {
      rev: 0, phase: 'setup', round: 0, order: [], activeId: null, music: 0,
      map: { kind: 'procedural', seed: MAP_SEED, cols: COLS, rows: ROWS, image: null, grid: true },
      tokens, tethers: [], log: [], beatsDone: [], nextId: 1, gmNotes: '',
    };
    this.s = s;
    this.geo = geo;
    for (const t of Object.values(tokens)) if (t.kind === 'vehicle') this.syncCrew(t);
    this.sysLog('Nouvelle partie. Les aventuriers roulent vers l\'est dans le désert d\'Averne.');
  }
  reset() {
    this.fresh();
    this.save();
  }
  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8'));
      if (!raw || !raw.tokens) return false;
      this.s = raw;
      this.geo = raw.map.kind === 'procedural' ? MapGen.generate(raw.map.seed, raw.map.cols, raw.map.rows) : MapGen.generate(1, raw.map.cols, raw.map.rows);
      if (raw.map.kind !== 'procedural') { this.geo.rocks = []; this.geo.lava = []; }
      return true;
    } catch (e) {
      return false;
    }
  }
  save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      try {
        fs.mkdirSync(path.dirname(SAVE_FILE), { recursive: true });
        fs.writeFileSync(SAVE_FILE, JSON.stringify(this.s));
      } catch (e) { /* sauvegarde best effort */ }
    }, 400);
  }
  takeFx() {
    const f = this.fx; this.fx = []; return f;
  }
  pushFx(o) { o.fid = this.fxId++; this.fx.push(o); }

  /* ---------- utilitaires ---------- */
  tok(id) { return this.s.tokens[id] || null; }
  tokens() { return Object.values(this.s.tokens); }
  crewOf(vid) { return this.tokens().filter((t) => t.aboard && t.aboard.v === vid); }
  isAlive(t) { return t && !t.dead && (t.kind === 'vehicle' ? !t.veh.destroyed : true); }
  pilotOf(v) {
    return this.crewOf(v.id).find((c) => c.aboard.station === 'helm' && !c.dead && !c.conditions.includes('inconscient')) || null;
  }
  vehicleOf(t) { return t.aboard ? this.tok(t.aboard.v) : null; }
  syncCrew(v) {
    for (const c of this.crewOf(v.id)) {
      const p = R.toWorld(v, c.aboard.lx, c.aboard.ly);
      c.x = p.x; c.y = p.y; c.r = v.r;
    }
  }
  canControl(c, t) {
    if (c.role === 'gm') return true;
    if (!t || c.role !== 'player' || !c.slot) return false;
    if (t.owner && t.owner === c.slot) return true;
    if (t.kind === 'vehicle') {
      const p = this.pilotOf(t);
      return !!(p && p.owner === c.slot);
    }
    return false;
  }
  log(entry) {
    entry.id = (this.s.log.length ? this.s.log[this.s.log.length - 1].id : 0) + 1;
    entry.ts = Date.now();
    this.s.log.push(entry);
    if (this.s.log.length > 250) this.s.log.splice(0, this.s.log.length - 250);
  }
  sysLog(text, kind = 'sys') { this.log({ kind, text }); }
  nameOf(t) { return t ? t.name : '?'; }
  // CA du livre : valeur en mouvement, valeur « à l'arrêt » (profils), abri des postes (+5 important, +2 partiel).
  targetAC(t) {
    if (t.kind === 'vehicle') return t.veh.movedTurn > 0 ? t.ac : (t.acStopped !== undefined ? t.acStopped : t.ac);
    const v = this.vehicleOf(t);
    if (v && t.aboard.station) { const st = v.veh.stations.find((x) => x.id === t.aboard.station); if (st && st.cover) return t.ac + st.cover; }
    return t.ac;
  }

  /* ---------- vue filtrée pour un client ---------- */
  viewFor(c) {
    const gm = c.role === 'gm' && !c.ai;
    const s = this.s;
    const tokens = {};
    for (const t of this.tokens()) {
      if (t.hidden && !gm) continue;
      const copy = JSON.parse(JSON.stringify(t));
      if (!gm && t.side === 'enemy') {
        copy.hpPct = Math.max(0, Math.round((t.hp / t.maxHp) * 100));
        copy.bloodied = t.hp <= t.maxHp / 2;
        delete copy.hp; delete copy.maxHp; delete copy.ac; delete copy.attacks; delete copy.sheet; delete copy.notes;
        delete copy.initMod; delete copy.dexSave; delete copy.immuneNonMagical; delete copy.relentless; delete copy.relentlessUsed;
        if (copy.veh) {
          delete copy.veh.dmgThreshold; delete copy.veh.mishapThreshold; delete copy.veh.pilotBonus; delete copy.veh.soulCoins; delete copy.veh.dashLeft; delete copy.veh.ichor; delete copy.immune;
        }
      }
      tokens[t.id] = copy;
    }
    const visible = (id) => !!tokens[id];
    const log = s.log.filter((e) => gm || !e.secret);
    return {
      rev: s.rev, phase: s.phase, round: s.round, activeId: s.activeId && visible(s.activeId) ? s.activeId : (gm ? s.activeId : null),
      order: s.order.filter(visible), music: s.music, map: s.map, geo: this.mapGeoForClient(),
      tokens, tethers: s.tethers.filter((t) => visible(t.from) && visible(t.to)),
      log, beatsDone: s.beatsDone, gmNotes: gm ? s.gmNotes : undefined,
      conditions: CONDITIONS,
    };
  }
  mapGeoForClient() { return null; } // la géométrie est regénérée côté client à partir de la graine

  /* ---------- point d'entrée des actions ---------- */
  act(c, a) {
    try {
      const fn = this['do_' + a.a];
      if (!fn) return { ok: false, err: 'Action inconnue : ' + a.a };
      const res = fn.call(this, c, a) || {};
      if (res.err) return { ok: false, err: res.err };
      this.s.rev++;
      this.save();
      return Object.assign({ ok: true }, res);
    } catch (e) {
      return { ok: false, err: e.message || String(e) };
    }
  }
  needGM(c) { return c.role !== 'gm' ? { err: 'Réservé au MJ.' } : null; }

  /* ---------- initiative & tours ---------- */
  sortOrder() {
    const s = this.s;
    const list = this.tokens().filter((t) => t.kind === 'creature' && t.init !== null && !t.dead);
    list.sort((a, b) => b.init - a.init || (b.initMod || 0) - (a.initMod || 0) || (a.id < b.id ? -1 : 1));
    s.order = list.map((t) => t.id);
  }
  do_initRoll(c, a) {
    const t = this.tok(a.id);
    if (!t || t.kind !== 'creature') return { err: 'Jeton invalide.' };
    if (!this.canControl(c, t)) return { err: 'Ce n\'est pas votre personnage.' };
    if (this.s.phase === 'setup' && c.role !== 'gm') return { err: "L'initiative n'est pas encore lancée." };
    const d = Dice.d20(a.mode || 'none');
    const total = d.kept + (t.initMod || 0);
    t.init = total;
    this.sortOrder();
    this.pushFx({ k: 'init', id: t.id, name: t.name, roll: d.kept, rolls: d.rolls, mod: t.initMod || 0, total, side: t.side });
    this.log({ kind: 'roll', who: t.name, text: `Initiative : d20${d.rolls.length > 1 ? '[' + d.rolls.join(',') + ']' : '(' + d.kept + ')'} ${t.initMod >= 0 ? '+' : '−'} ${Math.abs(t.initMod || 0)} = ${total}`, secret: t.hidden });
  }
  do_initSet(c, a) {
    const g = this.needGM(c); if (g) return g;
    const t = this.tok(a.id); if (!t) return { err: 'Jeton introuvable.' };
    t.init = a.value === null || a.value === '' ? null : Number(a.value);
    this.sortOrder();
  }
  do_gmInitAll(c, a) {
    const g = this.needGM(c); if (g) return g;
    const sides = a.side === 'all' ? ['party', 'enemy'] : [a.side || 'enemy'];
    for (const t of this.tokens()) {
      if (t.kind !== 'creature' || t.dead || !sides.includes(t.side) || t.init !== null) continue;
      const d = Dice.d20('none');
      t.init = d.kept + (t.initMod || 0);
      this.pushFx({ k: 'init', id: t.id, name: t.name, roll: d.kept, rolls: d.rolls, mod: t.initMod || 0, total: t.init, side: t.side, silent: t.hidden });
      this.log({ kind: 'roll', who: t.name, text: `Initiative : ${t.init}`, secret: t.hidden });
    }
    this.sortOrder();
  }
  do_gmStartInitiative(c) {
    const g = this.needGM(c); if (g) return g;
    for (const t of this.tokens()) t.init = null;
    this.s.order = []; this.s.activeId = null; this.s.round = 0;
    this.s.phase = 'initiative';
    this.pushFx({ k: 'phase', phase: 'initiative' });
    this.sysLog('Initiative ! Chacun lance son d20.', 'beat');
  }
  do_gmStartCombat(c) {
    const g = this.needGM(c); if (g) return g;
    this.sortOrder();
    if (!this.s.order.length) return { err: "Personne n'a d'initiative." };
    this.s.phase = 'combat'; this.s.round = 1;
    this.pushFx({ k: 'phase', phase: 'combat' });
    this.pushFx({ k: 'round', n: 1 });
    this.sysLog('Début du combat — round 1.', 'beat');
    this.startTurn(this.s.order[0]);
  }
  startTurn(id) {
    const s = this.s;
    const t = this.tok(id);
    if (!t) return;
    s.activeId = id;
    t.turn = { moved: 0, attacks: 0, action: false, bonus: false, reaction: false };
    const v = this.vehicleOf(t);
    if (v && t.aboard.station === 'helm') {
      v.veh.movedTurn = 0; v.veh.distTurn = 0; v.veh.dashed = false; v.veh.ramUsed = false; v.veh.driving = false; v.veh.stopped = false; v.veh.crushed = []; v.veh.lashUsed = false;
      // turbo à ichor : un d20 au début de chaque tour du conducteur, sur 1 → Chaudière fissurée
      if (v.veh.turboLeft > 0) {
        v.veh.turboLeft -= 1;
        const d = Dice.die(20);
        if (d === 1) { this.sysLog(`⚙ Turbo à ichor : d20 = 1 sur le tour de ${t.name} !`, 'warn'); this.forceMishap(v, 3); }
        if (v.veh.turboLeft <= 0) { v.veh.overdrive = false; this.sysLog(`Le turbo à ichor de ${v.name} s'éteint.`); }
      }
      
    }
    // Éruption du moteur : dégâts de feu à qui commence son tour à bord
    const ev = this.vehicleOf(t);
    if (ev && ev.veh.mishaps.some((m) => m.effect === 'flare') && !t.dead) {
      const dm = Dice.roll('3d6').total;
      this.sysLog(`🔥 ${t.name} commence son tour dans un engin en feu : ${dm} dégâts de feu.`, 'warn');
      this.damageToken(t, dm, 'feu', {});
    }
    this.pushFx({ k: 'turn', id, name: t.name, round: s.round, side: t.side, hidden: t.hidden });
    this.log({ kind: 'turn', text: `Tour de ${t.name}`, secret: t.hidden });
  }
  do_endTurn(c) {
    const s = this.s;
    if (s.phase !== 'combat') return { err: "Pas de combat en cours." };
    const cur = this.tok(s.activeId);
    if (c.role !== 'gm' && !(cur && this.canControl(c, cur))) return { err: "Ce n'est pas votre tour." };
    this.advanceTurn();
  }
  advanceTurn() {
    const s = this.s;
    if (!s.order.length) return;
    let idx = s.order.indexOf(s.activeId);
    for (let i = 0; i < s.order.length + 1; i++) {
      idx++;
      if (idx >= s.order.length) { idx = 0; s.round++; this.pushFx({ k: 'round', n: s.round }); this.sysLog(`Round ${s.round}`, 'beat'); }
      const t = this.tok(s.order[idx]);
      if (t && !t.dead) { this.startTurn(t.id); return; }
    }
  }
  do_gmNext(c) { const g = this.needGM(c); if (g) return g; this.advanceTurn(); }
  do_gmPrevTurn(c) {
    const g = this.needGM(c); if (g) return g;
    const s = this.s; if (s.phase !== 'combat' || !s.order.length) return;
    let idx = s.order.indexOf(s.activeId) - 1;
    if (idx < 0) { idx = s.order.length - 1; s.round = Math.max(1, s.round - 1); }
    this.startTurn(s.order[idx]);
  }
  do_gmPhase(c, a) {
    const g = this.needGM(c); if (g) return g;
    if (!['setup', 'initiative', 'combat', 'ended'].includes(a.phase)) return { err: 'Phase inconnue.' };
    this.s.phase = a.phase;
    if (a.phase === 'setup') { this.s.activeId = null; this.s.round = 0; }
    this.pushFx({ k: 'phase', phase: a.phase });
  }

  /* ---------- déplacements ---------- */
  clampPos(x, y, pad = 0.5) { return { x: R.clamp(x, pad, this.s.map.cols - pad), y: R.clamp(y, pad, this.s.map.rows - pad) }; }
  vehicleBudget(v) {
    let b = v.speed * (v.veh.dashed ? 2 : 1) + (v.veh.overdrive ? 6 : 0);
    if (v.veh.mishaps.some((m) => m.effect === 'slow6')) b -= 6;
    return Math.max(0, b);
  }
  overlapVehicles(a, b) {
    for (const p of R.hullSamples(a)) if (R.inHull(b, p.x, p.y, -0.15)) return true;
    for (const p of R.hullSamples(b)) if (R.inHull(a, p.x, p.y, -0.15)) return true;
    return R.inHull(a, b.x, b.y) || R.inHull(b, a.x, a.y);
  }
  tetherLimit(v, nx, ny) {
    for (const th of this.s.tethers) {
      if (th.from !== v.id && th.to !== v.id) continue;
      const other = this.tok(th.from === v.id ? th.to : th.from);
      if (!other) continue;
      if (Math.hypot(other.x - nx, other.y - ny) > th.len + 1e-6) return th;
    }
    return null;
  }
  do_move(c, a) {
    const t = this.tok(a.id);
    if (!t) return { err: 'Jeton introuvable.' };
    if (!this.canControl(c, t)) return { err: "Ce jeton ne vous appartient pas." };
    const x = Number(a.x), y = Number(a.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return { err: 'Position invalide.' };
    const nr = a.r === undefined || a.r === null ? t.r : R.norm180(Number(a.r));
    return t.kind === 'vehicle' ? this.moveVehicle(c, t, x, y, nr) : this.moveCreature(c, t, x, y);
  }
  moveVehicle(c, v, x, y, nr) {
    const gm = c.role === 'gm' && !c.ai;
    const s = this.s;
    if (v.veh.destroyed) return { err: 'Cette épave ne roule plus.' };
    const pilot = this.pilotOf(v);
    if (!gm && !pilot) return { err: 'Personne aux commandes.' };
    if (!gm && s.phase === 'combat' && s.activeId !== pilot.id) return { err: "Ce n'est pas le tour du pilote." };
    if (!gm && v.veh.flipped) return { err: "L'engin est retourné : il ne peut plus rouler." };
    if (!gm && v.veh.stopped) return { err: "L'engin s'est immobilisé dans la collision." };
    if (!gm && s.phase === 'combat' && !v.veh.driving && pilot.turn && pilot.turn.action) return { err: "Le pilote a déjà utilisé son action : conduire demande l'action « Conduire »." };
    const p = this.clampPos(x, y, 2);
    const cost = R.vehicleMoveCost(v, p.x, p.y, nr);
    if (!cost.ok && !gm) return { err: cost.reason };
    if (!gm && v.veh.mishaps.some((m) => m.effect === 'noturn') && cost.turnCost > 0) return { err: 'Direction bloquée : impossible de tourner.' };
    const combat = s.phase === 'combat';
    const remaining = this.vehicleBudget(v) - v.veh.movedTurn;
    if (combat && !gm && cost.cost > remaining + 1e-6) return { err: `Trop loin : ${cost.cost.toFixed(1)} cases demandées, ${Math.max(remaining, 0).toFixed(1)} restantes.` };
    // collisions : rochers le long du trajet
    if (!gm) {
      const steps = Math.max(1, Math.ceil(cost.dist / 0.5));
      for (let i = 1; i <= steps; i++) {
        const px = v.x + ((p.x - v.x) * i) / steps, py = v.y + ((p.y - v.y) * i) / steps;
        const rock = MapGen.hitRock(this.geo, px, py, Math.min(v.len, v.wid) / 2 * 0.85);
        if (rock) { this.pushFx({ k: 'bump', id: v.id, x: px, y: py }); return { err: 'Un rocher barre la route !' }; }
      }
      const ghost = Object.assign({}, v, { x: p.x, y: p.y, r: nr });
      for (const o of this.tokens()) {
        if (o.kind === 'vehicle' && o.id !== v.id && !o.veh.destroyed && this.overlapVehicles(ghost, o)) {
          this.pushFx({ k: 'bump', id: v.id, x: p.x, y: p.y });
          return { err: 'Collision : utilisez « Éperonner » pour percuter un véhicule.' };
        }
      }
      const th = this.tetherLimit(v, p.x, p.y);
      if (th) return { err: 'Le câble de harpon est tendu : impossible de s\'éloigner davantage.' };
    }
    const from = { x: v.x, y: v.y, r: v.r };
    v.x = p.x; v.y = p.y; v.r = nr;
    if (combat) {
      v.veh.movedTurn += cost.cost; v.veh.distTurn += cost.dist;
      if (!v.veh.driving && !gm && pilot) { v.veh.driving = true; pilot.turn.action = true; }
    }
    this.syncCrew(v);
    this.pushFx({ k: 'drive', id: v.id, from, to: { x: v.x, y: v.y, r: v.r }, cost: cost.cost, dir: cost.dir });
    // zone de lave : alerte, résolution par le MJ
    const pts = R.hullSamples(v).concat([{ x: v.x, y: v.y }]);
    if (pts.some((q) => MapGen.inLava(this.geo, q.x, q.y, 0))) {
      this.pushFx({ k: 'lava', id: v.id });
      this.sysLog(`⚠ ${v.name} roule dans la lave ! Le MJ tranche les dégâts.`, 'warn');
    }
    return { cost: cost.cost };
  }
  moveCreature(c, t, x, y) {
    const gm = c.role === 'gm' && !c.ai;
    const s = this.s;
    if (t.dead) return { err: 'Ce combattant est mort.' };
    if (!gm && t.conditions.includes('inconscient')) return { err: 'Un personnage inconscient ne bouge pas.' };
    if (!gm && s.phase === 'combat' && s.activeId !== t.id) return { err: "Ce n'est pas votre tour." };
    const p = this.clampPos(x, y, 0.5);
    const home = this.vehicleOf(t);
    // sur quel véhicule atterrit-on ?
    let dest = null;
    for (const v of this.tokens()) {
      if (v.kind !== 'vehicle' || v.veh.destroyed) continue;
      if (R.inHull(v, p.x, p.y, -0.15)) { dest = v; break; }
    }
    const old = { x: t.x, y: t.y };
    const stayAboard = dest && home && dest.id === home.id;
    const cost = stayAboard ? 0 : Math.hypot(p.x - old.x, p.y - old.y);
    if (!gm && s.phase === 'combat' && !stayAboard) {
      const remaining = t.speed - (t.turn ? t.turn.moved : 0);
      if (cost > remaining + 1e-6) return { err: `Trop loin : ${cost.toFixed(1)} cases demandées, ${Math.max(remaining, 0).toFixed(1)} restantes.` };
    }
    if (!dest && MapGen.hitRock(this.geo, p.x, p.y, 0.4) && !gm) return { err: 'Un rocher bloque le passage.' };
    if (dest) {
      const l = R.toLocal(dest, p.x, p.y);
      let station = null;
      for (const st of dest.veh.stations) if (Math.hypot(st.lx - l.lx, st.ly - l.ly) < 0.55) { station = st; l.lx = st.lx; l.ly = st.ly; }
      if (station) {
        const occ = this.crewOf(dest.id).find((o) => o.id !== t.id && o.aboard.station === station.id && !o.dead);
        if (occ && !gm) return { err: `Poste déjà occupé par ${occ.name}.` };
      }
      t.aboard = { v: dest.id, lx: l.lx, ly: l.ly, station: station ? station.id : null };
      const w = R.toWorld(dest, l.lx, l.ly);
      t.x = w.x; t.y = w.y; t.r = dest.r;
    } else {
      t.aboard = null;
      t.x = p.x; t.y = p.y;
      if (MapGen.inLava(this.geo, t.x, t.y, 0)) { this.pushFx({ k: 'lava', id: t.id }); this.sysLog(`⚠ ${t.name} pose le pied dans la lave !`, 'warn'); }
    }
    if (s.phase === 'combat' && t.turn && !stayAboard) t.turn.moved += cost;
    this.pushFx({ k: 'step', id: t.id, cost, boarded: dest ? dest.id : null });
    return { cost };
  }

  /* ---------- attaques ---------- */
  resolveWeapon(att, spec) {
    if (!spec) throw new Error('Arme manquante.');
    if (spec.src === 'station') {
      const v = this.vehicleOf(att);
      if (!v || !att.aboard.station) throw new Error("Ce combattant n'est pas à un poste d'arme.");
      const st = v.veh.stations.find((x) => x.id === att.aboard.station);
      if (!st || st.kind !== 'weapon') throw new Error("Ce poste n'a pas d'arme.");
      if (v.veh.jam && v.veh.jam.station === st.id) throw new Error('Arme enrayée !');
      const base = Enc.WEAPONS[st.weapon];
      return Object.assign({ wid: st.weapon, src: 'station', mag: 'none' }, base, (v.veh.weapons && v.veh.weapons[st.weapon]) || {});
    }
    if (spec.src === 'token') {
      const w = att.attacks && att.attacks[spec.idx];
      if (!w) throw new Error('Attaque introuvable.');
      if (w.uses && w.uses.left <= 0) throw new Error(`${w.name} : plus de charges.`);
      return Object.assign({ src: 'token', idx: spec.idx }, w);
    }
    // personnalisée : chiffres validés
    const w = {
      src: 'custom', name: String(spec.name || 'Attaque').slice(0, 40), toHit: Number(spec.toHit) || 0,
      dmg: String(spec.dmg || '1d6'), type: String(spec.type || 'tranchant'), mag: ['none', 'magic', 'silver'].includes(spec.mag) ? spec.mag : 'none',
      range: Number(spec.range) || 1.6,
    };
    Dice.parse(w.dmg);
    return w;
  }
  strike(att, w, target, o) {
    // o : { adv, mag }
    const isTether = !!target.tether;
    let advMode = o.adv || 'none';
    // véhicule à l'arrêt : jets d'attaque avantagés (annexe B, Classe d'armure)
    const stopped = !isTether && target.kind === 'vehicle' && !(target.veh.movedTurn > 0);
    if (stopped && advMode !== 'dis') advMode = 'adv';
    const d = Dice.d20(advMode);
    const nat = d.kept;
    const crit = nat === 20, fumble = nat === 1;
    const total = nat + (Number(w.toHit) || 0);
    const ac = isTether ? TETHER_AC : this.targetAC(target);
    const hit = crit || (!fumble && total >= ac);
    const res = { stopped, hit, crit, fumble, nat, rolls: d.rolls, total, ac, dmgRaw: 0, applied: 0, immune: false, ricochet: false, type: w.type, mishap: null };
    if (!hit) return res;
    const dmg = Dice.roll(w.dmg, { crit });
    res.dmgRaw = dmg.total; res.dmgText = dmg.text;
    let dealt = dmg.total;
    // Charge du sanglier-garou : 3 cases en ligne droite avant l'attaque
    if (w.charge && !isTether && target.kind === 'creature' && att.turn && att.turn.moved >= 3) {
      const extra = Dice.roll('2d6', { crit }); dealt += extra.total; res.dmgRaw += extra.total; res.charge = extra.total;
      const sv = Dice.d20().kept + (target.strSave || 0);
      if (sv < 13 && !target.conditions.includes('à terre')) { target.conditions.push('à terre'); res.knockedDown = true; }
      this.log({ kind: 'sys', text: `Charge : +${extra.total} tranchants ; ${target.name} Force ${sv} (DD 13) — ${sv < 13 ? 'à terre' : 'reste debout'}.` });
    }
    const rank = (x) => (x === 'magic' ? 2 : x === 'silver' ? 1 : 0);
    const mag = rank(o.mag) >= rank(w.mag) ? (o.mag || 'none') : w.mag;
    if (!isTether && target.kind === 'creature') {
      if (target.immuneNonMagical && PHYS.includes(w.type) && mag === 'none') { dealt = 0; res.immune = true; }
    }
    if (!isTether && target.kind === 'vehicle') {
      if ((target.immune || []).includes(w.type)) { dealt = 0; res.immune = true; }
      else {
        if (w.vsObject) dealt *= 2;
        if (dealt < target.veh.dmgThreshold) { dealt = 0; res.ricochet = true; }
      }
    }
    res.applied = dealt;
    if (dealt > 0) {
      if (isTether) {
        target.hp = Math.max(0, target.hp - dealt);
      } else {
        this.damageToken(target, dealt, w.type, res);
        if (target.kind === 'vehicle' && !target.veh.destroyed && dealt >= target.veh.mishapThreshold && target.veh.movedTurn > 0) res.mishap = this.rollMishap(target);
        // Masticateur : cible réduite à 0 PV = broyée
        if (w.grind && target.kind === 'creature' && target.hp <= 0) this.grind(target);
      }
    }
    return res;
  }
  grind(t) {
    t.dead = true; t.hp = 0;
    if (t.aboard) t.aboard.station = null;
    this.s.order = this.s.order.filter((id) => id !== t.id);
    this.pushFx({ k: 'death', id: t.id, x: t.x, y: t.y });
    this.sysLog(`⚙ ${t.name} est broyé et recraché par les tuyaux d'évacuation.`, 'hit');
  }
  do_attack(c, a) {
    const att = this.tok(a.id);
    if (!att || att.kind !== 'creature') return { err: 'Attaquant invalide.' };
    if (!this.canControl(c, att)) return { err: "Ce n'est pas votre personnage." };
    if (att.dead) return { err: 'Un mort ne se bat plus.' };
    const gm = c.role === 'gm' && !c.ai;
    const s = this.s;
    let target, tetherObj = null;
    if (String(a.target).startsWith('tether:')) {
      tetherObj = this.s.tethers.find((t) => t.id === a.target.slice(7));
      if (!tetherObj) return { err: 'Câble introuvable.' };
      target = { tether: true, id: tetherObj.id, name: 'câble de harpon', hp: tetherObj.hp, ac: TETHER_AC };
    } else target = this.tok(a.target);
    if (!target) return { err: 'Cible introuvable.' };
    if (!gm && target.hidden) return { err: 'Cible introuvable.' };
    if (!gm && !a.reaction && s.phase === 'combat' && s.activeId !== att.id) return { err: "Ce n'est pas votre tour." };
    if (!gm && att.conditions.includes('inconscient')) return { err: 'Inconscient.' };
    if (att.turn === undefined) att.turn = { moved: 0, attacks: 0, action: false, bonus: false, reaction: false };
    let w;
    try { w = this.resolveWeapon(att, a.weapon); } catch (e) { return { err: e.message }; }

    // économie d'actions
    if (!gm && s.phase === 'combat') {
      if (a.reaction) {
        if (att.turn.reaction) return { err: 'Réaction déjà utilisée.' };
      } else {
        const apa = att.apa || 2;
        if (w.rays && att.turn.action) return { err: 'Action déjà utilisée ce tour.' };
        if (att.turn.attacks >= apa) return { err: `Plus d'attaque disponible ce tour (${apa} par action).` };
      }
    }
    // portée (bord à bord)
    const tgtObj = tetherObj ? this.tetherMid(tetherObj) : target;
    const dist = tetherObj ? R.dist(att, tgtObj) : R.gap(att, target);
    if (!gm && dist > (w.range || 1.6) + 0.05) return { err: `Hors de portée : ${dist.toFixed(1)} cases (portée ${w.range}).` };

    const count = w.rays || 1;
    const out = [];
    for (let i = 0; i < count; i++) {
      if (!tetherObj && target.dead) break;
      out.push(this.strike(att, w, tetherObj ? Object.assign(tetherObj, { tether: true }) : target, { adv: a.adv, mag: a.mag }));
    }
    // consommation
    if (a.reaction) att.turn.reaction = true;
    else if (w.rays) { att.turn.action = true; att.turn.attacks = 99; }
    else att.turn.attacks += 1;
    if (w.src === 'token' && w.uses) att.attacks[w.idx].uses.left -= 1;

    // harpon : câble
    let hookedId = null;
    if (w.tether && target.kind === 'vehicle' && out.some((r) => r.hit) && !target.veh.destroyed) {
      const v = this.vehicleOf(att);
      if (v) {
        const exists = this.s.tethers.find((t) => t.from === v.id && t.to === target.id);
        const len = Math.max(R.dist(v, target), 6) + 2;
        if (exists) { exists.len = Math.min(exists.len, len); exists.hp = TETHER_HP; hookedId = exists.id; }
        else {
          hookedId = 'h' + (this.s.nextId++);
          this.s.tethers.push({ id: hookedId, from: v.id, to: target.id, hp: TETHER_HP, maxHp: TETHER_HP, len });
        }
        this.pushFx({ k: 'tether', id: hookedId, from: v.id, to: target.id });
      }
    }
    if (tetherObj) {
      tetherObj.hp = Math.max(0, tetherObj.hp);
      if (tetherObj.hp <= 0) {
        this.s.tethers = this.s.tethers.filter((t) => t.id !== tetherObj.id);
        this.pushFx({ k: 'cut', id: tetherObj.id, x: tgtObj.x, y: tgtObj.y });
        this.sysLog('Le câble de harpon est tranché !', 'hit');
      }
      delete tetherObj.tether;
    }

    for (const r of out) this.reportAttack(att, w, target, r, tetherObj ? tgtObj : target);
    this.afterDamage();
    return { results: out.map((r) => ({ hit: r.hit, applied: r.applied })) };
  }
  tetherMid(th) {
    const a = this.tok(th.from), b = this.tok(th.to);
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, kind: 'creature', size: 0.4 };
  }
  reportAttack(att, w, target, r, tgtPos) {
    const wkind = w.tether ? 'harpoon' : (w.type === 'feu' && w.range > 4 ? 'spell' : (w.range > 3 ? 'ranged' : 'melee'));
    this.pushFx({
      k: 'attack', from: att.id, to: target.tether ? null : target.id, wname: w.name, wkind, hit: r.hit, crit: r.crit, fumble: r.fumble,
      dmg: r.applied, immune: r.immune, ricochet: r.ricochet, nat: r.nat, total: r.total, ac: r.ac, type: r.type, mishap: r.mishap ? r.mishap.name : null,
      fx: att.x, fy: att.y, tx: tgtPos.x, ty: tgtPos.y, tkind: target.tether ? 'tether' : target.kind,
      secret: !!(att.hidden && target.side === 'enemy'),
    });
    const rolls = r.rolls.length > 1 ? `d20[${r.rolls.join(',')}]→${r.nat}` : `d20(${r.nat})`;
    let text = `${att.name} → ${target.name} : ${w.name}. ${rolls} +${w.toHit} = ${r.total} vs CA ${r.ac} — `;
    if (r.crit) text += 'COUP CRITIQUE ! ';
    if (!r.hit) text += r.fumble ? 'échec critique.' : 'raté.';
    else if (r.immune) text += `touché, mais ${target.name} est immunisé aux armes non magiques (${r.type}).`;
    else if (r.ricochet) text += `touché, le coup ricoche sur le blindage (${r.dmgRaw} < seuil ${target.veh ? target.veh.dmgThreshold : '?'}).`;
    else text += `touché : ${r.applied} dégâts (${r.dmgText}) ${r.type}.`;
    if (r.mishap) text += ` ⚙ AVARIE : ${r.mishap.name} — ${r.mishap.text}`;
    this.log({ kind: r.hit && r.applied ? 'hit' : 'attack', text, secret: !!(att.hidden && target.side === 'enemy') });
  }

  /* ---------- dégâts ---------- */
  damageToken(t, n, type, res) {
    if (t.kind === 'vehicle') {
      t.hp = Math.max(0, t.hp - n);
      if (t.hp === 0 && !t.veh.destroyed) this.destroyVehicle(t);
      return;
    }
    let dmg = n;
    if (t.relentless && !t.relentlessUsed && t.hp - dmg <= 0 && dmg <= 14) {
      t.hp = 1; t.relentlessUsed = true;
      this.pushFx({ k: 'relentless', id: t.id });
      this.sysLog(`${t.name} encaisse sans broncher : Acharnement (1 PV restant).`, 'hit');
      return;
    }
    t.hp = Math.max(0, t.hp - dmg);
    if (t.hp === 0) this.dropToken(t);
  }
  dropToken(t) {
    if (t.kind !== 'creature') return;
    if (t.side === 'party') {
      if (!t.conditions.includes('inconscient')) t.conditions.push('inconscient');
      if (!t.conditions.includes('à terre')) t.conditions.push('à terre');
      this.pushFx({ k: 'down', id: t.id });
      this.sysLog(`${t.name} s'effondre !`, 'hit');
    } else {
      t.dead = true;
      if (t.aboard) t.aboard.station = null;
      this.s.order = this.s.order.filter((id) => id !== t.id);
      this.pushFx({ k: 'death', id: t.id, x: t.x, y: t.y });
      this.sysLog(`${t.name} est abattu.`, 'hit');
    }
  }
  destroyVehicle(v) {
    v.veh.destroyed = true; v.hp = 0;
    this.pushFx({ k: 'destroy', id: v.id, x: v.x, y: v.y });
    this.sysLog(`💥 ${v.name} explose ! L'équipage est projeté — le MJ détermine les dégâts de chute.`, 'hit');
    const crew = this.crewOf(v.id);
    crew.forEach((c, i) => {
      const ang = (i / Math.max(crew.length, 1)) * Math.PI * 2 + 0.6;
      c.aboard = null;
      c.x = R.clamp(v.x + Math.cos(ang) * (v.len / 2 + 1.6), 0.5, this.s.map.cols - 0.5);
      c.y = R.clamp(v.y + Math.sin(ang) * (v.len / 2 + 1.6), 0.5, this.s.map.rows - 0.5);
      if (!c.conditions.includes('à terre')) c.conditions.push('à terre');
    });
    this.s.tethers = this.s.tethers.filter((t) => t.from !== v.id && t.to !== v.id);
  }
  afterDamage() {
    const s = this.s;
    const rag = this.tok('raggadragga');
    if (rag && !rag.dead && rag.hp <= rag.maxHp / 2 && !s.beatsDone.includes('fury') && !s.suggestedFury) {
      s.suggestedFury = true;
      this.pushFx({ k: 'suggest', beat: 'fury', msg: 'Raggadragga est à moitié mort : déclencher « Fou de rage » ?' });
    }
    const foes = this.tokens().filter((t) => t.kind === 'creature' && t.side === 'enemy');
    if (foes.length && foes.every((t) => t.dead) && !s.suggestedVictory) {
      s.suggestedVictory = true;
      this.pushFx({ k: 'suggest', beat: 'victory', msg: 'Tous les ennemis sont à terre : lancer la séquence de victoire ?' });
    }
    const pcs = this.tokens().filter((t) => t.kind === 'creature' && t.side === 'party');
    if (pcs.length && pcs.every((t) => t.conditions.includes('inconscient')) && !s.suggestedDefeat) {
      s.suggestedDefeat = true;
      this.pushFx({ k: 'suggest', beat: 'defeat', msg: 'Tous les aventuriers sont à terre : séquence de capture ?' });
    }
  }
  rollMishap(v) { return this.applyMishap(v, Dice.die(20)); }
  forceMishap(v, id) { const m = Enc.MISHAPS.find((x) => x.id === id); return this.applyMishap(v, m.min); }
  applyMishap(v, d) {
    const m = Enc.MISHAPS.find((x) => d >= x.min && d <= x.max);
    this.pushFx({ k: 'mishap', id: v.id, name: m.name, text: m.text, x: v.x, y: v.y });
    this.sysLog(`⚙ INCIDENT (d20 = ${d}) : ${m.name}. ${m.text}`, 'warn');
    const crew = this.crewOf(v.id).filter((c) => !c.dead);
    const entry = { id: m.id, name: m.name, effect: m.effect, dc: m.dc, ability: m.ability };
    if (m.effect === 'armor') { const cut = Math.min(10, v.veh.dmgThreshold); v.veh.dmgThreshold -= cut; entry.restore = cut; }
    if (m.effect === 'jam') {
      const ws = v.veh.stations.filter((x) => x.kind === 'weapon');
      const st = ws[Dice.die(ws.length) - 1];
      v.veh.jam = { station: st.id }; entry.station = st.id; entry.name += ` (${st.label})`;
    }
    if (m.effect === 'smoke') { const p = this.pilotOf(v); if (p) entry.pilot = p.id; }
    if (m.effect === 'flip') {
      v.veh.flipped = true; v.veh.stopped = true;
      for (const c of crew) {
        const sv = Dice.d20().kept + (c.strSave || 0);
        if (!c.conditions.includes('à terre')) c.conditions.push('à terre');
        if (sv < 15) { const dm = Dice.roll('3d6').total; this.log({ kind: 'sys', text: `Retournement : ${c.name} Force ${sv} (DD 15) — ${dm} dégâts contondants.` }); this.damageToken(c, dm, 'contondant', {}); }
        else this.log({ kind: 'sys', text: `Retournement : ${c.name} Force ${sv} (DD 15) — indemne, mais à terre.` });
      }
    }
    // une même avarie ne se cumule pas
    if (!v.veh.mishaps.some((x) => x.effect === m.effect && m.effect !== 'jam')) v.veh.mishaps.push(entry);
    else if (m.effect === 'armor') v.veh.dmgThreshold += entry.restore || 0;
    return m;
  }
  do_repair(c, a) {
    const v = this.tok(a.id);
    if (!v || v.kind !== 'vehicle') return { err: 'Véhicule invalide.' };
    const gm = c.role === 'gm' && !c.ai;
    const m = v.veh.mishaps.find((x, i) => (a.mi === undefined ? true : i === Number(a.mi)));
    if (!m) return { err: 'Rien à réparer.' };
    if (m.effect === 'flip') {
      if (!gm) return { err: "Un engin retourné ne se redresse pas seul : le MJ décide (grue, créature géante, démon…)." };
      v.veh.flipped = false; v.veh.stopped = false; v.veh.mishaps = v.veh.mishaps.filter((x) => x !== m);
      this.sysLog(`${v.name} est remis d'aplomb.`, 'hit'); return;
    }
    const who = this.tok(a.who);
    if (!who || !this.canControl(c, who)) return { err: "Ce n'est pas votre personnage." };
    if (!who.aboard || who.aboard.v !== v.id) return { err: 'Il faut être à bord, à portée de la zone endommagée.' };
    if (['helm'].includes(who.aboard.station) || (who.aboard.station && who.aboard.station !== 'free' && v.veh.stations.find((x) => x.id === who.aboard.station && x.kind === 'weapon')))
      return { err: 'Un réparateur ne peut pas tenir le poste de pilotage ou une arme : quittez votre poste.' };
    if (!gm && this.s.phase === 'combat' && this.s.activeId !== who.id) return { err: "Ce n'est pas votre tour." };
    if (!gm && this.s.phase === 'combat' && who.turn && who.turn.action) return { err: 'Action déjà utilisée.' };
    const moving = v.veh.movedTurn > 0;
    const d = moving ? Dice.d20('dis') : Dice.d20();
    const mod = (m.ability === 'str' ? who.strSave : who.dexSave) || 0;
    const r = d.kept + mod;
    if (this.s.phase === 'combat' && who.turn) who.turn.action = true;
    if (r >= m.dc) {
      v.veh.mishaps = v.veh.mishaps.filter((x) => x !== m);
      if (m.effect === 'armor') v.veh.dmgThreshold += m.restore || 0;
      if (m.effect === 'jam') v.veh.jam = null;
      this.sysLog(`${who.name} répare « ${m.name} » (${r} contre DD ${m.dc}${moving ? ', désavantage : engin en mouvement' : ''}).`, 'hit');
    } else this.sysLog(`${who.name} échoue à réparer « ${m.name} » (${r} contre DD ${m.dc}${moving ? ', désavantage : engin en mouvement' : ''}).`, 'attack');
  }

  /* ---------- règles du véhicule ---------- */
  needPilotTurn(c, v) {
    const gm = c.role === 'gm' && !c.ai;
    const pilot = this.pilotOf(v);
    if (!pilot) return { err: 'Personne aux commandes.' };
    if (!gm && !this.canControl(c, v)) return { err: "Vous ne pilotez pas ce véhicule." };
    if (!gm && this.s.phase === 'combat' && this.s.activeId !== pilot.id) return { err: "Ce n'est pas le tour du pilote." };
    return { pilot };
  }
  do_dash(c, a) {
    const v = this.tok(a.id);
    if (!v || v.kind !== 'vehicle') return { err: 'Véhicule invalide.' };
    const n = this.needPilotTurn(c, v); if (n.err) return n;
    const gm = c.role === 'gm' && !c.ai;
    if (v.veh.dashed) return { err: 'Déjà en pleine accélération.' };
    if (!gm && v.veh.dashLeft <= 0) return { err: 'Plus de Foncer ce combat (limite = modificateur de Constitution).' };
    if (this.s.phase === 'combat' && n.pilot.turn.bonus && !gm) return { err: 'Action bonus déjà utilisée ce tour.' };
    v.veh.dashed = true; v.veh.dashLeft = Math.max(0, v.veh.dashLeft - 1);
    if (this.s.phase === 'combat') n.pilot.turn.bonus = true;
    this.pushFx({ k: 'dash', id: v.id });
    this.sysLog(`${n.pilot.name} fonce (action bonus) : vitesse doublée ce tour (${v.veh.dashLeft} restant${v.veh.dashLeft > 1 ? 's' : ''}).`);
  }
  do_overdrive(c, a) {
    const v = this.tok(a.id);
    if (!v || v.kind !== 'vehicle') return { err: 'Véhicule invalide.' };
    const n = this.needPilotTurn(c, v); if (n.err) return n;
    const gm = c.role === 'gm' && !c.ai;
    if (v.veh.overdrive) return { err: 'Le turbo à ichor est déjà actif.' };
    if (!gm && v.veh.ichor <= 0) return { err: "Plus de flasque d'ichor de démon." };
    if (this.s.phase === 'combat' && n.pilot.turn.bonus && !gm) return { err: 'Action bonus déjà utilisée ce tour.' };
    v.veh.ichor = Math.max(0, v.veh.ichor - 1); v.veh.overdrive = true; v.veh.turboLeft = 10;
    if (this.s.phase === 'combat') n.pilot.turn.bonus = true;
    this.pushFx({ k: 'overdrive', id: v.id });
    this.sysLog(`${n.pilot.name} verse une flasque d'ichor de démon dans la chaudière : +9 m (6 cases) pendant 1 minute. d20 au début de chaque tour du conducteur : un 1 déclenche « Chaudière fissurée ».`);
  }
  // Collision : chaque créature à bord fait Force DD 15 (dégâts, ou moitié si réussi), que l'engin ait encaissé ou non.
  crashCrew(veh, dmg) {
    for (const c of this.crewOf(veh.id).filter((q) => !q.dead)) {
      const sv = Dice.d20().kept + (c.strSave || 0);
      const taken = sv >= 15 ? Math.floor(dmg / 2) : dmg;
      this.log({ kind: 'sys', text: `Choc : ${c.name} Force ${sv} (DD 15) — ${taken} dégâts contondants.` });
      if (taken) this.damageToken(c, taken, 'contondant', {});
    }
  }
  inMotionMishap(veh, dmg) {
    if (veh.veh.destroyed || dmg < veh.veh.mishapThreshold || !(veh.veh.movedTurn > 0)) return '';
    const mm = this.rollMishap(veh); return ` Incident de ${veh.name} : ${mm.name}.`;
  }
  // Éperonner : collision (véhicule, structure ou créature trop grande) ou Roues écrasantes (créature assez petite).
  do_ram(c, a) {
    const v = this.tok(a.id);
    const target = this.tok(a.target);
    if (!v || v.kind !== 'vehicle' || !target || target.id === v.id) return { err: 'Éperonnage invalide.' };
    if (target.aboard) return { err: 'Ciblez le véhicule, pas son équipage.' };
    const n = this.needPilotTurn(c, v); if (n.err) return n;
    const gm = c.role === 'gm' && !c.ai;
    const combat = this.s.phase === 'combat';
    if (v.veh.flipped && !gm) return { err: "L'engin est retourné." };
    if (!gm && combat && !(v.veh.distTurn > 0)) return { err: "Il faut avoir roulé ce tour : l'élan fait les dégâts (1d6 par 3 m parcourus)." };
    const gap = R.gap(v, target);
    if (!gm && gap > 1.2) return { err: `Trop loin pour éperonner (${gap.toFixed(1)} cases).` };
    const dice = Math.max(1, Math.min(20, Math.floor((v.veh.distTurn * 5) / 10)));
    let dealt = 0, hit = true, text = '';
    const collide = (dmg) => {
      v.veh.ramUsed = true; v.veh.stopped = true;
      if (dmg >= v.veh.dmgThreshold) { this.damageToken(v, dmg, 'contondant', {}); text += this.inMotionMishap(v, dmg); }
      this.crashCrew(v, dmg);
    };
    if (target.kind === 'vehicle') {
      if (!gm && v.veh.ramUsed) return { err: "L'engin s'est déjà immobilisé dans une collision ce tour." };
      const dm = Dice.roll(`${dice}d6`); const dmg = dm.total;
      let tdone = 0, tt = '';
      if (dmg >= target.veh.dmgThreshold) { this.damageToken(target, dmg, 'contondant', {}); tdone = dmg; tt = this.inMotionMishap(target, dmg); }
      dealt = tdone;
      text = `${dice}d6 (${dm.text}) = ${dmg} contondants pour chacun. ${target.name} ${tdone ? 'encaisse' : 'ne subit rien (sous le seuil de ' + target.veh.dmgThreshold + ')'}${tt}.`;
      collide(dmg);
      text += ` ${v.name} ${dmg >= v.veh.dmgThreshold ? 'encaisse aussi' : 'ne subit rien'} et s'immobilise.`;
    } else {
      const crush = v.crush;
      const small = crush && (target.size || 1) <= crush.maxSize;
      if (small) {
        // Roues écrasantes
        if (!gm && v.veh.crushed.includes(target.id)) return { err: 'Cette créature a déjà été écrasée ce tour.' };
        const d = Dice.d20();
        const sv = d.kept + (target.dexSave || 0);
        v.veh.crushed.push(target.id);
        if (sv >= crush.dc) { hit = false; text = `${crush.label} : ${target.name} se jette de côté (Dex ${sv} contre DD ${crush.dc}).`; }
        else {
          const prone = target.conditions.includes('à terre');
          const dm = Dice.roll(crush.dice).total + (prone ? Dice.roll(crush.dice).total : 0);
          dealt = dm;
          this.damageToken(target, dealt, 'contondant', {});
          if (!target.dead && !target.conditions.includes('à terre')) target.conditions.push('à terre');
          text = `${crush.label} : ${target.name} est écrasé (Dex ${sv} contre DD ${crush.dc}) — ${dealt} contondants${prone ? ' (déjà à terre : doublé)' : ', jeté à terre'}.`;
        }
      } else {
        // collision avec une grande créature : Dex DD 10 (réaction) ou 1d6 par 3 m, l'engin s'arrête
        const sv = Dice.d20().kept + (target.dexSave || 0);
        if (sv >= 10) { hit = false; text = `${target.name} évite l'engin (Dex ${sv} contre DD 10).`; }
        else { const dm = Dice.roll(`${dice}d6`); dealt = dm.total; this.damageToken(target, dealt, 'contondant', {}); text = `${target.name} est percuté (Dex ${sv} contre DD 10) — ${dealt} contondants.`; }
        collide(dealt || Dice.roll(`${dice}d6`).total);
      }
    }
    this.pushFx({ k: 'ram', id: v.id, to: target.id, hit, dmg: dealt, fx: v.x, fy: v.y, tx: target.x, ty: target.y });
    this.sysLog(`🐗 ${v.name} percute ${target.name} : ${text}`, hit ? 'hit' : 'attack');
    this.afterDamage();
  }
  // Faux balayantes (Tortionnaire) : en arrivant au contact d'une créature debout ou d'un autre véhicule.
  do_lash(c, a) {
    const v = this.tok(a.id);
    const target = this.tok(a.target);
    if (!v || v.kind !== 'vehicle' || !v.lash) return { err: "Cet engin n'a pas de faux balayantes." };
    if (!target || target.id === v.id || target.aboard) return { err: 'Cible invalide.' };
    const n = this.needPilotTurn(c, v); if (n.err) return n;
    const gm = c.role === 'gm' && !c.ai;
    if (!gm && v.veh.lashUsed) return { err: 'Faux balayantes déjà utilisées ce tour.' };
    if (!gm && this.s.phase === 'combat' && !(v.veh.distTurn > 0)) return { err: "Il faut être arrivé au contact en roulant ce tour." };
    if (!gm && R.gap(v, target) > 1.2) return { err: 'Trop loin (1,50 m maximum).' };
    if (target.kind === 'creature' && target.conditions.includes('à terre') && !gm) return { err: 'La cible est à terre.' };
    v.veh.lashUsed = true;
    let sv;
    if (target.kind === 'vehicle') { const p = this.pilotOf(target); sv = p ? Dice.d20().kept + (p.dexSave || 0) : -99; }
    else sv = Dice.d20().kept + (target.dexSave || 0);
    let text;
    if (sv >= v.lash.dc) text = `${target.name} s'éloigne (Dex ${sv} contre DD ${v.lash.dc}).`;
    else {
      const dm = Dice.roll(v.lash.dmg).total;
      if (target.kind === 'vehicle' && dm < target.veh.dmgThreshold) text = `les lames ricochent sur ${target.name} (${dm} < seuil ${target.veh.dmgThreshold}).`;
      else { this.damageToken(target, dm, 'tranchant', {}); this.pushFx({ k: 'lash', id: v.id, to: target.id, x: target.x, y: target.y, dmg: dm }); text = `${target.name} est lacéré (Dex ${sv} contre DD ${v.lash.dc}) — ${dm} tranchants.`; }
    }
    this.pushFx({ k: 'lash', id: v.id, to: target.id, x: target.x, y: target.y, dmg: 0 });
    this.sysLog(`🗡 ${v.lash.label} de ${v.name} : ${text}`, 'hit');
    this.afterDamage();
  }
  do_reel(c, a) {
    const op = this.tok(a.id);
    const th = this.s.tethers.find((t) => t.id === a.tether);
    if (!op || !th) return { err: 'Câble introuvable.' };
    if (!this.canControl(c, op)) return { err: "Ce n'est pas votre personnage." };
    const src = this.tok(th.from), dst = this.tok(th.to);
    if (!src || !dst || !op.aboard || op.aboard.v !== src.id) return { err: 'Seul un membre du véhicule tireur peut actionner le treuil.' };
    if (c.role !== 'gm' && this.s.phase === 'combat') {
      if (this.s.activeId !== op.id) return { err: "Ce n'est pas votre tour." };
      if (op.turn.action) return { err: 'Action déjà utilisée ce tour.' };
      op.turn.action = true;
    }
    const dx = src.x - dst.x, dy = src.y - dst.y;
    const d = Math.hypot(dx, dy) || 1;
    const stop = Math.max(0, d - (src.len / 2 + dst.len / 2 - 0.5));
    const pull = Math.min(2, stop);
    dst.x += (dx / d) * pull; dst.y += (dy / d) * pull;
    th.len = Math.max(4, th.len - 2);
    this.syncCrew(dst);
    this.pushFx({ k: 'reel', from: src.id, to: dst.id });
    this.sysLog(`${op.name} actionne le treuil : ${dst.name} est tiré de ${pull.toFixed(1)} cases vers ${src.name}.`);
  }

  /* ---------- fiches & MJ ---------- */
  do_sheet(c, a) {
    const t = this.tok(a.id);
    if (!t) return { err: 'Jeton introuvable.' };
    const gm = c.role === 'gm' && !c.ai;
    if (!gm && !(t.owner && t.owner === c.slot)) return { err: 'Fiche non modifiable.' };
    const p = a.patch || {};
    const allowedOwner = ['name', 'hp', 'maxHp', 'ac', 'initMod', 'dexSave', 'speed', 'apa', 'attacks', 'color'];
    const allowedGM = allowedOwner.concat(['size', 'hidden', 'immuneNonMagical', 'relentless', 'owner', 'sheet', 'notes', 'side', 'len', 'wid', 'conditions']);
    for (const k of Object.keys(p)) {
      if (!(gm ? allowedGM : allowedOwner).includes(k)) continue;
      if (k === 'attacks') {
        if (!Array.isArray(p.attacks)) continue;
        t.attacks = p.attacks.slice(0, 8).map((w) => {
          Dice.parse(w.dmg || '1d6');
          return { name: String(w.name || 'Attaque').slice(0, 40), toHit: Number(w.toHit) || 0, dmg: String(w.dmg || '1d6'), type: String(w.type || 'tranchant'), range: Number(w.range) || 1.6, mag: ['none', 'magic', 'silver'].includes(w.mag) ? w.mag : 'none', rays: w.rays ? Number(w.rays) : undefined, uses: w.uses, note: w.note ? String(w.note).slice(0, 120) : undefined };
        });
      } else if (['hp', 'maxHp', 'ac', 'initMod', 'dexSave', 'speed', 'apa', 'size', 'len', 'wid'].includes(k)) {
        const n = Number(p[k]); if (Number.isFinite(n)) t[k] = n;
      } else if (k === 'conditions') {
        t.conditions = (p.conditions || []).filter((x) => CONDITIONS.includes(x));
      } else t[k] = p[k];
    }
    t.hp = Math.min(Math.max(t.hp, 0), t.maxHp);
    if (t.kind === 'vehicle') this.syncCrew(t);
    if (gm && p.veh && t.veh) {
      for (const k of ['dmgThreshold', 'mishapThreshold', 'soulCoins', 'ichor', 'pilotBonus']) if (p.veh[k] !== undefined && Number.isFinite(Number(p.veh[k]))) t.veh[k] = Number(p.veh[k]);
    }
    if (gm && p.hidden !== undefined) this.hideCrew(t);
  }
  hideCrew(t) {
    if (t.kind === 'vehicle') for (const cr of this.crewOf(t.id)) cr.hidden = t.hidden;
  }
  do_gmHp(c, a) {
    const g = this.needGM(c); if (g) return g;
    const t = this.tok(a.id); if (!t) return { err: 'Jeton introuvable.' };
    const n = Math.floor(Number(a.n));
    if (!Number.isFinite(n) || n === 0) return { err: 'Valeur invalide.' };
    if (n < 0) {
      this.damageToken(t, -n, 'mj', {});
      this.pushFx({ k: 'dmg', id: t.id, n: -n, x: t.x, y: t.y });
      this.sysLog(`${t.name} perd ${-n} PV.`, 'hit');
    } else {
      t.hp = Math.min(t.maxHp, t.hp + n);
      if (t.hp > 0) {
        t.conditions = t.conditions.filter((x) => x !== 'inconscient');
        if (t.dead) t.dead = false;
      }
      this.pushFx({ k: 'heal', id: t.id, n, x: t.x, y: t.y });
      this.sysLog(`${t.name} récupère ${n} PV.`);
    }
    this.afterDamage();
  }
  do_gmCondition(c, a) {
    const g = this.needGM(c); if (g) return g;
    const t = this.tok(a.id); if (!t || !CONDITIONS.includes(a.cond)) return { err: 'Condition invalide.' };
    const i = t.conditions.indexOf(a.cond);
    if (i >= 0) t.conditions.splice(i, 1); else t.conditions.push(a.cond);
  }
  do_condition(c, a) { // un joueur peut gérer les conditions de son personnage
    const t = this.tok(a.id); if (!t || !CONDITIONS.includes(a.cond)) return { err: 'Condition invalide.' };
    if (!this.canControl(c, t)) return { err: "Ce n'est pas votre personnage." };
    const i = t.conditions.indexOf(a.cond);
    if (i >= 0) t.conditions.splice(i, 1); else t.conditions.push(a.cond);
  }
  do_gmReveal(c, a) {
    const g = this.needGM(c); if (g) return g;
    const t = this.tok(a.id); if (!t) return { err: 'Jeton introuvable.' };
    t.hidden = a.hidden !== undefined ? !!a.hidden : !t.hidden;
    this.hideCrew(t);
    if (!t.hidden) this.pushFx({ k: 'reveal', ids: [t.id].concat(t.kind === 'vehicle' ? this.crewOf(t.id).map((x) => x.id) : []) });
  }
  do_gmAdd(c, a) {
    const g = this.needGM(c); if (g) return g;
    const id = 't' + (this.s.nextId++);
    let t;
    switch (a.template) {
      case 'wereboar': t = Enc.mkWereboar(id, 'Sanglier-garou'); break;
      case 'wererat': t = Enc.mkWererat(id, 'Rat-garou'); break;
      case 'grinder-enemy': t = Enc.mkGrinder(id, 'Broyeur de démons ennemi', 'enemy'); break;
      case 'grinder-party': t = Enc.mkGrinder(id, 'Broyeur de démons allié', 'party'); break;
      case 'tormentor-party': t = Enc.mkTormentor(id, 'Tortionnaire allié', 'party'); break;
      case 'tormentor-enemy': t = Enc.mkTormentor(id, 'Tortionnaire ennemi', 'enemy'); break;
      case 'pc': t = Object.assign(Enc.mkPc(0), { id, owner: null, name: 'PNJ allié', color: '#e8dcc4' }); break;
      default: return { err: 'Modèle inconnu.' };
    }
    t.x = Number(a.x) || this.s.map.cols / 2; t.y = Number(a.y) || this.s.map.rows / 2;
    t.hidden = false;
    this.s.tokens[id] = t;
    if (t.kind === 'vehicle') this.syncCrew(t);
    this.pushFx({ k: 'reveal', ids: [id] });
    return { id };
  }
  do_gmRemove(c, a) {
    const g = this.needGM(c); if (g) return g;
    const t = this.tok(a.id); if (!t) return { err: 'Jeton introuvable.' };
    if (t.owner) return { err: 'Les jetons des joueurs ne se suppriment pas (cachez-les ou mettez-les à 0).' };
    if (t.kind === 'vehicle') for (const cr of this.crewOf(t.id)) cr.aboard = null;
    delete this.s.tokens[t.id];
    this.s.order = this.s.order.filter((x) => x !== t.id);
    this.s.tethers = this.s.tethers.filter((x) => x.from !== t.id && x.to !== t.id);
    if (this.s.activeId === t.id) this.advanceTurn();
  }
  do_gmSetStation(c, a) {
    const g = this.needGM(c); if (g) return g;
    const t = this.tok(a.id), v = this.tok(a.v);
    if (!t || !v || v.kind !== 'vehicle') return { err: 'Invalide.' };
    if (!a.station) { t.aboard = null; return; }
    const st = v.veh.stations.find((s) => s.id === a.station);
    if (!st) return { err: 'Poste inconnu.' };
    for (const o of this.crewOf(v.id)) if (o.aboard.station === st.id && o.id !== t.id) o.aboard.station = null;
    t.aboard = { v: v.id, lx: st.lx, ly: st.ly, station: st.id };
    this.syncCrew(v);
  }
  do_gmBeat(c, a) {
    const g = this.needGM(c); if (g) return g;
    const b = Enc.BEATS.find((x) => x.id === a.id);
    if (!b) return { err: 'Séquence inconnue.' };
    for (const act of b.do) {
      if (act.t === 'reveal') for (const id of act.ids) { const t = this.tok(id); if (t) t.hidden = false; }
      if (act.t === 'phase') { this.s.phase = act.phase; if (act.phase === 'initiative') { for (const t of this.tokens()) t.init = null; this.s.order = []; this.s.activeId = null; this.s.round = 0; } }
      if (act.t === 'music') this.s.music = act.level;
    }
    if (!this.s.beatsDone.includes(b.id)) this.s.beatsDone.push(b.id);
    const beatDo = b.do.map((x) => (x.t === 'cam' ? Object.assign({}, x, this.camRef(x.ref)) : x));
    this.pushFx({ k: 'beat', beat: b.id, title: b.title, do: beatDo });
    this.log({ kind: 'beat', text: `🎬 ${b.title}` });
  }
  camRef(ref) {
    const m = this.s.map;
    if (ref === 'spawn-enemy') return { x: m.cols * 0.84, y: m.rows * 0.46 };
    if (ref === 'spawn-party') return { x: m.cols * 0.18, y: m.rows * 0.52 };
    return { x: m.cols / 2, y: m.rows / 2 };
  }
  do_gmMusic(c, a) { const g = this.needGM(c); if (g) return g; this.s.music = Math.max(0, Math.min(3, Number(a.level) || 0)); this.pushFx({ k: 'music', level: this.s.music }); }
  do_gmFx(c, a) { // petits effets à la demande : explosion, secousse, flash
    const g = this.needGM(c); if (g) return g;
    this.pushFx({ k: 'gmfx', name: String(a.name), x: Number(a.x) || 0, y: Number(a.y) || 0 });
  }
  do_gmMap(c, a) {
    const g = this.needGM(c); if (g) return g;
    const m = this.s.map;
    if (a.kind === 'image') {
      if (!/^\/uploads\/[\w.-]+$/.test(String(a.url || ''))) return { err: 'URL de carte invalide.' };
      m.kind = 'image'; m.image = a.url; m.cols = R.clamp(Math.round(Number(a.cols)) || 40, 10, 200); m.rows = R.clamp(Math.round(Number(a.rows)) || 30, 10, 200);
      this.geo = MapGen.generate(1, m.cols, m.rows); this.geo.rocks = []; this.geo.lava = [];
    } else {
      m.kind = 'procedural'; m.image = null; m.seed = Number(a.seed) || MAP_SEED; m.cols = COLS; m.rows = ROWS;
      this.geo = MapGen.generate(m.seed, m.cols, m.rows);
    }
    if (a.grid !== undefined) m.grid = !!a.grid;
    for (const t of this.tokens()) { const p = this.clampPos(t.x, t.y, 0.5); t.x = p.x; t.y = p.y; }
    this.pushFx({ k: 'map' });
  }
  do_gmGrid(c, a) { const g = this.needGM(c); if (g) return g; this.s.map.grid = !!a.grid; }
  do_gmNotes(c, a) { const g = this.needGM(c); if (g) return g; this.s.gmNotes = String(a.text || '').slice(0, 8000); }
  do_gmReset(c) { const g = this.needGM(c); if (g) return g; this.reset(); this.pushFx({ k: 'reset' }); }
  do_gmClearTethers(c) { const g = this.needGM(c); if (g) return g; this.s.tethers = []; }

  /* ---------- dés & discussion ---------- */
  do_roll(c, a) {
    const expr = String(a.expr || 'd20').slice(0, 60);
    const secret = !!a.secret && c.role === 'gm';
    let who = a.label ? String(a.label).slice(0, 40) : c.name || 'Quelqu\'un';
    const out = [];
    if (/^d20/i.test(expr.replace(/\s/g, '')) && (a.mode === 'adv' || a.mode === 'dis')) {
      const rest = expr.replace(/\s/g, '').replace(/^d20|^1d20/i, '');
      const d = Dice.d20(a.mode);
      const mod = rest ? Dice.roll('0' + (/^[+-]/.test(rest) ? rest : '+' + rest)).total : 0;
      const total = d.kept + mod;
      this.log({ kind: 'roll', who, text: `${expr} (${a.mode === 'adv' ? 'avantage' : 'désavantage'}) : d20[${d.rolls.join(', ')}] → ${d.kept}${mod ? (mod > 0 ? ' + ' : ' − ') + Math.abs(mod) : ''} = ${total}`, secret });
      this.pushFx({ k: 'dice', who, total, expr, secret, nat: d.kept, mode: a.mode });
      return { total };
    }
    const r = Dice.roll(expr);
    this.log({ kind: 'roll', who, text: `${expr} : ${r.text} = ${r.total}`, secret });
    this.pushFx({ k: 'dice', who, total: r.total, expr, secret, nat: r.groups.length === 1 && r.groups[0].s === 20 && r.groups[0].n === 1 ? r.groups[0].r[0] : null });
    return { total: r.total };
  }
  do_chat(c, a) {
    const text = String(a.text || '').trim().slice(0, 400);
    if (!text) return { err: 'Message vide.' };
    this.log({ kind: 'chat', who: c.name || 'Anonyme', text, secret: false, gm: c.role === 'gm' });
  }

  /* ---------- tour automatique des ennemis (suggestion pour le MJ) ---------- */
  do_gmAuto(c) {
    const g = this.needGM(c); if (g) return g;
    const s = this.s;
    if (s.phase !== 'combat') return { err: 'Aucun combat en cours.' };
    const t = this.tok(s.activeId);
    if (!t || t.side !== 'enemy') return { err: "Le tour actif n'est pas celui d'un ennemi." };
    const gmc = { role: 'gm', name: 'MJ', ai: true };
    const done = [];
    const party = this.tokens().filter((x) => x.side === 'party' && !x.hidden && !x.dead);
    const partyCreatures = party.filter((x) => x.kind === 'creature' && !x.conditions.includes('inconscient'));
    const partyVeh = party.filter((x) => x.kind === 'vehicle' && !x.veh.destroyed);
    const v = this.vehicleOf(t);
    const tryAct = (a) => { const r = this.act(gmc, a); if (r.ok) done.push(a.a); return r; };

    if (v && t.aboard.station === 'helm') {
      const target = partyVeh.sort((p, q) => R.dist(v, p) - R.dist(v, q))[0];
      if (target) {
        const dist = R.dist(v, target);
        const want = Math.atan2(target.y - v.y, target.x - v.x) / R.RAD;
        const turn = R.angDiff(v.r, want);
        const nr = v.r + R.clamp(turn, -90, 90);
        const turnCost = Math.abs(R.angDiff(v.r, nr)) / 45;
        let budget = this.vehicleBudget(v);
        if (dist > budget + 8 && !t.turn.bonus && v.veh.dashLeft > 0) { tryAct({ a: 'dash', id: v.id }); budget = this.vehicleBudget(v); }
        const contact = (v.len + target.len) / 2 + 0.2;
        const go = Math.max(0, Math.min(budget - turnCost - v.veh.movedTurn, dist - contact));
        const dir = R.RAD * nr;
        if (go > 0.2 || turnCost > 0) tryAct({ a: 'move', id: v.id, x: v.x + Math.cos(dir) * go, y: v.y + Math.sin(dir) * go, r: nr });
        const gap = R.gap(v, target);
        if (gap <= 1.2 && v.veh.distTurn > 0 && !v.veh.ramUsed) tryAct({ a: 'ram', id: v.id, target: target.id });
        else if (!t.turn.action) {
          const ci = (t.attacks || []).findIndex((w) => w.rays && w.uses && w.uses.left > 0);
          const tg = partyCreatures.sort((p, q) => R.dist(t, p) - R.dist(t, q))[0];
          if (ci >= 0 && tg && R.dist(t, tg) <= 24) tryAct({ a: 'attack', id: t.id, target: tg.id, weapon: { src: 'token', idx: ci } });
        }
      }
    } else if (t.aboard && t.aboard.station) {
      const st = v.veh.stations.find((x) => x.id === t.aboard.station);
      const w = st && st.kind === 'weapon' ? Object.assign({}, Enc.WEAPONS[st.weapon]) : null;
      if (w) {
        const cand = (w.tether ? partyVeh.filter((p) => !this.s.tethers.some((th) => th.from === v.id && th.to === p.id)) : []).concat(partyVeh).concat(partyCreatures);
        const tg = cand.filter((p) => R.gap(t, p) <= w.range).sort((p, q) => R.gap(t, p) - R.gap(t, q))[0];
        if (tg) { tryAct({ a: 'attack', id: t.id, target: tg.id, weapon: { src: 'station' } }); tryAct({ a: 'attack', id: t.id, target: tg.id, weapon: { src: 'station' } }); }
        else done.push('rien à portée');
      }
    } else {
      const tg = partyCreatures.sort((p, q) => R.dist(t, p) - R.dist(t, q))[0];
      if (tg) {
        const ai = Math.max(0, t.attacks.findIndex((w) => w.range <= 2));
        tryAct({ a: 'attack', id: t.id, target: tg.id, weapon: { src: 'token', idx: ai } });
      }
    }
    this.sysLog(`🤖 Tour automatique de ${t.name} : ${done.length ? done.join(', ') : 'rien à faire'}.`);
    return { done };
  }
}

module.exports = { Game, CONDITIONS };
