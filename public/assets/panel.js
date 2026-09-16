// AHM Cloud QR Menü paneli
import { buildTheme, themeToCss, parseHex, toHex, contrast } from './color.js';

const TAGS = window.QRM.TAGS;
const root = document.getElementById('root');
const SLUG = document.body.dataset.slug || '';
const BASE = document.body.dataset.base || '';

const S = {
  menu: null,
  base: '',
  role: '',
  hasVenuePassword: false,
  dirty: false,
  saving: false,
  tab: 'menu',
  cat: 0,
  open: new Set(),
  onlyEmpty: false,
  qrUrl: '',
  qrFormat: 'A6',
};

/* ---------- yardımcılar ---------- */

function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (k === 'value') e.value = v;
      else if (k === 'checked') e.checked = true;
      else e.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    e.append(kid instanceof Node ? kid : String(kid));
  }
  return e;
}

let toastTimer = 0;
function toast(message, bad = false) {
  const t = document.getElementById('toast');
  t.textContent = message;
  t.className = 'toast' + (bad ? ' bad' : '');
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, bad ? 7000 : 3500);
}

const TR = { ç: 'c', ğ: 'g', ı: 'i', İ: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'c', Ğ: 'g', Ö: 'o', Ş: 's', Ü: 'u' };
function slug(s) {
  return String(s || '').replace(/[çğıİöşüÇĞÖŞÜ]/g, (c) => TR[c]).toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'oge';
}
const uid = (base) => `${slug(base)}-${Math.random().toString(36).slice(2, 6)}`;
const imgUrl = (name) => BASE + '/img/' + encodeURIComponent(name);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function fmtDate(iso) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function download(blob, filename) {
  const a = h('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

function focusSel(selector) {
  requestAnimationFrame(() => {
    const el = document.querySelector(selector);
    if (!el) return;
    el.scrollIntoView({ block: 'center' });
    el.focus({ preventScroll: true });
    if (typeof el.select === 'function') el.select();
  });
}

const priceMissing = (it) => !String(it.price || '').trim() && !(it.variants || []).some((v) => String(v.price || '').trim());
const allItems = () => (S.menu ? S.menu.categories.flatMap((c) => c.items) : []);

/* ---------- sunucu ---------- */

async function api(path, { method = 'GET', json, body, headers = {} } = {}) {
  const opt = { method, credentials: 'same-origin', headers: { ...headers } };
  if (method !== 'GET') opt.headers['X-QRM'] = '1';
  if (json !== undefined) {
    opt.headers['Content-Type'] = 'application/json';
    opt.body = JSON.stringify(json);
  }
  if (body !== undefined) opt.body = body;
  let res;
  try {
    res = await fetch(BASE + '/panel/api/' + path, opt);
  } catch {
    throw new Error('Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.');
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok || !data || data.ok === false) {
    const err = new Error((data && data.error) || `İşlem tamamlanamadı (${res.status}).`);
    err.status = res.status;
    err.where = data && data.where;
    if (res.status === 401 && path !== 'login' && path !== 'password') {
      renderLogin('Oturumunuz kapandı. Tekrar giriş yapın. Kaydetmediğiniz değişiklikler duruyor.');
    }
    throw err;
  }
  return data;
}

/* ---------- durum ---------- */

function markDirty() {
  S.dirty = true;
  updateState();
}

function updateState() {
  const st = document.getElementById('state');
  const save = document.getElementById('save');
  if (!st || !save || !S.menu) return;
  if (S.saving) {
    st.className = 'state dirty';
    st.textContent = 'Kaydediliyor…';
  } else if (S.dirty) {
    st.className = 'state dirty';
    st.textContent = 'Kaydedilmemiş değişiklik var';
  } else {
    st.className = 'state';
    st.textContent = S.menu.updatedAt ? `Kaydedildi · ${fmtDate(S.menu.updatedAt)}` : 'Henüz panelden kaydedilmedi';
  }
  save.disabled = !S.dirty || S.saving;
  save.textContent = S.saving ? 'Kaydediliyor…' : 'Kaydet';
  const n = allItems().filter(priceMissing).length;
  document.querySelectorAll('[data-empty-count]').forEach((el) => {
    el.textContent = n ? `${n} ürünün fiyatı boş` : 'Bütün fiyatlar girildi';
    el.className = n ? 'warn' : '';
  });
}

async function save() {
  if (!S.dirty || S.saving || !S.menu) return;
  S.saving = true;
  updateState();
  const send = (base) => api('menu', { method: 'PUT', json: { menu: S.menu, base } });
  try {
    let r;
    try {
      r = await send(S.base);
    } catch (e) {
      if (e.status !== 409) throw e;
      const ok = confirm('Menü siz paneli açtıktan sonra başka bir yerden kaydedilmiş.\n\nTamam derseniz sizin ekrandaki menü kaydedilir ve diğer değişiklikler kaybolur. Emin değilseniz İptal deyip Yedek bölümünden menüyü indirin, sonra sayfayı yenileyin.');
      if (!ok) throw new Error('Kaydedilmedi.');
      r = await send(null);
    }
    S.menu = r.menu;
    S.base = r.menu.updatedAt || '';
    S.dirty = false;
    S.saving = false;
    render();
    toast('Kaydedildi. Menü güncellendi.');
  } catch (e) {
    S.saving = false;
    updateState();
    if (e.status === 401) return;
    toast(e.message, true);
    if (e.where) focusWhere(e.where);
  }
}

function focusWhere(w) {
  if (w.tab === 'mekan') {
    S.tab = 'mekan';
    render();
    focusSel(`[data-path="${w.field}"]`);
    return;
  }
  S.tab = 'menu';
  if (typeof w.c === 'number') S.cat = w.c;
  const cat = S.menu.categories[w.c];
  if (cat && typeof w.i === 'number' && cat.items[w.i]) S.open.add(cat.items[w.i].id);
  render();
  let sel = '[data-path="cat-name"]';
  if (typeof w.i === 'number') {
    if (w.field === 'price') sel = `[data-path="price:${w.c}:${w.i}"]`;
    else if (w.field === 'variant') sel = `[data-path="vn:${w.c}:${w.i}:${w.v}"]`;
    else sel = `[data-path="name:${w.c}:${w.i}"]`;
  }
  focusSel(sel);
}

async function logout() {
  if (S.dirty && !confirm('Kaydedilmemiş değişiklikler var. Yine de çıkılsın mı?')) return;
  try {
    await api('logout', { method: 'POST' });
  } catch {
    /* oturum zaten kapalı olabilir */
  }
  S.menu = null;
  S.dirty = false;
  renderLogin('Çıkış yapıldı.');
}

/* ---------- form parçaları ---------- */

function field(label, obj, key, o = {}) {
  const inp = o.multiline
    ? h('textarea', { rows: o.rows || 3, maxlength: o.max || 600, placeholder: o.placeholder, 'data-path': o.path, 'aria-label': o.bare ? label : null })
    : h('input', { type: o.type || 'text', maxlength: o.max || 200, placeholder: o.placeholder, inputmode: o.inputmode, autocomplete: 'off', 'data-path': o.path, 'aria-label': o.bare ? label : null });
  inp.value = obj[key] ?? '';
  inp.addEventListener('input', () => {
    obj[key] = inp.value;
    markDirty();
    if (o.onInput) o.onInput(inp.value);
  });
  if (o.bare) return inp;
  return h('label', { class: 'f' + (o.wide ? ' wide' : '') }, h('span', { text: label }), inp, o.hint ? h('small', { text: o.hint }) : null);
}

function priceInput(obj, key, o = {}) {
  const inp = h('input', {
    type: 'text', class: 'price', inputmode: 'decimal', maxlength: 12, autocomplete: 'off',
    placeholder: o.placeholder || 'Fiyat', 'data-path': o.path, 'aria-label': o.label ? `${o.label} fiyatı` : 'Fiyat',
  });
  inp.value = obj[key] ?? '';
  inp.addEventListener('input', () => {
    obj[key] = inp.value.trim();
    markDirty();
  });
  return h('span', { class: 'price-wrap', 'data-cur': S.menu.currency || '₺' }, inp);
}

function check(label, obj, key, onChange) {
  const i = h('input', { type: 'checkbox', checked: !!obj[key] });
  i.addEventListener('change', () => {
    obj[key] = i.checked;
    markDirty();
    if (onChange) onChange(i.checked);
  });
  return h('label', { class: 'check' }, i, label);
}

function selectField(label, obj, key, options, onChange) {
  const s = h('select', {}, options.map(([v, t]) => h('option', { value: v, text: t })));
  s.value = obj[key];
  s.addEventListener('change', () => {
    obj[key] = s.value;
    markDirty();
    if (onChange) onChange(s.value);
  });
  return h('label', { class: 'f' }, h('span', { text: label }), s);
}

const smallBtn = (text, onclick, extra = '') => h('button', { type: 'button', class: `btn sm ${extra}`.trim(), text, onclick });

function brandLine(sub) {
  const m = S.menu;
  const logo = m ? (m.logo ? imgUrl(m.logo) : '') : document.body.dataset.logo;
  const name = (m && m.name) || document.body.dataset.name || SLUG;
  return h('div', { class: 'brandline' }, logo ? h('img', { src: logo, alt: '' }) : null, h('span', {}, h('b', { text: name }), h('small', { text: sub })));
}

/* ---------- fotoğraf ---------- */

async function prepareImage(file, keepAlpha) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Yalnızca JPG, PNG veya WEBP fotoğraf yükleyebilirsiniz.');
  const MAX = 1400;
  let bmp;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    return file;
  }
  const scale = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
  if (scale === 1 && file.size <= 900 * 1024) {
    bmp.close?.();
    return file;
  }
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  const toBlob = (type, q) => new Promise((res) => c.toBlob(res, type, q));
  let blob = await toBlob('image/webp', 0.86);
  if (!blob || blob.type !== 'image/webp') blob = await toBlob(keepAlpha ? 'image/png' : 'image/jpeg', 0.86);
  return blob && blob.size < file.size ? blob : file;
}

