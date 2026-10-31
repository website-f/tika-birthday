'use strict';

const express = require('express');
const multer = require('multer');
const compression = require('compression');
const sharp = require('sharp');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const DEFAULTS = require('./defaults');

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const CONTENT_FILE = path.join(DATA_DIR, 'content.json');
const RSVP_FILE = path.join(DATA_DIR, 'rsvps.json');
const SECRET_FILE = path.join(DATA_DIR, 'secret.key');
const CACHE_DIR = path.join(DATA_DIR, 'cache');
const MEMES_DIR = path.join(__dirname, 'public/memes');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;

if (!ADMIN_PASSWORD) {
  console.warn('[warn] ADMIN_PASSWORD is not set — the admin portal is locked.');
}

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(CACHE_DIR, { recursive: true });

// ---------- storage helpers ----------

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJSON(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// Saved objects are merged over defaults so new default fields appear
// automatically; arrays are taken from the saved copy as-is.
function merge(base, over) {
  if (!isPlainObject(base) || !isPlainObject(over)) return over === undefined ? base : over;
  const out = { ...base };
  for (const k of Object.keys(over)) out[k] = merge(base[k], over[k]);
  return out;
}

function getContent() {
  return merge(DEFAULTS, readJSON(CONTENT_FILE, {}));
}

function getSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  try {
    return fs.readFileSync(SECRET_FILE, 'utf8').trim();
  } catch {
    const s = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(SECRET_FILE, s, { mode: 0o600 });
    return s;
  }
}
const SECRET = getSecret();

// ---------- auth ----------

function sign(payload) {
  return crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
}

function makeToken() {
  const payload = `admin.${Date.now() + SESSION_TTL_MS}`;
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token) {
  if (typeof token !== 'string') return false;
  const i = token.lastIndexOf('.');
  if (i < 0) return false;
  const payload = token.slice(0, i);
  const sig = Buffer.from(token.slice(i + 1));
  const expected = Buffer.from(sign(payload));
  if (sig.length !== expected.length || !crypto.timingSafeEqual(sig, expected)) return false;
  const exp = Number(payload.split('.')[1]);
  return Number.isFinite(exp) && exp > Date.now();
}

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function isHttps(req) {
  return req.secure || req.headers['x-forwarded-proto'] === 'https';
}

function requireAdmin(req, res, next) {
  if (verifyToken(parseCookies(req.headers.cookie).tb_admin)) return next();
  res.status(401).json({ error: 'Not logged in' });
}

function passwordMatches(input) {
  if (!ADMIN_PASSWORD || typeof input !== 'string') return false;
  const a = crypto.createHash('sha256').update(input).digest();
  const b = crypto.createHash('sha256').update(ADMIN_PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
}

// Tiny in-memory limiter: enough to stop password guessing / RSVP spam.
const hits = new Map();
function limited(key, max, windowMs) {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.reset < now) {
    hits.set(key, { n: 1, reset: now + windowMs });
    return false;
  }
  h.n += 1;
  return h.n > max;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, h] of hits) if (h.reset < now) hits.delete(k);
}, 60_000).unref();

function clientIp(req) {
  return req.headers['x-real-ip'] || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
}

// ---------- uploads ----------

const ALLOWED = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/mp4': '.m4a',
  'audio/x-m4a': '.m4a',
  'audio/aac': '.aac',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
};

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, `${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}${ALLOWED[file.mimetype]}`),
  }),
  limits: { fileSize: 40 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED[file.mimetype]) return cb(null, true);
    cb(new Error(`Unsupported file type: ${file.mimetype || 'unknown'}. Use JPG, PNG, WEBP, GIF or MP3/M4A.`));
  },
});

// ---------- resized images ----------
// Originals are ~2000px / 600KB+. The card asks for /img/<size>/<dir>/<file>
// and gets a small WebP (or JPEG for old browsers), generated once and cached.

const SIZES = { s: 360, m: 900, l: 1600, g: 480 };
const SOURCES = { uploads: UPLOAD_DIR, memes: MEMES_DIR };
const SAFE_NAME = /^[\w.-]+\.(jpe?g|png|webp|gif)$/i;
sharp.cache(false);
sharp.concurrency(2);

const inflight = new Map();

function variant(size, dir, name, fmt) {
  const out = path.join(CACHE_DIR, `${size}-${dir}-${name}.${fmt}`);
  if (fs.existsSync(out)) return Promise.resolve(out);
  if (inflight.has(out)) return inflight.get(out);
  const src = path.join(SOURCES[dir], name);
  const animated = /\.gif$/i.test(name);
  let pipe = sharp(src, { animated, limitInputPixels: 80e6 })
    .rotate()
    .resize({ width: SIZES[size], height: SIZES[size], fit: 'inside', withoutEnlargement: true });
  pipe = fmt === 'webp'
    ? pipe.webp({ quality: animated ? 70 : 74, effort: animated ? 3 : 4, smartSubsample: true })
    : pipe.jpeg({ quality: 76, mozjpeg: true, progressive: true });
  const tmp = `${out}.${process.pid}.tmp`;
  const job = pipe
    .toFile(tmp)
    .then(() => { fs.renameSync(tmp, out); return out; })
    .finally(() => inflight.delete(out));
  inflight.set(out, job);
  return job;
}

