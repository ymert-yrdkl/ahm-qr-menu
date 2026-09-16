// Mekân renginden bütün tema tonlarını üretir.
// Hem sunucu (server.js) hem panel (tarayıcı) aynı dosyayı kullanır.

const DEFAULT_PAPER = [250, 248, 244];
const DEFAULT_BRAND = [193, 39, 45];
const DARK_INK = [27, 22, 20];
const LIGHT_INK = [245, 241, 234];
const WHITE = [255, 255, 255];
const BLACK = [0, 0, 0];

export function parseHex(value) {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(String(value || '').trim());
  if (!m) return null;
  let s = m[1];
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
}

export function toHex(rgb) {
  return '#' + rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}

export function normalizeHex(value) {
  const rgb = parseHex(value);
  return rgb ? toHex(rgb) : '';
}

// t = 0 ise a, t = 1 ise b
export function mix(a, b, t) {
  return a.map((v, i) => v + (b[i] - v) * t);
}

function channel(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function luminance(rgb) {
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

export function contrast(a, b) {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// Renk zemin üstünde yeterince okunmuyorsa hedef renge doğru kaydırır.
function ensureContrast(fg, bg, min, toward) {
  let c = fg;
  for (let t = 0.05; contrast(c, bg) < min && t <= 1.0001; t += 0.05) c = mix(fg, toward, t);
  return c;
}

export function buildTheme(theme = {}) {
  const paper = parseHex(theme.paper) || DEFAULT_PAPER;
  const dark = luminance(paper) < 0.3;
  const ink = dark ? LIGHT_INK : DARK_INK;
  const brand = parseHex(theme.primary) || DEFAULT_BRAND;
  const onBrand = contrast(WHITE, brand) >= contrast(DARK_INK, brand) ? WHITE : DARK_INK;
  const brandInk = ensureContrast(brand, paper, 4.5, dark ? WHITE : BLACK);
  const brandDeep = mix(brand, onBrand === WHITE ? BLACK : WHITE, 0.16);
  const muted = ensureContrast(mix(ink, paper, 0.48), paper, 4.6, ink);
  const soft = ensureContrast(mix(ink, paper, 0.28), paper, 7, ink);
  const line = mix(paper, ink, dark ? 0.18 : 0.11);
  const surface = dark ? mix(paper, WHITE, 0.06) : WHITE;
  const wash = mix(paper, brand, dark ? 0.16 : 0.07);

  return {
    scheme: dark ? 'dark' : 'light',
    paper: toHex(paper),
    ink: toHex(ink),
    soft: toHex(soft),
    muted: toHex(muted),
    line: toHex(line),
    surface: toHex(surface),
    brand: toHex(brand),
    onBrand: toHex(onBrand),
    brandInk: toHex(brandInk),
    brandDeep: toHex(brandDeep),
    wash: toHex(wash),
    brandReadable: contrast(brand, paper) >= 3,
  };
}

export function themeToCss(t) {
  return [
    `color-scheme:${t.scheme}`,
    `--paper:${t.paper}`,
    `--ink:${t.ink}`,
    `--soft:${t.soft}`,
    `--muted:${t.muted}`,
    `--line:${t.line}`,
    `--surface:${t.surface}`,
    `--brand:${t.brand}`,
    `--on-brand:${t.onBrand}`,
    `--brand-ink:${t.brandInk}`,
    `--brand-deep:${t.brandDeep}`,
    `--wash:${t.wash}`,
  ].join(';');
}
