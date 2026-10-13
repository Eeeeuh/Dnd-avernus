/* Interface (DOM) : plaques d'initiative, fiche du jeton, actions, panneaux du dock, fenêtres. */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
    for (const kid of kids.flat()) { if (kid === null || kid === undefined || kid === false) continue; el.append(kid.nodeType ? kid : document.createTextNode(String(kid))); }
    return el;
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const sgn = (n) => (n >= 0 ? '+' : '−') + Math.abs(n);

  const UI = { h, esc, tab: 'combat', dockOpen: true, logCount: 0, lastDiceTotal: null, rollMode: 'none', secret: false };
  window.UI = UI;

  /* ---------- petits éléments ---------- */
  UI.toast = function (msg, kind = '') {
    const t = h('div', { class: 'toast ' + kind, text: msg });
    $('#toasts').append(t);
    while ($('#toasts').children.length > 4) $('#toasts').firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 350); }, kind === 'err' ? 3800 : 2800);
  };
  let bannerT;
  UI.banner = function (title, sub, cls = '', ms = 2300) {
    const b = $('#banner');
    clearTimeout(bannerT);
    b.className = '';
    void b.offsetWidth;
    $('.banner-title', b).textContent = title;
    $('.banner-sub', b).textContent = sub || '';
    b.className = 'show ' + cls;
    bannerT = setTimeout(() => { b.className = ''; }, ms);
  };
  let speechT;
  UI.speech = function (who, text, ms = 6000) {
    const s = $('#speech');
    $('.speech-who', s).textContent = who; $('.speech-text', s).textContent = '« ' + text + ' »';
    s.classList.add('show'); clearTimeout(speechT); speechT = setTimeout(() => s.classList.remove('show'), ms);
  };
  UI.flash = function (color = '#ff3a1a') {
    const f = $('#flash'); f.style.background = color; f.classList.add('on');
    requestAnimationFrame(() => requestAnimationFrame(() => f.classList.remove('on')));
  };
  UI.tip = function (el, text) {
    el.addEventListener('mouseenter', (e) => { const t = $('#tooltip'); t.textContent = text; t.classList.remove('hidden'); const r = el.getBoundingClientRect(); t.style.left = Math.min(innerWidth - 250, r.left) + 'px'; t.style.top = Math.max(4, r.top - 40) + 'px'; });
    el.addEventListener('mouseleave', () => $('#tooltip').classList.add('hidden'));
  };
  UI.openModal = function (node) { const m = $('#modal'); m.replaceChildren(node); $('#modal-back').classList.remove('hidden'); const f = m.querySelector('input,button,select'); if (f) setTimeout(() => f.focus(), 30); };
  UI.closeModal = function () { $('#modal-back').classList.add('hidden'); $('#modal').replaceChildren(); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#modal-back').classList.contains('hidden')) UI.closeModal(); });
  document.addEventListener('pointerdown', (e) => { if (e.target.id === 'modal-back') UI.closeModal(); });

  /* ---------- lobby ---------- */
  UI.lobby = async function (onJoin, isGM) {
    const lobby = $('#lobby');
    // braises
    const cv = $('#lobby-embers'), c = cv.getContext('2d');
    let W, H; const em = [];
    const size = () => { W = cv.width = innerWidth; H = cv.height = innerHeight; };
    size(); addEventListener('resize', size);
    for (let i = 0; i < 90; i++) em.push({ x: Math.random() * innerWidth, y: Math.random() * innerHeight, s: 0.6 + Math.random() * 2.2, v: 14 + Math.random() * 50, p: Math.random() * 6 });
    let raf; const loop = (t) => {
      if (lobby.classList.contains('hidden')) return;
      c.clearRect(0, 0, W, H); c.globalCompositeOperation = 'lighter';
      for (const e of em) { e.y -= e.v * 0.016; e.x += Math.sin(t / 900 + e.p) * 0.4 + 0.3; if (e.y < -8) { e.y = H + 8; e.x = Math.random() * W; } c.fillStyle = `rgba(255,${100 + e.s * 40 | 0},30,${0.25 + 0.3 * Math.sin(t / 400 + e.p)})`; c.beginPath(); c.arc(e.x, e.y, e.s, 0, 6.3); c.fill(); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const nameIn = $('#lobby-name');
    nameIn.value = localStorage.getItem('av.name') || '';
    let slot = localStorage.getItem('av.slot') || null;
    if (isGM) { $('#lobby-gm').classList.remove('hidden'); $('#lobby-pcs').classList.add('hidden'); nameIn.placeholder = 'MJ'; }
    else {
      let pcs = [];
      try { pcs = (await (await fetch('/api/lobby')).json()).pcs; } catch (e) { /* hors ligne */ }
      if (!pcs.length) pcs = [1, 2, 3, 4].map((i) => ({ slot: 'p' + i, name: 'Aventurier ' + i, color: '#5CF2C8' }));
      const box = $('#lobby-pcs'); box.replaceChildren();
      const opts = pcs.map((p) => {
        const el = h('button', { class: 'pc-opt', type: 'button', role: 'radio', 'aria-checked': 'false', style: { '--pc': p.color } },
          h('span', { class: 'pc-dot', text: p.name.charAt(0).toUpperCase() }),
          h('span', null, h('div', { class: 'pc-name', text: p.name }), h('div', { class: 'pc-sub', text: 'Rejoindre ce personnage' })));
        el.addEventListener('click', () => { slot = p.slot; opts.forEach((o) => o.setAttribute('aria-checked', String(o === el))); });
        if (slot === p.slot) el.setAttribute('aria-checked', 'true');
        return el;
      });
      const spec = h('button', { class: 'pc-opt', type: 'button', role: 'radio', 'aria-checked': slot === 'spec' ? 'true' : 'false', style: { '--pc': '#a99c84' } },
        h('span', { class: 'pc-dot', text: '👁' }), h('span', null, h('div', { class: 'pc-name', text: 'Spectateur' }), h('div', { class: 'pc-sub', text: 'Regarder sans jouer' })));
      spec.addEventListener('click', () => { slot = 'spec'; opts.concat([spec]).forEach((o) => o.setAttribute('aria-checked', String(o === spec))); });
      opts.push(spec); opts.forEach((o) => box.append(o));
    }
    $('#lobby-go').onclick = () => {
      const name = nameIn.value.trim() || (isGM ? 'MJ' : 'Joueur');
      if (!isGM && !slot) { UI.toast('Choisissez un personnage (ou Spectateur).', 'err'); return; }
      localStorage.setItem('av.name', name); if (slot) localStorage.setItem('av.slot', slot);
      cancelAnimationFrame(raf); lobby.classList.add('hidden');
      onJoin({ name, slot: slot === 'spec' ? null : slot });
    };
    nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#lobby-go').click(); });
  };

  /* ---------- plaques d'initiative ---------- */
  UI.renderTop = function () {
    const S = App.S; if (!S) return;
    const label = $('#round-label');
    const names = { setup: 'Préparation', initiative: 'Initiative', combat: 'Round ' + S.round, ended: 'Terminé' };
    label.innerHTML = `${esc(names[S.phase])}<small>${S.phase === 'combat' ? 'Combat en cours' : S.phase === 'initiative' ? 'Lancez les d20' : S.phase === 'ended' ? 'Fin de la rencontre' : 'Placez vos jetons'}</small>`;
    const ol = $('#initiative');
    const ids = S.order.slice();
    if (S.phase === 'initiative' || S.phase === 'setup') {
      // en phase d'initiative, montrer aussi ceux qui n'ont pas encore lancé
      for (const t of Object.values(S.tokens)) if (t.kind === 'creature' && t.init === null && !t.dead && S.phase === 'initiative' && !ids.includes(t.id)) ids.push(t.id);
    }
    const key = ids.join(',') + '|' + S.activeId + '|' + ids.map((id) => { const t = S.tokens[id]; return t ? [t.init, t.hp, t.hpPct, t.dead ? 1 : 0].join('.') : ''; }).join(',');
    if (UI._topKey === key) return;
    UI._topKey = key;
    ol.replaceChildren();
    for (const id of ids) {
      const t = S.tokens[id]; if (!t) continue;
      const pct = t.hp !== undefined ? t.hp / t.maxHp * 100 : (t.hpPct !== undefined ? t.hpPct : 100);
      const li = h('li', { class: `plate ${t.side} ${S.activeId === id ? 'active' : ''} ${t.dead ? 'dead' : ''} ${App.canControl(t) ? 'me' : ''} ${t.init === null ? 'pending' : ''}`, style: t.side === 'party' ? { '--pc': t.color } : {}, title: t.name, onclick: () => { App.select(id); App.focus(id); } },
        h('div', { class: 'disc', text: t.sprite === 'wereboar' ? '🐗' : t.sprite === 'wererat' ? '🐀' : t.name.charAt(0).toUpperCase() }),
        h('div', { class: 'pname', text: t.name }),
        h('div', { class: 'pinit', text: t.init === null ? '—' : String(t.init) }),
        h('div', { class: 'pbar' }, h('i', { style: { width: Math.max(0, Math.min(100, pct)) + '%' } })));
      ol.append(li);
    }
    // plaque active visible
    const act = ol.querySelector('.active'); if (act && act.scrollIntoView) act.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  };

  /* ---------- fiche du jeton sélectionné ---------- */
  UI.renderCard = function () {
    const S = App.S, card = $('#card');
    const t = App.sel && S.tokens[App.sel];
    if (!t) { card.replaceChildren(); card.className = ''; return; }
    card.className = t.side === 'enemy' ? 'enemy' : '';
    const gmView = t.hp !== undefined;
    const pct = gmView ? t.hp / t.maxHp * 100 : (t.hpPct !== undefined ? t.hpPct : 100);
    const kids = [
      h('div', { class: 'card-h' }, h('div', { class: 'card-n', text: t.name }), h('div', { class: 'card-k', text: t.kind === 'vehicle' ? 'Véhicule de guerre' : (t.side === 'enemy' ? 'Ennemi' : 'Personnage') })),
    ];
    const stats = h('div', { class: 'statrow' });
    if (gmView) stats.append(h('span', { class: 'stat' }, h('b', { text: `${t.hp}/${t.maxHp}` }), 'PV'));
    else stats.append(h('span', { class: 'stat' }, h('b', { text: Math.round(pct) + '%' }), t.bloodied ? 'Ensanglanté' : 'en forme'));
    if (t.ac !== undefined) stats.append(h('span', { class: 'stat' }, h('b', { text: String(t.ac) }), 'CA'));
    if (t.kind === 'creature' && t.speed !== undefined) {
      const left = Math.max(0, t.speed - (t.turn ? t.turn.moved : 0));
      stats.append(h('span', { class: 'stat' }, h('b', { text: left.toFixed(left % 1 ? 1 : 0) }), 'cases'));
    }
    if (t.kind === 'vehicle') {
      const b = App.vehicleBudget(t), left = Math.max(0, b - t.veh.movedTurn);
      stats.append(h('span', { class: 'stat' }, h('b', { text: left.toFixed(1).replace('.0', '') + '/' + b }), 'cases'));
      if (t.veh.soulCoins !== undefined) stats.append(h('span', { class: 'stat soul' }, h('b', { text: String(t.veh.soulCoins) }), "pièces d'âme"));
    }
    kids.push(stats);
    kids.push(h('div', { class: 'hpbar ' + (pct < 25 ? 'crit' : pct < 50 ? 'low' : '') }, h('i', { style: { width: Math.max(0, pct) + '%' } })));
    if (t.kind === 'creature' && t.turn && S.phase === 'combat' && S.activeId === t.id) {
      kids.push(h('div', { class: 'chips' },
        h('span', { class: 'chip' + (t.turn.action ? ' bad' : '') }, t.turn.action ? 'Action utilisée' : 'Action'),
        h('span', { class: 'chip' + (t.turn.bonus ? ' bad' : '') }, t.turn.bonus ? 'Bonus utilisée' : 'Bonus'),
        h('span', { class: 'chip' + (t.turn.reaction ? ' bad' : '') }, t.turn.reaction ? 'Réaction utilisée' : 'Réaction'),
        h('span', { class: 'chip' }, `Attaques ${t.turn.attacks >= 99 ? 'épuisées' : t.turn.attacks + '/' + (t.apa || 2)}`)));
    }
    const chips = [];
    for (const c of t.conditions || []) chips.push(h('span', { class: 'chip bad', text: c }));
    if (t.kind === 'vehicle') {
      for (const m of t.veh.mishaps || []) chips.push(h('span', { class: 'chip bad', text: m.name }));
      if (t.veh.jam) { const st = t.veh.stations.find((x) => x.id === t.veh.jam.station); chips.push(h('span', { class: 'chip bad', text: 'Enrayé : ' + (st ? st.label : '') })); }
      if (t.veh.destroyed) chips.push(h('span', { class: 'chip bad', text: 'Épave' }));
      if (t.veh.dashed) chips.push(h('span', { class: 'chip', text: 'Pleins gaz' }));
      if (t.veh.overdrive) chips.push(h('span', { class: 'chip', text: 'Surrégime' }));
    }
    if (t.dead) chips.push(h('span', { class: 'chip bad', text: 'Mort' }));
    if (t.hidden) chips.push(h('span', { class: 'chip', text: 'Caché aux joueurs' }));
    if (chips.length) kids.push(h('div', { class: 'chips' }, chips));
    if (App.canControl(t) || App.you.role === 'gm') kids.push(h('div', { class: 'row', style: { marginTop: '8px' } }, h('button', { class: 'btn small', text: 'Fiche', onclick: () => UI.sheet(t.id) })));
    card.replaceChildren(...kids);
  };

  /* ---------- barre d'actions ---------- */
  UI.renderActions = function () {
    const S = App.S, bar = $('#actions'); if (!S) return;
    const gm = App.you.role === 'gm';
    const sel = App.sel && S.tokens[App.sel];
    const parts = [];
    const combat = S.phase === 'combat';
    const activeTok = S.activeId && S.tokens[S.activeId];

    // initiative
    if (S.phase === 'initiative') {
      const mine = Object.values(S.tokens).filter((t) => t.kind === 'creature' && App.canControl(t) && t.init === null && (gm ? t.side === 'party' : true));
      if (mine.length) parts.push(h('div', { class: 'act-group' }, mine.map((t) => h('button', { class: 'btn primary', text: `Initiative · ${t.name}`, onclick: () => App.act({ a: 'initRoll', id: t.id }) }))));
    }

    // actions du jeton sélectionné
    if (sel && !sel.dead) {
      const actor = sel.kind === 'creature' ? sel : App.pilotOf(sel);
      const canSel = App.canControl(sel);
      const myTurn = !combat || gm || (actor && S.activeId === actor.id);
      const why = !canSel ? 'Ce jeton ne vous appartient pas' : (!myTurn ? "Ce n'est pas votre tour" : '');
      const mk = (label, fn, o = {}) => h('button', { class: 'btn ' + (o.cls || ''), text: label, disabled: o.disabled || undefined, title: o.title || '', onclick: fn });

      if (sel.kind === 'creature' && canSel) {
        const weps = [];
        (sel.attacks || []).forEach((w, i) => weps.push({ label: w.name, sub: `${sgn(w.toHit)} · ${w.dmg}`, spec: { src: 'token', idx: i }, w }));
        const veh = App.vehicleOf(sel);
        if (veh && sel.aboard.station) {
          const st = veh.veh.stations.find((x) => x.id === sel.aboard.station);
          if (st && st.kind === 'weapon') {
            const w = App.weapons[st.weapon] || {};
            const jam = veh.veh.jam && veh.veh.jam.station === st.id;
            weps.unshift({ label: st.label, sub: `${sgn(w.toHit || 0)} · ${w.dmg || '?'}`, spec: { src: 'station' }, w, jam, station: true });
          }
        }
        if (weps.length) parts.push(h('div', { class: 'act-group' }, h('div', { class: 'act-label', text: 'Attaquer' }),
          weps.map((x) => h('button', { class: 'btn' + (x.station ? ' primary' : ''), disabled: (why || x.jam) ? true : undefined, title: why || (x.jam ? 'Arme enrayée' : ''), onclick: () => App.startAttack(sel, x) },
            x.label, h('span', { class: 'muted', style: { fontSize: '12px', fontFamily: 'var(--font-b)' }, text: x.sub })))));
        // réaction
        if (combat) parts.push(h('div', { class: 'act-group' }, h('button', { class: 'btn' + (App.reaction ? ' on' : ''), text: 'Attaque de réaction', title: 'Attaquer hors de votre tour (utilise votre réaction)', onclick: () => { App.reaction = !App.reaction; UI.renderActions(); } })));
      }

      // pilotage
      const veh = sel.kind === 'vehicle' ? sel : (sel.aboard && sel.aboard.station === 'helm' ? App.vehicleOf(sel) : null);
      if (veh && !veh.veh.destroyed && (App.canControl(veh) || gm)) {
        const pil = App.pilotOf(veh);
        const dis = combat && !gm && !(pil && S.activeId === pil.id);
        const dt = dis ? "Ce n'est pas le tour du pilote" : '';
        const pAct = pil && pil.turn ? pil.turn.action : false, pBon = pil && pil.turn ? pil.turn.bonus : false;
        parts.push(h('div', { class: 'act-group' }, h('div', { class: 'act-label', text: 'Pilotage — ' + veh.name }),
          mk('Pleins gaz', () => App.act({ a: 'dash', id: veh.id }), { disabled: dis || veh.veh.dashed || (combat && pAct && !gm), title: dt || 'Action : vitesse doublée' }),
          mk(`Surrégime (${veh.veh.soulCoins !== undefined ? veh.veh.soulCoins : '?'})`, () => App.act({ a: 'overdrive', id: veh.id }), { disabled: dis || veh.veh.overdrive || (combat && pBon && !gm), title: dt || "Action bonus : brûle une pièce d'âme, +6 cases" }),
          mk('Éperonner', () => App.startRam(veh), { cls: 'primary', disabled: dis, title: dt || 'Percuter un véhicule ou une créature au contact (3 cases d’élan minimum)' }),
          (veh.veh.mishaps || []).some((m) => m.effect === 'noturn' || m.effect === 'ac') ? mk('Réparer', () => App.act({ a: 'repair', id: veh.id, who: (App.myCrew(veh)[0] || {}).id }), { title: 'Jet de Dextérité (outils) DD 12' }) : null));
      }
      // treuil
      if (sel.kind === 'creature' && sel.aboard) {
        const myTethers = S.tethers.filter((t) => t.from === sel.aboard.v);
        if (myTethers.length && (canSel || gm)) parts.push(h('div', { class: 'act-group' }, h('div', { class: 'act-label', text: 'Câbles de harpon' }),
          myTethers.map((t) => mk('Treuil → ' + ((S.tokens[t.to] || {}).name || '?'), () => App.act({ a: 'reel', id: sel.id, tether: t.id }), { disabled: !!why && !gm, title: why || 'Action : tire la cible de 2 cases' }))));
      }
      if (sel.kind === 'creature' && (canSel || gm) && S.tethers.length) {
        const nearby = S.tethers.filter((t) => { const a = S.tokens[t.from], b = S.tokens[t.to]; return a && b && App.distToSeg(sel, a, b) < 4; });
        if (nearby.length) parts.push(h('div', { class: 'act-group' }, h('div', { class: 'act-label', text: 'Trancher un câble' }),
          nearby.map((t) => mk('Couper le câble', () => App.startAttack(sel, { label: 'Trancher le câble', sub: '', spec: (sel.attacks && sel.attacks[0]) ? { src: 'token', idx: 0 } : null, w: (sel.attacks || [])[0] }, 'tether:' + t.id), { disabled: !!why && !gm, title: why || 'Attaque contre le câble (CA 14)' }))));
      }
    }

    // fin de tour
    if (combat && activeTok && (App.canControl(activeTok) || gm)) {
      parts.push(h('div', { class: 'act-group' },
        h('button', { class: 'btn primary', text: gm && App.you.role === 'gm' && !App.canControl(activeTok) ? `Passer le tour de ${activeTok.name}` : 'Fin du tour', onclick: () => App.act({ a: 'endTurn' }) }),
        gm && activeTok.side === 'enemy' ? h('button', { class: 'btn', text: 'Tour auto', title: 'Joue le tour de ce monstre (suggestion)', onclick: () => App.act({ a: 'gmAuto' }) }) : null));
    }
    bar.replaceChildren(...parts);
  };

  UI.renderAttackBar = function () {
    const bar = $('#attackbar'), m = App.mode;
    if (!m) { bar.classList.add('hidden'); bar.replaceChildren(); return; }
    bar.classList.remove('hidden');
    const seg = (key, opts) => h('div', { class: 'seg' }, opts.map(([v, l]) => h('button', { type: 'button', 'aria-pressed': String(m[key] === v), text: l, onclick: () => { m[key] = v; UI.renderAttackBar(); } })));
    const kids = [h('div', { class: 'what', text: m.type === 'ram' ? `Éperonner — cliquez une cible` : `${m.label} — cliquez une cible` })];
    if (m.type === 'attack') {
      kids.push(seg('adv', [['dis', 'Désavantage'], ['none', 'Normal'], ['adv', 'Avantage']]));
      kids.push(seg('mag', [['none', 'Non magique'], ['magic', 'Magique'], ['silver', 'Argent']]));
    }
    kids.push(h('button', { class: 'btn danger', text: 'Annuler', onclick: () => App.cancelMode() }));
    bar.replaceChildren(...kids);
  };

  /* ---------- dock : onglets ---------- */
  UI.tabsFor = function () {
    const t = [['combat', 'Combat'], ['log', 'Journal'], ['dice', 'Dés']];
    if (App.you.role === 'gm') t.push(['gm', 'MJ']);
    t.push(['rules', 'Règles']);
    return t;
  };
  UI.setTab = function (id) { UI.tab = id; UI.renderDock(true); };
  UI.renderDock = function (force) {
    const S = App.S; if (!S) return;
    const tabs = $('#tabs');
    if (force || tabs.childElementCount !== UI.tabsFor().length) {
      tabs.replaceChildren(...UI.tabsFor().map(([id, l]) => h('button', { class: 'tab', role: 'tab', 'aria-selected': String(UI.tab === id), text: l, onclick: () => UI.setTab(id) })));
    } else [...tabs.children].forEach((b, i) => b.setAttribute('aria-selected', String(UI.tabsFor()[i][0] === UI.tab)));
    const panels = $('#panels');
    const sig = UI.tab + '|' + S.rev + '|' + (UI.tab === 'log' ? S.log.length : '');
    if (!force && UI._dockSig === sig) return;
    // le journal ne se redessine que s'il a changé ; les champs en cours de saisie ne sont pas écrasés
    const focused = document.activeElement && panels.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (focused && UI.tab !== 'log' && !force) return;
    UI._dockSig = sig;
    const fn = { combat: UI.panelCombat, log: UI.panelLog, dice: UI.panelDice, gm: UI.panelGM, rules: UI.panelRules }[UI.tab];
    if (UI.tab === 'log') {
      if (!panels.querySelector('.log') || force) { panels.replaceChildren(fn()); }
      else UI.updateLog();
    } else panels.replaceChildren(fn());
  };

  /* --- Combat --- */
  UI.panelCombat = function () {
    const S = App.S, gm = App.you.role === 'gm';
    const p = h('div', { class: 'panel' });
    if (gm) {
      p.append(h('h3', { text: 'Déroulement' }));
      const row = h('div', { class: 'row' });
      if (S.phase === 'setup') row.append(h('button', { class: 'btn primary', text: "Lancer l'initiative", onclick: () => App.act({ a: 'gmStartInitiative' }) }));
      if (S.phase === 'initiative') row.append(
        h('button', { class: 'btn', text: 'Jets des ennemis', onclick: () => App.act({ a: 'gmInitAll', side: 'enemy' }) }),
        h('button', { class: 'btn', text: 'Tout lancer', onclick: () => App.act({ a: 'gmInitAll', side: 'all' }) }),
        h('button', { class: 'btn primary', text: 'Commencer le combat', onclick: () => App.act({ a: 'gmStartCombat' }) }),
        h('button', { class: 'btn small', text: 'Retour préparation', onclick: () => App.act({ a: 'gmPhase', phase: 'setup' }) }));
      if (S.phase === 'combat') row.append(
        h('button', { class: 'btn', text: '‹ Tour précédent', onclick: () => App.act({ a: 'gmPrevTurn' }) }),
        h('button', { class: 'btn primary', text: 'Tour suivant ›', onclick: () => App.act({ a: 'gmNext' }) }),
        h('button', { class: 'btn danger small', text: 'Terminer', onclick: () => App.act({ a: 'gmPhase', phase: 'ended' }) }));
      if (S.phase === 'ended') row.append(h('button', { class: 'btn', text: 'Revenir à la préparation', onclick: () => App.act({ a: 'gmPhase', phase: 'setup' }) }));
      p.append(row);
    } else {
      p.append(h('h3', { text: 'Situation' }), h('p', { text: S.phase === 'combat' ? `Round ${S.round}. Au tour de ${(S.tokens[S.activeId] || {}).name || '?'}.` : S.phase === 'initiative' ? "Lancez votre initiative dans la barre du bas." : S.phase === 'ended' ? 'La rencontre est terminée.' : "Le MJ prépare la rencontre. Vous pouvez déjà placer vos jetons." }));
    }
    p.append(h('h3', { text: 'Initiative' }));
    const list = S.order.map((id) => S.tokens[id]).filter(Boolean);
    if (!list.length) p.append(h('p', { class: 'muted', text: S.phase === 'setup' ? "L'ordre apparaîtra après les jets d'initiative." : 'En attente des jets…' }));
    for (const t of list) {
      const pct = t.hp !== undefined ? t.hp / t.maxHp * 100 : (t.hpPct !== undefined ? t.hpPct : 100);
      p.append(h('div', { class: 'trow ' + t.side, style: S.activeId === t.id ? { background: 'rgba(255,90,31,.12)', borderColor: 'var(--ember)' } : {} },
        h('div', null, h('div', { class: 'tname', text: `${S.activeId === t.id ? '▶ ' : ''}${t.name}`, onclick: () => { App.select(t.id); App.focus(t.id); } }),
          h('div', { class: 'hpbar ' + (pct < 25 ? 'crit' : pct < 50 ? 'low' : '') }, h('i', { style: { width: pct + '%' } }))),
        gm ? h('input', { class: 'inp num', type: 'number', value: t.init, 'aria-label': 'Initiative de ' + t.name, onchange: (e) => App.act({ a: 'initSet', id: t.id, value: e.target.value }) }) : h('b', { text: String(t.init), style: { fontFamily: 'var(--font-d)', fontSize: '24px', color: 'var(--ember-2)' } })));
    }
    if (S.phase === 'initiative') {
      const pending = Object.values(S.tokens).filter((t) => t.kind === 'creature' && t.init === null && !t.dead);
      if (pending.length) { p.append(h('h3', { text: 'En attente du jet' })); pending.forEach((t) => p.append(h('div', { class: 'trow ' + t.side }, h('div', { class: 'tname', text: t.name }), gm ? h('button', { class: 'btn small', text: 'Lancer', onclick: () => App.act({ a: 'initRoll', id: t.id }) }) : null))); }
    }
    return p;
  };

  /* --- Journal --- */
  UI.logEntry = function (e) {
    const el = h('div', { class: 'log-e ' + (e.kind || '') });
    if (e.who && (e.kind === 'chat' || e.kind === 'roll')) el.append(h('b', { text: e.who + ' : ' }));
    el.append(document.createTextNode(e.text));
    if (e.secret) el.append(h('span', { class: 'secret', text: '(secret)' }));
    return el;
  };
  UI.panelLog = function () {
    const S = App.S;
    const wrap = h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 } });
    const list = h('div', { class: 'panel', id: 'log-scroll' }, h('div', { class: 'log' }, S.log.map(UI.logEntry)));
    const input = h('input', { type: 'text', placeholder: 'Message à la table…', maxlength: 400, 'aria-label': 'Message', onkeydown: (e) => { if (e.key === 'Enter' && e.target.value.trim()) { App.act({ a: 'chat', text: e.target.value }); e.target.value = ''; } } });
    wrap.append(list, h('div', { class: 'chatrow' }, input));
    UI.logCount = S.log.length;
    requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
    // le wrapper doit remplir le panneau
    wrap.className = 'panel-wrap'; wrap.style.flex = '1';
    return wrap;
  };
  UI.updateLog = function () {
    const S = App.S, sc = $('#log-scroll'); if (!sc) return;
    const log = sc.querySelector('.log');
    const lastId = log.lastChild ? Number(log.lastChild.dataset.id || 0) : 0;
    const stick = sc.scrollHeight - sc.scrollTop - sc.clientHeight < 60;
    log.replaceChildren(...S.log.map((e) => { const el = UI.logEntry(e); el.dataset.id = e.id; return el; }));
    if (stick) sc.scrollTop = sc.scrollHeight;
  };

  /* --- Dés --- */
  UI.panelDice = function () {
    const gm = App.you.role === 'gm';
    const p = h('div', { class: 'panel' });
    const roll = (expr) => App.act({ a: 'roll', expr, mode: UI.rollMode, secret: UI.secret, label: App.myLabel() });
    p.append(h('h3', { text: 'Jet rapide' }));
    p.append(h('div', { class: 'dice-grid' }, ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100', '2d6'].map((d) => h('button', { class: 'die', text: d, onclick: () => roll(d) }))));
    p.append(h('div', { class: 'row', style: { marginTop: '10px' } },
      h('div', { class: 'seg', role: 'group', 'aria-label': 'Avantage' }, [['dis', 'Désav.'], ['none', 'Normal'], ['adv', 'Avantage']].map(([v, l]) => h('button', { type: 'button', text: l, 'aria-pressed': String(UI.rollMode === v), onclick: (e) => { UI.rollMode = v; [...e.target.parentNode.children].forEach((b) => b.setAttribute('aria-pressed', String(b === e.target))); } })))));
    p.append(h('h3', { text: 'Formule' }));
    const inp = h('input', { class: 'inp', placeholder: 'ex. 1d20+7  ou  2d6+3', onkeydown: (e) => { if (e.key === 'Enter') { roll(e.target.value || 'd20'); } } });
    p.append(h('div', { class: 'row' }, inp, h('button', { class: 'btn primary', text: 'Lancer', onclick: () => roll(inp.value || 'd20') })));
    if (gm) p.append(h('label', { class: 'row', style: { marginTop: '8px' } }, h('input', { type: 'checkbox', checked: UI.secret || undefined, onchange: (e) => { UI.secret = e.target.checked; } }), h('span', { text: 'Jet secret (visible du MJ seulement)' })));
    p.append(h('div', { class: 'bigroll', id: 'bigroll', text: UI.lastDiceTotal === null ? '—' : String(UI.lastDiceTotal) }));
    p.append(h('p', { class: 'muted', text: 'Les résultats apparaissent aussi dans le journal, pour toute la table.' }));
    return p;
  };

  /* --- MJ --- */
  UI.panelGM = function () {
    const S = App.S;
    const p = h('div', { class: 'panel' });
    // séquence
    p.append(h('h3', { text: 'Séquence de la rencontre' }));
    for (const b of App.beats) {
      const done = S.beatsDone.includes(b.id);
      p.append(h('div', { class: 'beat' + (done ? ' done' : '') },
        h('div', { class: 'row' }, h('span', { class: 'beat-h grow', text: `${b.icon} ${b.title}` }), done ? h('span', { class: 'chip', text: 'jouée' }) : null),
        h('div', { class: 'read', text: b.read }),
        h('button', { class: 'btn' + (done ? '' : ' primary') + ' small', text: done ? 'Rejouer' : 'Déclencher', onclick: () => App.act({ a: 'gmBeat', id: b.id }) })));
    }
    // jetons
    p.append(h('h3', { text: 'Jetons' }));
    for (const t of Object.values(S.tokens)) {
      if (t.kind === 'vehicle' && !t.hp && t.hp !== 0) continue;
      const pct = t.hp / t.maxHp * 100;
      p.append(h('div', { class: 'trow ' + t.side + (t.hidden ? ' hid' : '') },
        h('div', null, h('div', { class: 'tname', text: `${t.name}${t.dead ? ' ✖' : ''}`, onclick: () => { App.select(t.id); App.focus(t.id); } }),
          h('div', { class: 'muted', text: `${t.hp}/${t.maxHp} PV · CA ${t.ac}` + (t.hidden ? ' · caché' : '') }),
          h('div', { class: 'hpbar ' + (pct < 25 ? 'crit' : pct < 50 ? 'low' : '') }, h('i', { style: { width: Math.max(0, pct) + '%' } }))),
        h('div', { class: 'row tight' },
          ...[-10, -5, -1, 1, 5].map((n) => h('button', { class: 'btn small', text: (n > 0 ? '+' : '') + n, onclick: () => App.act({ a: 'gmHp', id: t.id, n }) })),
          h('button', { class: 'btn small' + (t.hidden ? '' : ' on'), text: t.hidden ? 'Révéler' : 'Visible', title: t.hidden ? 'Montrer aux joueurs' : 'Cacher aux joueurs', onclick: () => App.act({ a: 'gmReveal', id: t.id }) }),
          h('button', { class: 'btn small', text: 'Fiche', onclick: () => UI.sheet(t.id) }),
          !t.owner ? h('button', { class: 'btn small danger', text: '✕', title: 'Supprimer', onclick: () => { if (confirm('Supprimer ' + t.name + ' ?')) App.act({ a: 'gmRemove', id: t.id }); } }) : null)));
    }
    p.append(h('h3', { text: 'Ajouter' }));
    p.append(h('div', { class: 'row' }, [['wereboar', 'Sanglier-garou'], ['wererat', 'Rat-garou'], ['grinder-enemy', 'Broyeuse ennemie'], ['grinder-party', 'Broyeuse alliée'], ['pc', 'PNJ allié']].map(([k, l]) => h('button', { class: 'btn small', text: l, onclick: () => App.act({ a: 'gmAdd', template: k, x: App.cam.x, y: App.cam.y }) }))));
    // câbles
    if (S.tethers.length) { p.append(h('h3', { text: 'Câbles' }), h('button', { class: 'btn small danger', text: 'Retirer tous les câbles', onclick: () => App.act({ a: 'gmClearTethers' }) })); }
    // ambiance
    p.append(h('h3', { text: 'Ambiance' }));
    p.append(h('div', { class: 'row' }, h('span', { class: 'muted', text: 'Musique' }), h('div', { class: 'seg' }, [[0, 'Calme'], [1, 'Tension'], [2, 'Combat'], [3, 'Furie']].map(([v, l]) => h('button', { type: 'button', text: l, 'aria-pressed': String(S.music === v), onclick: () => App.act({ a: 'gmMusic', level: v }) })))));
    p.append(h('div', { class: 'row', style: { marginTop: '6px' } }, [['explosion', 'Explosion'], ['roar', 'Rugissement'], ['horn', 'Cor'], ['siren', 'Alarme']].map(([k, l]) => h('button', { class: 'btn small', text: l, onclick: () => App.act({ a: 'gmFx', name: k, x: App.cam.x, y: App.cam.y }) }))));
    // carte
    p.append(h('h3', { text: 'Carte' }));
    p.append(h('div', { class: 'row' },
      h('button', { class: 'btn small', text: 'Importer ma carte…', onclick: () => UI.mapDialog() }),
      h('button', { class: 'btn small', text: 'Carte d’Averne', onclick: () => App.act({ a: 'gmMap', kind: 'procedural', seed: 66666 }) }),
      h('button', { class: 'btn small', text: 'Nouvelle graine', onclick: () => App.act({ a: 'gmMap', kind: 'procedural', seed: Math.floor(Math.random() * 1e6) }) }),
      h('label', { class: 'row tight' }, h('input', { type: 'checkbox', checked: S.map.grid || undefined, onchange: (e) => App.act({ a: 'gmGrid', grid: e.target.checked }) }), h('span', { text: 'Grille' }))));
    p.append(h('h3', { text: 'Notes' }));
    const ta = h('textarea', { class: 'inp', rows: 5, style: { width: '100%', resize: 'vertical' }, placeholder: 'Notes privées du MJ…', onchange: (e) => App.act({ a: 'gmNotes', text: e.target.value }) });
    ta.value = S.gmNotes || ''; p.append(ta);
    p.append(h('h3', { text: 'Partie' }), h('button', { class: 'btn small danger', text: 'Réinitialiser la rencontre', onclick: () => { if (confirm('Tout remettre à zéro (jetons, PV, initiative) ?')) App.act({ a: 'gmReset' }); } }));
    return p;
  };

  /* --- Règles --- */
  UI.panelRules = function () {
    const p = h('div', { class: 'panel' });
    const gm = App.you.role === 'gm';
    p.append(h('h3', { text: 'Commandes' }));
    p.append(h('table', { class: 'rules', html: `
      <tr><td>Déplacer</td><td>Faites glisser votre jeton (ou le véhicule si vous pilotez).</td></tr>
      <tr><td>Rotation</td><td>Poignée devant le véhicule, ou touches <b>Q</b> / <b>E</b>.</td></tr>
      <tr><td>Caméra</td><td>Molette pour zoomer, glisser le fond pour déplacer. Pincer sur mobile.</td></tr>
      <tr><td>Règle</td><td>Touche <b>M</b>, puis glisser pour mesurer.</td></tr>
      <tr><td>Recentrer</td><td>Touche <b>F</b> ou bouton ⌖.</td></tr>` }));
    p.append(h('h3', { text: 'Le tour' }));
    p.append(h('p', { text: "Tout se joue dans l'ordre d'initiative. Le véhicule roule pendant le tour de son pilote ; chaque équipier attaque pendant son propre tour depuis son poste." }));
    p.append(h('h3', { text: 'Conduite des machines infernales' }));
    p.append(h('table', { class: 'rules', html: `
      <tr><td>Roulage</td><td>Le pilote déplace l'engin jusqu'à sa vitesse. Il avance ou recule (coût ×2), jamais en crabe. Chaque 45° de virage coûte 1 case (au prorata).</td></tr>
      <tr><td>Pleins gaz</td><td>Action du pilote : vitesse doublée ce tour.</td></tr>
      <tr><td>Surrégime</td><td>Action bonus : une pièce d'âme dans le moteur, +6 cases.</td></tr>
      <tr><td>Éperonner</td><td>Il faut avoir roulé au moins 3 cases ce tour. Contre un véhicule : jet du pilote contre la CA, 3d10 contondants, l'éperon encaisse la moitié. Contre une créature : Dex DD 15 (demi-dégâts, sinon renversée).</td></tr>
      <tr><td>Seuil de dégâts</td><td>Un coup inférieur au seuil de l'engin ricoche sans effet.</td></tr>
      <tr><td>Avarie</td><td>Un coup égal ou supérieur au seuil d'avarie déclenche un jet sur la table d'avaries (moteur noyé, direction bloquée, incendie, arme enrayée, secousse, plaque arrachée).</td></tr>
      <tr><td>Harpon</td><td>Un harpon qui touche un véhicule le relie par un câble : on ne peut plus s'éloigner au-delà de sa longueur. Treuil : tire la cible de 2 cases. Trancher : attaque contre le câble (CA 14, 12 PV).</td></tr>
      <tr><td>Équipage</td><td>Les créatures à bord suivent l'engin. Pour changer de poste ou sauter sur un autre véhicule, déposez le jeton à l'endroit voulu.</td></tr>` }));
    if (gm) {
      p.append(h('h3', { html: 'Valeurs à vérifier <span class="badge-prov">provisoire</span>' }));
      p.append(h('p', { class: 'muted', text: "Les statistiques des lycanthropes viennent du Manuel des Monstres (de mémoire). Les armes du véhicule, le seuil de dégâts (10), le seuil d'avarie (20), les dégâts d'éperonnage et la table d'avaries sont des valeurs maison, modifiables depuis la fiche de chaque jeton (bouton Fiche). Comparez avec le livre et corrigez-les." }));
    }
    return p;
  };

  /* ---------- fiche : édition d'un jeton ---------- */
  UI.sheet = function (id) {
    const S = App.S, t = S.tokens[id]; if (!t) return;
    const gm = App.you.role === 'gm';
    const known = t.hp !== undefined;
    const f = {};
    const field = (key, label, type = 'text', cls = '') => { const i = h('input', { class: 'inp', type, value: t[key] !== undefined ? t[key] : '', step: type === 'number' ? 'any' : undefined }); f[key] = i; return h('label', { class: cls }, label, i); };
    const form = h('div', { class: 'form' },
      field('name', 'Nom', 'text', 'w2'), ...(known ? [field('hp', 'PV', 'number'), field('maxHp', 'PV max', 'number'), field('ac', 'CA', 'number')] : []),
      ...(t.kind === 'creature' && known ? [field('speed', 'Vitesse (cases)', 'number'), field('initMod', 'Mod. initiative', 'number'), field('dexSave', 'Dex / jets', 'number'), field('apa', 'Attaques / action', 'number')] : []));
    const body = [h('h2', { text: t.name }), form];
    let wl = null;
    const atk = (t.attacks || []).map((w) => Object.assign({}, w));
    if (t.kind === 'creature' && known) {
      body.push(h('h3', { text: 'Attaques', style: { fontFamily: 'var(--font-d)', fontSize: '22px', color: 'var(--ember-2)', margin: '14px 0 4px', fontWeight: 500 } }));
      wl = h('div', { class: 'wlist' });
      const draw = () => {
        wl.replaceChildren(h('div', { class: 'wrow muted', style: { fontSize: '11px' } }, 'Nom', 'Touche', 'Dégâts', 'Type', 'Portée', 'Magie', ''));
        atk.forEach((w, i) => {
          const mk = (k, type = 'text') => h('input', { class: 'inp', type, value: w[k] === undefined ? '' : w[k], step: type === 'number' ? 'any' : undefined, onchange: (e) => { w[k] = type === 'number' ? Number(e.target.value) : e.target.value; } });
          wl.append(h('div', { class: 'wrow' }, mk('name'), mk('toHit', 'number'), mk('dmg'), mk('type'), mk('range', 'number'),
            h('select', { class: 'inp', onchange: (e) => { w.mag = e.target.value; } }, ...[['none', 'Non'], ['magic', 'Magique'], ['silver', 'Argent']].map(([v, l]) => h('option', { value: v, text: l, selected: (w.mag || 'none') === v || undefined }))),
            h('button', { class: 'btn small danger', type: 'button', text: '✕', onclick: () => { atk.splice(i, 1); draw(); } })));
        });
        wl.append(h('button', { class: 'btn small', type: 'button', text: '+ Attaque', onclick: () => { atk.push({ name: 'Nouvelle attaque', toHit: 5, dmg: '1d8+3', type: 'tranchant', range: 1.6, mag: 'none' }); draw(); } }));
      };
      draw(); body.push(wl);
      body.push(h('p', { class: 'muted', text: 'Types physiques : contondant, perforant, tranchant (bloqués par l’immunité aux armes non magiques). Portée en cases de 1,5 m.' }));
    }
    // extras MJ
    const extra = {};
    if (gm) {
      const chk = (key, label) => { const c = h('input', { type: 'checkbox', checked: t[key] || undefined }); extra[key] = c; return h('label', { class: 'row tight' }, c, h('span', { text: label })); };
      const gmRow = h('div', { class: 'row', style: { marginTop: '10px', gap: '14px' } }, chk('hidden', 'Caché aux joueurs'), t.kind === 'creature' ? chk('immuneNonMagical', 'Immunisé aux armes non magiques') : null, t.kind === 'creature' ? chk('relentless', 'Acharnement') : null);
      body.push(gmRow);
      if (t.kind === 'vehicle' && t.veh) {
        const vi = {};
        const vf = (k, l) => { const i = h('input', { class: 'inp', type: 'number', value: t.veh[k] }); vi[k] = i; return h('label', null, l, i); };
        body.push(h('div', { class: 'form', style: { marginTop: '12px' } }, vf('dmgThreshold', 'Seuil de dégâts'), vf('mishapThreshold', "Seuil d'avarie"), vf('soulCoins', "Pièces d'âme"), vf('pilotBonus', 'Bonus du pilote')));
        extra._veh = vi;
        body.push(h('p', { class: 'muted', text: 'Vitesse, taille et équipage : modifiez la vitesse ci-dessus ; déposez un jeton sur un siège pour l\'y installer.' }));
      }
      if (t.kind === 'creature') {
        const cw = h('div', { class: 'chips', style: { marginTop: '10px' } });
        const drawc = () => { cw.replaceChildren(...S.conditions.map((c) => h('button', { type: 'button', class: 'btn small' + (t.conditions.includes(c) ? ' on' : ''), text: c, onclick: () => { App.act({ a: 'gmCondition', id: t.id, cond: c }); t.conditions = t.conditions.includes(c) ? t.conditions.filter((x) => x !== c) : t.conditions.concat(c); drawc(); } }))); };
        drawc(); body.push(h('h3', { text: 'Conditions', style: { fontFamily: 'var(--font-d)', fontSize: '22px', color: 'var(--ember-2)', margin: '14px 0 4px', fontWeight: 500 } }), cw);
      }
    } else if (t.kind === 'creature' && App.canControl(t)) {
      const cw = h('div', { class: 'chips', style: { marginTop: '10px' } });
      const drawc = () => { cw.replaceChildren(...S.conditions.map((c) => h('button', { type: 'button', class: 'btn small' + (t.conditions.includes(c) ? ' on' : ''), text: c, onclick: () => { App.act({ a: 'condition', id: t.id, cond: c }); t.conditions = t.conditions.includes(c) ? t.conditions.filter((x) => x !== c) : t.conditions.concat(c); drawc(); } }))); };
      drawc(); body.push(h('h3', { text: 'Conditions', style: { fontFamily: 'var(--font-d)', fontSize: '22px', color: 'var(--ember-2)', margin: '14px 0 4px', fontWeight: 500 } }), cw);
    }
    body.push(h('div', { class: 'modal-foot' },
      h('button', { class: 'btn', text: 'Fermer', onclick: UI.closeModal }),
      known ? h('button', { class: 'btn primary', text: 'Enregistrer', onclick: async () => {
        const patch = {};
        for (const [k, el] of Object.entries(f)) patch[k] = el.type === 'number' ? Number(el.value) : el.value;
        if (wl) patch.attacks = atk;
        for (const [k, el] of Object.entries(extra)) if (k !== '_veh') patch[k] = el.checked;
        if (extra._veh) patch.veh = Object.fromEntries(Object.entries(extra._veh).map(([k, el]) => [k, Number(el.value)]));
        const r = await App.act({ a: 'sheet', id: t.id, patch });
        if (r && r.ok) { UI.closeModal(); UI.toast('Fiche enregistrée', 'ok'); }
      } }) : null));
    UI.openModal(h('div', null, ...body));
  };

  /* ---------- carte importée ---------- */
  UI.mapDialog = function () {
    const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', class: 'inp' });
    const px = h('input', { class: 'inp', type: 'number', value: '70', min: '10', max: '400' });
    const status = h('p', { class: 'muted', text: "PNG, JPEG ou WebP, 40 Mo max. Indiquez combien de pixels fait une case de la grille dans votre image." });
    UI.openModal(h('div', null, h('h2', { text: 'Importer une carte' }), status,
      h('div', { class: 'form', style: { gridTemplateColumns: '2fr 1fr' } }, h('label', null, 'Image', file), h('label', null, 'Pixels par case', px)),
      h('div', { class: 'modal-foot' }, h('button', { class: 'btn', text: 'Annuler', onclick: UI.closeModal }),
        h('button', { class: 'btn primary', text: 'Utiliser cette carte', onclick: async () => {
          const f = file.files[0]; if (!f) { status.textContent = "Choisissez d'abord une image."; return; }
          status.textContent = 'Envoi en cours…';
          try {
            const r = await fetch('/upload-map?cid=' + encodeURIComponent(App.cid), { method: 'POST', headers: { 'Content-Type': f.type }, body: f });
            const j = await r.json();
            if (!j.ok) { status.textContent = j.err; return; }
            const im = new Image();
            im.onload = async () => {
              const cell = Math.max(10, Number(px.value) || 70);
              const res = await App.act({ a: 'gmMap', kind: 'image', url: j.url, cols: Math.round(im.naturalWidth / cell), rows: Math.round(im.naturalHeight / cell) });
              if (res.ok) UI.closeModal();
            };
            im.src = j.url;
          } catch (e) { status.textContent = "Échec de l'envoi."; }
        } }))));
  };

  /* ---------- réglages & aide ---------- */
  UI.settings = function () {
    const st = App.settings;
    const slider = (key, label) => { const i = h('input', { type: 'range', min: 0, max: 1, step: 0.01, value: AvAudio.vol[key], 'aria-label': label, style: { width: '100%' }, oninput: (e) => { AvAudio.setVol(key, Number(e.target.value)); st['vol_' + key] = Number(e.target.value); App.saveSettings(); } }); return h('label', { class: 'form', style: { gridTemplateColumns: '120px 1fr', alignItems: 'center', marginBottom: '8px' } }, h('span', { text: label }), i); };
    const chk = (key, label) => h('label', { class: 'row tight', style: { marginBottom: '8px' } }, h('input', { type: 'checkbox', checked: st[key] || undefined, onchange: (e) => { st[key] = e.target.checked; App.saveSettings(); App.applySettings(); } }), h('span', { text: label }));
    UI.openModal(h('div', null, h('h2', { text: 'Réglages' }),
      slider('master', 'Volume général'), slider('music', 'Musique'), slider('sfx', 'Effets'), slider('amb', 'Ambiance'),
      chk('reduced', 'Réduire les animations (moins de secousses)'), chk('noCinema', 'Ne pas suivre les caméras cinématiques'), chk('showNames', 'Toujours afficher les noms'),
      h('div', { class: 'modal-foot' }, h('button', { class: 'btn', text: 'Tester un son', onclick: () => AvAudio.play('metal') }), h('button', { class: 'btn primary', text: 'Fermer', onclick: UI.closeModal }))));
  };
  UI.help = function () {
    UI.openModal(h('div', null, h('h2', { text: 'Comment jouer' }),
      h('p', { text: "Cliquez un jeton pour le sélectionner : ses actions apparaissent en bas. Glissez-le pour le déplacer." }),
      h('p', { text: "Pour attaquer, choisissez une arme dans la barre du bas, puis cliquez la cible : le dé est lancé par le serveur et tout le monde voit le résultat." }),
      h('p', { text: "Pilote : glissez le véhicule dans le sens de la marche. Le coût s'affiche. Q et E font tourner l'engin de 15°, Maj pour garder le cap." }),
      h('p', { text: "Autres raccourcis : F recentre, M mesure, Échap annule, Espace passe au tour suivant (si c'est vous)." }),
      h('div', { class: 'modal-foot' }, h('button', { class: 'btn primary', text: 'Compris', onclick: UI.closeModal }))));
  };

  /* ---------- suggestions pour le MJ ---------- */
  UI.suggest = function (beat, msg) {
    if (App.you.role !== 'gm') return;
    const box = $('#suggest'); box.classList.remove('hidden');
    const el = h('div', { class: 'sugg' }, h('div', { text: msg }),
      h('div', { class: 'sugg-btns' }, h('button', { class: 'btn small primary', text: 'Oui', onclick: () => { App.act({ a: 'gmBeat', id: beat }); el.remove(); if (!box.children.length) box.classList.add('hidden'); } }),
        h('button', { class: 'btn small', text: 'Plus tard', onclick: () => { el.remove(); if (!box.children.length) box.classList.add('hidden'); } })));
    box.append(el);
  };

  UI.renderAll = function () {
    UI.renderTop(); UI.renderCard(); UI.renderActions(); UI.renderAttackBar(); UI.renderDock();
  };
})();