// Generate the variants the card uses ahead of time, one at a time, so the
// first visitor never waits on resizing.
let warmQueue = Promise.resolve();
function prewarm(content) {
  const want = [];
  const add = (src, sizes) => {
    const m = /^\/(uploads|memes)\/([^/]+)$/.exec(src || '');
    if (m && SAFE_NAME.test(m[2])) for (const s of sizes) want.push([s, m[1], m[2]]);
  };
  for (const p of content.memories?.photos || []) add(p.src, ['s', 'm', 'l']);
  for (const m of content.memes?.items || []) add(m.src, ['g']);
  add(content.letter?.gif, ['g']);
  add(content.rsvp?.waitingGif, ['g']);
  add(content.rsvp?.successGif, ['g']);
  warmQueue = warmQueue.then(async () => {
    for (const [s, dir, name] of want) {
      try { await variant(s, dir, name, 'webp'); } catch (e) { console.warn('prewarm failed', name, e.message); }
    }
  });
}

// ---------- app ----------

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');
app.use(compression());

app.get('/img/:size/:dir/:name', async (req, res) => {
  const { size, dir, name } = req.params;
  if (!SIZES[size] || !SOURCES[dir] || !SAFE_NAME.test(name)) return res.status(404).end();
  const src = path.join(SOURCES[dir], name);
  if (!fs.existsSync(src)) return res.status(404).end();
  const webp = /image\/webp/.test(req.headers.accept || '');
  res.set('Vary', 'Accept');
  // Old browsers without WebP: GIFs stay GIFs (keeps the animation).
  if (!webp && /\.gif$/i.test(name)) {
    return res.sendFile(src, { maxAge: '365d', immutable: true });
  }
  try {
    const file = await variant(size, dir, name, webp ? 'webp' : 'jpg');
    res.sendFile(file, { maxAge: '365d', immutable: true, headers: { 'Content-Type': webp ? 'image/webp' : 'image/jpeg' } });
  } catch (e) {
    console.warn('resize failed', name, e.message);
    res.sendFile(src, { maxAge: '1d' });
  }
});

app.use(express.json({ limit: '1mb' }));

app.get('/healthz', (req, res) => res.json({ ok: true }));

app.get('/api/content', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(getContent());
});

app.post('/api/rsvp', (req, res) => {
  if (limited(`rsvp:${clientIp(req)}`, 20, 60 * 60 * 1000)) return res.status(429).json({ error: 'Too many' });
  const clip = (v, n = 500) => (typeof v === 'string' ? v.slice(0, n) : '');
  const entry = {
    at: new Date().toISOString(),
    answer: clip(req.body?.answer, 20) || 'yes',
    food: clip(req.body?.food, 100),
    vibe: clip(req.body?.vibe, 100),
    note: clip(req.body?.note, 1000),
    noAttempts: Number(req.body?.noAttempts) || 0,
    ua: clip(req.headers['user-agent'], 200),
  };
  const list = readJSON(RSVP_FILE, []);
  list.push(entry);
  writeJSON(RSVP_FILE, list.slice(-500));
  res.json({ ok: true });
});

// --- admin api ---

app.post('/api/admin/login', (req, res) => {
  if (limited(`login:${clientIp(req)}`, 10, 15 * 60 * 1000)) {
    return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
  }
  if (!passwordMatches(req.body?.password)) return res.status(401).json({ error: 'Wrong password' });
  const secure = isHttps(req) ? '; Secure' : '';
  res.set('Set-Cookie', `tb_admin=${encodeURIComponent(makeToken())}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}${secure}`);
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  res.set('Set-Cookie', 'tb_admin=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  res.json({ ok: true });
});

app.get('/api/admin/me', requireAdmin, (req, res) => res.json({ ok: true }));

app.get('/api/admin/content', requireAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ content: getContent(), defaults: DEFAULTS });
});

app.put('/api/admin/content', requireAdmin, (req, res) => {
  if (!isPlainObject(req.body)) return res.status(400).json({ error: 'Invalid content' });
  // Only keep keys we know about so a bad payload can't bloat the file.
  const clean = {};
  for (const k of Object.keys(DEFAULTS)) if (k in req.body) clean[k] = req.body[k];
  writeJSON(CONTENT_FILE, clean);
  pruneUploads(JSON.stringify(clean));
  prewarm(getContent());
  res.json({ ok: true, content: getContent() });
});

