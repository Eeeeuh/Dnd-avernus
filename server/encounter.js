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
  chomper: { name: 'Mâchoire broyeuse (Chomper)', range: 2.5, toHit: 6, dmg: '3d10', type: 'perforant', melee: true, provisional: true, note: 'Contact : la gueule de fer se referme sur la cible.' },
  wrecking: { name: 'Boulet de démolition', range: 3.5, toHit: 6, dmg: '3d10+3', type: 'contondant', melee: true, provisional: true, note: 'Balancé au bout de sa chaîne sur le flanc.' },
  harpoon: { name: 'Lance-harpon', range: 14, toHit: 6, dmg: '2d10', type: 'perforant', tether: true, provisional: true, note: 'Sur un véhicule touché, le harpon reste planté et le câble le relie à votre engin.' },
};

const MISHAPS = [
  { id: 1, name: 'Moteur noyé', text: "Vitesse réduite de moitié jusqu'à la fin du prochain tour du pilote.", effect: 'slow' },
  { id: 2, name: 'Direction bloquée', text: "L'engin ne peut plus tourner. Réparation : une action et un jet de Dextérité (outils) DD 12.", effect: 'noturn' },
  { id: 3, name: 'Incendie à bord', text: "L'équipage subit 1d6 dégâts de feu (jet de Dextérité DD 12 pour moitié).", effect: 'fire' },
  { id: 4, name: 'Arme enrayée', text: "Une arme au hasard est inutilisable jusqu'au début du prochain tour du pilote.", effect: 'jam' },
  { id: 5, name: 'Secousse', text: "Tout l'équipage fait un jet de Dextérité DD 12 ou tombe à terre.", effect: 'shake' },
  { id: 6, name: 'Plaque arrachée', text: 'Un pan de blindage saute : CA réduite de 1 jusqu\'à réparation.', effect: 'ac' },
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
    hp: 58, maxHp: 58, ac: 16, speed: 6, initMod: 2, dexSave: 2, init: null,
    attacks: pcAttacks(), conditions: [], hidden: false,
  };
}

const WEREBOAR_ATTACKS = () => [
  { name: 'Massue', toHit: 5, dmg: '2d6+3', type: 'contondant', range: 1.6, mag: 'none' },
  { name: 'Défenses', toHit: 5, dmg: '1d10+3', type: 'tranchant', range: 1.6, mag: 'none', note: 'Humanoïde touché : Con DD 12 ou lycanthropie.' },
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

function stations(kind) {
  // repère local : lx vers l'avant, ly vers tribord
  return [
    { id: 'helm', label: 'Poste de pilotage', lx: 0.5, ly: 0, kind: 'helm' },
    { id: 'chomper', label: 'Mâchoire broyeuse', lx: 1.35, ly: 0, kind: 'weapon', weapon: 'chomper' },
    { id: 'ball', label: 'Boulet de démolition', lx: -0.5, ly: 1.05, kind: 'weapon', weapon: 'wrecking' },
    { id: 'harpoonL', label: 'Lance-harpons bâbord', lx: -1.45, ly: -0.95, kind: 'weapon', weapon: 'harpoon' },
    { id: 'harpoonR', label: 'Lance-harpons tribord', lx: -1.45, ly: 0.95, kind: 'weapon', weapon: 'harpoon' },
  ];
}

function mkGrinder(id, name, side, extra = {}) {
  return Object.assign({
    id, name, kind: 'vehicle', side, sprite: side === 'party' ? 'grinder-party' : 'grinder-enemy',
    color: side === 'party' ? '#5CF2C8' : '#FF5A1F',
    len: 4, wid: 3, x: 0, y: 0, r: 0,
    hp: 120, maxHp: 120, ac: 19, speed: 12, conditions: [], hidden: false, init: null,
    veh: {
      dmgThreshold: 10, mishapThreshold: 20, soulCoins: side === 'party' ? 3 : 0, pilotBonus: 5,
      stations: stations(), movedTurn: 0, dashed: false, overdrive: false,
      mishaps: [], jam: null, destroyed: false,
    },
    sheet: 'Broyeur de démons — véhicule de guerre infernal — valeurs provisoires [maison]',
  }, extra);
}

function aboard(token, v, stationId) {
  const st = v.veh.stations.find((s) => s.id === stationId);
  token.aboard = { v: v.id, lx: st.lx, ly: st.ly, station: stationId };
}

function initialTokens(map) {
  const tokens = {};
  const P = map.spawn.party, E = map.spawn.enemy;

  const vp = mkGrinder('v-party', 'Broyeuse des aventuriers', 'party', { x: P.x, y: P.y, r: P.r });
  const ve = mkGrinder('v-enemy', 'Broyeuse de Raggadragga', 'enemy', { x: E.x, y: E.y, r: E.r, hidden: true });
  tokens[vp.id] = vp; tokens[ve.id] = ve;

  const crewP = ['helm', 'ball', 'harpoonL', 'harpoonR'];
  for (let i = 0; i < 4; i++) {
    const pc = mkPc(i);
    aboard(pc, vp, crewP[i]);
    tokens[pc.id] = pc;
  }

  const rag = mkWereboar('raggadragga', 'Raggadragga', {
    boss: true, color: '#E0361F', hp: 78, maxHp: 78,
    sheet: 'Raggadragga — sanglier-garou, chef des Tripes Sanglantes — FP 4 — [résumé + MM]',
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
    read: "Un engin colossal jaillit du nuage : une broyeuse de démon, cheminées crachant des flammes, tambour de dents de fer qui tourne à vide. Sur le pont, des silhouettes de sangliers et de rats hurlent à pleins poumons.",
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
    read: "Blessé, Raggadragga mord ses propres lèvres jusqu'au sang. Il écrase l'accélérateur : la broyeuse hurle, ses cheminées crachent des gerbes d'étincelles.",
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
    read: "Les lames cessent de tomber. On vous attache les poignets avec des câbles de harpon ; la broyeuse fait demi-tour dans un nuage de cendres.",
    do: [
      { t: 'music', level: 0 }, { t: 'sfx', name: 'defeat' },
      { t: 'banner', text: 'Capturés', sub: 'La route vers Mad Maggie' },
      { t: 'phase', phase: 'ended' },
    ],
  },
];

module.exports = { WEAPONS, MISHAPS, BEATS, PC_COLORS, mkPc, mkGrinder, mkWereboar, mkWererat, initialTokens, stations, aboard, pcAttacks };
