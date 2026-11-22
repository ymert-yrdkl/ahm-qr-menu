// Yıldız görünümü: kapaklı tek sayfa menü (Yıldızkart QR menü v8).
// Veri sayfadaki #isletme-veri'den gelir (server.js › yildizData).
/* ══════════════ VERİ ══════════════ */
/* Mekânın menu.json'u sunucuda bu biçime çevrilir (server.js › yildizData). Panelden düzenlenir. */
const ISLETME = JSON.parse(document.getElementById("isletme-veri").textContent);
const BASE = document.body.dataset.base || "";
const SAATLI = Object.keys(ISLETME.saatler || {}).length > 0;   // saat girilmemişse açık/kapalı satırı hiç görünmez
/* Panelden gizlenen ürünler sunucuda da çıkarılır; burada ikinci emniyet. Boş kalan kategori görünmez. */
ISLETME.menu = ISLETME.menu.map((k) => ({ ...k, urunler: k.urunler.filter((u) => !u.gizli) })).filter((k) => k.urunler.length);
const MENU = ISLETME.menu;

// dokunmatik cihazda baştan dokunmatik kip: bağlantıyla açılan katmanın kapat düğmesinde odak halkası görünmesin
if (matchMedia("(pointer: coarse)").matches) document.documentElement.classList.add("dokunmatik");
/* ══════════════ YARDIMCILAR ══════════════ */
const $ = (id) => document.getElementById(id);
const AZALT = matchMedia("(prefers-reduced-motion: reduce)").matches;
let AZALT_ANLIK = false;
const TASARRUF = navigator.connection && navigator.connection.saveData;
const kacis = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));
const sade = (s) => s.toLocaleLowerCase("tr").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i");
const slug = (s) => sade(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const para = (n) => n == null ? "" : new Intl.NumberFormat(T("sayi")).format(n) + " ₺";   // fiyatsız: yeni ürün, fiyatı kasada
// Mekân görselleri (/img/...): sunucu ?w= ile varsa küçük sürümü (<ad>-200.webp, <ad>-640.webp) verir, yoksa aslını.
const boyut = (u, w, h) => !u ? "" : u.includes("/img/") ? `${u}?w=${w <= 200 ? 200 : w <= 640 ? 640 : 1200}` : u.startsWith("/") ? `${u}-${w <= 200 ? 200 : w <= 640 ? 640 : 1200}.webp` : u.includes("images.unsplash.com")
  ? `${u.split("?")[0]}?w=${w}&h=${h}&fit=crop&auto=format&q=72`
  : u.includes("images.pexels.com") ? `${u.split("?")[0]}?auto=compress&cs=tinysrgb&w=${w}&h=${h}&fit=crop` : u;
const medya = (u) => ({ foto: u.foto, video: u.video });
const titret = (ms) => navigator.vibrate && navigator.vibrate(ms);
const lerp = (a, b, t) => a + (b - a) * t;
const goreli = (iso) => {
  const g = Math.round((new Date(new Date().toDateString()) - new Date(iso + "T00:00")) / 864e5), r = T("goreli");
  return g <= 0 ? r[0] : g === 1 ? r[1] : g < 30 ? r[2](g) : new Date(iso).toLocaleDateString(DIL === "tr" ? "tr-TR" : DIL, { day: "numeric", month: "long" });
};
/* ══════════════ İSTATİSTİK ══════════════
   İşletmenin panelindeki "müşteriler menüde ne yapıyor" ekranı için SAYAÇLAR. Kimlik yok: çerez, IP,
   cihaz kimliği gönderilmez; tarayıcıda yalnız "bu menü bu telefonda daha önce açıldı mı" tutulur.
   Birikenler sayfa gizlenince (uygulamadan çıkma, ekran kilidi) tek istekte gider, sonra sıfırdan birikir. */
const IZ = (() => {
  const adres = BASE + "/api/olay";   // sunucu şimdilik yalnız kabul eder (204); sayaçlar ileride panel raporuna yazılacak
  let ilk = true, yeni = 0, menu = 0, inceledi = 0, sure = 0, bas = document.visibilityState === "visible" ? Date.now() : 0;
  let urun = {}, kat = {}, vitrin = {}, arama = {}, bos = {}, eylem = {};
  let menuSayildi = false, inceSayildi = false, bekleyen = null, aramaZamanlayici = 0;
  const katGoruldu = new Set(), aramaGoruldu = new Set();
  try { const k = "qm-ilk-" + ISLETME.slug; if (!localStorage.getItem(k)) { localStorage.setItem(k, "1"); yeni = 1; } } catch {}
  const ekle = (o, k) => { o[k] = (o[k] || 0) + 1; };
  function aramaYaz() {
    clearTimeout(aramaZamanlayici);
    if (!bekleyen) return;
    const { q, n } = bekleyen; bekleyen = null;
    if (q.length < 2 || aramaGoruldu.has(q)) return;
    aramaGoruldu.add(q); ekle(n ? arama : bos, q);
  }
  function gonder() {
    aramaYaz();
    if (bas) { sure += Date.now() - bas; bas = document.visibilityState === "visible" ? Date.now() : 0; }
    const dolu = [urun, kat, vitrin, arama, bos, eylem].some((o) => Object.keys(o).length);
    if (!ilk && !menu && !inceledi && !dolu && sure < 1000) return;
    const v = { ilk: ilk ? 1 : 0, yeni: ilk ? yeni : 0, menu, inceledi, sure: Math.round(sure / 1000), urun, kat, vitrin, arama, bos, eylem,
      dil: document.documentElement.lang, gece: document.documentElement.classList.contains("gece") ? 1 : 0 };
    try { if (!navigator.sendBeacon(adres, new Blob([JSON.stringify(v)], { type: "text/plain" }))) return; } catch { return; }
    ilk = false; menu = inceledi = sure = 0; urun = {}; kat = {}; vitrin = {}; arama = {}; bos = {}; eylem = {};
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") gonder(); else bas = Date.now(); });
  addEventListener("pagehide", gonder);
  return {
    menu() { if (!menuSayildi) { menuSayildi = true; menu = 1; } },
    urun(u, vit) { if (!u) return; ekle(urun, u.ad); if (vit) ekle(vitrin, u.ad); if (!inceSayildi) { inceSayildi = true; inceledi = 1; } },
    kat(ad) { if (ad && !katGoruldu.has(ad)) { katGoruldu.add(ad); ekle(kat, ad); } },
    ara(q, n) { q = q.trim().toLocaleLowerCase("tr").replace(/\s+/g, " ").slice(0, 30); bekleyen = q ? { q, n } : null; clearTimeout(aramaZamanlayici); aramaZamanlayici = setTimeout(aramaYaz, 1500); },
    eylem(k) { ekle(eylem, k); },
  };
})();

/* ══════════════ DİL ══════════════
   Arayüz metinleri burada; menü içeriği ISLETME'de (ürün/kategori "dil" alanı, uret.py + ceviri.py).
   Saat cümleleri dil bilgisi ister ("23:00'e kadar" / "until 23:00"), o yüzden işlev. */
const GECE_YARISI = { tr: "gece yarısı", en: "midnight" };
const saatYaz = (s, dil) => (s === "24:00" || s === "00:00") ? GECE_YARISI[dil] : s;
const EK = { 1:["e","de"], 2:["ye","de"], 3:["e","te"], 4:["e","te"], 5:["e","te"], 6:["ya","da"], 7:["ye","de"],
  8:["e","de"], 9:["a","da"], 10:["a","da"], 20:["ye","de"], 30:["a","da"], 40:["a","ta"], 50:["ye","de"] };
const ekli = (s, hal) => { if (s === "24:00" || s === "00:00") return hal ? "gece yarısı" : "gece yarısına";
  const [h, m] = s.split(":").map(Number); const n = m || h; return s + "'" + EK[n % 10 || n][hal]; };
const UI = {
  tr: { icerir: "İçerir:", tukendi: "Tükendi", wifi: "Wi-Fi şifresi", kopyala: "Kopyala", kopyalandi: "Kopyalandı", yapistir: "Wi-Fi ayarlarında yapıştırın",
    yorum: "Google'da değerlendir", yorum_alt: "Yorumunuz yeni misafirlere yol gösterir", hafta: "Haftanın saatleri",
    ara: "Ara", yol: "Yol tarifi al", menu_ac: "Menüyü aç", menu: "Menü", menu_kapat: "Menüyü kapat", menude_ara: "Menüde ara",
    kategoriler: "Kategoriler", kapat: "Kapat", dil: "Dil", gece: "Gece modu", ara_ipucu: "Menüde ara, örn. latte", video: "Video",
    urun: (n) => n + " ürün", ozet: (n) => `${n} ürün · Fiyatlar TL, KDV dahil`,
    sonuc_yok: (q) => `“${q}” için sonuç yok. Başka bir kelime deneyin.`,
    acik: "Açık", kapali: "Kapalı", gunler: ["", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"],
    bugun: (a) => "Bugün " + a, bugun_kapali: "Bugün kapalı", kapanisa: (n) => `· kapanışa ${n} dk`, kadar: (s) => "· " + ekli(s, 0) + " kadar",
    dk_sonra: (n) => `· ${n} dk sonra açılıyor`, acilir: (s) => "· " + ekli(s, 1) + " açılır", yarin: (s) => "· yarın " + ekli(s, 1) + " açılır",
    goreli: ["bugün", "dün", (g) => g + " gün önce"], guncel: (x) => "Menü " + x + " güncellendi",
    m_guncel: (x) => x.replace(/^./, (c) => c.toLocaleUpperCase("tr")) + " güncellendi", sayi: "tr-TR" },
  en: { icerir: "Contains:", tukendi: "Sold out", wifi: "Wi-Fi password", kopyala: "Copy", kopyalandi: "Copied", yapistir: "Paste it in your Wi-Fi settings",
    yorum: "Review us on Google", yorum_alt: "Your review helps new guests", hafta: "Opening hours",
    ara: "Call", yol: "Get directions", menu_ac: "View menu", menu: "Menu", menu_kapat: "Close menu", menude_ara: "Search the menu",
    kategoriler: "Categories", kapat: "Close", dil: "Language", gece: "Dark mode", ara_ipucu: "Search the menu, e.g. latte", video: "Video",
    urun: (n) => n + (n === 1 ? " item" : " items"), ozet: (n) => `${n} items · Prices in TRY, VAT included`,
    sonuc_yok: (q) => `No results for “${q}”. Try another word.`,
    acik: "Open", kapali: "Closed", gunler: ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
    bugun: (a) => "Today " + a, bugun_kapali: "Closed today", kapanisa: (n) => `· closes in ${n} min`, kadar: (s) => "· until " + saatYaz(s, "en"),
    dk_sonra: (n) => `· opens in ${n} min`, acilir: (s) => "· opens at " + saatYaz(s, "en"), yarin: (s) => "· opens tomorrow at " + saatYaz(s, "en"),
    goreli: ["today", "yesterday", (g) => g + " days ago"], guncel: (x) => "Menu updated " + x, m_guncel: (x) => "Updated " + x, sayi: "en-US" },
};
const DIL_ADI = { tr: ["TR", "Türkçe"], en: ["EN", "English"] };
const ALERJEN = { gluten: ["gluten", "gluten"], kabuklu: ["kabuklu deniz ürünü", "crustaceans"], yumurta: ["yumurta", "egg"],
  balik: ["balık", "fish"], yerfistigi: ["yer fıstığı", "peanuts"], soya: ["soya", "soy"], sut: ["süt", "milk"],
  kuruyemis: ["kuruyemiş", "tree nuts"], kereviz: ["kereviz", "celery"], hardal: ["hardal", "mustard"], susam: ["susam", "sesame"],
  sulfit: ["sülfit", "sulphites"], acibakla: ["acı bakla", "lupin"], yumusakca: ["yumuşakça", "molluscs"] };
const alerjenYaz = (u) => !(u.alerjen && u.alerjen.length) ? "" :
  `<b>${kacis(T("icerir"))}</b> ${kacis(u.alerjen.map((a) => (ALERJEN[a] || [a, a])[DIL === "tr" ? 0 : 1]).join(", "))}`;
const ETIKET = { "Çok satan": { en: "Bestseller" }, "Yeni": { en: "New" }, "Vegan": { en: "Vegan" }, "Acılı": { en: "Spicy" }, "Glutensiz": { en: "Gluten-free" }, "Vejetaryen": { en: "Vegetarian" } };
let DIL = (ISLETME.diller || ["tr"]).includes(document.documentElement.lang) ? document.documentElement.lang : "tr";
const T = (k, ...a) => { const v = (UI[DIL] && UI[DIL][k] !== undefined) ? UI[DIL][k] : UI.tr[k]; return typeof v === "function" ? v(...a) : v; };
const cev = (o, alan) => (DIL !== "tr" && o.dil && o.dil[DIL] && o.dil[DIL][alan]) || o[alan];     // ürün alanı
const kadi = (k) => (DIL !== "tr" && k.dil && k.dil[DIL]) || k.ad;                                   // kategori adı
const isl = (alan) => (DIL !== "tr" && ISLETME.dil && ISLETME.dil[DIL] && ISLETME.dil[DIL][alan]) || ISLETME[alan];
const etiketAdi = (e) => (DIL !== "tr" && ETIKET[e] && ETIKET[e][DIL]) || e;
const tum = MENU.flatMap((k) => k.urunler.map((u) => ({ ...u, kat: k })));

/* ══════════════ YAY MOTORU ══════════════
   Kritik sönüme yakın yay (k=420, c=40 → ζ≈0,98): hızlı, taşmasız, doğal.
   Yarıda yakalanabilir: yeni hedef eski hızla devralır. */
function yay(baslangic, hedef, hiz, guncelle, bitti, k = 420, c = 40) {
  let x = baslangic, v = hiz, son = performance.now(), iptal = false;
  if (AZALT || AZALT_ANLIK) { guncelle(hedef); bitti && bitti(); return { dur() {}, hiz: () => 0 }; }
  function adim(t) {
    if (iptal) return;
    let dt = Math.min(0.032, (t - son) / 1000); son = t;
    for (let i = 0; i < 4; i++) { const a = -k * (x - hedef) - c * v; v += a * dt / 4; x += v * dt / 4; }   // alt adım: kararlılık
    if (Math.abs(v) < 8 && Math.abs(x - hedef) < 0.4) { guncelle(hedef); bitti && bitti(); return; }
    guncelle(x); requestAnimationFrame(adim);
  }
  requestAnimationFrame(adim);
  return { dur() { iptal = true; }, hiz: () => v };
}

/* Bırakma hızı: olayların OLUŞMA zamanı (e.timeStamp) ve son 100 ms — ana iş parçacığı
   meşgulken (video çözme) olaylar yığılsa da gerçek parmak hızı ölçülür. px/ms */
function birakmaHizi(ornek) {
  const son = ornek[ornek.length - 1]; let ilk = son;
  for (let i = ornek.length - 1; i >= 0 && son[0] - ornek[i][0] <= 100; i--) ilk = ornek[i];
  return son[0] > ilk[0] ? (son[1] - ilk[1]) / (son[0] - ilk[0]) : 0;
}
/* Kapat mı? iOS gibi: parmağın savuracağı yere bak (y + v·150 ms), yukarı fiske asla kapatmaz */
const kapatsinMi = (y, hiz, H) => hiz > -0.2 && (hiz > 0.5 || y + hiz * 150 > H * 0.28);

/* ══════════════ YAPRAK: parmağa bağlı katman ══════════════ */
class Yaprak {
  constructor(el, perde, { ilerleme, kapandi, kaydirici, surukleAlani }) {
    Object.assign(this, { el, perde, ilerleme, kapandi, kaydirici, surukleAlani, y: 0, acik: false, anim: null });
    this.baglaDokunma(); this.baglaFare();
    // açıldıktan hemen sonraki dokunuş (hızlı çift dokunuş) perdeye düşerse kapatmasın
    perde.addEventListener("click", () => this.acik && performance.now() - this.acilis > 400 && geriCik());
    perde.addEventListener("touchmove", (e) => e.cancelable && e.preventDefault(), { passive: false });   // eski iOS: arka sayfa kaymasın
  }
  get H() { return this.el.offsetHeight || innerHeight; }
  ayarla(y) {
    this.y = y;
    this.el.style.transform = `translate3d(0,${y}px,0)`;
    const p = Math.min(1, Math.max(0, 1 - y / this.H));
    this.perde.style.opacity = (p * 0.42).toFixed(3);
    this.perde.classList.toggle("var", p > 0.001);
    this.ilerleme && this.ilerleme(p);
  }
  ac(anlik = false, hiz = 0) {
    this.anim && this.anim.dur();
    if (!this.acik) this.acilis = performance.now();
    this.el.classList.add("gorunur"); this.perde.classList.add("etkin"); this.acik = true;
    if (!this.y && !this.el.dataset.acildi) this.ayarla(this.H);
    this.el.dataset.acildi = 1;
    if (anlik) { this.ayarla(0); return; }
    this.anim = yay(this.y, 0, hiz, (y) => this.ayarla(y));
  }
  kapat(hiz = 0, bitince) {
    this.anim && this.anim.dur(); this.acik = false; this.perde.classList.remove("etkin");
    this.anim = yay(this.y, this.H, Math.max(hiz, 0), (y) => this.ayarla(y), () => {
      this.el.classList.remove("gorunur"); delete this.el.dataset.acildi;
      this.kapandi && this.kapandi(); bitince && bitince();
    }, 380, 38);
  }
  /* Dokunma: aşağı çek → izler. İçerik kaydırılmışsa ya da yukarı çekiliyorsa kaydırmaya bırakır. */
  baglaDokunma() {
    let x0 = 0, y0 = 0, yBas = 0, karar = null, ornek = [];
    this.el.addEventListener("touchstart", (e) => {
      if (!this.acik || e.touches.length > 1) return;
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; yBas = this.y; karar = null; ornek = [[e.timeStamp, y0]];
      this.icerde = this.kaydirici && this.kaydirici.contains(e.target) && !(this.surukleAlani && this.surukleAlani.contains(e.target));
    }, { passive: true });
    this.el.addEventListener("touchmove", (e) => {
      if (!this.acik) return;
      const yy = e.touches[0].clientY, dy = yy - y0, dx = e.touches[0].clientX - x0;
      // karar İLK harekette verilmeli: önlenmeyen ilk touchmove'dan sonra tarayıcı kaydırmayı üstlenir
      if (karar === null) {
        if (!dy && !dx) return;
        karar = Math.abs(dx) > Math.abs(dy) ? "kaydir"                                    // yatay: sekmeler, vitrin şeridi
          : dy > 0 && (!this.icerde || this.kaydirici.scrollTop <= 0) ? "surukle" : "kaydir";
        if (karar === "surukle") { this.anim && this.anim.dur(); y0 = yy; yBas = this.y; }
      }
      if (karar !== "surukle") return;
      e.preventDefault();
      const d = yy - y0; let y = yBas + d;
      if (y < 0) y = -Math.pow(-y, 0.72);                       // yukarı: lastik direnci
      this.ayarla(y);
      ornek.push([e.timeStamp, yy]); if (ornek.length > 12) ornek.shift();
    }, { passive: false });
    const birak = () => {
      if (karar !== "surukle") { karar = null; return; }
      karar = null;
      const hiz = birakmaHizi(ornek);
      if (kapatsinMi(this.y, hiz, this.H)) { titret(6); geriCik(hiz * 1000); }
      else this.anim = yay(this.y, 0, hiz * 1000, (y) => this.ayarla(y));
    };
    this.el.addEventListener("touchend", birak); this.el.addEventListener("touchcancel", birak);
  }
  /* Fare (masaüstü): yalnız tutamaç/üst bölgeden sürükle */
  baglaFare() {
    const alan = this.surukleAlani || this.el; let y0 = null, yBas = 0, ornek = [];
    alan.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "mouse" || !this.acik || e.target.closest("button,input,a")) return;
      this.anim && this.anim.dur(); y0 = e.clientY; yBas = this.y; ornek = [[e.timeStamp, y0]]; alan.setPointerCapture(e.pointerId);
    });
    alan.addEventListener("pointermove", (e) => {
      if (y0 === null) return;
      let y = yBas + e.clientY - y0; if (y < 0) y = -Math.pow(-y, 0.72);
      this.ayarla(y); ornek.push([e.timeStamp, e.clientY]); if (ornek.length > 12) ornek.shift();
    });
    const birak = () => {
      if (y0 === null) return; y0 = null;
      const hiz = birakmaHizi(ornek);
      if (kapatsinMi(this.y, hiz, this.H)) geriCik(hiz * 1000);
      else this.anim = yay(this.y, 0, hiz * 1000, (y) => this.ayarla(y));
    };
    alan.addEventListener("pointerup", birak); alan.addEventListener("pointercancel", birak);
  }
}

