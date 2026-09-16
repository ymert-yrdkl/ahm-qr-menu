// Menü sayfası ve panelin ortak sabitleri
(function () {
  'use strict';
  var TR = { 'ç': 'c', 'ğ': 'g', 'ı': 'i', 'İ': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u', 'â': 'a', 'î': 'i', 'û': 'u' };
  window.QRM = {
    TAGS: {
      populer: 'Çok satan',
      yeni: 'Yeni',
      sef: 'Şefin önerisi',
      acili: 'Acılı',
      vejetaryen: 'Vejetaryen',
      vegan: 'Vegan',
      glutensiz: 'Glutensiz'
    },
    fold: function (s) {
      return String(s || '').toLocaleLowerCase('tr').replace(/[çğıİöşüâîû]/g, function (c) { return TR[c] || c; });
    },
    price: function (p, currency) {
      p = String(p == null ? '' : p).trim();
      return p ? p + ' ' + (currency || '₺') : '';
    }
  };
})();
