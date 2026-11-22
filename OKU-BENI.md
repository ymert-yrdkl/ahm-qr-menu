# AHM Cloud QR Menü

Bütün mekânlar için tek bir QR menü uygulaması. Tasarım herkes için aynı. Mekândan mekâna yalnızca logo, ana renk ve zemin rengi değişir. Her mekân kendi alt alan adında açılır:

```
https://schnitzgo.ahmcloud.com          müşterinin gördüğü menü
https://schnitzgo.ahmcloud.com/panel/   mekânın menü paneli
```

Tek bir Coolify uygulaması bütün mekânlara hizmet eder. Yeni mekân için yeni sunucu ya da yeni kurulum gerekmez.

## Klasörler

```
server.js               Sunucu. Bağımlılığı yok, Node.js 20+ yeterli.
lib/schema.js           Menü dosyasının biçimi ve doğrulaması.
public/                 Menü sayfası, panel, ortak tasarım.
venues/<mekan>/         Depodaki mekânlar. Klasör adı = alt alan adı.
  menu.json             Menünün tamamı.
  img/                  Logo ve ürün fotoğrafları.
tools/                  Yeni mekân, içe aktarma ve kontrol araçları.
Dockerfile              Coolify bu dosyayla kurar.
```

## Veri nasıl akar

1. Mekânlar depoda `venues/` altında durur.
2. Uygulama açılırken `venues/` içindeki her mekânı kalıcı veri klasörüne (`/data/venues`) kopyalar. **Veri klasöründe zaten olan mekâna dokunmaz.** Böylece paneldeki fiyatlar ve değişiklikler yeniden kurulumda kaybolmaz.
3. Panelde yapılan her değişiklik `/data/venues/<mekan>/menu.json` dosyasına yazılır. Önceki hal `yedek/` klasörüne saklanır.
4. Depodaki bir mekânı sunucudakinin üzerine yazmak gerekirse `SEED_OVERWRITE=mekan1,mekan2` ortam değişkeniyle bir kez yeniden başlatın, sonra değişkeni silin. Sunucudaki önceki hal yedeklenir, panel şifresi korunur, ama paneldeki fiyatlar gider.

## Coolify kurulumu

1. **Depo:** Bu klasörü GitHub veya Gitea'ya gönderin. Coolify'da *New Resource → Public/Private Repository* seçin.
2. **Build Pack:** `Dockerfile`. Port: `3000`.
3. **Kalıcı depolama:** *Storages* bölümünde bir volume ekleyin, bağlama yolu `/data`. Bu yapılmazsa her kurulumda panel değişiklikleri silinir.
4. **Ortam değişkenleri:**

   | Değişken | Değer |
   |---|---|
   | `ADMIN_PASSWORD` | Bütün panellere giren yönetici şifresi. Uzun ve rastgele olsun. |
   | `SESSION_SECRET` | 64 karakterlik rastgele metin. |
   | `BASE_DOMAIN` | `ahmcloud.com` |
   | `NODE_ENV` | `production` |

5. **DNS:** Alan adı sağlayıcısında bir kez `*.ahmcloud.com` için sunucunun IP adresine giden **A kaydı** açın. Her mekân için ayrı DNS kaydı gerekmez.
6. **Alan adları:** Coolify'da uygulamanın *Domains* alanına mekânları virgülle ekleyin:
   ```
   https://schnitzgo.ahmcloud.com,https://burgerlab.ahmcloud.com
   ```
   Coolify her biri için SSL sertifikasını kendisi alır. Yeni mekânda bu listeye ekleyip *Redeploy* yeterli.
   İsterseniz `https://*.ahmcloud.com` joker alan adı da kullanılabilir, ama bunun için Coolify'da Traefik'e DNS doğrulamalı joker sertifika tanımlamak gerekir.
7. **Sağlık kontrolü:** `/healthz` adresi `ok` döner.

İsteğe bağlı değişkenler:

| Değişken | Ne işe yarar |
|---|---|
| `DOMAIN_MAP` | Mekânın kendi alan adı için: `menu.kafem.com=kafem,qr.burger.com=burgerlab` |
| `DEFAULT_VENUE` | Alt alan adı eşleşmezse açılacak mekân. |
| `SEED_OVERWRITE` | Depodaki sürümü sunucudakinin üzerine yazar (yukarıya bakın). |
| `DEMO_VENUES` | Paneli şifresiz açılacak demo mekânlar (`venues/_demo.txt` ile aynı). Yalnız tanıtım için. |

## Yeni mekân ekleme

1. Mekân adını verin. Menü içeriği (ürün adları, açıklamalar, fotoğraflar) Yemeksepeti, Getir, Trendyol Yemek veya mekânın sitesinden toplanır ve bir kaynak dosyaya yazılır.
2. Mekân klasörü açılır ve içerik aktarılır:
   ```bash
   node tools/yeni-mekan.mjs burgerlab "Burger Lab" "#e4572e"
   node tools/ice-aktar.mjs burgerlab kaynak/burgerlab.json
   node tools/kontrol.mjs
   ```
   Fiyatlar varsayılan olarak aktarılmaz, çünkü platform fiyatları mekânın gerçek fiyatı değildir.