/* ══════════════ AÇILIŞ İÇERİĞİ ══════════════ */
document.title = ISLETME.ad;
if (!ISLETME.logo) $("ad").textContent = ISLETME.ad;
if (!ISLETME.logo) document.querySelectorAll(".isletme-ad").forEach((e) => (e.textContent = ISLETME.ad));
/* Panelde boş bırakılan satır görünmez */
$("wifi").hidden = !ISLETME.wifi; $("telefon").hidden = !ISLETME.telefon;
$("instagram").hidden = !ISLETME.instagram; $("adres").hidden = !ISLETME.adres;
if (ISLETME.wifi) { $("wifi-ag").textContent = ISLETME.wifi.ag; $("wifi-sifre").textContent = ISLETME.wifi.sifre; }
if (ISLETME.telefon) { $("telefon").href = "tel:" + ISLETME.telefon.replace(/[^+\d]/g, ""); $("telefon-yazi").textContent = "\u2066" + ISLETME.telefon + "\u2069"; }
$("yorum").hidden = !ISLETME.yorum; if (ISLETME.yorum) $("yorum").href = ISLETME.yorum;
$("durum").hidden = !SAATLI; $("hafta").closest("details").hidden = !SAATLI;
if (ISLETME.instagram) $("instagram").href = "https://www.instagram.com/" + ISLETME.instagram + "/";
$("instagram-ad").textContent = "\u2066@" + ISLETME.instagram + "\u2069";   // LRI…PDI: sağdan sola yazıda "@" başta kalsın
$("adres-yazi").textContent = ISLETME.adres;
$("adres").href = ISLETME.harita || "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(ISLETME.adres || "");
/* Dile bağlı her şey burada: dil değişince yalnız bu ve menuCiz() yeniden çalışır (sayfa yenilenmez) */
function acilisCiz() {
  document.querySelectorAll("[data-t]").forEach((e) => (e.textContent = T(e.dataset.t)));
  document.querySelectorAll("[data-ta]").forEach((e) => e.setAttribute("aria-label", T(e.dataset.ta)));
  $("ara-kutu").placeholder = T("ara_ipucu");
  $("menu-sayi").textContent = T("urun", tum.length);
  $("guncel").textContent = T("guncel", goreli(ISLETME.guncel));
  $("m-guncel").textContent = T("m_guncel", goreli(ISLETME.guncel));
  $("oneri-baslik").textContent = isl("oneri"); $("m-not").textContent = isl("not_");
  $("ozet").textContent = T("ozet", tum.length);
  durumCiz(); dilSeciciCiz();
}

