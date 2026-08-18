// Talk & Heal — Dynamic Event Box render mantığı (Website Implementation Brief Madde 1, 2026-08-18).
// Veri: events-data.js. Her [data-event-box] container'ını, mevcut data-en/data-tr dil
// mekanizmasına (style.css: html[data-lang] [data-en/tr]{display:none}) otomatik uyacak şekilde
// doldurur. Etkinlik yoksa hiçbir şey yazmaz -> container boş kalır -> CSS ile gizlenir.
(function () {
  var events = window.TALK_AND_HEAL_EVENTS || [];
  if (!events.length) return;

  var CATEGORY_LABEL = {
    workshop: { en: 'Workshop', tr: 'Atölye' },
    masterclass: { en: 'Masterclass', tr: 'Ustalık Sınıfı' },
  };

  function bilingualSpan(en, tr) {
    var wrap = document.createDocumentFragment();
    var spanEn = document.createElement('span');
    spanEn.setAttribute('data-en', '');
    spanEn.textContent = en;
    var spanTr = document.createElement('span');
    spanTr.setAttribute('data-tr', '');
    spanTr.textContent = tr;
    wrap.appendChild(spanEn);
    wrap.appendChild(spanTr);
    return wrap;
  }

  function eventCard(ev) {
    var card = document.createElement('article');
    card.className = 'event-card';

    var badge = document.createElement('span');
    badge.className = 'event-badge';
    var catLabel = CATEGORY_LABEL[ev.category] || CATEGORY_LABEL.workshop;
    badge.appendChild(bilingualSpan(catLabel.en, catLabel.tr));
    card.appendChild(badge);

    var title = document.createElement('h3');
    title.className = 'event-title';
    title.appendChild(bilingualSpan(ev.titleEn, ev.titleTr));
    card.appendChild(title);

    var meta = document.createElement('p');
    meta.className = 'event-meta';
    meta.appendChild(bilingualSpan(ev.dateTimeEn, ev.dateTimeTr));
    meta.appendChild(document.createTextNode(' — '));
    meta.appendChild(bilingualSpan(ev.formatEn, ev.formatTr));
    card.appendChild(meta);

    var desc = document.createElement('p');
    desc.className = 'event-desc';
    desc.appendChild(bilingualSpan(ev.descriptionEn, ev.descriptionTr));
    card.appendChild(desc);

    var cta = document.createElement('a');
    cta.className = 'btn btn-primary event-cta';
    cta.href = ev.ctaHref;
    if (!/^mailto:/.test(ev.ctaHref)) {
      cta.target = '_blank';
      cta.rel = 'noopener';
    }
    cta.appendChild(bilingualSpan(ev.ctaLabelEn, ev.ctaLabelTr));
    card.appendChild(cta);

    return card;
  }

  document.querySelectorAll('[data-event-box]').forEach(function (box) {
    events.forEach(function (ev) {
      box.appendChild(eventCard(ev));
    });
  });
})();