async function uploadImage(file, hint, keepAlpha) {
  const blob = await prepareImage(file, keepAlpha);
  if (blob.size > 8 * 1024 * 1024) throw new Error('Fotoğraf 8 MB’den büyük. Daha küçük bir fotoğraf seçin.');
  const r = await api('upload?ad=' + encodeURIComponent(hint || 'foto'), {
    method: 'POST', body: blob, headers: { 'Content-Type': blob.type || 'application/octet-stream' },
  });
  return r.file;
}

function photoCell(obj, key, hint, o = {}) {
  const box = h('div', { class: 'box' });
  const input = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', hidden: true });
  const up = h('button', { type: 'button', class: 'btn sm', onclick: () => input.click() });
  const rm = smallBtn('Kaldır', () => {
    obj[key] = '';
    markDirty();
    paint();
    if (o.onChange) o.onChange();
  }, 'danger');
  function paint() {
    box.textContent = '';
    if (obj[key]) box.append(h('img', { src: imgUrl(obj[key]), alt: '' }));
    else box.textContent = o.emptyText || 'Fotoğraf yok';
    up.textContent = obj[key] ? 'Değiştir' : 'Fotoğraf yükle';
    rm.hidden = !obj[key];
  }
  input.addEventListener('change', async () => {
    const file = input.files[0];
    input.value = '';
    if (!file) return;
    up.disabled = true;
    up.textContent = 'Yükleniyor…';
    try {
      obj[key] = await uploadImage(file, hint(), o.keepAlpha);
      markDirty();
      toast('Fotoğraf yüklendi. Menüde görünmesi için Kaydet’e basın.');
      if (o.onChange) o.onChange();
    } catch (e) {
      if (e.status !== 401) toast(e.message, true);
    } finally {
      up.disabled = false;
      paint();
    }
  });
  paint();
  return h('div', { class: 'photo' }, box, up, rm, input);
}

/* ---------- giriş ---------- */

