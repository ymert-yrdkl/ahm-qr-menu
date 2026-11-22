// AHM Cloud QR Menü sunucusu
// Tek uygulama, çok mekân: her mekân kendi alt alan adında (ör. schnitzgo.ahmcloud.com) açılır.
// Bağımlılık yok, Node.js 20+ yeterli.

import http from 'node:http';
import { promises as fs, createReadStream, readFileSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { normalizeVenue, publicView, slugify, ValidationError } from './lib/schema.js';
import { buildTheme, themeToCss } from './public/assets/color.js';
import { yildizData, yildizPalette, yildizCover } from './lib/yildiz.js';

const scrypt = promisify(crypto.scrypt);

/* ---------- ayarlar ---------- */

const APP_DIR = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(APP_DIR, 'public');
const SEED_DIR = path.join(APP_DIR, 'venues');
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(APP_DIR, 'data'));
const VENUES_DIR = path.join(DATA_DIR, 'venues');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DEV = process.env.NODE_ENV !== 'production';
const TRUST_PROXY = process.env.TRUST_PROXY !== '0';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const BASE_DOMAINS = listEnv(process.env.BASE_DOMAIN || 'ahmcloud.com').map((d) => d.toLowerCase());
const DEFAULT_VENUE = slugify(process.env.DEFAULT_VENUE || '');
const SEED_OVERWRITE = new Set(listEnv(process.env.SEED_OVERWRITE || ''));
const DOMAIN_MAP = new Map(
  listEnv(process.env.DOMAIN_MAP || '')
    .map((pair) => pair.split('='))
    .filter((p) => p.length === 2)
    .map(([d, s]) => [d.trim().toLowerCase(), slugify(s)]),
);

// Yayından kaldırılan mekânlar: venues/_kapali.txt (satır başına bir mekân) ve DISABLED_VENUES ortam değişkeni.
// Mekânın verileri silinmez, yalnızca adresleri 404 döner.
function readDisabled() {
  let lines = [];
  try {
    lines = readFileSync(path.join(SEED_DIR, '_kapali.txt'), 'utf8').split(/\r?\n/);
  } catch {
    lines = [];
  }
  return new Set([...lines, ...listEnv(process.env.DISABLED_VENUES || '')].map((l) => l.replace(/#.*$/, '').trim().toLowerCase()).filter(Boolean));
}
const DISABLED = readDisabled();

const RESERVED = new Set(['www', 'panel', 'api', 'admin', 'app', 'mail', 'static', 'assets', 'qr']);
// Bu adreslerde mekân yoldan seçilir: qr.ahmcloud.com/schnitzgo
const PATH_HOSTS = new Set([...listEnv(process.env.PATH_HOSTS || 'qr.ahmcloud.com'), 'qr.localhost'].map((h) => h.toLowerCase()));
const MAX_JSON = 3 * 1024 * 1024;
const MAX_UPLOAD = 8 * 1024 * 1024;
const BACKUP_KEEP = 30;
const SESSION_TTL = 12 * 3600 * 1000;
const COOKIE = 'qrm_oturum';
const ASSET_V = Date.now().toString(36);

function listEnv(v) {
  return String(v).split(/[,;]/).map((s) => s.trim()).filter(Boolean);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

// /img/<ad>?w=200 gibi isteklerde varsa <ad>-200.webp verilir (aktarma araçları üretir); yoksa asıl dosya.
const IMG_SIZES = new Set([32, 200, 640, 900, 1200, 1600]);

const BASE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

const PAGE_CSP = [
  "default-src 'self'",
  "img-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "script-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join('; ');

/* ---------- yanıt yardımcıları ---------- */

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...BASE_HEADERS, ...headers });
  res.end(body);
}

function sendJson(res, status, data, headers = {}) {
  send(res, status, JSON.stringify(data), {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
}

function fail(res, status, error, where) {
  sendJson(res, status, { ok: false, error, where: where || undefined });
}

function sendHtml(res, status, html, extra = {}) {
  send(res, status, html, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-cache',
    'Content-Security-Policy': PAGE_CSP,
    ...extra,
  });
}

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

const LINE_SEP = String.fromCharCode(0x2028);
const PARA_SEP = String.fromCharCode(0x2029);
function jsonForScript(data) {
  return JSON.stringify(data).replace(/</g, '\\u003c').split(LINE_SEP).join('\\u2028').split(PARA_SEP).join('\\u2029');
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length'] || 0);
    if (declared > limit) {
      req.resume();
      return reject(Object.assign(new Error('büyük'), { code: 'TOO_LARGE' }));
    }
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) tooLarge = true;
      else chunks.push(chunk);
    });
    req.on('end', () => (tooLarge ? reject(Object.assign(new Error('büyük'), { code: 'TOO_LARGE' })) : resolve(Buffer.concat(chunks))));
    req.on('error', reject);
  });
}

