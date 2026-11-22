# Coolify: Base Directory olarak bu klasörü ver (depoda: /siteler/ispircafe).
# Kaynak proje: Projeler/cafe otomasyonları (araclar/onizleme_uret.py ile üretilir, elle düzenlenmez)
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/
COPY medya /usr/share/nginx/html/medya
COPY fonts /usr/share/nginx/html/fonts
EXPOSE 80