(function kapak() {
  const u = ISLETME.hero_foto;
  const f = $("foto");
  if (!u) { f.parentNode.parentNode.hidden = true; return; }   // kapak yoksa fotoğraf alanı da yok
  // src ve srcset HTML'de. Satır içi onload CSP'ye takıldığı için yüklenme burada dinlenir.
  if (f.complete && f.naturalWidth) f.parentNode.classList.add("hazir");
  else f.addEventListener("load", () => f.parentNode.classList.add("hazir"), { once: true });
  if (!ISLETME.hero_video || AZALT || TASARRUF) return;
  /* Kapak videosu sayfa oturduktan SONRA ve yalnız uygun bağlantıda iner: fotoğraf LCP'yi taşır,
     video (~1,3 MB) yavaş bağlantıda ya da Android'in hücresel verisinde hiç inmez. */
  const bag = navigator.connection || {};
  if (bag.type === "cellular" || /(^|-)2g|3g/.test(bag.effectiveType || "")) return;
  const basla = () => setTimeout(videoKur, 1200);
  if (document.readyState === "complete") basla(); else addEventListener("load", basla, { once: true });
})();
function videoKur() {
  const v = document.createElement("video");
  Object.assign(v, { muted: true, loop: true, playsInline: true, autoplay: true, preload: "auto", src: ISLETME.hero_video });
  ["muted", "playsinline", "webkit-playsinline", "autoplay", "loop"].forEach((a) => v.setAttribute(a, ""));
  v.setAttribute("aria-hidden", "true"); v.addEventListener("playing", () => v.classList.add("hazir"), { once: true });
  document.querySelector(".foto .katman").append(v); v.play().catch(() => {});   // Düşük Güç Modu: oynamazsa fotoğraf kalır
}

