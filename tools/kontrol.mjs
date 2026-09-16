#!/usr/bin/env node
// Yayına almadan önce bütün mekân dosyalarını denetler.
// Kullanım: node tools/kontrol.mjs [klasör]   (varsayılan: venues)

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeVenue, ValidationError } from '../lib/schema.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = path.resolve(ROOT, process.argv[2] || 'venues');
let failed = false;

const entries = (await fs.readdir(base, { withFileTypes: true })).filter((e) => e.isDirectory());
if (!entries.length) console.log('Hiç mekân yok.');

for (const e of entries) {
  const dir = path.join(base, e.name);
  const problems = [];
  const warnings = [];
  let raw;
  try {
    raw = JSON.parse((await fs.readFile(path.join(dir, 'menu.json'), 'utf8')).replace(/^\uFEFF/, ''));
  } catch (err) {
    console.log(`✗ ${e.name}: menu.json okunamadı (${err.message})`);
    failed = true;
    continue;
  }

  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(e.name)) problems.push('Klasör adı alt alan adı olarak kullanılamaz. Yalnızca küçük harf, rakam ve tire olmalı.');

  let menu;
  try {
    menu = normalizeVenue(raw, { strict: true });
  } catch (err) {
    if (!(err instanceof ValidationError)) throw err;
    problems.push(err.message);
    menu = normalizeVenue(raw);
  }

  const images = new Set();
  try {
    for (const f of await fs.readdir(path.join(dir, 'img'))) images.add(f);
  } catch {
    /* img klasörü yok */
  }
  if (menu.logo && !images.has(menu.logo)) problems.push(`Logo dosyası yok: img/${menu.logo}`);
  if (!menu.logo) warnings.push('Logo yok');

  let items = 0;
  let photos = 0;
  let prices = 0;
  for (const c of menu.categories) {
    for (const it of c.items) {
      items++;
      if (it.price || it.variants.some((v) => v.price)) prices++;
      if (it.image) {
        if (images.has(it.image)) photos++;
        else problems.push(`Fotoğraf dosyası yok: img/${it.image} (${it.name})`);
      }
    }
  }
  if (!items) warnings.push('Menüde ürün yok');

  const mark = problems.length ? '✗' : '✓';
  console.log(`${mark} ${e.name} · ${menu.name} · ${menu.categories.length} kategori · ${items} ürün · ${photos} fotoğraf · ${prices} fiyatlı · renk ${menu.theme.primary}`);
  warnings.forEach((w) => console.log(`    uyarı: ${w}`));
  problems.forEach((p) => console.log(`    hata: ${p}`));
  if (problems.length) failed = true;
}

process.exit(failed ? 1 : 0);
