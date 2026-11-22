// Yıldız görünümü: boyamadan önce gece modu ve dil.
/* Boyamadan ÖNCE: gece modu (kayıtlı seçim, yoksa telefonun ayarı) ve dil/yön (kayıtlı, yoksa telefonun dili).
   Sonradan değişirse sayfa bir kare açık/Türkçe görünüp sıçramasın. */
(function () {
  var d = document.documentElement, g, dl, ok = (d.getAttribute("data-diller") || "tr").split(",");
  try { g = localStorage.getItem("qm-gece"); dl = localStorage.getItem("qm-dil"); } catch (e) {}
  if (g ? g === "1" : matchMedia("(prefers-color-scheme: dark)").matches) d.classList.add("gece");
  if (!dl || ok.indexOf(dl) < 0) { dl = "tr"; (navigator.languages || [navigator.language || "tr"]).some(function (x) { x = String(x).slice(0, 2).toLowerCase(); if (ok.indexOf(x) >= 0) { dl = x; return true; } }); }
  d.lang = dl;
})();
