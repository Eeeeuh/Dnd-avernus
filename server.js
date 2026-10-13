'use strict';
/* Serveur VTT « Descente en Averne » — aucune dépendance, Node 18+ suffit.
 *   node server.js            (port 3000, ou PORT=8080 node server.js)
 * Les joueurs ouvrent http://<ip>:3000 ; le MJ ouvre le lien avec sa clé, affiché au démarrage.
 * Temps réel : Server-Sent Events (serveur → clients) + POST /act (clients → serveur).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { Game } = require('./server/engine');

const PORT = parseInt(process.env.PORT || '3000', 10);
const PUB = path.join(__dirname, 'public');
const DATA = path.join(__dirname, 'data');
const UPLOADS = path.join(DATA, 'uploads');
fs.mkdirSync(UPLOADS, { recursive: true });

// clé MJ : variable d'environnement, sinon fichier persistant
let GM_KEY = process.env.GM_KEY;
const keyFile = path.join(DATA, 'gm.key');
if (!GM_KEY) {
  try { GM_KEY = fs.readFileSync(keyFile, 'utf8').trim(); } catch (e) { /* nouvelle clé */ }
  if (!GM_KEY) { GM_KEY = crypto.randomBytes(6).toString('hex'); fs.writeFileSync(keyFile, GM_KEY); }
}

const game = new Game();
const clients = new Map(); // cid -> { id, res, role, slot, name }

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};

function sse(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
function presence() {
  return [...clients.values()].map((c) => ({ id: c.id, name: c.name, role: c.role, slot: c.slot }));
}
function broadcast(fx) {
  const who = presence();
  for (const c of clients.values()) {
    try {
      sse(c.res, 'state', { state: game.viewFor(c), who });
      const mine = fx.filter((f) => c.role === 'gm' || !f.secret);
      if (mine.length) sse(c.res, 'fx', mine);
    } catch (e) { /* client mort, nettoyé sur 'close' */ }
  }
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', (d) => { n += d.length; if (n > limit) { reject(new Error('Corps trop gros')); req.destroy(); } else chunks.push(d); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function serveFile(res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Introuvable'); }
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache', 'Content-Length': st.size });
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = decodeURIComponent(url.pathname);

  if (req.method === 'GET' && p === '/events') {
    const q = url.searchParams;
    const wantsGM = q.get('gm') !== null && q.get('gm') !== '';
    if (wantsGM && q.get('gm') !== GM_KEY) { res.writeHead(403); return res.end('Clé MJ invalide'); }
    const slot = ['p1', 'p2', 'p3', 'p4'].includes(q.get('slot')) ? q.get('slot') : null;
    const c = {
      id: crypto.randomBytes(6).toString('hex'), res, role: wantsGM ? 'gm' : 'player', slot: wantsGM ? null : slot,
      name: (q.get('name') || (wantsGM ? 'MJ' : 'Joueur')).slice(0, 24),
    };
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 1500\n\n');
    clients.set(c.id, c);
    sse(res, 'hello', {
      cid: c.id, you: { role: c.role, slot: c.slot, name: c.name },
      beats: c.role === 'gm' ? require('./server/encounter').BEATS.map((b) => ({ id: b.id, title: b.title, icon: b.icon, read: b.read })) : [],
      weapons: require('./server/encounter').WEAPONS, mishaps: require('./server/encounter').MISHAPS,
    });
    broadcast([]);
    const hb = setInterval(() => { try { res.write(': hb\n\n'); } catch (e) { /* ignoré */ } }, 15000);
    req.on('close', () => { clearInterval(hb); clients.delete(c.id); broadcast([]); });
    return;
  }

  if (req.method === 'GET' && p === '/api/lobby') {
    const pcs = game.tokens().filter((t) => t.owner && /^p[1-4]$/.test(t.owner)).map((t) => ({ slot: t.owner, name: t.name, color: t.color }));
    return json(res, 200, { pcs, phase: game.s.phase, online: presence().length });
  }

  if (req.method === 'POST' && p === '/act') {
    try {
      const body = JSON.parse((await readBody(req, 200000)).toString('utf8'));
      const c = clients.get(body.cid);
      if (!c) return json(res, 401, { ok: false, err: 'Session expirée, rechargez la page.' });
      const out = game.act(c, body.a || {});
      broadcast(game.takeFx());
      return json(res, 200, out);
    } catch (e) {
      return json(res, 400, { ok: false, err: 'Requête invalide.' });
    }
  }

  if (req.method === 'POST' && p === '/upload-map') {
    const c = clients.get(url.searchParams.get('cid'));
    if (!c || c.role !== 'gm') return json(res, 403, { ok: false, err: 'Réservé au MJ.' });
    const type = String(req.headers['content-type'] || '');
    const ext = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' }[type];
    if (!ext) return json(res, 415, { ok: false, err: 'Formats acceptés : PNG, JPEG, WebP.' });
    try {
      const buf = await readBody(req, 40 * 1024 * 1024);
      const name = 'map-' + Date.now() + ext;
      fs.writeFileSync(path.join(UPLOADS, name), buf);
      return json(res, 200, { ok: true, url: '/uploads/' + name });
    } catch (e) {
      return json(res, 413, { ok: false, err: 'Image trop lourde (40 Mo max).' });
    }
  }

  if (req.method === 'GET' && p.startsWith('/uploads/')) {
    const f = path.normalize(path.join(UPLOADS, p.slice('/uploads/'.length)));
    if (!f.startsWith(UPLOADS)) { res.writeHead(403); return res.end(); }
    return serveFile(res, f);
  }

  if (req.method === 'GET') {
    const rel = p === '/' ? 'index.html' : p.replace(/^\/+/, '');
    const f = path.normalize(path.join(PUB, rel));
    if (!f.startsWith(PUB)) { res.writeHead(403); return res.end(); }
    return serveFile(res, f);
  }
  res.writeHead(405); res.end();
});

server.listen(PORT, '0.0.0.0', () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  const line = '─'.repeat(64);
  console.log(`\n${line}\n  DESCENTE EN AVERNE — table virtuelle\n${line}`);
  console.log(`  Joueurs : http://localhost:${PORT}${ips.map((i) => `   ou   http://${i}:${PORT}`).join('')}`);
  console.log(`  MJ      : http://localhost:${PORT}/?gm=${GM_KEY}`);
  console.log(`${line}\n  Le lien MJ contient votre clé : ne le partagez pas.\n`);
});

process.on('SIGINT', () => { game.save(); setTimeout(() => process.exit(0), 500); });
process.on('SIGTERM', () => { game.save(); setTimeout(() => process.exit(0), 500); });
