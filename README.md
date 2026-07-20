# Talk & Heal

Çiğdem Taş'ın terapi/danışmanlık markası **Talk and Heal** için statik web sitesi. Sade HTML/CSS/JS
ile yazıldı, build adımı yok.

## Canlı site

- **Asıl link (müşteriyle paylaşılan):** https://engintas243524.github.io/cigdem-tas-talk-and-heal/
- Netlify (`lustrous-strudel-4833be.netlify.app`): Türkiye'deki bazı ağlarda (mobil operatör + bazı
  ev Wi-Fi'ları) `ERR_SSL_PROTOCOL_ERROR` veriyor, bu yüzden GitHub Pages ana link olarak kullanılıyor.
- Her `git push`'ta her iki adrese de ~30-60 saniye içinde otomatik deploy oluyor.
- Kalıcı çözüm olarak custom domain (`talkandheal.co.uk`, sitede placeholder olarak geçiyor) planlandı
  ama henüz satın alınmadı.

## Yerel önizleme

Build/bağımlılık yok — `index.html`'i tarayıcıda açmak yeterli. Sunucu gerektiren bir şey test
edeceksen (örn. relative path sorunları):

```bash
python3 -m http.server 8000
```

## Yapı

```
index.html, hakkimda.html, services.html, approach.html, blog.html, iletisim.html
style.css
assets/               — görseller, logo, ikonlar
DESIGN_SPEC.md         — palet/font/tasarım kararları ve kaynakları
NOTES.md               — açık/bekleyen maddeler (WhatsApp numarası, fiyat verisi, form endpoint'i vb.)
talk-and-heal-hata-gunlugu/  — 10 aşamalı geliştirme sürecinin hata/QA günlüğü
AI_DESTEKLI_WEB_GELISTIRME_REHBERI.md — bu projede izlenen geliştirme rehberi
```

## Açık kararlar / devam eden işler

Güncel liste için `NOTES.md`'ye bak. Öne çıkanlar:

- Sıcak-beyaz zemin denemesi (`--paper`/`--surface` #FEFBF8/#FFFFFF) uygulandı ama müşteri/kullanıcı
  henüz onaylamadı.
- WhatsApp numarası, gerçek fotoğraf, fiyat sayfası verisi ve iletişim formu servis endpoint'i
  placeholder/TBD durumda.
- Custom domain (`talkandheal.co.uk`) satın alınmadı.

## Lisans / içerik notu

Marka renkleri ve genel his `wholenesscollectivetherapy.com`'dan referans alındı; görseller ve font
oradan kopyalanmadı — özgün olarak üretildi (SVG doku, "Jost" gibi ücretsiz font alternatifleri).
