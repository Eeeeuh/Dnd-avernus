'use strict';
// Tests de logique : node test/engine.test.js
const assert = require('assert');
const { Game } = require('../server/engine');
const R = require('../public/js/rules.js');

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
ok('combat démarre', act(GM, { a: 'gmStartCombat' }).ok && g.s.phase === 'combat' && g.s.round === 1);

console.log('Tours et déplacement');
const active = g.tok(g.s.activeId);
const other = g.s.order.map((i) => g.tok(i)).find((t) => t.side === 'party' && t.id !== active.id);
if (other) ok('un joueur ne joue pas hors de son tour', !act(P(Number(other.owner[1])), { a: 'move', id: other.id, x: other.x + 1, y: other.y }).ok);
// force le tour du pilote du véhicule des joueurs
g.s.activeId = 'p1'; g.startTurn('p1');
const vp = g.tok('v-party');
const x0 = vp.x;
r = act(P(1), { a: 'move', id: 'v-party', x: x0 + 8, y: vp.y, r: 0 });
ok('pilote avance de 8 cases', r.ok && Math.abs(vp.x - (x0 + 8)) < 1e-6);
ok('équipage suit le véhicule', Math.abs(g.tok('p3').x - R.toWorld(vp, vp.veh.stations.find((s) => s.id === 'harpoonL').lx, vp.veh.stations.find((s) => s.id === 'harpoonL').ly).x) < 1e-6);
r = act(P(1), { a: 'move', id: 'v-party', x: vp.x + 6, y: vp.y, r: 0 });
ok('dépasse le budget de mouvement : refusé', !r.ok && /Trop loin/.test(r.err));
r = act(P(1), { a: 'move', id: 'v-party', x: vp.x, y: vp.y + 3, r: 0 });
ok('dérapage latéral refusé', !r.ok && /crabe/.test(r.err));
ok('overdrive consomme une pièce d\'âme', act(P(1), { a: 'overdrive', id: 'v-party' }).ok && vp.veh.soulCoins === 2);
r = act(P(1), { a: 'move', id: 'v-party', x: vp.x + 4, y: vp.y, r: 0 });
ok('+6 cases après surrégime', r.ok);
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
const ve2 = g.tok('v-enemy'); ve2.hp = 120; ve2.veh.destroyed = false;
const vp2 = g.tok('v-party');
vp2.x = 20; vp2.y = 24; vp2.r = 0; g.syncCrew(vp2);
ve2.x = 30; ve2.y = 24; ve2.r = 180; g.syncCrew(ve2);
let tether = null;
for (let i = 0; i < 40 && !tether; i++) { g.startTurn('p3'); g.s.activeId = 'p3'; act(P(3), { a: 'attack', id: 'p3', target: 'v-enemy', weapon: { src: 'station' }, adv: 'adv' }); tether = g.s.tethers[0]; }
ok('harpon planté : câble créé', !!tether);
if (tether) {
  const d0 = R.dist(vp2, ve2);
  g.startTurn('p3'); g.s.activeId = 'p3';
  r = act(P(3), { a: 'reel', id: 'p3', tether: tether.id });
  ok('treuil rapproche les véhicules', r.ok && R.dist(vp2, ve2) < d0);
}

console.log('Éperonnage');
vp2.x = 20; vp2.y = 24; vp2.r = 0; g.syncCrew(vp2); ve2.x = 25.2; ve2.y = 24; g.syncCrew(ve2);
g.s.tethers = [];
g.startTurn('p1'); g.s.activeId = 'p1';
r = act(P(1), { a: 'ram', id: 'v-party', target: 'v-enemy' });
ok('éperonner sans élan : refusé', !r.ok && /3 cases/.test(r.err));
vp2.veh.movedTurn = 5; vp2.veh.ramUsed = false;
r = act(P(1), { a: 'ram', id: 'v-party', target: 'v-enemy' });
ok('éperonnage avec élan : accepté', r.ok);

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