async function readJson(req, res, limit) {
  let buf;
  try {
    buf = await readBody(req, limit);
  } catch (e) {
    fail(res, e.code === 'TOO_LARGE' ? 413 : 400, e.code === 'TOO_LARGE' ? 'Gönderilen veri çok büyük.' : 'İstek okunamadı.');
    return null;
  }
  try {
    const data = JSON.parse(buf.toString('utf8'));
    if (data && typeof data === 'object') return data;
  } catch {
    /* aşağıda hata döner */
  }
  fail(res, 400, 'İstek okunamadı.');
  return null;
}

function safeJoin(base, rel) {
  const full = path.resolve(base, rel.replace(/^[/\\]+/, ''));
  return full.startsWith(base + path.sep) ? full : null;
}

async function serveFile(req, res, file, cache) {
  let st;
  try {
    st = await fs.stat(file);
  } catch {
    return false;
  }
  if (!st.isFile()) return false;
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
  const headers = { ...BASE_HEADERS, 'Cache-Control': cache, ETag: etag };
  if (type === 'image/svg+xml') headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; img-src data:";
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers);
    res.end();
    return true;
  }
  res.writeHead(200, { ...headers, 'Content-Type': type, 'Content-Length': st.size });
  if (req.method === 'HEAD') res.end();
  else createReadStream(file).pipe(res);
  return true;
}

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) {
      try {
        out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        /* bozuk çerez */
      }
    }
  }
  return out;
}

function isHttps(req) {
  if (req.socket.encrypted) return true;
  return TRUST_PROXY && String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
}

function clientIp(req) {
  if (TRUST_PROXY && req.headers['x-forwarded-for']) return String(req.headers['x-forwarded-for']).split(',')[0].trim();
  return req.socket.remoteAddress || '?';
}

function cookieHeader(req, name, value, maxAgeSec) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${req.qrmBase ? req.qrmBase + '/' : '/'}`, 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxAgeSec}`];
  if (isHttps(req)) parts.push('Secure');
  return parts.join('; ');
}

/* ---------- şablonlar ---------- */

const templateCache = new Map();
async function template(name) {
  if (!DEV && templateCache.has(name)) return templateCache.get(name);
  const html = await fs.readFile(path.join(PUBLIC_DIR, name), 'utf8');
  templateCache.set(name, html);
  return html;
}

function fill(html, vars) {
  return html.replace(/\{\{([A-Z_]+)\}\}/g, (_, k) => (k in vars ? String(vars[k]) : ''));
}

/* ---------- mekân verisi ---------- */

const venueDir = (slug) => path.join(VENUES_DIR, slug);
const menuFile = (slug) => path.join(venueDir(slug), 'menu.json');
const imgDir = (slug) => path.join(venueDir(slug), 'img');
const backupDir = (slug) => path.join(venueDir(slug), 'yedek');
const authFile = (slug) => path.join(venueDir(slug), 'auth.json');

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