function durumCiz() {
  if (!SAATLI) return;
  const p =Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Istanbul", weekday: "short",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  const gun = { Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6, Sun:7 }[p.weekday];
  const dk = (s) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
  const goster = (s) => (s === "24:00" ? "00:00" : s), aralik = (a, b) => a + "\u2009–\u2009" + goster(b);
  const simdi = +p.hour * 60 + +p.minute, [ac, kapa] = ISLETME.saatler[gun] || [];
  $("durum").classList.remove("kapali", "yakinda");
  $("bugun-ozet").textContent = ac ? T("bugun", aralik(ac, kapa)) : T("bugun_kapali");
  if (ac && simdi >= dk(ac) && simdi < dk(kapa)) {
    const kalan = dk(kapa) - simdi; $("durum-yazi").textContent = T("acik");
    if (kalan <= 60) { $("durum").classList.add("yakinda"); $("saat-yazi").textContent = T("kapanisa", kalan); }
    else $("saat-yazi").textContent = T("kadar", kapa);
  } else {
    $("durum").classList.add("kapali"); $("durum-yazi").textContent = T("kapali");
    const yarin = ISLETME.saatler[gun % 7 + 1];
    $("saat-yazi").textContent = ac && simdi < dk(ac) ? (dk(ac) - simdi <= 60 ? T("dk_sonra", dk(ac) - simdi) : T("acilir", ac))
      : (yarin ? T("yarin", yarin[0]) : "");
  }
  const G = T("gunler");
  $("hafta").innerHTML = [1,2,3,4,5,6,7].map((g) => { const s = ISLETME.saatler[g], b = g === gun ? ' class="bugun"' : "";
    return `<dt${b}>${G[g]}</dt><dd${b}>${s ? aralik(s[0], s[1]) : T("kapali")}</dd>`; }).join("");
}

