# Coolify: bu klasoru (site/) build context olarak ver.
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html menu-veri.js /usr/share/nginx/html/
COPY img /usr/share/nginx/html/img
EXPOSE 80