const venueCache = new Map();
async function loadVenue(slug) {
  let st;
  try {
    st = await fs.stat(menuFile(slug));
  } catch {
    return null;
  }
  const hit = venueCache.get(slug);
  if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit.data;
  const raw = await fs.readFile(menuFile(slug), 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw.replace(/^\uFEFF/, ''));
  } catch (e) {
    throw Object.assign(new Error(`${slug}/menu.json okunamadı: ${e.message}`), { code: 'BAD_MENU' });
  }
  const data = normalizeVenue(parsed);
  venueCache.set(slug, { mtimeMs: st.mtimeMs, size: st.size, data });
  return data;
}

const locks = new Map();
function withLock(slug, fn) {
  const prev = locks.get(slug) || Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(slug, next.catch(() => {}));
  return next;
}

function stamp() {
  const d = new Date();
  const p = (n, l = 2) => String(n).padStart(l, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function backupMenu(slug, reason = '') {
  if (!(await exists(menuFile(slug)))) return;
  await fs.mkdir(backupDir(slug), { recursive: true });
  const suffix = reason ? `-${slugify(reason, 20)}` : '';
  await fs.copyFile(menuFile(slug), path.join(backupDir(slug), `menu-${stamp()}-${crypto.randomBytes(2).toString('hex')}${suffix}.json`));
  const files = (await fs.readdir(backupDir(slug))).filter((f) => f.startsWith('menu-') && f.endsWith('.json')).sort();
  for (const f of files.slice(0, Math.max(0, files.length - BACKUP_KEEP))) {
    await fs.unlink(path.join(backupDir(slug), f)).catch(() => {});
  }
}

async function writeAtomic(file, content) {
  const tmp = `${file}.tmp-${crypto.randomBytes(4).toString('hex')}`;
  await fs.writeFile(tmp, content, 'utf8');
  await fs.rename(tmp, file);
}

async function saveVenue(slug, data) {
  await fs.mkdir(venueDir(slug), { recursive: true });
  await backupMenu(slug);
  await writeAtomic(menuFile(slug), JSON.stringify(data, null, 2) + '\n');
  venueCache.delete(slug);
}

/* ---------- ilk kurulum: depodaki mekânları veri klasörüne kopyala ---------- */

async function seedVenues() {
  await fs.mkdir(VENUES_DIR, { recursive: true });
  let entries = [];
  try {
    entries = await fs.readdir(SEED_DIR, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (!e.isDirectory() || !/^[a-z0-9][a-z0-9-]*$/.test(e.name)) continue;
    const src = path.join(SEED_DIR, e.name);
    if (!(await exists(path.join(src, 'menu.json')))) continue;
    const already = await exists(menuFile(e.name));
    if (already && !SEED_OVERWRITE.has(e.name)) continue;
    if (already) await backupMenu(e.name, 'seed-oncesi');
    await fs.mkdir(imgDir(e.name), { recursive: true });
    if (await exists(path.join(src, 'img'))) await fs.cp(path.join(src, 'img'), imgDir(e.name), { recursive: true, force: true });
    await fs.copyFile(path.join(src, 'menu.json'), menuFile(e.name));
    venueCache.delete(e.name);
    console.log(`[kurulum] ${e.name} ${already ? 'depodaki sürümle yenilendi' : 'eklendi'}`);
  }
}

/* ---------- şifre ve oturum ---------- */

let SESSION_SECRET = process.env.SESSION_SECRET || '';

async function loadSecret() {
  if (SESSION_SECRET) return;
  const file = path.join(DATA_DIR, '.oturum-anahtari');
  try {
    SESSION_SECRET = (await fs.readFile(file, 'utf8')).trim();
  } catch {
    /* yok, oluşturulacak */
  }
  if (SESSION_SECRET.length < 32) {
    SESSION_SECRET = crypto.randomBytes(32).toString('hex');
    await fs.writeFile(file, SESSION_SECRET, { mode: 0o600 });
  }
}

async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pw, salt, 32);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

async function checkHash(pw, stored) {
  const [alg, saltHex, keyHex] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !saltHex || !keyHex) return false;
  const key = await scrypt(pw, Buffer.from(saltHex, 'hex'), 32);
  const want = Buffer.from(keyHex, 'hex');
  return want.length === key.length && crypto.timingSafeEqual(key, want);
}

function sameText(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

async function readAuth(slug) {
  try {
    const a = JSON.parse(await fs.readFile(authFile(slug), 'utf8'));
    return a && typeof a === 'object' ? a : {};
  } catch {
    return {};
  }
}

const adminMark = () => crypto.createHash('sha256').update('admin:' + ADMIN_PASSWORD).digest('hex').slice(0, 12);

function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${mac}`;
}

function readToken(token) {
  const [body, mac] = String(token || '').split('.');
  if (!body || !mac) return null;
  const want = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  if (mac.length !== want.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(want))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return p && p.exp > Date.now() ? p : null;
  } catch {
    return null;
  }
}

async function getSession(req, slug) {
  const p = readToken(parseCookies(req)[COOKIE]);
  if (!p || p.v !== slug) return null;
  if (p.r === 'admin') return ADMIN_PASSWORD && p.m === adminMark() ? p : null;
  if (p.r === 'mekan') {
    const auth = await readAuth(slug);
    return auth.hash && p.g === (auth.gen || 0) ? p : null;
  }
  return null;
}

function sessionCookie(req, slug, role, gen) {
  const payload = { v: slug, r: role, exp: Date.now() + SESSION_TTL };
  if (role === 'admin') payload.m = adminMark();
  else payload.g = gen || 0;
  return cookieHeader(req, COOKIE, signToken(payload), SESSION_TTL / 1000);
}

const attempts = new Map();
function throttled(key) {
  const a = attempts.get(key);
  return a && a.until > Date.now() ? Math.ceil((a.until - Date.now()) / 60000) : 0;
}
function noteFailure(key) {
  const a = attempts.get(key) || { n: 0, until: 0 };
  a.n += 1;
  if (a.n >= 8) {
    a.n = 0;
    a.until = Date.now() + 10 * 60 * 1000;
  }
  attempts.set(key, a);
}
setInterval(() => {
  const now = Date.now();
  for (const [k, a] of attempts) if (a.until < now && a.n === 0) attempts.delete(k);
}, 15 * 60 * 1000).unref();

/* ---------- mekânı adresten bulma ---------- */

function slugFromHost(req) {
  const host = String(req.headers.host || '').toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
  if (DOMAIN_MAP.has(host)) return DOMAIN_MAP.get(host);
  for (const base of [...BASE_DOMAINS, 'localhost']) {
    if (host.endsWith('.' + base)) {
      const sub = host.slice(0, -(base.length + 1));
      if (/^[a-z0-9][a-z0-9-]{0,62}$/.test(sub) && !RESERVED.has(sub)) return sub;
    }
  }
  return '';
}

async function resolveVenue(req, url) {
  const fromHost = slugFromHost(req);
  if (fromHost) return { slug: fromHost, setCookie: null };
  if (DEV) {
    const q = slugify(url.searchParams.get('mekan') || '');
    if (q) return { slug: q, setCookie: `qrm_gelistirme=${q}; Path=/; SameSite=Lax` };
    const c = slugify(parseCookies(req).qrm_gelistirme || '');
    if (c) return { slug: c, setCookie: null };
  }
  return { slug: DEFAULT_VENUE, setCookie: null };
}

/* ---------- sayfalar ---------- */

async function renderHome(res, status, message) {
  const html = fill(await template('home.html'), { MESSAGE: escHtml(message), V: ASSET_V });
  sendHtml(res, status, html);
}

async function renderMenu(res, slug, venue, extraHeaders, base = '') {
  if (venue.theme.design === 'yildiz') return renderYildiz(res, slug, venue, extraHeaders, base);
  const theme = buildTheme(venue.theme);
  const data = { ...publicView(venue), v: slug };
  const html = fill(await template('menu.html'), {
    TITLE: escHtml(venue.name ? `${venue.name} · Menü` : 'Menü'),
    DESCRIPTION: escHtml(`${venue.name || 'Mekân'} menüsü${venue.tagline ? ' · ' + venue.tagline : ''}`),
    THEME_COLOR: theme.paper,
    THEME_VARS: themeToCss(theme),
    BODY_CLASS: `fit-${venue.theme.imageFit} scheme-${theme.scheme}`,
    ICON: venue.logo ? `${base}/img/${encodeURIComponent(venue.logo)}` : '/assets/favicon.svg',
    BASE: escHtml(base),
    DATA: jsonForScript(data),
    V: ASSET_V,
  });
  sendHtml(res, 200, html, extraHeaders);
}

// Yıldız görünümü: kapaklı tek sayfa. Tasarım menu-yildiz.html + assets/yildiz.js, veri lib/yildiz.js.
async function renderYildiz(res, slug, venue, extraHeaders, base = '') {
  const p = yildizPalette(venue.theme.primary);
  const data = yildizData(venue, slug, base);
  const cover = yildizCover(venue);
  const img = cover ? `${base}/img/${encodeURIComponent(cover)}` : '';
  const urunSayisi = data.menu.reduce((n, k) => n + k.urunler.length, 0);
  const favicon = `data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 32 32%27%3E%3Crect x=%274%27 y=%274%27 width=%2724%27 height=%2724%27 rx=%277%27 fill=%27%23${p.vurgu.slice(1)}%27/%3E%3C/svg%3E`;
  const html = fill(await template('menu-yildiz.html'), {
    TITLE: escHtml(venue.name || 'Menü'),
    DESCRIPTION: escHtml(`${venue.name || 'Mekân'}: ${urunSayisi} ürünlük menü, çalışma saatleri ve yol tarifi.`),
    NAME: escHtml(venue.name || 'Menü'),
    ICON: venue.logo ? `${base}/img/${encodeURIComponent(venue.logo)}` : favicon,
    DILLER: escHtml(venue.languages.join(',')),
    VURGU: p.vurgu,
    VURGU_ACIK: p.vurguAcik,
    GECE_YAZI: p.geceYazi,
    GECE_ACIK: p.geceAcik,
    HERO_KUCUK: img ? `${img}?w=32` : '',
    HERO_ORTA: img ? `${img}?w=900` : '',
    HERO_SRCSET: img ? `${img}?w=900 900w, ${img}?w=1600 1600w` : '',
    OG_IMAGE: img ? `${img}?w=1600` : '',
    BASE: escHtml(base),
    DATA: jsonForScript(data),
    V: ASSET_V,
  });
  sendHtml(res, 200, html, extraHeaders);
}

async function renderPanel(res, slug, venue, extraHeaders, base = '') {
  const theme = buildTheme(venue.theme);
  const html = fill(await template('panel.html'), {
    NAME: escHtml(venue.name || slug),
    SLUG: escHtml(slug),
    THEME_VARS: themeToCss(theme),
    ICON: venue.logo ? `${base}/img/${encodeURIComponent(venue.logo)}` : '/assets/favicon.svg',
    LOGO: venue.logo ? `${base}/img/${encodeURIComponent(venue.logo)}` : '',
    BASE: escHtml(base),
    V: ASSET_V,
  });
  sendHtml(res, 200, html, { 'X-Robots-Tag': 'noindex, nofollow', ...extraHeaders });
}

/* ---------- panel API ---------- */

function sniffImage(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return '';
}

async function panelApi(req, res, url, slug, route) {
  const method = req.method;

  if (method !== 'GET' && method !== 'HEAD') {
    if (req.headers['x-qrm'] !== '1') return fail(res, 403, 'İstek reddedildi.');
    const origin = req.headers.origin;
    if (origin) {
      let ok = false;
      try {
        ok = new URL(origin).host === req.headers.host;
      } catch {
        ok = false;
      }
      if (!ok) return fail(res, 403, 'İstek reddedildi.');
    }
  }

  const auth = await readAuth(slug);
  const session = await getSession(req, slug);

  if (route === 'session' && method === 'GET') {
    return sendJson(res, 200, {
      ok: true,
      loggedIn: !!session,
      role: session ? session.r : '',
      configured: Boolean(ADMIN_PASSWORD || auth.hash),
      hasVenuePassword: Boolean(auth.hash),
    });
  }

  if (route === 'login' && method === 'POST') {
    const key = `${clientIp(req)}|${slug}`;
    const wait = throttled(key);
    if (wait) return fail(res, 429, `Çok fazla hatalı deneme yapıldı. ${wait} dakika sonra tekrar deneyin.`);
    if (!ADMIN_PASSWORD && !auth.hash) return fail(res, 503, 'Panel şifresi ayarlanmamış. Sunucuda ADMIN_PASSWORD ortam değişkenini tanımlayın.');
    const body = await readJson(req, res, 10 * 1024);
    if (!body) return;
    const pw = typeof body.password === 'string' ? body.password : '';
    let role = '';
    if (pw && auth.hash && (await checkHash(pw, auth.hash))) role = 'mekan';
    else if (pw && ADMIN_PASSWORD && sameText(pw, ADMIN_PASSWORD)) role = 'admin';
    if (!role) {
      noteFailure(key);
      await new Promise((r) => setTimeout(r, 400));
      return fail(res, 401, 'Şifre hatalı.');
    }
    attempts.delete(key);
    return sendJson(res, 200, { ok: true, role }, { 'Set-Cookie': sessionCookie(req, slug, role, auth.gen) });
  }

  if (route === 'logout' && method === 'POST') {
    return sendJson(res, 200, { ok: true }, { 'Set-Cookie': cookieHeader(req, COOKIE, '', 0) });
  }

  if (!session) return fail(res, 401, 'Oturumunuz kapalı. Tekrar giriş yapın.');

  if (route === 'menu' && method === 'GET') {
    const venue = await loadVenue(slug);
    return sendJson(res, 200, { ok: true, menu: venue, role: session.r });
  }

  if (route === 'menu' && method === 'PUT') {
    const body = await readJson(req, res, MAX_JSON);
    if (!body) return;
    return withLock(slug, async () => {
      const current = await loadVenue(slug);
      if (typeof body.base === 'string' && current && current.updatedAt && body.base !== current.updatedAt) {
        return fail(res, 409, 'Menü siz açtıktan sonra başka bir yerden kaydedildi.');
      }
      let menu;
      try {
        menu = normalizeVenue(body.menu, { strict: true });
      } catch (e) {
        if (e instanceof ValidationError) return fail(res, 422, e.message, e.where);
        throw e;
      }
      menu.updatedAt = new Date().toISOString();
      await saveVenue(slug, menu);
      return sendJson(res, 200, { ok: true, menu });
    });
  }

  if (route === 'upload' && method === 'POST') {
    let buf;
    try {
      buf = await readBody(req, MAX_UPLOAD);
    } catch (e) {
      return fail(res, 413, 'Fotoğraf 8 MB’den büyük olamaz.');
    }
    const ext = sniffImage(buf);
    if (!ext) return fail(res, 415, 'Yalnızca JPG, PNG veya WEBP fotoğraf yükleyebilirsiniz.');
    const base = slugify(url.searchParams.get('ad') || '', 40) || 'foto';
    const file = `${base}-${crypto.randomBytes(3).toString('hex')}.${ext}`;
    await fs.mkdir(imgDir(slug), { recursive: true });
    await fs.writeFile(path.join(imgDir(slug), file), buf);
    return sendJson(res, 200, { ok: true, file });
  }

  if (route === 'password' && method === 'POST') {
    const body = await readJson(req, res, 10 * 1024);
    if (!body) return;
    const next = typeof body.next === 'string' ? body.next : '';
    if (next.length < 8 || next.length > 128) return fail(res, 422, 'Yeni şifre 8 ile 128 karakter arasında olmalı.');
    if (session.r === 'mekan') {
      const current = typeof body.current === 'string' ? body.current : '';
      if (!(await checkHash(current, auth.hash))) return fail(res, 401, 'Mevcut şifre hatalı.');
    }
    const gen = (auth.gen || 0) + 1;
    await fs.mkdir(venueDir(slug), { recursive: true });
    await writeAtomic(authFile(slug), JSON.stringify({ hash: await hashPassword(next), gen, updatedAt: new Date().toISOString() }));
    const headers = session.r === 'mekan' ? { 'Set-Cookie': sessionCookie(req, slug, 'mekan', gen) } : {};
    return sendJson(res, 200, { ok: true }, headers);
  }

  if (route === 'backups' && method === 'GET') {
    let files = [];
    try {
      files = (await fs.readdir(backupDir(slug))).filter((f) => /^menu-[\w-]+\.json$/.test(f)).sort().reverse();
    } catch {
      files = [];
    }
    const list = [];
    for (const f of files.slice(0, BACKUP_KEEP)) {
      const st = await fs.stat(path.join(backupDir(slug), f));
      list.push({ name: f, size: st.size, date: st.mtime.toISOString() });
    }
    return sendJson(res, 200, { ok: true, backups: list });
  }

  if (route.startsWith('backups/') && method === 'GET') {
    const name = route.slice('backups/'.length);
    if (!/^menu-[\w-]+\.json$/.test(name)) return fail(res, 400, 'Geçersiz yedek adı.');
    let raw;
    try {
      raw = await fs.readFile(path.join(backupDir(slug), name), 'utf8');
    } catch {
      return fail(res, 404, 'Yedek bulunamadı.');
    }
    try {
      return sendJson(res, 200, { ok: true, menu: normalizeVenue(JSON.parse(raw)) });
    } catch {
      return fail(res, 422, 'Yedek dosyası okunamadı.');
    }
  }

  return fail(res, 404, 'Bilinmeyen işlem.');
}

/* ---------- yönlendirme ---------- */

async function handle(req, res) {
  const url = new URL(req.url || '/', 'http://yerel');
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return fail(res, 400, 'Geçersiz adres.');
  }
  const method = req.method || 'GET';
  const readOnly = method === 'GET' || method === 'HEAD';

  if (pathname === '/healthz') return send(res, 200, 'ok', { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });

  if (pathname.startsWith('/assets/') || pathname.startsWith('/vendor/')) {
    const file = readOnly ? safeJoin(PUBLIC_DIR, pathname) : null;
    // Sürüm etiketli (?v=) dosyalar uzun, etiketsiz dosyalar (ör. panelin içe aktardığı color.js) kısa süre önbellekte kalır.
    const cache = DEV ? 'no-cache' : url.searchParams.has('v') ? 'public, max-age=604800, immutable' : 'public, max-age=3600';
    if (file && (await serveFile(req, res, file, cache))) return;
    return send(res, 404, 'Bulunamadı', { 'Content-Type': 'text/plain; charset=utf-8' });
  }

  if (pathname === '/robots.txt') {
    return send(res, 200, 'User-agent: *\nDisallow: /panel/\nDisallow: /*/panel/\n', { 'Content-Type': 'text/plain; charset=utf-8' });
  }

  let slug;
  let setCookie = null;
  let base = '';
  const host = String(req.headers.host || '').toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
  if (PATH_HOSTS.has(host)) {
    const seg = pathname.split('/');
    const first = seg[1] || '';
    if (!first) return renderHome(res, 200, 'QR menü altyapısı çalışıyor.');
    slug = /^[a-z0-9][a-z0-9-]{0,62}$/.test(first) ? first : '';
    if (!slug) return renderHome(res, 404, 'Bu adreste bir menü bulunamadı.');
    base = '/' + slug;
    if (seg.length === 2) {
      if (!readOnly) return fail(res, 404, 'Bulunamadı.');
      return send(res, 301, '', { Location: base + '/' + (url.search || '') });
    }
    pathname = '/' + seg.slice(2).join('/');
    req.qrmBase = base;
  } else {
    ({ slug, setCookie } = await resolveVenue(req, url));
  }
  const venue = slug && !DISABLED.has(slug) ? await loadVenue(slug) : null;
  if (!venue) {
    if (!readOnly) return fail(res, 404, 'Mekân bulunamadı.');
    return renderHome(res, slug ? 404 : pathname === '/' ? 200 : 404, slug ? 'Bu adreste bir menü bulunamadı.' : 'QR menü altyapısı çalışıyor.');
  }
  const extra = setCookie ? { 'Set-Cookie': setCookie } : {};

  // /menu: yıldız görünümünde menü katmanı açık başlar (sayfa kendisi ayırt eder); klasikte aynı sayfa.
  if ((pathname === '/' || pathname === '/menu' || pathname === '/menu/') && readOnly) return renderMenu(res, slug, venue, extra, base);

  if (pathname === '/api/menu' && readOnly) return sendJson(res, 200, publicView(venue), { 'Cache-Control': 'no-cache' });

  // Yıldız görünümünün anonim menü sayaçları. Şimdilik yalnız kabul edilir, saklanmaz.
  if (pathname === '/api/olay' && method === 'POST') {
    try {
      await readBody(req, 16 * 1024);
    } catch {
      /* büyük ya da bozuk: yine sessizce kabul */
    }
    return send(res, 204, '', { 'Cache-Control': 'no-store' });
  }

  if (pathname.startsWith('/img/') && readOnly) {
    const name = pathname.slice(5);
    const file = /^[a-z0-9][a-z0-9._-]{0,120}\.(webp|jpe?g|png|svg)$/i.test(name) ? safeJoin(imgDir(slug), name) : null;
    const w = Number(url.searchParams.get('w'));
    if (file && IMG_SIZES.has(w)) {
      const variant = safeJoin(imgDir(slug), `${name.replace(/\.[a-z0-9]+$/i, '')}-${w}.webp`);
      if (variant && (await serveFile(req, res, variant, 'public, max-age=86400'))) return;
    }
    if (file && (await serveFile(req, res, file, 'public, max-age=86400'))) return;
    return send(res, 404, 'Bulunamadı', { 'Content-Type': 'text/plain; charset=utf-8' });
  }

  if (pathname === '/panel' && readOnly) return send(res, 301, '', { Location: base + '/panel/' });
  if (pathname === '/panel/' && readOnly) return renderPanel(res, slug, venue, extra, base);
  if (pathname.startsWith('/panel/api/')) return panelApi(req, res, url, slug, pathname.slice('/panel/api/'.length));

  if (!readOnly) return fail(res, 404, 'Bulunamadı.');
  return renderHome(res, 404, 'Aradığınız sayfa bulunamadı.');
}

/* ---------- başlat ---------- */

async function main() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await loadSecret();
  await seedVenues();

  const venues = (await fs.readdir(VENUES_DIR, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
  console.log(`[qr-menu] veri klasörü: ${DATA_DIR}`);
  console.log(`[qr-menu] mekânlar: ${venues.join(', ') || 'yok'}`);
  console.log(`[qr-menu] alan adları: *.${BASE_DOMAINS.join(', *.')}`);
  if (DISABLED.size) console.log(`[qr-menu] kapalı mekânlar: ${[...DISABLED].join(', ')}`);
  if (!ADMIN_PASSWORD) console.warn('[qr-menu] UYARI: ADMIN_PASSWORD tanımlı değil. Mekân şifresi olmayan panellere giriş yapılamaz.');

  const server = http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      console.error('[hata]', req.method, req.url, err);
      if (!res.headersSent) fail(res, 500, err.code === 'BAD_MENU' ? 'Menü dosyası bozuk. Panelde Yedek bölümünden bir yedek yükleyin.' : 'Sunucuda beklenmeyen bir hata oluştu.');
      else res.destroy();
    });
  });
  server.requestTimeout = 60 * 1000;
  server.headersTimeout = 20 * 1000;
  server.listen(PORT, HOST, () => console.log(`[qr-menu] http://${HOST}:${PORT} adresinde çalışıyor${DEV ? ' (geliştirme modu)' : ''}`));

  const stop = () => server.close(() => process.exit(0));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

main().catch((err) => {
  console.error('[qr-menu] başlatılamadı:', err);
  process.exit(1);
});