// Delete uploads the saved content no longer references. Files younger than
// an hour are kept: they may belong to an edit that hasn't been saved yet.
function pruneUploads(json) {
  fs.readdir(UPLOAD_DIR, (err, names) => {
    if (err) return;
    const cutoff = Date.now() - 60 * 60 * 1000;
    for (const name of names) {
      if (json.includes(`/uploads/${name}`)) continue;
      // Cached variants of a removed upload go too.
      fs.readdir(CACHE_DIR, (e, cached) => {
        if (!e) for (const c of cached) if (c.includes(`-uploads-${name}.`)) fs.rm(path.join(CACHE_DIR, c), { force: true }, () => {});
      });
      const file = path.join(UPLOAD_DIR, name);
      fs.stat(file, (e, st) => {
        if (!e && st.isFile() && st.mtimeMs < cutoff) fs.rm(file, { force: true }, () => {});
      });
    }
  });
}

app.post('/api/admin/upload', requireAdmin, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 40MB).' : err.message;
      return res.status(400).json({ error: msg });
    }
    if (!req.file) return res.status(400).json({ error: 'No file received' });
    res.json({ ok: true, url: `/uploads/${req.file.filename}` });
    if (SAFE_NAME.test(req.file.filename)) {
      warmQueue = warmQueue.then(() => Promise.all(['s', 'm'].map((s) => variant(s, 'uploads', req.file.filename, 'webp'))).catch(() => {}));
    }
  });
});

app.delete('/api/admin/upload/:name', requireAdmin, (req, res) => {
  const name = path.basename(req.params.name);
  if (!/^[a-z0-9]+-[a-f0-9]+\.[a-z0-9]+$/.test(name)) return res.status(400).json({ error: 'Bad name' });
  fs.rm(path.join(UPLOAD_DIR, name), { force: true }, () => res.json({ ok: true }));
});

app.get('/api/admin/rsvps', requireAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(readJSON(RSVP_FILE, []).reverse());
});

app.delete('/api/admin/rsvps', requireAdmin, (req, res) => {
  writeJSON(RSVP_FILE, []);
  res.json({ ok: true });
});

// --- static ---

app.use('/uploads', express.static(UPLOAD_DIR, { immutable: true, maxAge: '365d', index: false }));
app.use('/vendor/gsap', express.static(path.join(__dirname, 'node_modules/gsap/dist'), { maxAge: '30d' }));
app.use('/vendor/confetti', express.static(path.join(__dirname, 'node_modules/canvas-confetti/dist'), { maxAge: '30d' }));
app.use('/memes', express.static(path.join(__dirname, 'public/memes'), { maxAge: '30d' }));

// The card is rendered client-side, but the <title> and share preview are
// filled in here so links shared in WhatsApp show her name.
const BUILD = Date.now().toString(36);
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function shareTags(req, c) {
  // Crawlers need absolute URLs; orxies terminates TLS in front of us.
  const proto = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
  const origin = `${proto}://${req.headers.host}`;
  const s = c.share || {};
  const title = escapeHtml(s.title || c.pageTitle);
  const desc = escapeHtml(s.description || '');
  const tags = [
    `<meta name="description" content="${desc}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${desc}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${escapeHtml(origin)}/" />`,
    `<meta name="twitter:card" content="${s.image ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${desc}" />`,
  ];
  if (s.image) {
    const img = escapeHtml(/^https?:\/\//.test(s.image) ? s.image : origin + s.image);
    tags.push(
      `<meta property="og:image" content="${img}" />`,
      `<meta property="og:image:secure_url" content="${img}" />`,
      `<meta property="og:image:alt" content="${title}" />`,
      `<meta name="twitter:image" content="${img}" />`,
    );
    if (/\.jpe?g$/i.test(s.image)) tags.push('<meta property="og:image:type" content="image/jpeg" />');
  }
  return tags.join('\n  ');
}

function sendPage(file, req, res) {
  const c = getContent();
  const html = fs
    .readFileSync(path.join(__dirname, 'public', file), 'utf8')
    .replace('{{SHARE_TAGS}}', shareTags(req, c))
    .replaceAll('{{TITLE}}', escapeHtml(c.pageTitle))
    .replaceAll('{{NAME}}', escapeHtml(c.herName))
    .replaceAll('{{V}}', BUILD);
  res.set('Cache-Control', 'no-cache').type('html').send(html);
}

app.get('/', (req, res) => sendPage('index.html', req, res));
app.get(['/admin', '/admin/'], (req, res) => {
  res.set('X-Robots-Tag', 'noindex');
  sendPage('admin/index.html', req, res);
});
app.use(express.static(path.join(__dirname, 'public'), { index: false, maxAge: '1h' }));

app.use((req, res) => res.status(404).send('Not found'));

app.listen(PORT, () => {
  console.log(`tika-birthday listening on :${PORT} (data: ${DATA_DIR})`);
  prewarm(getContent());
});
