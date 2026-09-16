// Mekân menü dosyasının (venues/<mekan>/menu.json) biçimi ve doğrulaması.
import { normalizeHex } from '../public/assets/color.js';

export const TAGS = ['populer', 'yeni', 'sef', 'acili', 'vejetaryen', 'vegan', 'glutensiz'];
export const LIMITS = { categories: 80, items: 400, variants: 12 };

export class ValidationError extends Error {
  constructor(message, where) {
    super(message);
    this.where = where || null;
  }
}

const IMG_RE = /^[a-z0-9][a-z0-9._-]{0,120}\.(webp|jpe?g|png|svg)$/i;
const URL_RE = /^https?:\/\/[^\s<>"']+$/i;
const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const PRICE_RE = /^\d[\d.,]{0,11}$/;

const TR_MAP = { ç: 'c', ğ: 'g', ı: 'i', i̇: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };

export function slugify(value, max = 48) {
  return String(value || '')
    .toLocaleLowerCase('tr')
    .replace(/[çğıöşüâîû]|i̇/g, (c) => TR_MAP[c] || c)
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
}

const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const arr = (v) => (Array.isArray(v) ? v : []);
const bool = (v) => v === true || v === 1 || v === '1' || v === 'true';

function stripControls(v, multiline) {
  let out = '';
  for (const ch of v) {
    const code = ch.codePointAt(0);
    if (code === 10 && multiline) out += ch;
    else if (code < 32 || code === 127) out += multiline ? '' : ' ';
    else out += ch;
  }
  return out;
}

function text(v, max, multiline = false) {
  if (typeof v === 'number') v = String(v);
  if (typeof v !== 'string') return '';
  v = v.replace(/\r\n?/g, '\n');
  v = stripControls(v, multiline);
  v = v.trim();
  if (multiline) v = v.replace(/\n{3,}/g, '\n\n');
  return Array.from(v).slice(0, max).join('');
}

function image(v) {
  const s = text(v, 130);
  return IMG_RE.test(s) && !s.includes('..') ? s : '';
}

function url(v, strict, label, where) {
  const s = text(v, 500);
  if (!s) return '';
  if (URL_RE.test(s)) return s;
  if (strict) throw new ValidationError(`${label} geçersiz. Bağlantı https:// ile başlamalı.`, where);
  return '';
}

function price(v, strict, label, where) {
  let p = text(v, 24).replace(/\s*(₺|tl)$/i, '').replace(/\s+/g, '');
  if (p && !PRICE_RE.test(p)) {
    if (strict) throw new ValidationError(`"${label}" fiyatı anlaşılamadı: "${p}". Yalnızca sayı yazın, örneğin 250 veya 99,90.`, where);
    p = '';
  }
  return p;
}

function uniqueId(v, fallback, used) {
  let id = typeof v === 'string' ? v.toLowerCase() : '';
  if (!ID_RE.test(id)) id = slugify(fallback, 40) || 'oge';
  const base = id.slice(0, 56);
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  used.add(id);
  return id;
}

// strict: panelden gelen kayıtta hataları kullanıcıya bildirir.
// strict değilse: dosyadan okurken bozuk alanları sessizce düzeltir.
export function normalizeVenue(input, { strict = false } = {}) {
  const m = obj(input);
  const t = obj(m.theme);
  const c = obj(m.contact);
  const where = (field) => ({ tab: 'mekan', field });

  const out = {
    version: 2,
    updatedAt: text(m.updatedAt, 40),
    name: text(m.name, 80),
    tagline: text(m.tagline, 120),
    logo: image(m.logo),
    theme: {
      primary: normalizeHex(t.primary) || '#c1272d',
      paper: normalizeHex(t.paper),
      imageFit: t.imageFit === 'contain' ? 'contain' : 'cover',
    },
    contact: {
      phone: text(c.phone, 40),
      address: text(c.address, 300, true),
      mapsUrl: url(c.mapsUrl, strict, 'Yol tarifi bağlantısı', where('mapsUrl')),
      instagram: url(c.instagram, strict, 'Instagram bağlantısı', where('instagram')),
      website: url(c.website, strict, 'Web sitesi bağlantısı', where('website')),
      orderUrl: url(c.orderUrl, strict, 'Sipariş bağlantısı', where('orderUrl')),
      orderLabel: text(c.orderLabel, 40),
      wifiName: text(c.wifiName, 64),
      wifiPassword: text(c.wifiPassword, 64),
    },
    note: text(m.note, 600, true),
    currency: text(m.currency, 4) || '₺',
    categories: [],
  };

  if (strict && !out.name) throw new ValidationError('Mekân adı boş olamaz.', where('name'));

  const cats = arr(m.categories);
  if (cats.length > LIMITS.categories) {
    if (strict) throw new ValidationError(`En fazla ${LIMITS.categories} kategori olabilir.`);
    cats.length = LIMITS.categories;
  }

  const usedCat = new Set();
  const usedItem = new Set();
  cats.forEach((rawCat, ci) => {
    const cat = obj(rawCat);
    let name = text(cat.name, 80);
    if (!name) {
      if (strict) throw new ValidationError(`${ci + 1}. kategorinin adı boş. Adını yazın ya da kategoriyi silin.`, { tab: 'menu', c: ci, field: 'name' });
      name = 'Adsız kategori';
    }
    const items = arr(cat.items);
    if (items.length > LIMITS.items) {
      if (strict) throw new ValidationError(`"${name}" kategorisinde en fazla ${LIMITS.items} ürün olabilir.`, { tab: 'menu', c: ci });
      items.length = LIMITS.items;
    }
    const outItems = [];
    items.forEach((rawItem, ii) => {
      const it = obj(rawItem);
      const at = (field) => ({ tab: 'menu', c: ci, i: ii, field });
      const itemName = text(it.name, 120);
      if (!itemName) {
        if (strict) throw new ValidationError(`"${name}" kategorisinde adı boş bir ürün var. Adını yazın ya da ürünü silin.`, at('name'));
        return;
      }
      const variants = [];
      arr(it.variants).slice(0, LIMITS.variants).forEach((rawV, vi) => {
        const v = obj(rawV);
        const vName = text(v.name, 40);
        const vPrice = price(v.price, strict, `${itemName} / ${vName || 'seçenek'}`, { ...at('variant'), v: vi });
        if (!vName && !vPrice) return;
        if (!vName) {
          if (strict) throw new ValidationError(`"${itemName}" ürününde adı boş bir seçenek var.`, { ...at('variant'), v: vi });
          return;
        }
        variants.push({ name: vName, price: vPrice });
      });
      outItems.push({
        id: uniqueId(it.id, itemName, usedItem),
        name: itemName,
        desc: text(it.desc, 800, true),
        price: price(it.price, strict, itemName, at('price')),
        variants,
        image: image(it.image),
        tags: [...new Set(arr(it.tags).filter((x) => TAGS.includes(x)))],
        allergens: text(it.allergens, 200),
        soldOut: bool(it.soldOut),
        hidden: bool(it.hidden),
      });
    });
    out.categories.push({
      id: uniqueId(cat.id, name, usedCat),
      name,
      desc: text(cat.desc, 200),
      layout: cat.layout === 'compact' ? 'compact' : 'photo',
      hidden: bool(cat.hidden),
      items: outItems,
    });
  });

  return out;
}

// Müşteriye giden menü: gizli kategori ve ürünler çıkarılır.
export function publicView(venue) {
  const categories = venue.categories
    .filter((c) => !c.hidden)
    .map((c) => ({
      id: c.id,
      name: c.name,
      desc: c.desc,
      layout: c.layout,
      items: c.items.filter((i) => !i.hidden).map(({ hidden, ...rest }) => rest),
    }))
    .filter((c) => c.items.length > 0);

  return {
    name: venue.name,
    tagline: venue.tagline,
    logo: venue.logo,
    imageFit: venue.theme.imageFit,
    contact: venue.contact,
    note: venue.note,
    currency: venue.currency,
    categories,
  };
}
