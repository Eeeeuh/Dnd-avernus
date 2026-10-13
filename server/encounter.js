'use strict';
/* Données de la rencontre « Raggadragga et les Tripes Sanglantes » (Descente en Averne, ch. 3).
 *
 * Sources :
 *  - [résumé] le texte fourni par le MJ : équipage, postes, PV de l'engin, bandeau de décharge, tactique.
 *  - [MM]     statblocks des lycanthropes d'après le Manuel des Monstres 5e (de mémoire, à vérifier).
 *  - [maison] valeurs provisoires (armes du véhicule, seuils, table d'avaries…). Tout est modifiable
 *             en direct depuis le panneau MJ, ou ici. Les valeurs "maison" portent provisional:true.
 */

const WEAPONS = {
  // Valeurs du livre : Descente en Averne, annexe B (p. 218-219). 1 case = 1,50 m = 5 ft.
  chomper: { name: 'Masticateur', range: 1, toHit: 9, dmg: '6d6+4', type: 'perforant', melee: true, mag: 'magic', grind: true, note: "Cible réduite à 0 PV : broyée et recrachée par les tuyaux d'évacuation. Objets non magiques détruits." },
  wrecking: { name: 'Boulet de démolition', range: 3, toHit: 9, dmg: '8d8+4', type: 'contondant', melee: true, mag: 'magic', vsObject: true, note: 'Allonge 4,50 m. Dégâts doublés contre un objet ou une structure (véhicules compris : interprétation).' },
  harpoon: { name: 'Lance-harpons', range: 24, toHit: 5, dmg: '2d8', type: 'perforant', tether: true, mag: 'magic', note: "Portée 36 m (24 cases), 10 harpons. Le câble qui relie les véhicules est une règle maison (provisoire)." },
};

// Table des incidents d20 (annexe B, p. 220). DD de réparation du livre.
const MISHAPS = [
  { id: 1, min: 1, max: 1, name: 'Flammes dans le moteur', text: "Le véhicule est enveloppé de flammes : toute créature qui commence son tour dans ou sur le véhicule subit 3d6 dégâts de feu jusqu'à la fin de l'incident.", effect: 'flare', dc: 15, ability: 'dex' },
  { id: 2, min: 2, max: 4, name: 'Volant bloqué', text: "Le véhicule ne peut que rouler en ligne droite et rate automatiquement ses tests et jets de sauvegarde de Dextérité.", effect: 'noturn', dc: 15, ability: 'str' },
  { id: 3, min: 5, max: 7, name: 'Chaudière fissurée', text: 'La vitesse du véhicule décroît de 9 m (6 cases).', effect: 'slow6', dc: 15, ability: 'str' },
  { id: 4, min: 8, max: 10, name: 'Arme défaillante', text: "Une arme du véhicule (au choix du MJ) ne peut plus être utilisée.", effect: 'jam', dc: 20, ability: 'str' },
  { id: 5, min: 11, max: 13, name: 'Fumée aveuglante', text: 'Le poste de pilotage se remplit de fumée : visibilité nulle, le pilote est aveuglé.', effect: 'smoke', dc: 15, ability: 'dex' },
  { id: 6, min: 14, max: 16, name: 'Armure affaiblie', text: 'Le seuil de dégâts du véhicule est réduit de 10.', effect: 'armor', dc: 15, ability: 'str' },
  { id: 7, min: 17, max: 19, name: 'Essieu endommagé', text: "Le véhicule est désavantagé à ses tests de Dextérité ; tests de caractéristique et jets d'attaque désavantagés pour ceux à bord.", effect: 'axle', dc: 20, ability: 'dex' },
  { id: 8, min: 20, max: 20, name: 'Renversement', text: "Le véhicule se retourne et s'arrête. À bord : Force DD 15 ou 3d6 contondants, et à terre. Accrochés à l'extérieur : Force DD 20 ou éjectés.", effect: 'flip', dc: null, ability: null },
];

const PC_COLORS = ['#5CF2C8', '#FFB020', '#C79BFF', '#5AA9FF'];

function pcAttacks() {
  return [
    { name: 'Corps à corps', toHit: 7, dmg: '1d8+4', type: 'tranchant', range: 1.6, mag: 'none' },
    { name: 'Distance / sort', toHit: 7, dmg: '2d6+3', type: 'feu', range: 24, mag: 'magic' },
  ];
}

function mkPc(i) {
  return {
    id: 'p' + (i + 1), name: 'Aventurier ' + (i + 1), kind: 'creature', side: 'party', sprite: 'pc',
    owner: 'p' + (i + 1), color: PC_COLORS[i], size: 1, x: 0, y: 0, r: 0,
    hp: 58, maxHp: 58, ac: 16, speed: 6, initMod: 2, dexSave: 2, strSave: 2, init: null,
    attacks: pcAttacks(), conditions: [], hidden: false,
  };
}

