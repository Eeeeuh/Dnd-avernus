'use strict';
// Tests de logique : node test/engine.test.js
const assert = require('assert');
const { Game } = require('../server/engine');
const R = require('../public/js/rules.js');
const Enc = require('../server/encounter');

const g = new Game();
g.reset();
const GM = { role: 'gm', name: 'MJ' };
const P = (n) => ({ role: 'player', slot: 'p' + n, name: 'Joueur ' + n });
let pass = 0;
const ok = (name, cond) => { assert.ok(cond, name); pass++; console.log('  ✓', name); };
const act = (c, a) => g.act(c, a);

console.log('Initiative');
let r = act(P(1), { a: 'initRoll', id: 'p1' });
ok('joueur ne peut pas lancer avant la phase initiative', !r.ok);
ok('MJ démarre l\'initiative', act(GM, { a: 'gmStartInitiative' }).ok);
for (let i = 1; i <= 4; i++) ok(`PJ ${i} lance son initiative`, act(P(i), { a: 'initRoll', id: 'p' + i }).ok);
ok('un joueur ne lance pas pour un autre', !act(P(1), { a: 'initRoll', id: 'p2' }).ok);
ok('MJ lance pour les ennemis', act(GM, { a: 'gmInitAll', side: 'enemy' }).ok);
ok('ordre = 4 PJ + 5 ennemis', g.s.order.length === 9);
const sorted = g.s.order.map((id) => g.tok(id).init);
ok('ordre trié par initiative décroissante', sorted.every((v, i) => i === 0 || sorted[i - 1] >= v));
ok('complication de poursuite (MJ)', act(GM, { a: 'gmChase' }).ok && /Complication de poursuite/.test(g.s.log[g.s.log.length - 1].text));
ok('complication refusée au joueur', !act(P(1), { a: 'gmChase' }).ok);
ok('récap Foundry (secret)', act(GM, { a: 'gmRecap' }).ok && g.s.log[g.s.log.length - 1].secret && /Tortionnaire/.test(g.s.log[g.s.log.length - 1].text));
ok('combat démarre', act(GM, { a: 'gmStartCombat' }).ok && g.s.phase === 'combat' && g.s.round === 1);

console.log('Tours et déplacement');
const active = g.tok(g.s.activeId);
const other = g.s.order.map((i) => g.tok(i)).find((t) => t.side === 'party' && t.id !== active.id);
if (other) ok('un joueur ne joue pas hors de son tour', !act(P(Number(other.owner[1])), { a: 'move', id: other.id, x: other.x + 1, y: other.y }).ok);
// force le tour du pilote du véhicule des joueurs
g.s.activeId = 'p1'; g.startTurn('p1');
const vp = g.tok('v-party');
g.geo.rocks = []; g.geo.lava = [];
const x0 = vp.x;
r = act(P(1), { a: 'move', id: 'v-party', x: x0 + 8, y: vp.y, r: 0 });
ok('pilote avance de 8 cases', r.ok && Math.abs(vp.x - (x0 + 8)) < 1e-6);
ok('équipage suit le véhicule', Math.abs(g.tok('p3').x - R.toWorld(vp, vp.veh.stations.find((s) => s.id === 'seatL').lx, vp.veh.stations.find((s) => s.id === 'seatL').ly).x) < 1e-6);
ok('conduire consomme l\'action du pilote', g.tok('p1').turn.action === true);
r = act(P(1), { a: 'move', id: 'v-party', x: vp.x + 14, y: vp.y, r: 0 });
ok('dépasse le budget de 20 cases : refusé', !r.ok && /Trop loin/.test(r.err));
r = act(P(1), { a: 'move', id: 'v-party', x: vp.x, y: vp.y + 3, r: 0 });
ok('dérapage latéral refusé', !r.ok && /crabe/.test(r.err));
ok('turbo : consomme une flasque d\'ichor', act(P(1), { a: 'overdrive', id: 'v-party' }).ok && vp.veh.ichor === 0 && vp.veh.turboLeft === 10);
ok('turbo = action bonus', g.tok('p1').turn.bonus === true);
ok('Foncer refusé : action bonus déjà prise', !act(P(1), { a: 'dash', id: 'v-party' }).ok);
r = act(P(1), { a: 'move', id: 'v-party', x: vp.x + 16, y: vp.y, r: 0 });
if (!r.ok) console.log('   raison :', r.err);
ok('+6 cases après turbo (24 ≤ 26)', r.ok);
ok('le joueur 2 ne pilote pas', !act(P(2), { a: 'move', id: 'v-party', x: vp.x + 1, y: vp.y }).ok);