function renderLogin(message) {
  root.textContent = '';
  const pw = h('input', { type: 'password', autocomplete: 'current-password', id: 'pw' });
  const err = h('p', { class: 'err', role: 'alert', text: message || '' });
  const btn = h('button', { type: 'submit', class: 'btn primary', text: 'Giriş yap' });
  const form = h('form', {
    class: 'login-card',
    novalidate: true,
    onsubmit: async (e) => {
      e.preventDefault();
      if (!pw.value) {
        err.textContent = 'Şifrenizi yazın.';
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Giriş yapılıyor…';
      try {
        await api('login', { method: 'POST', json: { password: pw.value } });
        await loadSession();
        if (S.menu) render();
        else await loadMenu();
      } catch (x) {
        err.textContent = x.message;
        btn.disabled = false;
        btn.textContent = 'Giriş yap';
        pw.select();
      }
    },
  },
  brandLine('Menü paneli'),
  h('h1', { text: 'Menü paneli' }),
  h('p', { class: 'muted', text: 'Ürünleri, fiyatları, fotoğrafları, renkleri ve QR kodu buradan yönetin.' }),
  h('label', { class: 'f' }, h('span', { text: 'Şifre' }), pw),
  err,
  btn);
  root.append(h('div', { class: 'login' }, form));
  setTimeout(() => pw.focus(), 0);
}

async function loadSession() {
  const s = await api('session');
  S.role = s.role;
  S.hasVenuePassword = s.hasVenuePassword;
  return s;
}

async function loadMenu() {
  const r = await api('menu');
  S.menu = r.menu;
  S.base = r.menu.updatedAt || '';
  S.role = r.role || S.role;
  S.dirty = false;
  render();
}

/* ---------- ana görünüm ---------- */

const TABS = [
  ['menu', 'Menü'],
  ['fiyat', 'Fiyatlar'],
  ['mekan', 'Mekân ve renkler'],
  ['qr', 'QR kod'],
  ['yedek', 'Yedek'],
];

function render() {
  const y = window.scrollY;
  root.textContent = '';
  const views = { menu: viewMenu, fiyat: viewPrices, mekan: viewVenue, qr: viewQr, yedek: viewBackup };
  root.append(
    h('header', { class: 'top' },
      h('div', { class: 'in' },
        brandLine(S.role === 'admin' ? 'Yönetici' : 'Menü paneli'),
        h('span', { class: 'state', id: 'state', role: 'status' }),
        h('a', { class: 'btn', href: BASE + '/', target: '_blank', rel: 'noopener', text: 'Menüyü aç' }),
        h('button', { class: 'btn primary', type: 'button', id: 'save', text: 'Kaydet', onclick: save }),
        h('button', { class: 'btn', type: 'button', text: 'Çıkış', onclick: logout })),
      h('nav', { class: 'tabs', role: 'tablist', 'aria-label': 'Panel bölümleri' },
        TABS.map(([k, label]) => h('button', {
          class: 'tab', type: 'button', role: 'tab', 'aria-selected': String(S.tab === k), text: label,
          onclick: () => { S.tab = k; render(); window.scrollTo(0, 0); },
        })))),
    h('main', { class: 'view', id: 'view' }, views[S.tab]()),
  );
  updateState();
  window.scrollTo(0, y);
}

/* ---------- Menü sekmesi ---------- */

function viewMenu() {
  const cats = S.menu.categories;
  if (S.cat >= cats.length) S.cat = Math.max(0, cats.length - 1);

  const aside = h('aside', { class: 'catlist', 'aria-label': 'Kategoriler' });
  cats.forEach((c, i) => {
    const miss = c.items.filter(priceMissing).length;
    aside.append(h('button', {
      type: 'button', class: 'catbtn', 'aria-current': String(i === S.cat),
      onclick: () => { S.cat = i; render(); if (window.innerWidth < 880) document.getElementById('catmain')?.scrollIntoView(); },
    },
    h('span', { class: 'cn' }, h('span', { id: `catlabel-${i}`, text: c.name || 'Adsız kategori' }), c.hidden ? h('em', { text: 'Gizli' }) : null),
    h('small', {}, `${c.items.length} ürün`, miss ? h('b', { text: ` · ${miss} fiyatsız` }) : null)));
  });
  aside.append(h('button', {
    type: 'button', class: 'btn block', text: 'Kategori ekle',
    onclick: () => {
      cats.push({ id: uid('kategori'), name: 'Yeni kategori', desc: '', layout: 'photo', hidden: false, items: [] });
      S.cat = cats.length - 1;
      markDirty();
      render();
      focusSel('[data-path="cat-name"]');
    },
  }));

  const main = h('section', { id: 'catmain' });
  if (!cats.length) main.append(h('p', { class: 'empty', text: 'Henüz kategori yok. “Kategori ekle” ile başlayın.' }));
  else main.append(...categoryEditor(cats[S.cat], S.cat));

  return h('div', {},
    h('div', { class: 'summary' },
      h('p', {}, h('strong', { text: `${cats.length} kategori · ${allItems().length} ürün` }), ' · ', h('span', { 'data-empty-count': '' }))),
    h('div', { class: 'split' }, aside, main));
}

function categoryEditor(c, ci) {
  const cats = S.menu.categories;
  const move = (d) => {
    const j = ci + d;
    if (j < 0 || j >= cats.length) return;
    [cats[ci], cats[j]] = [cats[j], cats[ci]];
    S.cat = j;
    markDirty();
    render();
  };

  const head = h('div', { class: 'card' },
    h('div', { class: 'grid2' },
      field('Kategori adı', c, 'name', { max: 80, path: 'cat-name', onInput: (v) => { const el = document.getElementById(`catlabel-${ci}`); if (el) el.textContent = v || 'Adsız kategori'; } }),
      field('Kısa açıklama', c, 'desc', { max: 200, placeholder: 'İsteğe bağlı' })),
    h('div', { class: 'acts' },
      selectField('Görünüm', c, 'layout', [['photo', 'Fotoğraflı liste'], ['compact', 'Kısa liste (içecek, sos)']]),
      check('Menüde gizle', c, 'hidden', () => render()),
      h('span', { class: 'grow' }),
      smallBtn('Yukarı taşı', () => move(-1)),
      smallBtn('Aşağı taşı', () => move(1)),
      smallBtn('Kategoriyi sil', () => {
        if (!confirm(`"${c.name || 'Adsız kategori'}" kategorisi ve içindeki ${c.items.length} ürün silinsin mi?`)) return;
        cats.splice(ci, 1);
        S.cat = Math.max(0, ci - 1);
        markDirty();
        render();
      }, 'danger')));

  const allOpen = c.items.length > 0 && c.items.every((it) => S.open.has(it.id));
  const itemsHead = h('div', { class: 'items-head' },
    h('h2', {}, 'Ürünler', h('small', { text: `${c.items.length} ürün` })),
    h('div', { class: 'acts' },
      c.items.length ? smallBtn(allOpen ? 'Hepsini kapat' : 'Hepsini aç', () => {
        c.items.forEach((it) => (allOpen ? S.open.delete(it.id) : S.open.add(it.id)));
        render();
      }) : null,
      h('button', {
        type: 'button', class: 'btn primary', text: 'Ürün ekle',
        onclick: () => {
          const it = { id: uid('urun'), name: '', desc: '', price: '', variants: [], image: '', tags: [], allergens: '', soldOut: false, hidden: false };
          c.items.push(it);
          S.open.add(it.id);
          markDirty();
          render();
          focusSel(`[data-path="name:${ci}:${c.items.length - 1}"]`);
        },
      })));

  const list = h('div', {});
  c.items.forEach((it, ii) => list.append(itemEditor(c, ci, it, ii)));
  if (!c.items.length) list.append(h('p', { class: 'empty', text: 'Bu kategoride henüz ürün yok. “Ürün ekle” ile ekleyin.' }));

  return [head, itemsHead, list];
}

function itemEditor(c, ci, it, ii) {
  const open = S.open.has(it.id);
  const row = h('article', { class: `it${open ? ' open' : ''}${it.hidden ? ' is-hidden' : ''}` });
  const nameB = h('b', { text: it.name || 'Adsız ürün' });

  const sum = h('div', { class: 'it-sum' },
    h('div', { class: 'it-th' }, it.image ? h('img', { src: imgUrl(it.image), alt: '' }) : '—'),
    h('div', { class: 'it-nm' }, nameB,
      h('small', {},
        it.hidden ? h('em', { text: 'Gizli' }) : null,
        it.variants.length ? h('em', { text: `${it.variants.length} seçenek` }) : null,
        it.desc || '')),
    h('div', { class: 'it-pr' }, priceInput(it, 'price', { path: `price:${ci}:${ii}`, label: it.name, placeholder: it.variants.length ? 'Ana fiyat' : 'Fiyat' })),
    h('div', { class: 'it-so' }, check('Tükendi', it, 'soldOut')),
    h('div', { class: 'it-tg' }, smallBtn(open ? 'Kapat' : 'Düzenle', () => {
      if (open) S.open.delete(it.id);
      else S.open.add(it.id);
      render();
    })));
  row.append(sum);
  if (!open) return row;

  const cats = S.menu.categories;
  const move = (d) => {
    const j = ii + d;
    if (j < 0 || j >= c.items.length) return;
    [c.items[ii], c.items[j]] = [c.items[j], c.items[ii]];
    markDirty();
    render();
  };

  const tags = h('div', {}, h('span', { class: 'lbl', text: 'Etiketler' }),
    h('div', { class: 'tags' }, Object.entries(TAGS).map(([key, label]) => {
      const i = h('input', { type: 'checkbox', checked: it.tags.includes(key) });
      i.addEventListener('change', () => {
        it.tags = i.checked ? [...new Set([...it.tags, key])] : it.tags.filter((t) => t !== key);
        markDirty();
      });
      return h('label', { class: 'check' }, i, label);
    })));

  const vars = h('div', { class: 'vars' }, h('span', { class: 'lbl', text: 'Seçenekler (boy, porsiyon, adet)' }));
  it.variants.forEach((v, vi) => {
    vars.append(h('div', { class: 'var' },
      field('Seçenek adı', v, 'name', { bare: true, max: 40, placeholder: 'Örn. Büyük boy', path: `vn:${ci}:${ii}:${vi}` }),
      priceInput(v, 'price', { path: `v:${ci}:${ii}:${vi}`, label: `${it.name} ${v.name}` }),
      smallBtn('Sil', () => { it.variants.splice(vi, 1); markDirty(); render(); }, 'danger')));
  });
  vars.append(h('div', { class: 'acts' },
    smallBtn('Seçenek ekle', () => {
      it.variants.push({ name: '', price: '' });
      markDirty();
      render();
      focusSel(`[data-path="vn:${ci}:${ii}:${it.variants.length - 1}"]`);
    }),
    it.variants.length ? h('span', { class: 'hint', text: 'Seçenekli üründe fiyatı her seçeneğe ayrı yazın. Ana fiyat boş kalabilir.' }) : null));

  const moveSel = h('select', { 'aria-label': 'Başka kategoriye taşı' },
    h('option', { value: '', text: 'Başka kategoriye taşı…' }),
    cats.map((k, ki) => (ki === ci ? null : h('option', { value: String(ki), text: k.name || 'Adsız kategori' }))));
  moveSel.addEventListener('change', () => {
    const target = cats[Number(moveSel.value)];
    if (!target) return;
    c.items.splice(ii, 1);
    target.items.push(it);
    markDirty();
    render();
    toast(`"${it.name || 'Ürün'}" ${target.name} kategorisine taşındı.`);
  });

  row.append(h('div', { class: 'it-edit' },
    photoCell(it, 'image', () => it.name, { onChange: () => render() }),
    h('div', { class: 'stack' },
      field('Ürün adı', it, 'name', { max: 120, path: `name:${ci}:${ii}`, onInput: (v) => { nameB.textContent = v || 'Adsız ürün'; } }),
      field('Açıklama / içindekiler', it, 'desc', { multiline: true, rows: 3, max: 800 }),
      vars,
      tags,
      field('Alerjen bilgisi', it, 'allergens', { max: 200, placeholder: 'Örn. gluten, süt, yumurta' }),
      h('div', { class: 'acts' },
        check('Menüde gizle', it, 'hidden', () => render()),
        h('span', { class: 'grow' }),
        moveSel,
        smallBtn('Yukarı', () => move(-1)),
        smallBtn('Aşağı', () => move(1)),
        smallBtn('Sil', () => {
          if (!confirm(`"${it.name || 'Adsız ürün'}" silinsin mi?`)) return;
          c.items.splice(ii, 1);
          S.open.delete(it.id);
          markDirty();
          render();
        }, 'danger')))));
  return row;
}

/* ---------- Fiyatlar sekmesi ---------- */

function viewPrices() {
  const filter = h('input', { type: 'checkbox', checked: S.onlyEmpty });
  filter.addEventListener('change', () => { S.onlyEmpty = filter.checked; render(); });

  const wrap = h('div', {},
    h('div', { class: 'summary' },
      h('p', {}, h('strong', { text: 'Hızlı fiyat girişi' }), ' · ', h('span', { 'data-empty-count': '' })),
      h('label', { class: 'check' }, filter, 'Yalnızca fiyatı boş olanlar')),
    h('p', { class: 'hint', text: 'Fiyatı yazıp Enter’a basınca sıradaki ürüne geçer. Yalnızca sayı yazın, örneğin 250 veya 99,90. Değişiklikler Kaydet’e basınca menüye yansır.' }));

  let shown = 0;
  S.menu.categories.forEach((c, ci) => {
    const rows = c.items.map((it, ii) => ({ it, ii })).filter(({ it }) => !S.onlyEmpty || priceMissing(it));
    if (!rows.length) return;
    shown += rows.length;
    const table = h('section', { class: 'ptable' }, h('h2', { class: 'sec-t' }, c.name, h('small', { text: `${c.items.length} ürün` })));
    rows.forEach(({ it, ii }) => {
      table.append(h('div', { class: 'prow' },
        h('span', { class: 'pn' }, it.name, it.hidden ? h('em', { text: 'Gizli' }) : null),
        priceInput(it, 'price', { path: `price:${ci}:${ii}`, label: it.name, placeholder: it.variants.length ? 'Ana fiyat' : 'Fiyat' })));
      it.variants.forEach((v, vi) => {
        table.append(h('div', { class: 'prow sub' },
          h('span', { class: 'pn', text: v.name || 'Adsız seçenek' }),
          priceInput(v, 'price', { path: `v:${ci}:${ii}:${vi}`, label: `${it.name} ${v.name}` })));
      });
    });
    wrap.append(table);
  });
  if (!shown) wrap.append(h('p', { class: 'empty', text: S.onlyEmpty ? 'Fiyatı boş ürün kalmadı.' : 'Menüde henüz ürün yok.' }));

  wrap.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !e.target.matches('input.price')) return;
    e.preventDefault();
    const all = [...wrap.querySelectorAll('input.price')];
    const next = all[all.indexOf(e.target) + (e.shiftKey ? -1 : 1)];
    if (next) {
      next.focus();
      next.select();
    }
  });
  return wrap;
}