const WEREBOAR_ATTACKS = () => [
  { name: 'Massue', toHit: 5, dmg: '2d6+3', type: 'contondant', range: 1.6, mag: 'none' },
  { name: 'Défenses', toHit: 5, dmg: '2d6+3', type: 'tranchant', range: 1.6, mag: 'none', note: 'Humanoïde touché : Con DD 12 ou lycanthropie.' },
];
const WERERAT_ATTACKS = () => [
  { name: 'Épée courte', toHit: 4, dmg: '1d6+2', type: 'perforant', range: 1.6, mag: 'none' },
  { name: 'Arbalète de poing', toHit: 4, dmg: '1d6+2', type: 'perforant', range: 6, mag: 'none' },
  { name: 'Morsure', toHit: 4, dmg: '1d4+2', type: 'perforant', range: 1.6, mag: 'none', note: 'Humanoïde touché : Con DD 11 ou lycanthropie.' },
];

function mkWereboar(id, name, extra = {}) {
  return Object.assign({
    id, name, kind: 'creature', side: 'enemy', sprite: 'wereboar', color: '#B3202A', size: 1, x: 0, y: 0, r: 0,
    hp: 78, maxHp: 78, ac: 11, speed: 6, initMod: 0, dexSave: 0, init: null,
    attacks: WEREBOAR_ATTACKS(), conditions: [], hidden: true,
    immuneNonMagical: true, relentless: true, relentlessUsed: false,
    sheet: 'Sanglier-garou (forme hybride) — FP 4 — [MM]',
  }, extra);
}
function mkWererat(id, name, extra = {}) {
  return Object.assign({
    id, name, kind: 'creature', side: 'enemy', sprite: 'wererat', color: '#B3202A', size: 1, x: 0, y: 0, r: 0,
    hp: 60, maxHp: 60, ac: 12, speed: 6, initMod: 2, dexSave: 2, init: null,
    attacks: WERERAT_ATTACKS(), conditions: [], hidden: true,
    immuneNonMagical: true,
    sheet: 'Rat-garou (forme hybride) — FP 2 — [MM]',
  }, extra);
}

function stations() {
  // repère local : lx vers l'avant, ly vers tribord. cover : bonus de CA des occupants (abri important +5, partiel +2).
  return [
    { id: 'helm', label: 'Poste de pilotage', lx: 0.5, ly: 0, kind: 'helm', cover: 5 },
    { id: 'chomper', label: 'Masticateur', lx: 1.35, ly: 0, kind: 'weapon', weapon: 'chomper', cover: 2 },
    { id: 'ball', label: 'Boule de démolition', lx: -0.5, ly: 1.05, kind: 'weapon', weapon: 'wrecking', cover: 2 },
    { id: 'harpoonL', label: 'Lance-harpons bâbord', lx: -1.45, ly: -0.95, kind: 'weapon', weapon: 'harpoon', cover: 2 },
    { id: 'harpoonR', label: 'Lance-harpons tribord', lx: -1.45, ly: 0.95, kind: 'weapon', weapon: 'harpoon', cover: 2 },
  ];
}
function stationsTormentor() {
  return [
    { id: 'helm', label: 'Poste de pilotage', lx: 0.55, ly: 0, kind: 'helm', cover: 5 },
    { id: 'harpoon', label: 'Lance-harpons', lx: -0.95, ly: 0, kind: 'weapon', weapon: 'harpoon', cover: 2 },
    { id: 'seatL', label: 'Passager bâbord', lx: -0.15, ly: -0.62, kind: 'seat', cover: 0 },
    { id: 'seatR', label: 'Passager tribord', lx: -0.15, ly: 0.62, kind: 'seat', cover: 0 },
  ];
}