console.log('Attaques');
g.s.activeId = 'p2'; g.startTurn('p2');
// téléporte l'ennemi au contact pour tester
const ve = g.tok('v-enemy');
ve.x = vp.x + 5; ve.y = vp.y; ve.r = 180; g.syncCrew(ve);
const rag = g.tok('raggadragga');
r = act(P(2), { a: 'attack', id: 'p2', target: 'raggadragga', weapon: { src: 'token', idx: 0 } });
ok('cible cachée : refus', !r.ok);
g.tok('raggadragga').hidden = false; for (const id of ['v-enemy', 'jibbs', 'oozywog', 'finnik', 'yeegha']) g.tok(id).hidden = false;
let hp = rag.hp;
for (let i = 0; i < 40 && rag.hp === hp; i++) { g.startTurn('p2'); const rr = act({ role: 'gm', name: 'MJ' }, { a: 'attack', id: 'p2', target: 'raggadragga', weapon: { src: 'token', idx: 0 }, mag: 'none' }); }
ok('arme non magique : Raggadragga immunisé (PV inchangés)', rag.hp === hp);
let magicHit = false;
for (let i = 0; i < 60 && !magicHit; i++) { g.startTurn('p2'); act(GM, { a: 'attack', id: 'p2', target: 'raggadragga', weapon: { src: 'token', idx: 1 } }); if (rag.hp < hp) magicHit = true; }
ok('arme magique : Raggadragga perd des PV', magicHit);

console.log('Véhicules : seuil de dégâts, avaries, destruction');
g.startTurn('p2');
const before = ve.hp;
for (let i = 0; i < 30; i++) { g.startTurn('p2'); act(GM, { a: 'attack', id: 'p2', target: 'v-enemy', weapon: { src: 'custom', name: 'Test', toHit: 30, dmg: '1d4', type: 'tranchant', range: 40 } }); }
ok('coups < seuil : blindage intact', ve.hp === before);
let mishapSeen = false;
for (let i = 0; i < 30 && !mishapSeen; i++) { g.startTurn('p2'); act(GM, { a: 'attack', id: 'p2', target: 'v-enemy', weapon: { src: 'custom', name: 'Gros coup', toHit: 30, dmg: '6d6+10', type: 'force', range: 40, mag: 'magic' } }); if (ve.veh.mishaps.length || ve.veh.jam || ve.hp < before) mishapSeen = true; }
ok('gros coups : dégâts ou avarie', mishapSeen);

console.log('Harpon, câble, treuil');
const ve2 = g.tok('v-enemy'); ve2.hp = 200; ve2.veh.destroyed = false;
const vp2 = g.tok('v-party');
vp2.x = 20; vp2.y = 24; vp2.r = 0; g.syncCrew(vp2);
ve2.x = 30; ve2.y = 24; ve2.r = 180; g.syncCrew(ve2);
let tether = null;
for (let i = 0; i < 40 && !tether; i++) { g.startTurn('p2'); g.s.activeId = 'p2'; act(P(2), { a: 'attack', id: 'p2', target: 'v-enemy', weapon: { src: 'station' }, adv: 'adv' }); tether = g.s.tethers[0]; }
ok('harpon planté : câble créé', !!tether);
if (tether) {
  const d0 = R.dist(vp2, ve2);
  g.startTurn('p2'); g.s.activeId = 'p2';
  r = act(P(2), { a: 'reel', id: 'p2', tether: tether.id });
  ok('treuil rapproche les véhicules', r.ok && R.dist(vp2, ve2) < d0);
}

console.log('Éperonnage');
vp2.x = 20; vp2.y = 24; vp2.r = 0; g.syncCrew(vp2); ve2.x = 24.6; ve2.y = 24; g.syncCrew(ve2);
g.s.tethers = [];
g.startTurn('p1'); g.s.activeId = 'p1';
vp2.veh.distTurn = 0; vp2.veh.ramUsed = false; vp2.veh.stopped = false;
r = act(P(1), { a: 'ram', id: 'v-party', target: 'v-enemy' });
ok('éperonner sans avoir roulé : refusé', !r.ok && /roulé/.test(r.err));
vp2.veh.movedTurn = 10; vp2.veh.distTurn = 20; vp2.veh.ramUsed = false;
const hpA = vp2.hp, hpB = ve2.hp;
r = act(P(1), { a: 'ram', id: 'v-party', target: 'v-enemy' });
ok('collision avec élan : acceptée', r.ok);
ok('collision : les deux engins encaissent 5d6 (≥ seuil)', vp2.hp < hpA && ve2.hp < hpB);
ok('collision : l\'engin s\'immobilise', vp2.veh.stopped === true && !act(P(1), { a: 'move', id: 'v-party', x: vp2.x - 1, y: vp2.y, r: 0 }).ok);
r = act(P(1), { a: 'ram', id: 'v-party', target: 'v-enemy' });
ok('une seule collision par tour', !r.ok);

