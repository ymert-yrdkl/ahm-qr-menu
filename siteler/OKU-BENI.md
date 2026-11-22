# siteler/

QR menü uygulamasından bağımsız, statik tanıtım siteleri.
Her klasör kendi `Dockerfile`'ıyla ayrı bir Coolify uygulaması olarak yayınlanır.

| Klasör | Adres |
| --- | --- |
| `dino/` | demo3.ahmcloud.com |
| `ispircafe/` | ispircafe.fanussoft.com |

Kök dizindeki `.dockerignore` bu klasörü hariç tutar; QR menü imajı etkilenmez.
Coolify'da yeni uygulama açarken **Base Directory** olarak `/siteler/<ad>`
verilir, Dockerfile o klasörden okunur.

Kaynak proje: Masaüstü/Dino-Coffee-Bakery (veri ve görsel üreteçleri orada).

`ispircafe/`: İspir Ekmek Cafe & Bistro QR menüsü (Yıldızkart QR menü v8 şablonu). Kaynak proje:
`Projeler/cafe otomasyonları` (`araclar/onizleme_uret.py` üretir, buradaki dosyalar elle düzenlenmez).