function mkGrinder(id, name, side, extra = {}) {
  return Object.assign({
    id, name, kind: 'vehicle', side, sprite: side === 'party' ? 'grinder-party' : 'grinder-enemy', model: 'grinder',
    color: side === 'party' ? '#5CF2C8' : '#FF5A1F',
    len: 4, wid: 3, x: 0, y: 0, r: 0,
    hp: 200, maxHp: 200, ac: 19, acStopped: 19, speed: 20, immune: ['feu', 'poison', 'psychique'], conditions: [], hidden: false, init: null,
    crush: { maxSize: 2, dc: 11, dice: '4d10', label: 'Roues écrasantes' },
    veh: {
      dmgThreshold: 10, mishapThreshold: 20, soulCoins: side === 'party' ? 0 : 3, ichor: 0, pilotBonus: 0,
      stations: stations(), movedTurn: 0, distTurn: 0, dashed: false, dashLeft: 4, overdrive: false, turboLeft: 0, driving: false, stopped: false, flipped: false, crushed: [], lashUsed: false,
      mishaps: [], jam: null, destroyed: false,
    },
    sheet: 'Broyeur de démons — Gigantesque, 8 créatures — Descente en Averne p. 219 (déplacements : règles maison)',
  }, extra);
}
function mkTormentor(id, name, side, extra = {}) {
  return Object.assign({
    id, name, kind: 'vehicle', side, sprite: 'tormentor', model: 'tormentor',
    color: side === 'party' ? '#5CF2C8' : '#FF5A1F',
    len: 3.4, wid: 2.4, x: 0, y: 0, r: 0,
    hp: 60, maxHp: 60, ac: 21, acStopped: 19, speed: 20, immune: ['feu', 'poison', 'psychique'], conditions: [], hidden: false, init: null,
    crush: { maxSize: 1, dc: 13, dice: '2d10', label: 'Roues écrasantes' },
    lash: { dc: 13, dmg: '2d10+2', label: 'Faux balayantes' },
    veh: {
      dmgThreshold: 10, mishapThreshold: 20, soulCoins: 0, ichor: 1, pilotBonus: 0,
      stations: stationsTormentor(), weapons: { harpoon: { toHit: 7, dmg: '2d8+2' } },
      movedTurn: 0, distTurn: 0, dashed: false, dashLeft: 2, overdrive: false, turboLeft: 0, driving: false, stopped: false, flipped: false, crushed: [], lashUsed: false,
      mishaps: [], jam: null, destroyed: false,
    },
    sheet: 'Tortionnaire — Très Grande taille, 4 créatures — Descente en Averne p. 218 (déplacements : règles maison)',
  }, extra);
}

function aboard(token, v, stationId) {
  const st = v.veh.stations.find((s) => s.id === stationId);
  token.aboard = { v: v.id, lx: st.lx, ly: st.ly, station: stationId };
}

function initialTokens(map) {
  const tokens = {};
  const P = map.spawn.party, E = map.spawn.enemy;

  const vp = mkTormentor('v-party', 'Tortionnaire des aventuriers', 'party', { x: P.x, y: P.y, r: P.r });
  const ve = mkGrinder('v-enemy', 'Broyeur de démons de Raggadragga', 'enemy', { x: E.x, y: E.y, r: E.r, hidden: true });
  tokens[vp.id] = vp; tokens[ve.id] = ve;

  const crewP = ['helm', 'harpoon', 'seatL', 'seatR'];
  for (let i = 0; i < 4; i++) {
    const pc = mkPc(i);
    aboard(pc, vp, crewP[i]);
    tokens[pc.id] = pc;
  }

  const rag = mkWereboar('raggadragga', 'Raggadragga', {
    boss: true, color: '#E0361F', hp: 120, maxHp: 120,
    sheet: 'Raggadragga — sanglier-garou (forme hybride), seigneur de guerre des Tripes sanglantes — 120 PV (p. 87) — profil de base : Manuel des Monstres',
    attacks: WEREBOAR_ATTACKS().concat([
      { name: 'Bandeau de décharge (rayon ardent)', toHit: 5, dmg: '2d6', type: 'feu', range: 24, mag: 'magic', rays: 3, uses: { max: 1, left: 1 }, note: 'Bandeau magique : 3 rayons, une fois par aube.' },
    ]),
  });
  const jibbs = mkWereboar('jibbs', 'Jibbs');
  const oozy = mkWereboar('oozywog', 'Oozywog');
  const finnik = mkWererat('finnik', 'Finnik');
  const yeegha = mkWererat('yeegha', 'Yeegha');
  aboard(rag, ve, 'helm');
  aboard(jibbs, ve, 'chomper');
  aboard(oozy, ve, 'ball');
  aboard(finnik, ve, 'harpoonL');
  aboard(yeegha, ve, 'harpoonR');
  for (const t of [rag, jibbs, oozy, finnik, yeegha]) tokens[t.id] = t;

  return tokens;
}

