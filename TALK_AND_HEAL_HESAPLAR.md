# Talk & Heal — Sosyal Medya Platform Hesapları Özeti

Sparrow'daki `SPARROW_HESAPLAR.md` deseninin aynısı. Tüm platformlarda kullanıcı adı/e-posta
tutarlılığı için referans. **Şifreler burada YOK** (kullanıcının kendi şifre yöneticisinde).
Detaylı kurulum/durum kaydı için `talk-and-heal-hata-gunlugu/` ve `handoff.md`.

## Genel kalıp

Tüm platformlarda kullanıcı adı/handle **`talkandheal`**, e-posta **`tascigdem1977@gmail.com`**
olarak tutarlı tutuluyor (2026-08-26'da karar verildi). Postiz'de bu 11 kanal, Sparrow'un
paylaşılan Netcup Postiz kurulumunda (`app.sparro.io`) ayrı bir **"customer" (müşteri grubu)**
olarak gruplanacak — Sparro'nun kendi kanallarıyla karışmayacak.

Hedef 11 platform (Talk & Heal'in kendi rakip-platform envanteri listesiyle aynı sıra,
`form-backend/src/config.ts`'deki `RAKIP_PLATFORM_LISTESI`): Facebook, Instagram, LinkedIn, X,
TikTok, YouTube, Bluesky, Threads, Google Business, Pinterest, Mastodon.

| Platform | Kullanıcı adı / Hesap adı | E-posta | Durum | Not |
|---|---|---|---|---|
| Mastodon (mastodon.social) | talkandheal | tascigdem1977@gmail.com | Hesap aktif, e-posta onaylandı (hCaptcha kullanıcı tarafından çözüldü) | Kayıt+onay 2026-08-26'da tamamlandı |
| Mastodon Uygulaması (Geliştirme → Yeni uygulama) | Talk & Heal (Postiz) | — | Oluşturuldu 2026-08-26 | App ID (İstemci anahtarı): `OnmhgZVgQfzeDWN-0tVAlcmTKbVfOQ4wXlcCS30801o`. Client secret düz metin burada YOK — Netcup sunucusundaki `/opt/postiz/docker-compose.yaml`'da `MASTODON_CLIENT_SECRET` olarak duruyor. Kapsamlar: profile, write:media, write:statuses. Redirect URI: `https://app.sparro.io/integrations/social/mastodon` |
| Postiz paneli (app.sparro.io) | — | engintass19@gmail.com (admin girişi) | Giriş yapıldı | Backend restart sonrası (2026-08-26, PM2 backend process port 3000'i bind etmiyordu) düzeltildi |
| Postiz "Talk & Heal" customer grubu | Talk & Heal | — | Oluşturuldu 2026-08-26 | Mastodon + Bluesky kanalları bu gruba atandı, Sparro'nun kendi kanallarından ayrı görünüyor (sol panelde ayrı başlık) |
| Bluesky | talkandheal.bsky.social | tascigdem1977@gmail.com | Hesap aktif, Postiz'e bağlandı, "Talk & Heal" grubuna atandı | Kayıt 2026-08-26'da tamamlandı (hCaptcha kullanıcı tarafından çözüldü). Postiz bağlantısı için "Postiz" adında bir App Password oluşturuldu (Bluesky Ayarlar → Uygulama Şifreleri) — düz metin şifre burada YOK, sadece Postiz içinde saklı. DİKKAT: "Add Channel → Bluesky" formu tarayıcı autofill ile Sparro'nun kendi bilgilerini (engintass19@gmail.com) önceden dolduruyor, her seferinde manuel temizleyip doğru hesabı girmek gerekiyor |

| Instagram | talkandheal.uk | tascigdem1977@gmail.com | Hesap aktif, İşletme (Business) hesabına çevrildi (kategori: Sağlık/Güzellik) | Kayıt 2026-08-26. `talkandheal` kullanıcı adı DOLU (alakasız küçük bir hesap, @Mir-za, 15 takipçi) — `.uk` uzantısıyla devam edildi, Talk & Heal'in Londra/BACP kimliğiyle tutarlı. İletişim bilgileri (telefon/adres) bilinçli olarak atlandı — Çiğdem'in gerçek verisi, sonra kendisi ekleyebilir. Henüz Postiz'e bağlanmadı — bunun için Meta Developer App (Instagram Standalone) kurulması gerekiyor |

## Kalan platformlar (henüz başlanmadı)

Facebook, LinkedIn, X, TikTok, YouTube, Threads, Google Business, Pinterest.
Mastodon + Bluesky TAMAMLANDI (2026-08-26) — yukarıya bakın. Instagram hesabı açıldı, devamı sürüyor.

## Gizlilik politikası sayfası (2026-08-26)

`gizlilik-politikasi.html` eklendi, commit `18c625f`, `main`'e push edildi — Meta Developer App
kaydı (Instagram/Facebook/Threads için) gerçek bir Privacy Policy URL şart koşuyor, site bu
sayfaya sahip değildi. **Not:** bu kapsamlı bir KVKK/GDPR metni değil — sadece sosyal medya
entegrasyonu için asgari bildirim, sayfanın kendi footer'ında bu açıkça belirtiliyor. Talk & Heal
randevu/ödeme/WhatsApp gibi hassas veri işlediği için tam kapsamlı bir gizlilik politikası (UK
ICO/GDPR uyumlu) ayrıca hukuki inceleme ile hazırlanmalı — bu, projenin genel açık maddeleri
listesine eklenmeli.

**Canlı URL (Meta App'te kullanılacak):** `https://engintas243524.github.io/cigdem-tas-talk-and-heal/gizlilik-politikasi.html`

**Deploy yolculuğu (önemli, tekrar karşılaşılırsa hatırlanmalı):**
1. `talkandheal.co.uk` (gerçek domain) hâlâ ESKİ WORDPRESS sunucusunda — bu proje deposundaki
   statik siteye HENÜZ geçilmedi (bkz. `hosting-devir-gorusmesi-goker.md`). GitHub'a push etmek
   bu domain'i güncellemedi.
2. İlk denenen yol: yeni bir Cloudflare Pages projesi (`talk-and-heal`, hesap `engintass19@gmail.com`,
   form-backend ile aynı hesap) — `https://talk-and-heal.pages.dev`. Deploy Cloudflare Dashboard'da
   "başarılı"/"Production" görünüyor ama **`*.pages.dev` alt alan adına hem bu makineden hem
   kullanıcının telefonundan (wifi+mobil) 10+ dakika boyunca `ERR_CONNECTION_TIMED_OUT` alındı** —
   sunucu tarafı yayılma/provizyon sorunu, çözülmeden bırakıldı (proje Cloudflare'de duruyor,
   zararsız, silinmedi).
3. **Çalışan çözüm: GitHub Pages** — repoda zaten etkinmiş (`gh api repos/.../pages` → "already
   enabled", `main` branch, root path). Push sonrası birkaç dakika içinde otomatik build oldu,
   `curl` ve tarayıcıdan anında 200 doğrulandı. Yeni bir platform hesabı/site eklerken önce bunu
   dene, Cloudflare Pages'e gerek yok.

## Postiz sunucu-config notu — Mastodon (2026-08-26)

`/opt/postiz/docker-compose.yaml`'da `MASTODON_CLIENT_ID`/`MASTODON_CLIENT_SECRET` boş bırakılmıştı
(muhtemelen ilk kurulumda hiç doldurulmamış) — bu yüzden Postiz'in "Add Channel → Mastodon" akışı
`client_id` boş bir OAuth URL üretip "Gerekli parametre eksik: client_id" hatası veriyordu. Yukarıdaki
Mastodon Uygulaması'nın anahtarları bu iki env değişkenine yazılıp `docker exec postiz pm2 restart backend`
ile container'a yüklendi. Aynı desen ileride başka bir Mastodon instance'ı gerekirse tekrarlanabilir.

## Sunucu-tarafı not (2026-08-26)

Postiz'in backend süreci (PM2 `backend` app) migration sonrası port 3000'i hiç bind etmemişti —
`docker exec postiz pm2 restart backend` ile düzeltildi (Postgres/Redis bağlantıları zaten
sağlamdı, sadece backend'in kendisi başlatma sırasında takılmıştı). Aynı sorun tekrar çıkarsa
aynı komutla çözülebilir.