$("wifi").addEventListener("click", async () => {
  const b = $("wifi"), ag = $("wifi-ag");
  try { await navigator.clipboard.writeText(ISLETME.wifi.sifre); }
  catch { const r = document.createRange(); r.selectNodeContents($("wifi-sifre")); const s = getSelection();
    s.removeAllRanges(); s.addRange(r); document.execCommand("copy"); s.removeAllRanges(); }
  titret(8);
  const yaz = (metin, tamam) => { b.classList.add("degisiyor");
    setTimeout(() => { $("kopya-yazi").textContent = metin; b.classList.toggle("tamam", tamam); b.classList.remove("degisiyor"); }, 150); };
  yaz(T("kopyalandi"), true);
  // alt satır: bir sonraki adım (TEK satır — satır yüksekliği zıplamasın)
  ag.style.opacity = 0; setTimeout(() => { ag.textContent = T("yapistir"); ag.style.opacity = 1; }, 150);
  clearTimeout(b._z); b._z = setTimeout(() => { yaz(T("kopyala"), false); ag.style.opacity = 0;
    setTimeout(() => { ag.textContent = ISLETME.wifi.ag; ag.style.opacity = 1; }, 150); }, 2600);
});

/* ══════════════ MENÜ İÇERİĞİ ══════════════ */
const OYNAT = $("oynat-ikon").innerHTML;
const etiketler = (u) => [...(u.tukendi ? [`<span class="etiket tukendi">${kacis(T("tukendi"))}</span>`] : []), ...(u.sef ? [`<span class="etiket sef">${kacis(isl("oneri_tekil"))}</span>`] : []),
  ...(u.etiket || []).map((e) => `<span class="etiket">${kacis(etiketAdi(e))}</span>`)];
const kaydir = $("menuKaydir");
let bolumler = [], sekmeler = [], gorsellerVerildi = false;
const isaret = document.createElement("span"); isaret.className = "isaret";
const gelisIzle = () => document.querySelectorAll("#menuYaprak img.gel:not(.yuklendi)").forEach((i) => {
  if (i.complete && i.naturalWidth) i.classList.add("yuklendi"); else i.addEventListener("load", () => i.classList.add("yuklendi"), { once: true }); });
const gorselVer = () => document.querySelectorAll("#menuYaprak img[data-src]").forEach((i) => { i.src = i.dataset.src; i.removeAttribute("data-src"); });
/* Menü dile göre çizilir; dil değişince yeniden çağrılır (görseller zaten indiyse doğrudan verilir) */
function menuCiz() {
  $("serit").innerHTML = tum.filter((u) => u.sef).map((u) => { const m = medya(u), i = tum.indexOf(u);
    return `<button class="vitrin${u.tukendi ? " bitti" : ""}" type="button" data-i="${i}"><span class="kadr"><img class="gel" data-src="${boyut(m.foto, 600, 750)}" alt="${kacis(cev(u, "ad"))}" width="300" height="375" loading="lazy" decoding="async">
      ${m.video ? `<span class="oynat">${OYNAT}${kacis(T("video"))}</span>` : ""}</span><b>${kacis(cev(u, "ad"))}<span>${para(u.fiyat)}</span></b><small>${kacis(cev(u, "aciklama") || "")}</small></button>`; }).join("");
  $("sekmeler").innerHTML = MENU.map((k) => `<button class="sekme" type="button" data-k="${slug(k.ad)}">${kacis(kadi(k))}</button>`).join("");
  $("liste").innerHTML = MENU.map((k) => `<section class="bolum" id="k-${slug(k.ad)}" data-k="${slug(k.ad)}" aria-labelledby="b-${slug(k.ad)}">
    <h3 id="b-${slug(k.ad)}">${kacis(kadi(k))}</h3>
    ${k.urunler.map((u) => { const i = tum.findIndex((t) => t.ad === u.ad), m = medya(u), et = etiketler(u), ad = cev(u, "ad"), ac = cev(u, "aciklama");
      // arama: gösterilen dil + Türkçe (turist "latte" da yazar, garsonun söylediği "menemen"i de)
      const ara = kacis(sade([ad, ac, u.ad, u.aciklama, ...(u.etiket || []).map(etiketAdi)].filter(Boolean).join(" ")));
      const govde = `<h4 data-ad="${kacis(ad)}">${kacis(ad)}</h4><span class="fiyat">${para(u.fiyat)}</span>
        ${ac ? `<p>${kacis(ac)}</p>` : ""}${et.length ? `<span class="etiketler">${et.join("")}</span>` : ""}${u.alerjen && u.alerjen.length ? `<span class="alerjen">${alerjenYaz(u)}</span>` : ""}`;
      if (!m.foto) return `<div class="urun yalin${u.tukendi ? " bitti" : ""}" data-ara="${ara}">${govde}</div>`;
      return `<button class="urun${u.tukendi ? " bitti" : ""}" type="button" data-i="${i}" data-ara="${ara}">
        <span class="kucuk"><img class="gel" data-src="${boyut(m.foto, 160, 160)}" alt="" width="76" height="76" loading="lazy" decoding="async">${m.video ? `<i aria-hidden="true">${OYNAT}</i>` : ""}</span>
        ${govde}</button>`; }).join("")}
  </section>`).join("");
  bolumler = [...document.querySelectorAll(".bolum")]; sekmeler = [...document.querySelectorAll(".sekme")];
  $("sekmeler").append(isaret);
  if (gorsellerVerildi) gorselVer();
  gelisIzle();
}
menuCiz();