/* ---------- Mekân sekmesi ---------- */

async function logoColors(src) {
  const img = new Image();
  img.src = src;
  await img.decode();
  const N = 72;
  const canvas = document.createElement('canvas');
  canvas.width = N;
  canvas.height = N;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, N, N);
  const d = ctx.getImageData(0, 0, N, N).data;
  const bins = new Map();
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 160) continue;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const light = (max + min) / 510;
    if (light > 0.93 || light < 0.07) continue;
    const sat = max ? (max - min) / max : 0;
    const key = (r >> 4) * 256 + (g >> 4) * 16 + (b >> 4);
    const e = bins.get(key) || { n: 0, r: 0, g: 0, b: 0, s: 0 };
    e.n++; e.r += r; e.g += g; e.b += b; e.s += sat;
    bins.set(key, e);
  }
  const ranked = [...bins.values()]
    .map((e) => ({ rgb: [e.r / e.n, e.g / e.n, e.b / e.n], score: e.n * (0.3 + e.s / e.n) }))
    .sort((a, b) => b.score - a.score);
  const picked = [];
  for (const c of ranked) {
    if (picked.every((p) => Math.hypot(p[0] - c.rgb[0], p[1] - c.rgb[1], p[2] - c.rgb[2]) > 70)) picked.push(c.rgb);
    if (picked.length === 6) break;
  }
  return picked.map(toHex);
}

