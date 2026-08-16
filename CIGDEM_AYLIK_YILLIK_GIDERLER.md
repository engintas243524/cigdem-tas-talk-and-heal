# Talk and Heal — Aylık/Yıllık Gider Özeti (Çiğdem için, 2026-08-16)

Bu tablo, sitenin "Görsel/Video Stratejisi" özelliğine yeni eklenen (güncel trend araştırması
yapan) yapay zeka özelliğinin gerçek maliyetini gösteriyor — gerçek testlerle ölçüldü, tahmin
değil. Diğer gider kalemleri (Stripe komisyonu, WhatsApp mesaj ücreti gibi kullanım bazlı olanlar)
bu tabloda yok, ayrı ele alınacak; burada sadece bu oturumda hesaplanan kısım var.

## Kalem kalem gider tablosu

| Gider kalemi | Ne işe yarıyor | Aylık | Yıllık |
|---|---|---|---|
| Yapay zeka rapor üretimi (Görsel/Video Stratejisi + Aksiyon/Hedef Analizi) | Rakip analizi ekranındaki raporları yazan yapay zeka (Claude) | ~2-3 $ (ayrılan üst sınır: 5 $) | ~24-36 $ (üst sınır: 60 $) |
| Google Haritalar (rakip arama/adres bulma) | Rakip Analizi'nde rakip aramak için | 0 $ (ücretsiz kullanım sınırının çok altında) | 0 $ |
| Güncel trend araması (YouTube) | Video trend verisi (yakında eklenecek) | 0 $ (Google'ın ücretsiz günlük hakkı yeterli) | 0 $ |
| talkandheal.uk (yeni alınan yedek domain) | IONOS'ta hesap açmak için alındı | — | ilk yıl 1 £, sonraki yıllar ~10 £ (istenirse iptal edilebilir) |
| Site barındırma (GitHub Pages) | Ana site (talkandheal.co.uk) burada yayında | 0 $ | 0 $ |
| Arka plan sunucusu (Cloudflare Workers) | Randevu/ödeme/panel sistemi | 0 $ (ücretsiz kullanım sınırı günde 100.000 istek, siteniz bunun çok altında) | 0 $ |

**Not:** "Ayrılan üst sınır" satırı, ayda en fazla kaç rapor üretilebileceğine dair bizim koyduğumuz
bir güvenlik sınırı (12-13 rapor/ay) — gerçek harcama genelde bunun altında kalıyor, üst sınır
aşılamıyor (sistem otomatik durduruyor).

## Henüz bu tabloda olmayan, ayrı ele alınması gereken kalemler

- **Stripe** (ödeme alma komisyonu) — işlem başına yüzdelik, ciroya bağlı, ayrı hesaplanmalı
- **WhatsApp Business API** (randevu bildirimleri) — mesaj başına ücret, kullanım hacmine bağlı
- **Resend** (otomatik e-postalar) — muhtemelen ücretsiz kullanım sınırının içinde, teyit edilmedi

İstersen bu üç kalemi de ayrı bir oturumda gerçek rakamlarla (tahmin değil) tamamlayabiliriz.