function etkin(k) {
  if (document.documentElement.classList.contains("kilit")) { const c = MENU.find((x) => slug(x.ad) === k); c && IZ.kat(c.ad); }   // menü açıkken (açılış animasyonu dahil)
  sekmeler.forEach((s) => s.setAttribute("aria-current", s.dataset.k === k ? "true" : "false"));
  const s = sekmeler.find((x) => x.dataset.k === k), n = $("sekmeler"); if (!s) return;
  isaret.style.setProperty("--x", s.offsetLeft + "px"); isaret.style.setProperty("--o", s.offsetWidth / 100);
  // sekmeyi şeridin ortasına getir — göreli fark: soldan sağa ve sağdan sola yazıda aynı çalışır
  const nr = n.getBoundingClientRect(), sr = s.getBoundingClientRect();
  n.scrollTo({ left: n.scrollLeft + (sr.left + sr.width / 2) - (nr.left + nr.width / 2), behavior: AZALT ? "auto" : "smooth" });
}
let bant = null;
function bantKur() {
  bant && bant.disconnect();
  const ustH = $("m-ust").offsetHeight;
  bant = new IntersectionObserver((g) => { const v = g.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
    if (v[0] && !kaydirHedef) etkin(v[0].target.dataset.k); }, { root: kaydir, rootMargin: `-${ustH - 50}px 0px -60% 0px` });
  bolumler.forEach((b) => bant.observe(b));
}
new IntersectionObserver(([e]) => $("m-ust").classList.toggle("golgeli", !e.isIntersecting), { root: kaydir }).observe($("m-h2"));
/* Sekmeye dokun: kaydırma bir yayla (tarayıcının düz kaydırması yerine), gösterge hemen gider */
let kaydirHedef = null, kaydirAnim = null;
$("sekmeler").addEventListener("click", (e) => {
  const s = e.target.closest(".sekme"); if (!s) return;
  const b = $("k-" + s.dataset.k); etkin(s.dataset.k); kaydirHedef = s.dataset.k;
  const hedef = Math.min(kaydir.scrollHeight - kaydir.clientHeight,
    kaydir.scrollTop + b.getBoundingClientRect().top - kaydir.getBoundingClientRect().top - 8);
  kaydirAnim && kaydirAnim.dur();
  kaydirAnim = yay(kaydir.scrollTop, hedef, 0, (y) => (kaydir.scrollTop = y), () => (kaydirHedef = null), 260, 32);
});
kaydir.addEventListener("touchstart", () => { kaydirAnim && kaydirAnim.dur(); kaydirHedef = null; }, { passive: true });   // parmak kaydırmayı yakalar

/* Arama */
$("ara-ac").addEventListener("click", () => {
  const a = $("ara"), acik = !a.classList.contains("acik");
  a.classList.toggle("acik", acik); $("ara-ac").setAttribute("aria-expanded", acik);
  if (acik) $("ara-kutu").focus(); else { $("ara-kutu").value = ""; suz(""); }
  bantKur();
});
function suz(q) {
  const s = sade(q.trim()); let bulunan = 0;
  kaydirAnim && kaydirAnim.dur(); kaydir.scrollTop = 0;              // sonuçlar baştan görünsün
  bolumler.forEach((b) => { let n = 0;
    b.querySelectorAll(".urun").forEach((u) => { const ok = !s || u.dataset.ara.includes(s); u.hidden = !ok; n += ok;
      const h = u.querySelector("h4"), ad = h.dataset.ad, j = s ? sade(ad).indexOf(s) : -1;
      h.innerHTML = j < 0 ? kacis(ad) : kacis(ad.slice(0, j)) + "<mark>" + kacis(ad.slice(j, j + s.length)) + "</mark>" + kacis(ad.slice(j + s.length)); });
    b.hidden = n === 0; bulunan += n; });
  $("sekmeler").style.display = s ? "none" : ""; $("oneri").hidden = !!s;
  $("bos").classList.toggle("gorunur", bulunan === 0);
  $("bos").textContent = bulunan === 0 ? T("sonuc_yok", q.trim()) : "";
  IZ.ara(q, bulunan);
}
$("ara-kutu").addEventListener("input", (e) => suz(e.target.value));

/* ══════════════ KATMANLAR ══════════════ */
const kok = $("kok"), alt = $("alt");
const menuYaprak = new Yaprak($("menuYaprak"), $("perde1"), {
  kaydirici: kaydir, surukleAlani: $("m-ust"),
  // açılış geri çekilir, alt düğme aşağı iner — hepsi aynı ilerleme değerine bağlı
  ilerleme(p) {
    kok.style.transformOrigin = `50% ${scrollY + innerHeight * 0.5}px`;
    kok.style.willChange = p > 0.001 && p < 0.999 ? "transform" : "";          // katman yalnız hareket sırasında (zayıf telefonda bellek)
    kok.style.transform = p > 0.001 ? `scale(${(1 - 0.06 * p).toFixed(4)})` : "";
    document.documentElement.classList.toggle("katmanli", p > 0.001);
    alt.style.transform = p > 0.001 ? `translate3d(0,${(p * 120).toFixed(1)}%,0)` : "";
    $("menu-ac").setAttribute("aria-expanded", p > 0.5);
  },
  kapandi() { const hv = document.querySelector(".foto video"); if (hv) hv.play().catch(() => {});
    document.documentElement.classList.remove("kilit", "katmanli"); kok.style.transform = ""; kok.style.willChange = ""; alt.style.transform = "";
    kok.inert = alt.inert = false; $("menu-ac").focus({ preventScroll: true }); },
});
const urunYaprak = new Yaprak($("urunYaprak"), $("perde2"), {
  kaydirici: document.querySelector(".u-govde"), surukleAlani: $("u-medya"),
  ilerleme(p) { ucusGuncelle && ucusGuncelle(p); },
  kapandi() { panelMedyaTemizle(); $("menuYaprak").inert = false; if (sonDugme && sonDugme.isConnected) sonDugme.focus({ preventScroll: true }); },
});