3. Depoya gönderilir, Coolify'da alan adı eklenip yeniden kurulur.
4. Panelde yönetici şifresiyle girilir. *Mekân ve renkler* bölümünde "Logodan renk öner" ile ana renk seçilir, mekân sahibine panel şifresi belirlenir.
5. Fiyatlar *Fiyatlar* bölümünden girilir. *QR kod* bölümünden masa kartı yazdırılır.

## Menü dosyası

```json
{
  "name": "Burger Lab",
  "tagline": "Smash burger",
  "logo": "logo.png",
  "theme": { "primary": "#e4572e", "paper": "", "imageFit": "cover" },
  "contact": {
    "phone": "", "address": "", "mapsUrl": "", "instagram": "", "website": "",
    "orderUrl": "", "orderLabel": "", "wifiName": "", "wifiPassword": ""
  },
  "note": "",
  "currency": "₺",
  "categories": [
    {
      "name": "Burgerler",
      "desc": "",
      "layout": "photo",
      "hidden": false,
      "items": [
        {
          "name": "Cheese Burger",
          "desc": "Dana köfte, cheddar, turşu",
          "price": "",
          "variants": [{ "name": "Menü", "price": "" }],
          "image": "cheese-burger.webp",
          "tags": ["populer"],
          "allergens": "gluten, süt",
          "soldOut": false,
          "hidden": false
        }
      ]
    }
  ]
}
```

- **theme.primary:** logonun ana rengi. Bütün tonlar bundan otomatik üretilir. Açık renklerde okunaklılık için yazılar otomatik koyulaştırılır.
- **theme.paper:** zemin. Boşsa krem. Koyu bir renk verilirse menü koyu temaya geçer.
- **theme.imageFit:** `cover` normal fotoğraflar için, `contain` arka planı şeffaf ürün görselleri için.
- **layout:** `photo` fotoğraflı liste, `compact` içecek ve sos gibi kısa listeler.
- **tags:** `populer`, `yeni`, `sef`, `acili`, `vejetaryen`, `vegan`, `glutensiz`.
- **id alanları** yazılmak zorunda değil, sunucu kendisi üretir.
- Boş bırakılan her alan menüde gizlenir.

## Görünümler

Her mekân iki görünümden birini kullanır (panel › Mekân ve renkler › Görünüm, dosyada `theme.design`):

- **klasik** (varsayılan): `public/menu.html` + `assets/menu.js`. Sade liste, zemin rengi seçilebilir.
- **yildiz**: `public/menu-yildiz.html` + `assets/yildiz.js` (Yıldızkart QR menü v8 tasarımı). Kapak fotoğrafı,
  açık/kapalı durumu ve haftalık saatler, Google yorum düğmesi, Wi-Fi şifresini kopyalama, öne çıkanlar şeridi,
  TR/EN dil düğmesi, gece modu, `/menu` ve `/menu#urun-adi` bağlantıları. Veri `lib/yildiz.js` ile çevrilir;
  renkler ana renkten okunurluk denetimiyle hesaplanır (zemin rengi kullanılmaz).

Yıldız görünümünün alanları (klasik görünüm bunları yok sayar):

```json
{
  "theme": { "design": "yildiz" },
  "cover": "kapak.webp",
  "hours": { "1": ["08:00", "23:00"], "7": ["09:00", "24:00"] },
  "featured": { "title": "Şefin önerileri", "label": "Şefin önerisi" },
  "languages": ["tr", "en"],
  "i18n": { "en": { "note": "", "featuredTitle": "", "featuredLabel": "" } },
  "contact": { "reviewUrl": "https://search.google.com/local/writereview?placeid=…" },
  "categories": [{ "en": { "name": "Breakfast" }, "items": [{ "en": { "name": "", "desc": "" } }] }]
}
```

- **hours:** 1 = Pazartesi … 7 = Pazar. Olmayan gün kapalı. Hiç saat yoksa açık/kapalı satırı görünmez. Kapanış en geç `24:00`.
- **Öne çıkanlar:** etiketi `sef` olan ürünler. **cover** boşsa öne çıkan ürünün fotoğrafı kapak olur.
- **Görsel boyutları:** `/img/<ad>.webp?w=200` istenince klasörde `<ad>-200.webp` varsa o verilir (32, 200, 640, 900, 1200, 1600),
  yoksa asıl dosya. Toplu aktarımda küçük sürümler önceden üretilir; panelden yüklenen fotoğrafın yalnız aslı olur.
- **İstatistik:** yıldız görünümü anonim sayaçları `POST /api/olay` ile gönderir. Şimdilik yalnız kabul edilir (204), saklanmaz.

## Yerelde çalıştırma

```bash
ADMIN_PASSWORD=deneme-sifresi-123 node server.js
```

Tarayıcıda `http://schnitzgo.localhost:3000` menüyü, `http://schnitzgo.localhost:3000/panel/` paneli açar. Chrome ve Edge `*.localhost` adreslerini kendi bilgisayara yönlendirir.

## Güvenlik

- Panel şifreleri `scrypt` ile saklanır. Oturum çerezi HttpOnly ve SameSite=Strict.
- Aynı IP'den 8 hatalı girişten sonra 10 dakika bekleme gelir.
- Yüklenen dosyanın gerçekten JPG, PNG veya WEBP olduğu içeriğinden kontrol edilir. SVG yüklenemez.
- Yönetici şifresini değiştirmek bütün yönetici oturumlarını kapatır. Mekân şifresini değiştirmek o mekânın oturumlarını kapatır.
