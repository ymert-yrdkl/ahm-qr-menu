// Müşterinin gördüğü menü. Veri sayfanın içine gömülü gelir, ek istek yapılmaz.
(function () {
  'use strict';

  var D;
  try { D = JSON.parse(document.getElementById('menu-data').textContent); }
  catch (e) { D = { categories: [] }; }

  var Q = window.QRM;
  var BASE = document.body.getAttribute('data-base') || '';
  var TAGS = Q.TAGS;
  var CUR = D.currency || '₺';
  var C = D.contact || {};
  var byId = {};
  var lastFocus = null;

  function $(id) { return document.getElementById(id); }

  function h(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null && text !== '') e.textContent = text;
    return e;
  }

  function img(name, alt, eager) {
    var i = document.createElement('img');
    i.src = BASE + '/img/' + encodeURIComponent(name);
    i.alt = alt || '';
    i.decoding = 'async';
    if (!eager) i.loading = 'lazy';
    return i;
  }

  function safeUrl(u) {
    if (!u) return '';
    try { var x = new URL(u); return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : ''; }
    catch (e) { return ''; }
  }

  function telHref(t) {
    var d = String(t || '').replace(/[^\d+]/g, '');
    if (!d) return '';
    if (d.charAt(0) === '0') d = '+90' + d.slice(1);
    else if (d.charAt(0) !== '+' && d.length === 10) d = '+90' + d;
    return 'tel:' + d;
  }

  function link(href, text, cls, external) {
    var a = h('a', cls, text);
    a.href = href;
    if (external) { a.target = '_blank'; a.rel = 'noopener'; }
    return a;
  }

  function hasDetail(it) {
    return !!(it.image || it.desc || (it.variants && it.variants.length) || it.allergens || (it.tags && it.tags.length));
  }

  function metaLine(it) {
    var mt = h('span', 'mt');
    var p = Q.price(it.price, CUR);
    if (p) mt.appendChild(h('span', 'pr', p));
    if (it.variants && it.variants.length) {
      var vr = h('span', 'vr');
      it.variants.forEach(function (v, i) {
        if (i) vr.appendChild(document.createTextNode(' · '));
        vr.appendChild(document.createTextNode(v.name + (v.price ? ' ' : '')));
        if (v.price) vr.appendChild(h('b', null, Q.price(v.price, CUR)));
      });
      mt.appendChild(vr);
    }
    if (it.soldOut) mt.appendChild(h('span', 'so', 'Tükendi'));
    (it.tags || []).forEach(function (t) { if (TAGS[t]) mt.appendChild(h('span', 'tg', TAGS[t])); });
    return mt.children.length ? mt : null;
  }

  function itemButton(it) {
    var b = h('button', 'item' + (it.soldOut ? ' is-out' : ''));
    b.type = 'button';
    b.dataset.id = it.id;
    var txt = h('span', 'txt');
    txt.appendChild(h('span', 'nm', it.name));
    if (it.desc) txt.appendChild(h('span', 'ds', it.desc));
    var mt = metaLine(it);
    if (mt) txt.appendChild(mt);
    b.appendChild(txt);
    if (it.image) {
      var th = h('span', 'th');
      th.appendChild(img(it.image, ''));
      b.appendChild(th);
    }
    return b;
  }

  function compactRow(it) {
    var interactive = hasDetail(it);
    var r = h(interactive ? 'button' : 'div', 'row' + (it.soldOut ? ' is-out' : ''));
    if (interactive) { r.type = 'button'; r.dataset.id = it.id; }
    var left = h('span', 'rn', it.name);
    var sub = [];
    if (it.variants && it.variants.length) {
      sub.push(it.variants.map(function (v) { return v.name + (v.price ? ' ' + Q.price(v.price, CUR) : ''); }).join(' · '));
    }
    if (it.soldOut) sub.push('Tükendi');
    if (it.desc) sub.push(it.desc);
    if (sub.length) left.appendChild(h('small', null, sub.join(' · ')));
    r.appendChild(left);
    var p = Q.price(it.price, CUR);
    if (p) r.appendChild(h('span', 'rp', p));
    return r;
  }

  /* ---------- sayfa ---------- */

  function renderBrand() {
    var a = $('brand');
    a.textContent = '';
    if (D.logo) a.appendChild(img(D.logo, '', true));
    var s = h('span');
    s.appendChild(h('b', null, D.name || 'Menü'));
    if (D.tagline) s.appendChild(h('small', null, D.tagline));
    a.appendChild(s);
    a.setAttribute('aria-label', (D.name || 'Menü') + ', sayfanın başına dön');
  }

  function renderMenu() {
    var main = $('menu');
    var rail = $('rail');
    main.textContent = '';
    rail.textContent = '';

    D.categories.forEach(function (c) {
      c.items.forEach(function (it) { byId[it.id] = it; });

      var sec = h('section', 'cat');
      sec.id = 'k-' + c.id;
      sec.setAttribute('aria-labelledby', 'h-' + c.id);
      var head = h('div', 'cat-head');
      var h2 = h('h2', null, c.name);
      h2.id = 'h-' + c.id;
      head.appendChild(h2);
      head.appendChild(h('span', 'count', c.items.length + ' ürün'));
      if (c.desc) head.appendChild(h('p', null, c.desc));
      sec.appendChild(head);

      if (c.layout === 'compact') {
        var rows = h('div', 'rows');
        c.items.forEach(function (it) { rows.appendChild(compactRow(it)); });
        sec.appendChild(rows);
      } else {
        c.items.forEach(function (it) { sec.appendChild(itemButton(it)); });
      }
      main.appendChild(sec);

      var a = link('#k-' + c.id, c.name);
      rail.appendChild(a);
    });

    if (!D.categories.length) {
      main.appendChild(h('p', 'empty', 'Menü hazırlanıyor. Kısa süre sonra burada olacak.'));
    } else {
      $('cats').hidden = false;
      $('search-open').hidden = false;
      if (D.note) main.appendChild(h('p', 'note', D.note));
    }
  }

  function infoBlock(title, content) {
    var d = h('div');
    d.appendChild(h('h3', null, title));
    var p = h('p');
    if (typeof content === 'string') p.textContent = content;
    else p.appendChild(content);
    d.appendChild(p);
    return d;
  }

  function copyButton(value) {
    var b = h('button', 'copy', 'Kopyala');
    b.type = 'button';
    b.addEventListener('click', function () {
      var done = function () { b.textContent = 'Kopyalandı'; setTimeout(function () { b.textContent = 'Kopyala'; }, 1800); };
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(value).then(done, function () {});
      } else {
        var t = h('textarea'); t.value = value; t.setAttribute('readonly', '');
        t.style.position = 'fixed'; t.style.opacity = '0';
        document.body.appendChild(t); t.select();
        try { document.execCommand('copy'); done(); } catch (e) { /* kopyalanamadı */ }
        t.remove();
      }
    });
    return b;
  }

  function renderFooter() {
    var f = $('foot');
    f.textContent = '';
    f.appendChild(h('p', 'foot-name', D.name || ''));
    if (D.tagline) f.appendChild(h('p', 'foot-tag', D.tagline));

    var order = safeUrl(C.orderUrl);
    var maps = safeUrl(C.mapsUrl);
    var btns = h('div', 'btns');
    if (order) btns.appendChild(link(order, C.orderLabel || 'Sipariş ver', 'btn', true));
    if (maps) btns.appendChild(link(maps, 'Yol tarifi al', 'btn ghost', true));
    if (btns.children.length) f.appendChild(btns);

    var info = h('div', 'info');
    if (C.address) info.appendChild(infoBlock('Adres', C.address));
    var tel = telHref(C.phone);
    if (tel) info.appendChild(infoBlock('Telefon', link(tel, C.phone)));
    if (C.wifiName || C.wifiPassword) {
      var w = document.createDocumentFragment();
      if (C.wifiName) w.appendChild(document.createTextNode(C.wifiName));
      if (C.wifiPassword) {
        if (C.wifiName) w.appendChild(h('br'));
        w.appendChild(document.createTextNode('Şifre: ' + C.wifiPassword));
        w.appendChild(copyButton(C.wifiPassword));
      }
      info.appendChild(infoBlock('Wi-Fi', w));
    }
    var insta = safeUrl(C.instagram);
    if (insta) {
      var handle = insta.replace(/[?#].*$/, '').replace(/\/+$/, '').split('/').pop();
      info.appendChild(infoBlock('Instagram', link(insta, handle ? '@' + handle : 'Instagram', null, true)));
    }
    var web = safeUrl(C.website);
    if (web) info.appendChild(infoBlock('Web sitesi', link(web, web.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''), null, true)));
    if (info.children.length) f.appendChild(info);

    var legal = h('div', 'legal');
    legal.appendChild(h('span', null, '© ' + new Date().getFullYear() + ' ' + (D.name || '')));
    legal.appendChild(h('span', null, 'QR menü · AHM Cloud'));
    f.appendChild(legal);

    if (order) {
      var dock = $('dock');
      var wrap = h('div', 'wrap');
      if (tel) wrap.appendChild(link(tel, C.phone, 'dl'));
      else wrap.appendChild(h('span', 'dl', D.name || ''));
      wrap.appendChild(link(order, C.orderLabel || 'Sipariş ver', 'btn', true));
      dock.appendChild(wrap);
      dock.hidden = false;
      document.body.classList.add('with-dock');
    }
  }

  /* ---------- kategori şeridi ---------- */

  function watchSections() {
    var links = [].slice.call(document.querySelectorAll('#rail a'));
    var rail = $('rail');
    if (!links.length) return;
    var current = '';
    function setActive(id) {
      if (id === current) return;
      current = id;
      links.forEach(function (a) {
        var on = a.getAttribute('href') === '#' + id;
        a.classList.toggle('on', on);
        if (on) {
          a.setAttribute('aria-current', 'true');
          var left = a.offsetLeft - 20;
          if (rail.scrollTo) rail.scrollTo({ left: left, behavior: 'smooth' }); else rail.scrollLeft = left;
        } else {
          a.removeAttribute('aria-current');
        }
      });
    }
    setActive(links[0].getAttribute('href').slice(1));
    if (!('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) setActive(e.target.id); });
    }, { rootMargin: '-56px 0px -62% 0px' });
    links.forEach(function (a) {
      var s = document.getElementById(a.getAttribute('href').slice(1));
      if (s) io.observe(s);
    });
  }

  /* ---------- ürün detayı ---------- */

  var sheet = $('sheet');

  function openSheet(it) {
    lastFocus = document.activeElement;
    sheet.textContent = '';
    var scroll = h('div', 'sheet-scroll');
    if (it.image) {
      var fig = h('div', 'sheet-img');
      fig.appendChild(img(it.image, it.name, true));
      scroll.appendChild(fig);
    }
    var body = h('div', 'sheet-body');
    var title = h('h2', null, it.name);
    title.id = 'sheet-title';
    body.appendChild(title);

    var mt = h('div', 'mt');
    if (it.soldOut) mt.appendChild(h('span', 'so', 'Tükendi'));
    (it.tags || []).forEach(function (t) { if (TAGS[t]) mt.appendChild(h('span', 'tg', TAGS[t])); });
    if (mt.children.length) body.appendChild(mt);

    var p = Q.price(it.price, CUR);
    if (p) body.appendChild(h('div', 'sheet-price', p));
    if (it.desc) body.appendChild(h('p', 'sheet-desc', it.desc));
    if (it.variants && it.variants.length) {
      var vt = h('div', 'sheet-vars');
      it.variants.forEach(function (v) {
        var row = h('div');
        row.appendChild(h('span', null, v.name));
        row.appendChild(h('span', null, Q.price(v.price, CUR)));
        vt.appendChild(row);
      });
      body.appendChild(vt);
    }
    if (it.allergens) {
      var al = h('p', 'sheet-meta');
      al.appendChild(h('b', null, 'Alerjen: '));
      al.appendChild(document.createTextNode(it.allergens));
      body.appendChild(al);
    }
    scroll.appendChild(body);
    sheet.appendChild(scroll);

    var close = h('button', 'icon-btn sheet-close');
    close.type = 'button';
    close.setAttribute('aria-label', 'Kapat');
    close.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5 5 19" stroke="currentColor" stroke-width="1.8"/></svg>';
    close.addEventListener('click', closeSheet);
    sheet.appendChild(close);

    document.documentElement.classList.add('lock');
    if (typeof sheet.showModal === 'function') sheet.showModal();
    else sheet.setAttribute('open', '');
    close.focus({ preventScroll: true });
  }

  function closeSheet() {
    if (typeof sheet.close === 'function' && sheet.open) sheet.close();
    else sheet.removeAttribute('open');
  }

  sheet.addEventListener('close', function () {
    if ($('search').hidden) document.documentElement.classList.remove('lock');
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  });
  sheet.addEventListener('click', function (e) { if (e.target === sheet) closeSheet(); });

  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('[data-id]') : null;
    if (t && byId[t.dataset.id]) openSheet(byId[t.dataset.id]);
  });

  /* ---------- arama ---------- */

  var search = $('search');
  var input = $('search-input');
  var results = $('search-results');
  var searchOpener = null;

  function runSearch() {
    var q = Q.fold(input.value.trim());
    results.textContent = '';
    if (!q) {
      results.appendChild(h('p', 'search-hint', 'Ürün adı ya da içindeki bir malzemeyi yazın.'));
      return;
    }
    var found = 0;
    D.categories.forEach(function (c) {
      var hits = c.items.filter(function (it) {
        return Q.fold(it.name + ' ' + (it.desc || '')).indexOf(q) !== -1;
      });
      if (!hits.length) return;
      found += hits.length;
      results.appendChild(h('p', 'search-grp', c.name));
      hits.forEach(function (it) { results.appendChild(itemButton(it)); });
    });
    if (!found) results.appendChild(h('p', 'search-hint', '“' + input.value.trim() + '” için sonuç bulunamadı.'));
  }

  function openSearch() {
    searchOpener = document.activeElement;
    search.hidden = false;
    document.documentElement.classList.add('lock');
    runSearch();
    input.focus();
  }

  function closeSearch() {
    search.hidden = true;
    document.documentElement.classList.remove('lock');
    if (searchOpener && searchOpener.focus) searchOpener.focus({ preventScroll: true });
  }

  $('search-open').addEventListener('click', openSearch);
  $('search-close').addEventListener('click', closeSearch);
  input.addEventListener('input', runSearch);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !search.hidden && !sheet.open) closeSearch();
  });

  /* ---------- başlat ---------- */

  renderBrand();
  renderMenu();
  renderFooter();
  watchSections();
  if (location.hash) {
    var target = document.getElementById(location.hash.slice(1));
    if (target) target.scrollIntoView();
  }
})();