// Séquence narrative : chaque "beat" est déclenchable par le MJ. Les textes en italique à l'écran du MJ sont à lire à voix haute.
const BEATS = [
  {
    id: 'horizon', title: 'Poussière à l\'horizon', icon: '🌫',
    read: "À l'est, un nuage de cendres rouges grossit au-dessus des dunes. Sous le vent brûlant monte un grondement de moteurs, rauque, comme si l'on torturait quelque chose de vivant.",
    do: [
      { t: 'music', level: 1 }, { t: 'sfx', name: 'horn' },
      { t: 'cam', ref: 'spawn-enemy', zoom: 0.75, ms: 2600 },
      { t: 'banner', text: 'Poussière à l\'horizon', sub: 'Des moteurs approchent' },
      { t: 'shake', amp: 4 },
    ],
  },
  {
    id: 'ambush', title: 'Les Tripes Sanglantes surgissent', icon: '🐗',
    read: "Un panache de poussière rouge s'élève dans le lointain, créé par une grande machine de guerre infernale arrivant en trombe : un Broyeur de démons couvert de sang, avec des crocs métalliques grinçants à l'avant et une boule de démolition qui se balance derrière. Son équipage est constitué d'humanoïdes avec des têtes de sanglier et de rats, tous équipés de grosses lunettes.",
    do: [
      { t: 'reveal', ids: ['v-enemy', 'raggadragga', 'jibbs', 'oozywog', 'finnik', 'yeegha'] },
      { t: 'music', level: 2 }, { t: 'sfx', name: 'roar' }, { t: 'sfx', name: 'engineSurge' },
      { t: 'cam', ref: 'center', zoom: 0.62, ms: 2200 },
      { t: 'banner', text: 'Raggadragga', sub: 'Gang des Tripes Sanglantes' },
      { t: 'shake', amp: 9 },
      { t: 'phase', phase: 'initiative' },
    ],
  },
  {
    id: 'taunt', title: 'Raggadragga hurle', icon: '📣',
    read: "Raggadragga se dresse derrière ses commandes : « Des pièces d'âme ! De la belle ferraille ! Tout ça est à nous maintenant ! »",
    do: [
      { t: 'speech', who: 'Raggadragga', text: "Des pièces d'âme ! De la belle ferraille ! Tout ça est à nous maintenant !" },
      { t: 'sfx', name: 'roar' },
    ],
  },
  {
    id: 'volley', title: 'Salve de harpons', icon: '⚓',
    read: "Les rats-garous hissent leurs lance-harpons. Des câbles d'acier sifflent dans l'air chaud.",
    do: [{ t: 'banner', text: 'Salve de harpons', sub: 'Les câbles sifflent' }, { t: 'sfx', name: 'harpoon' }, { t: 'shake', amp: 5 }],
  },
  {
    id: 'fury', title: 'Raggadragga fou de rage', icon: '🔥',
    read: "Blessé, Raggadragga mord ses propres lèvres jusqu'au sang. Il écrase l'accélérateur : le Broyeur hurle, ses cheminées crachent des gerbes d'étincelles.",
    do: [
      { t: 'speech', who: 'Raggadragga', text: 'Je vais vous écraser sous mes roues !' },
      { t: 'music', level: 3 }, { t: 'sfx', name: 'roar' }, { t: 'flash', color: '#ff3a1a' }, { t: 'shake', amp: 10 },
      { t: 'banner', text: 'Fou de rage', sub: 'Raggadragga est blessé' },
    ],
  },
  {
    id: 'parley', title: 'Marché ou otages', icon: '🤝',
    read: "À bout de souffle, Raggadragga ricane : il veut les pièces d'âme et les composants de valeur. À défaut, vos têtes valent cher auprès de l'Aura de la Nuit, Mad Maggie.",
    do: [
      { t: 'speech', who: 'Raggadragga', text: "Les pièces d'âme, et on se quitte bons amis… ou je vous vends à Mad Maggie, en morceaux." },
      { t: 'music', level: 1 },
    ],
  },
  {
    id: 'victory', title: 'Victoire', icon: '🏆',
    read: "Le hurlement du moteur s'éteint. Dans le silence, le vent d'Averne rabat la poussière rouge sur l'épave fumante.",
    do: [
      { t: 'music', level: 0 }, { t: 'sfx', name: 'victory' },
      { t: 'banner', text: 'Les Tripes Sanglantes sont vaincues', sub: 'Le désert se tait' },
      { t: 'phase', phase: 'ended' },
    ],
  },
  {
    id: 'defeat', title: 'Capturés', icon: '⛓',
    read: "Les lames cessent de tomber. On vous attache les poignets avec des câbles de harpon ; le Broyeur fait demi-tour dans un nuage de cendres.",
    do: [
      { t: 'music', level: 0 }, { t: 'sfx', name: 'defeat' },
      { t: 'banner', text: 'Capturés', sub: 'La route vers Mad Maggie' },
      { t: 'phase', phase: 'ended' },
    ],
  },
];

module.exports = { WEAPONS, MISHAPS, BEATS, PC_COLORS, mkPc, mkGrinder, mkTormentor, mkWereboar, mkWererat, initialTokens, stations, aboard, pcAttacks };