/* ── ürün paneli + uçan görsel ── */
let ucusGuncelle = null, kaynakKutu = null, ucan = null, acikUrun = -1;
function panelDoldur(i, yerTutucu) {
  const u = tum[i], m = medya(u), yer = $("u-medya");
  yer.querySelectorAll("img,video").forEach((e) => e.remove());
  const img = new Image(); img.alt = cev(u, "ad"); img.id = "u-gorsel"; img.className = "dusuk"; acikUrun = i;
  img.src = yerTutucu || boyut(m.foto, 160, 160); yer.prepend(img);
  const buyuk = new Image(); buyuk.src = boyut(m.foto, 1120, 840);
  if (buyuk.complete && buyuk.naturalWidth) { img.src = buyuk.src; img.classList.remove("dusuk"); }   // dokunuşta indirildiyse keskin başla
  buyuk.decode().then(() => { if (img.isConnected) { img.src = buyuk.src; img.classList.remove("dusuk"); } }).catch(() => {});
  if (m.video && !AZALT && !TASARRUF) {
    const v = document.createElement("video");
    Object.assign(v, { muted: true, loop: true, playsInline: true, autoplay: true, preload: "auto", src: m.video });
    ["muted", "playsinline", "webkit-playsinline", "autoplay", "loop"].forEach((a) => v.setAttribute(a, ""));
  v.setAttribute("aria-hidden", "true"); v.addEventListener("playing", () => v.classList.add("hazir"), { once: true }); yer.append(v); v.play().catch(() => {});
  }
  panelMetin(u);
}
function panelMetin(u) {
  $("u-ad").textContent = cev(u, "ad"); $("u-fiyat").textContent = para(u.fiyat); $("u-aciklama").textContent = cev(u, "aciklama") || "";
  $("u-etiket").innerHTML = etiketler(u).join(""); $("u-alerjen").innerHTML = alerjenYaz(u); $("u-kategori").textContent = kadi(u.kat);
}
function panelMedyaTemizle() { $("u-medya").querySelectorAll("video").forEach((v) => v.pause()); ucanKaldir(); }
function ucanKaldir() { ucan && ucan.remove(); ucan = null; ucusGuncelle = null; $("u-medya").classList.remove("ucusta"); }
/* dikdörtgen R'yi, r1 boyutlu klonda: tek tip ölçek + kırpma (en-boy oranı bozulmaz) */
function ucanCiz(R, r1, yaricap) {
  const sc = Math.max(R.w / r1.w, R.h / r1.h), cx = (r1.w - R.w / sc) / 2, cy = (r1.h - R.h / sc) / 2;
  ucan.style.transform = `translate3d(${R.x - cx * sc}px,${R.y - cy * sc}px,0) scale(${sc})`;
  ucan.style.clipPath = `inset(${cy}px ${cx}px round ${yaricap / sc}px)`;
}
const kutu = (el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
function ucusKur(kaynakImg, yon) {
  ucanKaldir(); if (AZALT || !kaynakImg || !kaynakImg.getClientRects().length) return;
  const medyaEl = $("u-medya"), H = urunYaprak.H;
  const r1 = kutu(medyaEl); r1.y -= urunYaprak.y;                 // panel açıkken (y=0) görselin yeri
  const r0 = kutu(kaynakImg), r0Yaricap = parseFloat(getComputedStyle(kaynakImg.parentElement).borderRadius) || 12;
  ucan = document.createElement("div"); ucan.className = "ucan"; ucan.style.width = r1.w + "px"; ucan.style.height = r1.h + "px";
  const im = new Image(); im.src = $("u-gorsel").src; im.alt = ""; ucan.append(im); document.body.append(ucan);
  medyaEl.classList.add("ucusta");
  const yBas = urunYaprak.y;
  ucusGuncelle = (p) => {
    const y = urunYaprak.y;
    // açılış: t = p (0 → 1); kapanış: başlangıç konumundan küçük görsele
    const t = yon === "ac" ? p : Math.min(1, Math.max(0, (y - yBas) / Math.max(1, H - yBas)));
    const hedef = { x: r1.x, y: r1.y + y, w: r1.w, h: r1.h };
    const R = yon === "ac" ? { x: lerp(r0.x, hedef.x, t), y: lerp(r0.y, hedef.y, t), w: lerp(r0.w, hedef.w, t), h: lerp(r0.h, hedef.h, t) }
      : { x: lerp(r1.x, r0.x, t), y: lerp(r1.y + yBas, r0.y, t), w: lerp(r1.w, r0.w, t), h: lerp(r1.h, r0.h, t) };
    ucanCiz(R, r1, yon === "ac" ? lerp(r0Yaricap, 0, t) : lerp(0, r0Yaricap, t));
    if (yon === "ac" && t > 0.995) ucanKaldir();
  };
  ucusGuncelle(1 - urunYaprak.y / H);
}
let sonKaynak = null, sonDugme = null;
function urunAc(i, dugme, anlik = false) {
  sonKaynak = dugme && dugme.querySelector("img"); sonDugme = dugme;
  $("menuYaprak").inert = true;
  panelDoldur(i, sonKaynak && sonKaynak.currentSrc);
  IZ.urun(tum[i], dugme && dugme.classList.contains("vitrin"));
  urunYaprak.el.classList.add("gorunur");
  if (!urunYaprak.acik) urunYaprak.ayarla(urunYaprak.H);
  if (!anlik) ucusKur(sonKaynak, "ac");
  urunYaprak.ac(anlik);
  $("u-kapat").focus({ preventScroll: true });
}
function urunKapat(hiz = 0) {
  $("u-medya").querySelectorAll("video").forEach((v) => v.pause());
  const gorunur = sonKaynak && sonKaynak.getClientRects().length && (() => { const r = sonKaynak.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; })();
  if (gorunur) ucusKur(sonKaynak, "kapat"); else ucanKaldir();
  urunYaprak.kapat(hiz);
}
/* dokunma anında büyük görseli indirmeye başla: panel açılınca çoğu zaman hazır */
addEventListener("pointerdown", (e) => { if (e.target.closest("#menu-ac")) menuGorselleri(); }, { passive: true, capture: true });
document.addEventListener("pointerdown", (e) => { const b = e.target.closest("[data-i]"); if (!b) return;
  const m = medya(tum[+b.dataset.i]); if (m.foto) new Image().src = boyut(m.foto, 1120, 840); }, { passive: true });

/* ══════════════ GEÇMİŞ: her katman bir adım ══════════════ */
const TABAN = location.pathname.replace(/\/menu\/?$/, "").replace(/\/$/, "");
let durumSahte = false;
/* Menü görselleri menü ilk açılınca iner: yaprak ekranın hemen altında beklediği için tarayıcı onları
   "görünmek üzere" sayıp açılışta indiriyor, kapak fotoğrafıyla bant genişliği paylaşıyordu (LCP). */
function menuGorselleri() {
  if (gorsellerVerildi) return; gorsellerVerildi = true; gorselVer();
}
function menuAc(anlik = false) {
  menuGorselleri();
  setTimeout(() => { const hv = document.querySelector(".foto video"); if (hv && menuYaprak.acik) hv.pause(); }, 500);   // açılış bitince
  document.documentElement.classList.add("kilit");
  kok.inert = alt.inert = true;                                      // ekran okuyucu arkadaki sayfayı okumasın
  menuYaprak.ac(anlik); bantKur(); IZ.menu();
  $("menu-kapat").focus({ preventScroll: true });                    // görünür olduktan sonra
  requestAnimationFrame(() => { gelisIzle(); if (!isaret.classList.contains("hazir")) { etkin(bolumler[0].dataset.k); requestAnimationFrame(() => isaret.classList.add("hazir")); } });
}
function menuKapat(hiz = 0) { menuYaprak.kapat(hiz); }
function geriCik(hiz = 0) {
  // katmanı kapat ve geçmişi bir adım geri al (UI'dan kapatınca da tutarlı kalsın)
  geriHiz = hiz;
  if (history.state && history.state.k) history.back(); else durumaUy({ k: null }, hiz);
}
let geriHiz = 0;
function durumaUy(s, hiz = 0) {
  const hedef = s || {};
  if (urunYaprak.acik && hedef.k !== "urun") urunKapat(hiz);
  if (menuYaprak.acik && !hedef.k) menuKapat(urunYaprak.acik ? 0 : hiz);
  if ((hedef.k === "menu" || hedef.k === "urun") && !menuYaprak.acik) menuAc();
  if (hedef.k === "urun" && !urunYaprak.acik) urunAc(hedef.i, document.querySelector(`.urun[data-i="${hedef.i}"]`));
}
addEventListener("popstate", (e) => {
  // iOS kenar kaydırması / Android geri hareketi zaten kendi animasyonunu oynattıysa ikinci kez oynatma
  if (e.hasUAVisualTransition) { const eski = AZALT_ANLIK; AZALT_ANLIK = true; durumaUy(e.state, 0); AZALT_ANLIK = eski; }
  else durumaUy(e.state, geriHiz);
  geriHiz = 0;
});

$("menu-ac").addEventListener("click", () => { if (menuYaprak.acik) return; history.pushState({ k: "menu" }, "", TABAN + "/menu"); titret(6); menuAc(); });
$("menu-kapat").addEventListener("click", () => geriCik());
$("u-kapat").addEventListener("click", () => geriCik());
addEventListener("keydown", (e) => { if (e.key === "Escape" && (menuYaprak.acik || urunYaprak.acik)) geriCik(); });
document.addEventListener("click", (e) => { const b = e.target.closest("[data-i]"); if (!b || urunYaprak.acik) return;
  // "Menüyü aç"a çift dokunuşta ikinci dokunuş, yükselen menüdeki bir ürüne denk gelmesin
  if (performance.now() - (menuYaprak.acilis || 0) < 450) return;
  history.pushState({ k: "urun", i: +b.dataset.i }, "", TABAN + "/menu#" + slug(tum[+b.dataset.i].ad)); urunAc(+b.dataset.i, b); });
addEventListener("resize", () => { if (menuYaprak.acik) { menuYaprak.ayarla(0); bantKur(); } if (urunYaprak.acik) urunYaprak.ayarla(0); }, { passive: true });
document.fonts.ready.then(() => { const e = document.querySelector('.sekme[aria-current="true"]'); if (e) etkin(e.dataset.k); });

/* /menu ile gelindiyse menü açık başlar (geçmiş: açılış ← menü, geri tuşu açılışa döner) */
if (/\/menu\/?$/.test(location.pathname)) {
  const iz = location.hash;                                          // adres değişmeden önce oku
  history.replaceState({ k: null }, "", TABAN || "/");
  history.pushState({ k: "menu" }, "", TABAN + "/menu");
  menuAc(true);
  const i = tum.findIndex((u) => "#" + slug(u.ad) === decodeURIComponent(iz));   // /menu#brownie → ürün açık gelir
  if (iz && i >= 0) {
    history.replaceState({ k: "menu" }, "", TABAN + "/menu");
    history.pushState({ k: "urun", i }, "", TABAN + "/menu#" + slug(tum[i].ad));
    const d = document.querySelector(`.urun[data-i="${i}"]`);
    requestAnimationFrame(() => { d.scrollIntoView({ block: "center" }); urunAc(i, d, true); });
  }
}
/* ══════════════ DİL SEÇİCİ ══════════════ */
function dilSeciciCiz() {
  const d = ISLETME.diller || ["tr"], k = $("dil-sec");
  k.hidden = d.length < 2;
  k.innerHTML = d.map((x) => `<button type="button" lang="${x}" data-dil="${x}" aria-label="${DIL_ADI[x][1]}" aria-pressed="${x === DIL}">${DIL_ADI[x][0]}</button>`).join("");
}
function dilDegistir(d) {
  if (d === DIL || !(ISLETME.diller || []).includes(d)) return;
  DIL = d; document.documentElement.lang = d;
  try { localStorage.setItem("qm-dil", d); } catch {}
  const ara = $("ara-kutu").value;
  acilisCiz(); menuCiz();
  requestAnimationFrame(() => { $("serit").scrollLeft = 0; });   // yeni dilde öneriler baştan
  if (ara) suz(ara);
  if (menuYaprak.acik) { bantKur(); const g = bolumler.find((b) => b.getBoundingClientRect().bottom > kaydir.getBoundingClientRect().top + 60); etkin((g || bolumler[0]).dataset.k); }
  else isaret.classList.remove("hazir");
  if (urunYaprak.acik && acikUrun >= 0) panelMetin(tum[acikUrun]);
}
$("dil-sec").addEventListener("click", (e) => { const b = e.target.closest("[data-dil]"); if (b) { titret(6); if (b.dataset.dil !== DIL) IZ.eylem("dil"); dilDegistir(b.dataset.dil); } });

/* ══════════════ GECE MODU ══════════════
   Varsayılan: telefonun ayarı (başlıkta, boyamadan önce uygulanır). Düğmeyle seçilen hatırlanır;
   seçim yoksa telefon ayarı değişince sayfa da değişir. */
const geceMi = () => document.documentElement.classList.contains("gece");
function temaRengi() { $("tema-rengi").content = getComputedStyle(document.documentElement).getPropertyValue("--zemin").trim(); }
function geceUygula(g, kaydet) {
  const h = document.documentElement;
  if (!AZALT) { h.classList.add("gecis"); clearTimeout(geceUygula._z); geceUygula._z = setTimeout(() => h.classList.remove("gecis"), 420); }
  h.classList.toggle("gece", g);
  if (kaydet) try { localStorage.setItem("qm-gece", g ? "1" : "0"); } catch {}
  document.querySelectorAll(".gece-dugme").forEach((b) => b.setAttribute("aria-pressed", g));
  temaRengi();
}
document.querySelectorAll(".gece-dugme").forEach((b) => b.addEventListener("click", () => { titret(6); IZ.eylem("gece"); geceUygula(!geceMi(), true); }));
/* dışarı giden bağlantılar ve Wi-Fi kopyalama: panelde "etkileşimler" */
[["wifi", "wifi"], ["instagram", "instagram"], ["yorum", "yorum"], ["telefon", "telefon"], ["adres", "yol"]].forEach(([id, k]) => $(id).addEventListener("click", () => IZ.eylem(k)));
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => { let k = null; try { k = localStorage.getItem("qm-gece"); } catch {} if (k === null) geceUygula(e.matches, false); });
document.querySelectorAll(".gece-dugme").forEach((b) => b.setAttribute("aria-pressed", geceMi()));
temaRengi();
acilisCiz();

/* D: iOS Safari :active durumunu ancak bir touchstart dinleyicisi varsa gösterir */
document.addEventListener("touchstart", () => {}, { passive: true });
addEventListener("pointerdown", () => document.documentElement.classList.add("dokunmatik"), { passive: true, capture: true });
addEventListener("keydown", (e) => { if (e.key === "Tab") document.documentElement.classList.remove("dokunmatik"); }, { capture: true });
/* K: geri gelince (bfcache: Instagram'dan dönüş) videolar yeniden oynasın */
addEventListener("pageshow", (e) => { if (e.persisted) document.querySelectorAll("video").forEach((v) => v.play().catch(() => {})); });
