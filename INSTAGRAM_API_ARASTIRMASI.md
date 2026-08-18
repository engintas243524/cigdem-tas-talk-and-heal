# Instagram API Araştırması (Faz 6 — Etik/Yasal Gate Roadmap'in devamı, YouTube'un [Faz 5] muadili)

**Tarih:** 2026-08-18. **Bağlam:** kullanıcı Instagram'ı Görsel/Video Stratejisi için "asıl kaynak"
olarak işaret etti. YouTube'daki gibi ($0 maliyetli, basit anahtar kurulumu) sanıldı ama araştırma
**önemli mimari farklar** ortaya çıkardı — kodlamaya geçmeden önce bunlar netleşmeli.

## 1. Kurulum — mevcut Meta altyapısı YENİDEN KULLANILABİLİR

WhatsApp Cloud API için zaten bir **Meta Business Portfolio + "Talk and Heal" adlı App** kurulu
(`INTEGRASYON_TODO.md`, 2026-07-21). Instagram için yeni bir App açmaya GEREK YOK — aynı App'e
"Instagram" ürünü eklenir (Google'daki "My First Project"i yeniden kullanma deseniyle aynı).

## 2. İki farklı Instagram API yolu var — hangisi bize lazım?

- **"Instagram API with Instagram Login"** (Facebook Page gerektirmez, daha hafif) — ama
  **insights YOK, publishing YOK**. Bize yaramaz.
- **"Instagram Graph API with Facebook Login"** (klasik yol, Instagram hesabı bir Facebook
  Page'e bağlı olmalı) — insights + Hashtag Search bunda var. **Bize gereken bu.**
- **Ön koşul (Çiğdem'de doğrulanmalı):** Instagram hesabı **Business veya Creator** tipinde
  olmalı VE bir **Facebook Page'e bağlı** olmalı. Değilse önce bu ikisi ayarlanır (ücretsiz,
  Instagram app > Ayarlar > Hesap türü + Meta Business Suite üzerinden Page bağlama).

## 3. Erişim seviyesi — büyük kolaylık: App Review GEREKMİYOR

Meta iki erişim seviyesi sunuyor: **Standard Access** (sadece kendi/yönetilen hesap) ve
**Advanced Access** (başkalarının hesapları için, zorunlu App Review + Business Verification,
2-4 hafta sürer). **Talk & Heal SADECE Çiğdem'in kendi hesabına erişecek → Standard Access
yeterli, App Review YOK, bekleme YOK.** YouTube'dan bile daha az sürtünmeli bir kurulum.

## 4. Kritik fark — hız limiti, YouTube'dan ÇOK daha kısıtlı

- Genel Graph API çağrıları: 200 çağrı/saat/hesap (YouTube'un günlük 10.000 ünitesine kıyasla
  benzer görünür ama...)
- **Hashtag Search (trend/konu keşfi için asıl ihtiyacımız olan uç nokta) haftada SADECE 30
  FARKLI hashtag** ile sınırlı — hesap başına, günlük değil haftalık. Bu, YouTube'daki
  `konuHavuzunuSirala`'nın "her Claude çağrısında canlı 1-5 konu sorgula" mimarisiyle DOĞRUDAN
  UYUMSUZ — haftada 30 hashtag bütçesini birkaç rapor isteğinde tüketebiliriz.
- **Sonuç:** Set 1 mimarisi YouTube'daki gibi "istek anında canlı sorgula" OLAMAZ. Bunun yerine
  **haftalık/periyodik bir cron ile önceden belirlenmiş bir hashtag havuzunu tarayıp sonucu
  Sheets'e/cache'e yazma** deseni gerekir — tam olarak `RakipTakip`'in zaten kullandığı periyodik
  mimari (`scheduled.ts` + `RakipTakipGecmis` tab'i). Yeni bir desen icat etmiyoruz, var olanı
  uyguluyoruz.

## 5. Token yönetimi — Google'dan farklı, yeni bir parça gerekiyor

Google service-account anahtarı süresiz; Instagram/Facebook **long-lived access token ~60 gün**
sonra süresi doluyor, süresi dolmadan yenilenmesi (refresh) gerekiyor. `MEVZUAT_TAKIP_ARALIK_GUN`
tarzı bir cron'a (`scheduled.ts`, zaten her 15 dakikada çalışıyor) "token 60 günü doldurmadan
yenile" mantığı eklenmesi gerekecek — YouTube entegrasyonunda bu adım yoktu.

## 6. Maliyet

API'nin kendisi ücretsiz (Meta'ya doğrudan ödeme yok) — tek maliyet geliştirme zamanı. YouTube
gibi $0 onaylandı.

## 7. Faz 5'ten (YouTube) mimari fark özeti

| | YouTube (Faz 5, YAPILDI) | Instagram (Faz 6) |
|---|---|---|
| Erişim | API key, anında | Standard Access, App Review yok ama Business/Creator+Page ön koşulu var |
| Sorgu zamanlaması | İstek anında canlı (`konuHavuzunuSirala`) | Haftalık cron + cache (RakipTakip deseniyle aynı) |
| Hız limiti | ~10.000 ünite/GÜN | 30 hashtag/HAFTA (çok daha sıkı) |
| Token | Süresiz anahtar | ~60 günde yenilenmesi gereken access token |
| Maliyet | $0 | $0 |

## Sıradaki adım (öneri, kod değil — kullanıcı onayı bekliyor)

1. Çiğdem'e sor/doğrulat: Instagram hesabı Business/Creator mi, bir Facebook Page'e bağlı mı?
   Değilse önce bunlar ayarlanmalı (ücretsiz, Çiğdem'in kendi yapması gerekir — hesap sahipliği).
2. Mevcut "Talk and Heal" Meta App'ine Instagram ürünü eklenir, Standard Access ile Çiğdem'in
   hesabı bağlanır (adım adım link rehberliği ile, Google Maps deseniyle aynı).
3. `lib/instagram.ts` (Graph API wrapper) + `lib/instagramTokenYenile.ts` (60 günlük refresh,
   `scheduled.ts`'e entegre) + haftalık hashtag-tarama cron'u (RakipTakip deseniyle,
   `InstagramTrendGecmis` benzeri yeni bir Sheets tab'i) — YouTube'unkinden daha büyük bir iş,
   çünkü canlı sorgu yerine cache mimarisi kuruluyor.

Sources: [Overview of the Instagram API — Meta Developer Docs](https://developers.facebook.com/docs/instagram-platform/overview/), [Instagram API with Instagram Login — Meta Developer Docs](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/), [Meta Advanced Access: Which Permissions Need App Review](https://singhamandeep.com/what-is-meta-advanced-access/), [Instagram Graph API Rate Limits Explained (2026)](https://singhamandeep.com/instagram-graph-api-rate-limits-why-your-app-hits-429-errors-and-how-to-scale-2026/), [Rate Limits — Graph API — Meta Developer Docs](https://developers.facebook.com/docs/graph-api/overview/rate-limiting/)