function viewVenue() {
  const m = S.menu;
  const t = m.theme;
  const c = m.contact;

  const preview = h('div', { class: 'preview', 'aria-label': 'Renk önizlemesi' });
  const note = h('p', { class: 'hint' });
  const paintPreview = () => {
    const th = buildTheme(t);
    preview.setAttribute('style', themeToCss(th));
    preview.textContent = '';
    preview.append(
      h('div', { class: 'pv-bar' }, m.logo ? h('img', { src: imgUrl(m.logo), alt: '' }) : null, h('span', {}, h('b', { text: m.name || 'Mekân adı' }), h('small', { text: m.tagline || 'Slogan' }))),
      h('div', { class: 'pv-rail' }, h('span', { text: 'Burgerler' }), h('span', { text: 'İçecekler' }), h('span', { text: 'Tatlılar' })),
      h('div', { class: 'pv-body' },
        h('p', { class: 'pv-h', text: 'Burgerler' }),
        h('div', { class: 'pv-item' }, h('div', {}, h('b', { text: 'Ev yapımı burger' }), h('small', { text: 'Dana köfte, cheddar, karamelize soğan' }), h('i', {}, `250 ${m.currency || '₺'}`, h('span', { text: 'Çok satan' }))), h('div', { class: 'pv-th' })),
        h('span', { class: 'pv-btn', text: 'Sipariş ver' })));
    const notes = [];
    if (!th.brandReadable) notes.push('Seçilen renk zemine göre açık. Yazılarda otomatik olarak koyulaştırılmış tonu kullanılır.');
    if (th.onBrand !== '#ffffff') notes.push('Renk açık olduğu için düğmelerde koyu yazı kullanılır.');
    if (th.scheme === 'dark') notes.push('Zemin koyu olduğu için menü koyu temada açılır.');
    note.textContent = notes.join(' ');
  };

  const colorIn = h('input', { type: 'color', value: t.primary, 'aria-label': 'Ana renk seçici' });
  const hexIn = h('input', { type: 'text', value: t.primary, maxlength: 7, 'data-path': 'primary', 'aria-label': 'Ana renk kodu' });
  const setPrimary = (hex) => {
    t.primary = hex;
    colorIn.value = hex;
    hexIn.value = hex;
    markDirty();
    paintPreview();
  };
  colorIn.addEventListener('input', () => setPrimary(colorIn.value));
  hexIn.addEventListener('input', () => {
    const rgb = parseHex(hexIn.value);
    if (rgb) {
      t.primary = toHex(rgb);
      colorIn.value = t.primary;
      markDirty();
      paintPreview();
    }
  });

  const suggestions = h('div', { class: 'swatches' });
  const suggestBtn = smallBtn('Logodan renk öner', async () => {
    if (!m.logo) {
      toast('Önce logo yükleyin.', true);
      return;
    }
    suggestBtn.disabled = true;
    try {
      const colors = await logoColors(imgUrl(m.logo));
      suggestions.textContent = '';
      if (!colors.length) toast('Logoda belirgin bir renk bulunamadı. Rengi elle seçin.', true);
      colors.forEach((hex) => suggestions.append(h('button', {
        type: 'button', class: 'swatch', style: `background:${hex}`, title: hex, 'aria-label': `${hex} rengini seç`,
        onclick: () => setPrimary(hex),
      })));
    } catch {
      toast('Logo okunamadı. Rengi elle seçin.', true);
    } finally {
      suggestBtn.disabled = false;
    }
  });

  const paperIn = h('input', { type: 'color', value: t.paper || '#faf8f4', 'aria-label': 'Zemin rengi seçici' });
  const setPaper = (hex) => {
    t.paper = hex;
    paperIn.value = hex || '#faf8f4';
    markDirty();
    paintPreview();
  };
  paperIn.addEventListener('input', () => setPaper(paperIn.value));
  const paperPresets = [['#faf8f4', 'Krem'], ['#ffffff', 'Beyaz'], ['#f3efe6', 'Bej'], ['#151312', 'Koyu']];

  const pwCurrent = h('input', { type: 'password', autocomplete: 'current-password' });
  const pwNext = h('input', { type: 'password', autocomplete: 'new-password' });
  const pwAgain = h('input', { type: 'password', autocomplete: 'new-password' });
  const pwBtn = h('button', {
    type: 'button', class: 'btn', text: 'Şifreyi kaydet',
    onclick: async () => {
      if (pwNext.value.length < 8) return toast('Yeni şifre en az 8 karakter olmalı.', true);
      if (pwNext.value !== pwAgain.value) return toast('Yeni şifreler birbirini tutmuyor.', true);
      pwBtn.disabled = true;
      try {
        await api('password', { method: 'POST', json: { current: pwCurrent.value, next: pwNext.value } });
        S.hasVenuePassword = true;
        pwCurrent.value = pwNext.value = pwAgain.value = '';
        toast('Panel şifresi kaydedildi.');
      } catch (e) {
        toast(e.message, true);
      } finally {
        pwBtn.disabled = false;
      }
    },
  });

  const form = h('div', { class: 'stack' },
    h('h2', { class: 'sec-t', text: 'Kimlik' }),
    h('div', { class: 'grid2' },
      field('Mekân adı', m, 'name', { max: 80, path: 'name', onInput: paintPreview }),
      field('Slogan veya kısa tanım', m, 'tagline', { max: 120, placeholder: 'Örn. Good Fast Food', onInput: paintPreview })),
    h('div', {}, h('span', { class: 'lbl', text: 'Logo' }),
      photoCell(m, 'logo', () => 'logo', { keepAlpha: true, emptyText: 'Logo yok', onChange: paintPreview }),
      h('p', { class: 'hint', text: 'Arka planı şeffaf PNG en iyi sonucu verir.' })),

    h('h2', { class: 'sec-t', text: 'Renkler' }),
    h('div', {}, h('span', { class: 'lbl', text: 'Ana renk (logonun rengi)' }),
      h('div', { class: 'color-row' }, colorIn, hexIn, suggestBtn), suggestions),
    h('div', {}, h('span', { class: 'lbl', text: 'Zemin' }),
      h('div', { class: 'color-row' }, paperIn,
        paperPresets.map(([hex, label]) => smallBtn(label, () => setPaper(hex))))),
    selectField('Ürün fotoğrafları', t, 'imageFit', [
      ['cover', 'Kareye kırpılsın (normal fotoğraflar)'],
      ['contain', 'Tamamı görünsün (arka planı şeffaf ürünler)'],
    ]),
    note,

    h('h2', { class: 'sec-t', text: 'İletişim ve bağlantılar' }),
    h('p', { class: 'hint', text: 'Boş bırakılan bilgi menüde gösterilmez.' }),
    h('div', { class: 'grid2' },
      field('Telefon', c, 'phone', { type: 'tel', max: 40, path: 'phone' }),
      field('Instagram bağlantısı', c, 'instagram', { type: 'url', max: 500, placeholder: 'https://instagram.com/…', path: 'instagram' }),
      field('Adres', c, 'address', { multiline: true, rows: 3, max: 300, wide: true }),
      field('Yol tarifi bağlantısı', c, 'mapsUrl', { type: 'url', max: 500, placeholder: 'https://maps.google.com/…', path: 'mapsUrl' }),
      field('Web sitesi', c, 'website', { type: 'url', max: 500, placeholder: 'https://', path: 'website' }),
      field('Sipariş bağlantısı', c, 'orderUrl', { type: 'url', max: 500, placeholder: 'https://', path: 'orderUrl', hint: 'Doluysa menünün altında sabit bir sipariş düğmesi çıkar.' }),
      field('Sipariş düğmesi yazısı', c, 'orderLabel', { max: 40, placeholder: 'Sipariş ver' }),
      field('Wi-Fi adı', c, 'wifiName', { max: 64 }),
      field('Wi-Fi şifresi', c, 'wifiPassword', { max: 64 })),

    h('h2', { class: 'sec-t', text: 'Menü altı' }),
    h('div', { class: 'grid2' },
      field('Not', m, 'note', { multiline: true, rows: 2, max: 600, wide: true, placeholder: 'Örn. Fiyatlara KDV dahildir. Alerjen bilgisi için personelimize danışın.' }),
      field('Para birimi', m, 'currency', { max: 4 })),

    h('h2', { class: 'sec-t', text: 'Panel şifresi' }),
    h('p', { class: 'hint', text: S.role === 'admin'
      ? 'Yönetici olarak girdiniz. Mekân sahibine verilecek panel şifresini buradan belirleyin. Yönetici şifresi bütün mekânlarda çalışmaya devam eder.'
      : 'Şifreyi değiştirdiğinizde diğer cihazlardaki oturumlar kapanır.' }),
    h('div', { class: 'grid2' },
      S.role === 'mekan' ? h('label', { class: 'f wide' }, h('span', { text: 'Mevcut şifre' }), pwCurrent) : null,
      h('label', { class: 'f' }, h('span', { text: 'Yeni şifre' }), pwNext),
      h('label', { class: 'f' }, h('span', { text: 'Yeni şifre tekrar' }), pwAgain)),
    h('div', { class: 'acts' }, pwBtn,
      S.role === 'admin' ? h('span', { class: 'hint', text: S.hasVenuePassword ? 'Bu mekânın panel şifresi var.' : 'Bu mekânın henüz panel şifresi yok.' }) : null));

  paintPreview();
  return h('div', { class: 'venue' }, form, h('div', { class: 'pv-wrap' }, h('span', { class: 'lbl', text: 'Önizleme' }), preview));
}

