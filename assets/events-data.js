// Talk & Heal — Dynamic Event Box veri kaynağı (Website Implementation Brief Madde 1, 2026-08-18).
// Homepage hero + services.html BURADAN okur (bkz. events-box.js) — yeni bir workshop/masterclass
// eklemek için burada bir kayıt daha ekle, HTML'e dokunma. Boş dizi = kutu hem hero'da hem
// services.html'de otomatik gizlenir (bkz. style.css .event-box:empty).
//
// Alan şeması:
//   id             — benzersiz kısa string (ör. "2026-09-workshop-anxiety")
//   category       — 'workshop' | 'masterclass'
//   titleEn/titleTr
//   dateTimeEn/dateTimeTr     — hazır biçimlendirilmiş metin (ör. "14 Sept 2026, 18:00 BST")
//   formatEn/formatTr         — "Online" / "In-person — [adres/mekan]"
//   descriptionEn/descriptionTr — kısa (1-2 cümle)
//   ctaLabelEn/ctaLabelTr     — "Reserve Spot" / "Learn More" vb.
//   ctaHref                   — mailto:, WhatsApp linki veya Çiğdem'in verdiği dış link (Zoom/Eventbrite)

window.TALK_AND_HEAL_EVENTS = [
  // Henüz gerçek bir etkinlik yok — 2026-08-19 14:00 görüşmesinde Çiğdem'den ilk etkinlik bilgisi
  // istenecek (bkz. INTEGRASYON_TODO.md, "2026-08-19 14:00 görüşmesinde Çiğdem'den istenecekler").
];
