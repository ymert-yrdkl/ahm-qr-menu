#!/usr/bin/env node
// Toplanan menü içeriğini (Yemeksepeti, Getir, Trendyol Yemek, mekânın sitesi vb.) mekân klasörüne aktarır.
// Uzak görselleri indirir, dosya adlarını düzenler, menu.json dosyasını yazar.
//
// Kullanım: node tools/ice-aktar.mjs <mekan> <kaynak.json> [--fiyatlarla]
//
// Kaynak dosya biçimi (yalnızca name alanları zorunlu):
// {
//   "name": "Burger Lab", "tagline": "Smash burger", "logo": "https://.../logo.png",
//   "theme": { "primary": "#e4572e" },
//   "contact": { "phone": "0555 000 00 00", "address": "...", "instagram": "https://instagram.com/..." },
//   "categories": [
//     { "name": "Burgerler", "layout": "photo",
//       "items": [ { "name": "Cheese Burger", "desc": "...", "image": "https://.../foto.jpg", "price": "250" } ] }
//   ]
// }
//
// Fiyatlar varsayılan olarak AKTARILMAZ. Platform fiyatları mekânın gerçek fiyatı değildir.
// Fiyatları da almak için --fiyatlarla ekleyin.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeVenue, slugify } from '../lib/schema.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const withPrices = args.includes('--fiyatlarla');
const [rawSlug, sourcePath] = args.filter((a) => !a.startsWith('--'));

if (!rawSlug || !sourcePath) {
  console.log('Kullanım: node tools/ice-aktar.mjs <mekan> <kaynak.json> [--fiyatlarla]');
  process.exit(1);
}

const slug = slugify(rawSlug, 63);
const dir = path.join(ROOT, 'venues', slug);
const imgDir = path.join(dir, 'img');
const sourceDir = path.dirname(path.resolve(sourcePath));
const source = JSON.parse((await fs.readFile(sourcePath, 'utf8')).replace(/^\uFEFF/, ''));

let existing = {};
try {
  existing = JSON.parse(await fs.readFile(path.join(dir, 'menu.json'), 'utf8'));
} catch {
  existing = {};
}

await fs.mkdir(imgDir, { recursive: true });

function sniff(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpg';
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (/^\s*(<\?xml|<svg)/i.test(buf.toString('utf8', 0, 200))) return 'svg';
  return '';
}

const used = new Set(await fs.readdir(imgDir));
const stats = { ok: 0, failed: [], big: [] };

async function fetchImage(ref, hint) {
  if (!ref || typeof ref !== 'string') return '';
  let buf;
  try {
    if (/^https?:\/\//i.test(ref)) {
      const res = await fetch(ref, { headers: { 'User-Agent': 'Mozilla/5.0 (AHM QR Menu importer)' }, signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      buf = Buffer.from(await res.arrayBuffer());
    } else {
      const local = path.resolve(sourceDir, ref);
      buf = await fs.readFile(local);
    }
  } catch (e) {
    stats.failed.push(`${hint}: ${e.message}`);
    return '';
  }
  const ext = sniff(buf);
  if (!ext) {
    stats.failed.push(`${hint}: görsel biçimi tanınmadı`);
    return '';
  }
  const base = slugify(hint, 48) || 'gorsel';
  let name = `${base}.${ext}`;
  for (let n = 2; used.has(name); n++) name = `${base}-${n}.${ext}`;
  used.add(name);
  await fs.writeFile(path.join(imgDir, name), buf);
  stats.ok++;
  if (buf.length > 400 * 1024) stats.big.push(`${name} (${Math.round(buf.length / 1024)} KB)`);
  return name;
}

async function pool(tasks, size = 4) {
  const results = new Array(tasks.length);
  let i = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (i < tasks.length) {
      const k = i++;
      results[k] = await tasks[k]();
    }
  }));
  return results;
}

const categories = Array.isArray(source.categories) ? source.categories : [];
const jobs = [];
for (const c of categories) {
  for (const it of Array.isArray(c.items) ? c.items : []) {
    const ref = it.image;
    jobs.push(async () => { it.image = await fetchImage(ref, it.name); });
    if (!withPrices) {
      it.price = '';
      if (Array.isArray(it.variants)) it.variants = it.variants.map((v) => ({ ...v, price: '' }));
    }
  }
}
let logo = existing.logo || '';
if (source.logo) jobs.push(async () => { logo = (await fetchImage(source.logo, 'logo')) || logo; });
await pool(jobs);

const merged = normalizeVenue({
  ...existing,
  name: source.name || existing.name || slug,
  tagline: source.tagline ?? existing.tagline,
  logo,
  theme: { ...(existing.theme || {}), ...(source.theme || {}) },
  contact: { ...(existing.contact || {}), ...(source.contact || {}) },
  note: source.note ?? existing.note,
  currency: source.currency || existing.currency,
  categories,
  updatedAt: '',
});

await fs.writeFile(path.join(dir, 'menu.json'), JSON.stringify(merged, null, 2) + '\n', 'utf8');

const itemCount = merged.categories.reduce((n, c) => n + c.items.length, 0);
const withImage = merged.categories.reduce((n, c) => n + c.items.filter((i) => i.image).length, 0);
console.log(`venues/${slug}/menu.json yazıldı`);
console.log(`Kategori: ${merged.categories.length} · Ürün: ${itemCount} · Fotoğraflı: ${withImage} · İndirilen görsel: ${stats.ok}`);
console.log(`Fiyatlar: ${withPrices ? 'aktarıldı' : 'aktarılmadı (panelden girilecek)'}`);
if (stats.big.length) console.log(`Büyük görseller (küçültmek iyi olur):\n  ${stats.big.join('\n  ')}`);
if (stats.failed.length) {
  console.log(`İndirilemeyen görseller:\n  ${stats.failed.join('\n  ')}`);
  process.exitCode = 2;
}
