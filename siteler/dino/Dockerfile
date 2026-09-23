# Coolify: Base Directory olarak bu klasoru ver (depoda: /siteler/dino).
# Kaynak proje: Masaustu/Dino-Coffee-Bakery/site
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html menu-veri.js /usr/share/nginx/html/
COPY img /usr/share/nginx/html/img
EXPOSE 80