/* ---------- QR sekmesi ---------- */

function qrMatrix(text) {
  const q = window.qrcode(0, 'M');
  q.addData(text);
  q.make();
  return { n: q.getModuleCount(), dark: (r, c) => q.isDark(r, c) };
}

function qrColor() {
  const th = buildTheme(S.menu.theme);
  return contrast(parseHex(th.ink), [255, 255, 255]) >= 12 ? th.ink : '#000000';
}

function qrSvg(text, color, margin = 4) {
  const { n, dark } = qrMatrix(text);
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (dark(r, c)) d += `M${c + margin} ${r + margin}h1v1h-1z`;
  const size = n + margin * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#ffffff"/><path fill="${color}" d="${d}"/></svg>`;
}

function qrPng(text, color, px = 1200) {
  const { n, dark } = qrMatrix(text);
  const margin = 4;
  const size = n + margin * 2;
  const scale = Math.max(1, Math.floor(px / size));
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size * scale;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = color;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (dark(r, c)) ctx.fillRect((c + margin) * scale, (r + margin) * scale, scale, scale);
  return new Promise((res) => canvas.toBlob(res, 'image/png'));
}

function printCard() {
  const m = S.menu;
  const th = buildTheme(m.theme);
  const [w, hgt] = S.qrFormat === 'A5' ? [148, 210] : [105, 148];
  const u = (w / 105).toFixed(4);
  const svg = qrSvg(S.qrUrl, qrColor());
  const logo = m.logo ? `<span class="logo"><img src="${location.origin}${imgUrl(m.logo)}" alt=""></span>` : '';
  const wifi = m.contact.wifiName || m.contact.wifiPassword
    ? `<span>Wi-Fi: <b>${esc(m.contact.wifiName)}</b>${m.contact.wifiPassword ? ` · Şifre: <b>${esc(m.contact.wifiPassword)}</b>` : ''}</span>` : '';
  const phone = m.contact.phone ? `<span><b>${esc(m.contact.phone)}</b></span>` : '';
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${esc(m.name)} masa kartı</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&family=Outfit:wght@500;600&display=swap">
<style>
@page{size:${w}mm ${hgt}mm;margin:0}
*{box-sizing:border-box;border-radius:0}
html,body{margin:0;background:#e9e6e0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.card{--u:${u}mm;width:${w}mm;height:${hgt}mm;margin:10mm auto;display:flex;flex-direction:column;overflow:hidden;background:${th.paper};color:${th.ink};font-family:"DM Sans",Arial,sans-serif}
.band{display:flex;align-items:center;gap:calc(3.5*var(--u));padding:calc(7*var(--u)) calc(8*var(--u));background:${th.brand};color:${th.onBrand}}
.logo{display:grid;place-items:center;width:calc(13*var(--u));height:calc(13*var(--u));padding:calc(1.2*var(--u));background:${th.paper};flex:0 0 auto}
.logo img{width:100%;height:100%;object-fit:contain;display:block}
.name{font-family:"Outfit",Arial,sans-serif;font-weight:600;font-size:calc(6.4*var(--u));line-height:1.05;letter-spacing:-.02em}
.tag{margin-top:calc(1.2*var(--u));font-size:calc(2.2*var(--u));letter-spacing:.24em;text-transform:uppercase;opacity:.85}
.body{flex:1;display:flex;flex-direction:column;padding:calc(7*var(--u)) calc(8*var(--u)) 0}
h1{margin:0;font-family:"Outfit",Arial,sans-serif;font-weight:500;font-size:calc(9.6*var(--u));line-height:.98;letter-spacing:-.045em}
h1 span{color:${th.brandInk}}
.qr{width:calc(56*var(--u));height:calc(56*var(--u));margin-top:calc(6*var(--u));padding:calc(1.6*var(--u));background:#fff;border:calc(.3*var(--u)) solid ${th.ink}}
.qr svg{display:block;width:100%;height:100%}
.hint{margin:calc(3*var(--u)) 0 0;max-width:calc(62*var(--u));font-size:calc(2.9*var(--u));line-height:1.4;color:${th.muted}}
.foot{display:flex;justify-content:space-between;gap:calc(3*var(--u));margin-top:auto;padding:calc(3.2*var(--u)) calc(8*var(--u));border-top:calc(.3*var(--u)) solid ${th.ink};font-size:calc(2.6*var(--u));color:${th.muted}}
.foot b{color:${th.ink};font-weight:500}
@media print{html,body{background:${th.paper}}.card{margin:0}}
</style></head><body><div class="card">
<div class="band">${logo}<div><div class="name">${esc(m.name)}</div>${m.tagline ? `<div class="tag">${esc(m.tagline)}</div>` : ''}</div></div>
<div class="body"><h1>Menü için<br><span>okutun.</span></h1><div class="qr">${svg}</div>
<p class="hint">Telefonunuzun kamerasını açıp kodu okutun.</p></div>
<div class="foot">${wifi || '<span></span>'}${phone}</div>
</div></body></html>`;

  const win = window.open('', '_blank', 'width=560,height=820');
  if (!win) {
    toast('Yazdırma penceresi açılamadı. Tarayıcının açılır pencere engelini kaldırın.', true);
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  const go = async () => {
    try {
      await Promise.all([...win.document.images].map((i) => i.decode().catch(() => {})));
      if (win.document.fonts) await win.document.fonts.ready;
    } catch {
      /* yazdırmaya devam */
    }
    setTimeout(() => win.print(), 200);
  };
  if (win.document.readyState === 'complete') go();
  else win.addEventListener('load', go);
}

function viewQr() {
  if (!S.qrUrl) S.qrUrl = location.origin + BASE + '/';
  const box = h('div', { class: 'qr-box', role: 'img', 'aria-label': 'Menü QR kodu önizlemesi' });
  const urlIn = h('input', { type: 'url', value: S.qrUrl, 'aria-label': 'QR kodun açacağı adres' });
  const paint = () => {
    try {
      box.innerHTML = qrSvg(S.qrUrl || ' ', qrColor());
    } catch {
      box.textContent = 'Adres QR koda sığmayacak kadar uzun.';
    }
  };
  urlIn.addEventListener('input', () => { S.qrUrl = urlIn.value.trim(); paint(); });
  paint();
  const file = slug(S.menu.name || SLUG) || 'menu';

  const format = h('select', { 'aria-label': 'Kart boyutu' }, h('option', { value: 'A6', text: 'A6 (10,5 × 14,8 cm)' }), h('option', { value: 'A5', text: 'A5 (14,8 × 21 cm)' }));
  format.value = S.qrFormat;
  format.addEventListener('change', () => { S.qrFormat = format.value; });

  return h('div', { class: 'qr' },
    box,
    h('div', { class: 'stack' },
      h('h2', { class: 'sec-t', text: 'Menü QR kodu' }),
      h('label', { class: 'f' }, h('span', { text: 'QR kodun açacağı adres' }), urlIn,
        h('small', { text: 'Adres otomatik olarak bu panelin mekân adresidir. Yayındaki adresle aynı olduğundan emin olun.' })),
      h('div', { class: 'acts' },
        h('button', { type: 'button', class: 'btn', text: 'SVG indir', onclick: () => download(new Blob([qrSvg(S.qrUrl, qrColor())], { type: 'image/svg+xml' }), `${file}-qr.svg`) }),
        h('button', { type: 'button', class: 'btn', text: 'PNG indir', onclick: async () => download(await qrPng(S.qrUrl, qrColor()), `${file}-qr.png`) })),
      h('h2', { class: 'sec-t', text: 'Masa kartı' }),
      h('p', { class: 'hint', text: 'Kart mekânın logosu ve renkleriyle hazırlanır. Wi-Fi ve telefon bilgisi doluysa kartın altına yazılır. Yazdırırken “Arka plan grafikleri” seçeneğini açın.' }),
      h('div', { class: 'acts' },
        h('label', { class: 'f' }, h('span', { text: 'Kart boyutu' }), format),
        h('button', { type: 'button', class: 'btn primary', text: 'Masa kartını yazdır', onclick: printCard }))));
}

/* ---------- Yedek sekmesi ---------- */

function viewBackup() {
  const list = h('div', { class: 'backups' }, h('p', { class: 'hint', text: 'Yedekler yükleniyor…' }));
  api('backups').then((r) => {
    list.textContent = '';
    if (!r.backups.length) {
      list.append(h('p', { class: 'hint', text: 'Henüz sunucu yedeği yok. İlk kayıttan sonra oluşur.' }));
      return;
    }
    r.backups.forEach((b) => list.append(h('div', { class: 'brow' },
      h('span', { text: fmtDate(b.date) }),
      h('small', { text: `${Math.max(1, Math.round(b.size / 1024))} KB` }),
      smallBtn('Bu yedeği aç', async () => {
        if (S.dirty && !confirm('Kaydedilmemiş değişiklikler yedekle değiştirilecek. Devam edilsin mi?')) return;
        try {
          const x = await api('backups/' + encodeURIComponent(b.name));
          S.menu = { ...x.menu, updatedAt: S.menu.updatedAt };
          markDirty();
          render();
          toast('Yedek açıldı. Kalıcı olması için Kaydet’e basın.');
        } catch (e) {
          if (e.status !== 401) toast(e.message, true);
        }
      }))));
  }).catch((e) => {
    list.textContent = '';
    list.append(h('p', { class: 'hint', text: e.message }));
  });

  const fileIn = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files[0];
    fileIn.value = '';
    if (!f) return;
    let obj;
    try {
      obj = JSON.parse(await f.text());
    } catch {
      toast('Dosya okunamadı. Panelden indirilmiş bir menü dosyası seçin.', true);
      return;
    }
    if (!obj || !Array.isArray(obj.categories)) {
      toast('Bu dosya bir menü dosyası değil.', true);
      return;
    }
    if (S.dirty && !confirm('Kaydedilmemiş değişiklikler dosyadaki menüyle değiştirilecek. Devam edilsin mi?')) return;
    const keep = S.menu.updatedAt;
    S.menu = obj;
    S.menu.updatedAt = keep;
    S.menu.theme = S.menu.theme || { primary: '#c1272d', paper: '', imageFit: 'cover' };
    S.menu.contact = S.menu.contact || {};
    S.menu.categories.forEach((c) => {
      c.id = c.id || uid(c.name || 'kategori');
      c.items = Array.isArray(c.items) ? c.items : [];
      c.items.forEach((it) => {
        it.id = it.id || uid(it.name || 'urun');
        it.variants = Array.isArray(it.variants) ? it.variants : [];
        it.tags = Array.isArray(it.tags) ? it.tags : [];
      });
    });
    S.cat = 0;
    markDirty();
    render();
    toast('Dosya açıldı. Kalıcı olması için Kaydet’e basın.');
  });

  return h('div', { class: 'stack', style: 'max-width:760px' },
    h('h2', { class: 'sec-t', text: 'Dosya olarak' }),
    h('p', { class: 'hint', text: 'Menünün tamamını bilgisayarınıza indirin ya da daha önce indirdiğiniz dosyayı geri yükleyin. Fotoğraflar dosyaya dahil değildir, sunucuda kalır.' }),
    h('div', { class: 'acts' },
      h('button', {
        type: 'button', class: 'btn', text: 'Menüyü indir',
        onclick: () => download(new Blob([JSON.stringify(S.menu, null, 2)], { type: 'application/json' }), `${SLUG}-menu-${new Date().toISOString().slice(0, 10)}.json`),
      }),
      h('button', { type: 'button', class: 'btn', text: 'Dosyadan yükle', onclick: () => fileIn.click() }),
      fileIn),
    h('h2', { class: 'sec-t', text: 'Sunucu yedekleri' }),
    h('p', { class: 'hint', text: 'Her kayıttan önce menünün önceki hali otomatik saklanır. Son 30 yedek tutulur.' }),
    list);
}

/* ---------- başlat ---------- */

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && S.menu) {
    e.preventDefault();
    save();
  }
});
window.addEventListener('beforeunload', (e) => {
  if (S.dirty) {
    e.preventDefault();
    e.returnValue = '';
  }
});

(async function boot() {
  try {
    const s = await loadSession();
    if (s.loggedIn) await loadMenu();
    else renderLogin(s.configured ? '' : 'Panel şifresi ayarlanmamış. Sunucuda ADMIN_PASSWORD ortam değişkenini tanımlayın.');
  } catch (e) {
    renderLogin(e.message);
  }
})();
