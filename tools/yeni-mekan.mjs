#!/usr/bin/env node
// Yeni mekân klasörü açar.
// Kullanım: node tools/yeni-mekan.mjs <alt-alan-adi> "Mekân Adı" [#anarenk]
// Örnek:    node tools/yeni-mekan.mjs burgerlab "Burger Lab" "#e4572e"

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeVenue, slugify } from '../lib/schema.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [rawSlug, name = '', color = ''] = process.argv.slice(2);

if (!rawSlug) {
  console.log('Kullanım: node tools/yeni-mekan.mjs <alt-alan-adi> "Mekân Adı" [#anarenk]');
  process.exit(1);
}

const slug = slugify(rawSlug, 63);
if (!slug) {
  console.error('Geçersiz alt alan adı. Yalnızca harf, rakam ve tire kullanın.');
  process.exit(1);
}

const dir = path.join(ROOT, 'venues', slug);
try {
  await fs.access(path.join(dir, 'menu.json'));
  console.error(`venues/${slug} zaten var.`);
  process.exit(1);
} catch {
  /* yok, oluşturulacak */
}

const menu = normalizeVenue({ name: name || slug, theme: { primary: color || '#c1272d' }, categories: [] });
await fs.mkdir(path.join(dir, 'img'), { recursive: true });
await fs.writeFile(path.join(dir, 'menu.json'), JSON.stringify(menu, null, 2) + '\n', 'utf8');

console.log(`Oluşturuldu: venues/${slug}/menu.json`);
console.log(`Adres: https://${slug}.ahmcloud.com`);
console.log('Sıradaki adım: menüyü tools/ice-aktar.mjs ile doldurun, logoyu venues/' + slug + '/img içine koyun.');