console.log('Règles du livre : CA, dash, avaries, immunités');
const vt = g.tok('v-enemy'); vt.veh.movedTurn = 0;
ok('CA de l\'engin à l\'arrêt (19)', g.targetAC(vt) === 19);
vt.veh.movedTurn = 3;
ok('CA 19 en mouvement', g.targetAC(vt) === 19);
ok('immunité feu/poison/psychique', vt.immune.includes('feu') && vt.immune.includes('poison') && vt.immune.includes('psychique'));
const seen = new Set();
for (let i = 0; i < 400; i++) { const t0 = g.tok('v-enemy'); t0.veh.mishaps = []; t0.veh.flipped = false; t0.veh.stopped = false; t0.veh.dmgThreshold = 10; t0.veh.jam = null; seen.add(g.rollMishap(t0).effect); }
ok('tableau d\'avaries d20 : les 8 résultats sortent', seen.size === 8);
const vv = g.tok('v-party'); vv.veh.mishaps = []; vv.veh.dmgThreshold = 10; vv.veh.flipped = false; vv.veh.stopped = false;
const armor = Enc.MISHAPS.find((m) => m.effect === 'armor');
vv.veh.mishaps.push({ id: armor.id, name: armor.name, effect: 'armor', dc: 2, ability: 'str', restore: 10 }); vv.veh.dmgThreshold = 0;
g.startTurn('p2'); g.s.activeId = 'p2'; g.tok('p2').aboard = { v: 'v-party', lx: 0, ly: 0, station: 'free' }; vv.veh.movedTurn = 0;
r = act(P(2), { a: 'repair', id: 'v-party', who: 'p2' });
ok('réparation (DD 2) : blindage restauré', r.ok !== false && vv.veh.mishaps.length === 0 && vv.veh.dmgThreshold === 10);
vv.veh.mishaps = []; g.rollMishap; vv.veh.flipped = true;
ok('retourné : pas de conduite pour un joueur', (vv.veh.mishaps.push({ id: 8, name: 'Retournement', effect: 'flip' }), g.startTurn('p1'), !act(P(1), { a: 'move', id: 'v-party', x: vv.x + 1, y: vv.y, r: 0 }).ok));
act(GM, { a: 'repair', id: 'v-party' });
ok('le MJ redresse l\'engin', vv.veh.flipped === false);


