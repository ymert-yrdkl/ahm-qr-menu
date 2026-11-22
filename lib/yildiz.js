// Yıldız görünümü (menu-yildiz.html): mekânın menu.json'unu sayfanın beklediği biçime çevirir ve renkleri hesaplar.
// Klasik görünüm bu dosyayı kullanmaz.
import { parseHex, toHex, mix, contrast } from '../public/assets/color.js';

const ZEMIN = [250, 250, 248];       // şablonun açık zemini (#FAFAF8)
const ZEMIN_GECE = [29, 29, 28];     // şablonun gece zemini (#1D1D1C)
const BEYAZ = [255, 255, 255];

const ETIKET = { populer: 'Çok satan', yeni: 'Yeni', acili: 'Acılı', vejetaryen: 'Vejetaryen', vegan: 'Vegan', glutensiz: 'Glutensiz' };
// Şablonun tanıdığı alerjen kodları (İngilizcesi şablonda). Panelde serbest metin yazılır: "gluten, süt".
const ALERJEN = { gluten: 'gluten', 'kabuklu deniz ürünü': 'kabuklu', yumurta: 'yumurta', balık: 'balik', 'yer fıstığı': 'yerfistigi',
  soya: 'soya', süt: 'sut', kuruyemiş: 'kuruyemis', kereviz: 'kereviz', hardal: 'hardal', susam: 'susam', sülfit: 'sulfit',
  'acı bakla': 'acibakla', yumuşakça: 'yumusakca' };

/* ---------- renk ---------- */

function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb([h, s, l]) {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

const withL = (rgb, l) => {
  const [h, s] = rgbToHsl(rgb);
  return hslToRgb([h, s, Math.max(0, Math.min(1, l))]);
};

// Açık modda: beyaz yazılı düğme ve zemin üstü metin en az 4,6:1. Gece modunda: metin en az 4,8:1.
// Logonun rengi zaten yetiyorsa olduğu gibi kalır.
export function yildizPalette(primary) {
  const brand = parseHex(primary) || [193, 39, 45];
  const l0 = rgbToHsl(brand)[2];
  let l = l0;
  let vurgu = brand;
  while ((contrast(vurgu, BEYAZ) < 4.6 || contrast(vurgu, ZEMIN) < 4.6) && l > 0) vurgu = withL(brand, (l -= 0.005));
  l = l0;
  let geceYazi = brand;
  while (contrast(geceYazi, ZEMIN_GECE) < 4.8 && l < 1) geceYazi = withL(brand, (l += 0.005));
  return {
    vurgu: toHex(vurgu),
    vurguAcik: toHex(mix(ZEMIN, brand, 0.16)),
    geceYazi: toHex(geceYazi),
    geceAcik: toHex(mix(ZEMIN_GECE, brand, 0.16)),
  };
}

/* ---------- veri ---------- */

// "1.100" → 1100, "99,90" → 99.9, "250" → 250. Anlaşılmazsa null (şablon fiyatı boş gösterir).
export function priceNumber(p) {
  let s = String(p || '').trim();
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function instagramHandle(u) {
  const m = /instagram\.com\/([A-Za-z0-9._]{1,30})/i.exec(String(u || ''));
  return m ? m[1] : '';
}

const imgUrl = (base, name) => (name ? `${base}/img/${encodeURIComponent(name)}` : '');

function itemView(it, base, currency) {
  const vs = (it.variants || []).filter((v) => v.name);
  const prices = vs.map((v) => priceNumber(v.price)).filter((n) => n != null);
  const fiyat = priceNumber(it.price) ?? (prices.length ? Math.min(...prices) : null);
  // Şablonda seçenek yok: seçenekler açıklamanın sonuna yazılır.
  const secenek = vs.map((v) => (v.price ? `${v.name} ${v.price} ${currency}` : v.name)).join(' · ');
  const u = {
    ad: it.name,
    aciklama: [it.desc, secenek].filter(Boolean).join('. '),
    fiyat,
  };
  if (it.image) u.foto = imgUrl(base, it.image);
  if (it.tags.includes('sef')) u.sef = true;
  const etiket = it.tags.map((t) => ETIKET[t]).filter(Boolean);
  if (etiket.length) u.etiket = etiket;
  if (it.soldOut) u.tukendi = true;
  if (it.allergens) {
    u.alerjen = it.allergens.split(/[,;]/).map((a) => a.trim()).filter(Boolean)
      .map((a) => ALERJEN[a.toLocaleLowerCase('tr')] || a);
  }
  const en = {};
  if (it.en && it.en.name) en.ad = it.en.name;
  if (it.en && it.en.desc) en.aciklama = it.en.desc;
  if (Object.keys(en).length) u.dil = { en };
  return u;
}

// publicView ile aynı süzgeç: gizli kategori ve ürünler çıkmaz.
export function yildizData(venue, slug, base) {
  const cur = venue.currency || '₺';
  const menu = venue.categories
    .filter((c) => !c.hidden)
    .map((c) => {
      const k = { ad: c.name, urunler: c.items.filter((i) => !i.hidden).map((i) => itemView(i, base, cur)) };
      if (c.en && c.en.name) k.dil = { en: c.en.name };
      return k;
    })
    .filter((k) => k.urunler.length);

  const cover = yildizCover(venue);
  const c = venue.contact;
  const en = venue.i18n && venue.i18n.en ? venue.i18n.en : {};
  const dilEn = {};
  if (en.featuredTitle) dilEn.oneri = en.featuredTitle;
  if (en.featuredLabel) dilEn.oneri_tekil = en.featuredLabel;
  if (en.note) dilEn.not_ = en.note;

  return {
    slug,
    ad: venue.name,
    tur: venue.tagline,
    oneri: venue.featured.title || 'Şefin önerileri',
    oneri_tekil: venue.featured.label || 'Şefin önerisi',
    wifi: c.wifiName || c.wifiPassword ? { ag: c.wifiName, sifre: c.wifiPassword } : null,
    instagram: instagramHandle(c.instagram) || null,
    telefon: c.phone || null,
    adres: c.address.replace(/\s*\n\s*/g, ', '),
    saatler: venue.hours,
    yorum: c.reviewUrl || '',
    harita: c.mapsUrl || '',
    guncel: (venue.updatedAt || new Date().toISOString()).slice(0, 10),
    hero_foto: imgUrl(base, cover),
    hero_video: null,
    menu,
    not_: venue.note,
    diller: venue.languages,
    dil: Object.keys(dilEn).length ? { en: dilEn } : {},
  };
}

// Kapak: panelde yüklenen kapak, yoksa öne çıkan ürünün ya da ilk ürünün fotoğrafı.
export function yildizCover(venue) {
  const all = venue.categories.filter((c) => !c.hidden).flatMap((c) => c.items.filter((i) => !i.hidden));
  return venue.cover || (all.find((i) => i.image && i.tags.includes('sef')) || all.find((i) => i.image) || {}).image || '';
}