console.log('Profils du livre : Tortionnaire, Broyeur, Raggadragga');
const T = g.tok('v-party'), B = g.tok('v-enemy');
ok('Tortionnaire : 60 PV, CA 21 (19 à l\'arrêt), vitesse 20 cases', T.maxHp === 60 && T.ac === 21 && T.acStopped === 19 && T.speed === 20);
ok('Tortionnaire : 4 places, un seul lance-harpons +7 (2d8+2)', T.veh.stations.length === 4 && T.veh.stations.filter((x) => x.kind === 'weapon').length === 1 && T.veh.weapons.harpoon.toHit === 7);
ok('Broyeur : 200 PV, CA 19, masticateur +9 6d6+4, boule +9 8d8+4', B.maxHp === 200 && B.ac === 19 && Enc.WEAPONS.chomper.toHit === 9 && Enc.WEAPONS.chomper.dmg === '6d6+4' && Enc.WEAPONS.wrecking.dmg === '8d8+4');
ok('Raggadragga : 120 PV', g.tok('raggadragga').maxHp === 120);
ok('Tortionnaire : en mouvement CA 21, à l\'arrêt 19', (T.veh.movedTurn = 4, g.targetAC(T) === 21) && (T.veh.movedTurn = 0, g.targetAC(T) === 19));
const pilot = g.tok('p1');
ok('abri du pilote : +5 à la CA', g.targetAC(pilot) === pilot.ac + 5);
ok('passager sans abri', g.targetAC(g.tok('p3')) === g.tok('p3').ac);
// attaque contre un véhicule à l'arrêt : avantage (2 dés)
T.veh.movedTurn = 0;
let sawAdv = false; for (let i = 0; i < 5; i++) { const rr = g.strike(g.tok('jibbs'), { toHit: 0, dmg: '1d4', type: 'tranchant', mag: 'none' }, T, {}); if (rr.rolls.length === 2) sawAdv = true; }
ok('véhicule à l\'arrêt : attaques avantagées', sawAdv);
// Roues écrasantes
const victim = g.tok('jibbs'); victim.dexSave = -50; victim.relentlessUsed = true; victim.conditions = []; victim.hp = 78; victim.hidden = false; victim.dead = false; victim.aboard = null;
const rg = g.tok('raggadragga'); rg.dead = false; rg.hp = rg.maxHp; rg.conditions = []; rg.hidden = false; Enc.aboard(rg, B, 'helm'); B.veh.destroyed = false; B.hp = 200;
B.x = 40; B.y = 24; B.r = 0; g.syncCrew(B); victim.x = 42.4; victim.y = 24;
B.veh.distTurn = 8; B.veh.movedTurn = 8; B.veh.crushed = []; B.veh.stopped = false; B.veh.ramUsed = false;
g.s.activeId = 'raggadragga'; g.tok('raggadragga').turn = { moved: 0, attacks: 0, action: true, bonus: false, reaction: false };
const before2 = victim.hp;
r = act(GM, { a: 'ram', id: 'v-enemy', target: 'jibbs' });
ok('Roues écrasantes (Dex ratée) : 4d10 + à terre', r.ok && victim.hp < before2 && victim.conditions.includes('à terre') && before2 - victim.hp >= 4);
r = act(GM, { a: 'ram', id: 'v-enemy', target: 'jibbs' });
ok('Roues écrasantes : une fois par créature et par tour (MJ peut passer outre)', r.ok);
// Faux balayantes
T.x = 20; T.y = 10; T.r = 0; g.syncCrew(T); victim.x = 21.9; victim.y = 10; victim.conditions = []; victim.hp = 78; victim.dead = false;
T.veh.distTurn = 5; T.veh.lashUsed = false; g.tok('p1').turn = { moved: 0, attacks: 0, action: true, bonus: false, reaction: false }; g.s.activeId = 'p1';
const hpL = victim.hp; let lashed = false;
for (let i = 0; i < 25 && !lashed; i++) { T.veh.lashUsed = false; victim.dexSave = -50; act(P(1), { a: 'lash', id: 'v-party', target: 'jibbs' }); if (victim.hp < hpL) lashed = true; }
ok('Faux balayantes : 2d10+2 tranchants (DD 13)', lashed);
ok('Faux balayantes : une fois par tour', (T.veh.lashUsed = true, !act(P(1), { a: 'lash', id: 'v-party', target: 'jibbs' }).ok));
// Masticateur : broyé
const lunch = g.tok('yeegha'); lunch.hp = 1; lunch.dead = false; lunch.hidden = false; lunch.aboard = null; lunch.relentless = false; lunch.x = 30; lunch.y = 30;
for (let i = 0; i < 30 && !lunch.dead; i++) { lunch.hp = 1; g.strike(g.tok('jibbs'), Object.assign({}, Enc.WEAPONS.chomper, { toHit: 50 }), lunch, { adv: 'adv' }); }
ok('Masticateur : cible à 0 PV broyée', lunch.dead === true && lunch.hp === 0);
ok('feu : le Broyeur est immunisé', (() => { let rr; for (let i = 0; i < 30; i++) { rr = g.strike(g.tok('p1'), { toHit: 50, dmg: '4d6', type: 'feu', mag: 'magic' }, B, {}); if (rr.hit) break; } return rr.immune === true && rr.applied === 0; })());

console.log('Fin de partie');
ok('GM peut révéler / cacher', act(GM, { a: 'gmReveal', id: 'jibbs', hidden: true }).ok && g.tok('jibbs').hidden === true);
const view = g.viewFor(P(1));
ok('vue joueur : ennemi caché absent', !view.tokens.jibbs);
ok('vue joueur : PV ennemis masqués', view.tokens.raggadragga && view.tokens.raggadragga.hp === undefined && view.tokens.raggadragga.hpPct !== undefined);
ok('vue MJ : tout visible', !!g.viewFor(GM).tokens.jibbs && g.viewFor(GM).tokens.raggadragga.hp !== undefined);
for (const b of ['horizon', 'ambush', 'taunt', 'volley', 'fury', 'parley', 'victory', 'defeat']) ok('séquence ' + b, act(GM, { a: 'gmBeat', id: b }).ok);
ok('dés : 2d6+3', act(P(1), { a: 'roll', expr: '2d6+3' }).total >= 5);
ok('dés : formule invalide refusée', !act(P(1), { a: 'roll', expr: 'banane' }).ok);
ok('joueur ne peut pas utiliser une action MJ', !act(P(1), { a: 'gmReset' }).ok);
g.reset();
console.log(`\n${pass} vérifications OK`);
process.exit(0);
