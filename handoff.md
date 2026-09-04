# Handoff — Talk & Heal (2026-09-02)

## Bu oturumda TAMAMLANAN işler

- **LinkedIn kişisel profil entegrasyonu TAMAMLANDI:** Postiz'e `tascigdem@hotmail.com` hesabı
  "Cigdem Tas" kanalı olarak bağlandı, "Talk & Heal" grubuna taşındı. Yol boyunca Postiz'in kendi
  LinkedIn OAuth kodunda iki bug bulunup düzeltildi (`prompt=none` sessiz yetkilendirme + yanlış
  scope listesi — detay: `talk-and-heal-hata-gunlugu/05-Backend-Entegrasyon/05-backend-entegrasyon.md`
  BE-120), düzeltme `github.com/engintas243524/postiz-app` main'e push edildi (commit `7b395525`)
  ve Netcup'ta yeni image (`sparro-v4`) olarak canlıya alındı.
- **Telegram entegrasyonu TAMAMLANDI:** Önceki oturumdan kalan "Postiz bağlantısı tıkandı" sorunu
  çözüldü — kök neden bot'un Telegram sunucusunda "left" durumunda takılı kalmasıydı (telefon
  arayüzü yanıltıcı şekilde admin gösteriyordu). Botu kaldırıp yeniden admin eklemek sorunu
  çözdü, "Talk & Heal" kanalı Postiz'e bağlandı. Tüm doğrulama Telegram Bot API'sinden
  (`getUpdates` çıktısı) yapıldı, tahmin kullanılmadı. Detay: BE-119.

## Bu oturumda KISMİ ilerleme — dış onay/erişim bekliyor

- **Instagram/Facebook — Çiğdem'in 2FA onayında bekliyor:** Çiğdem'in kişisel hesap bilgisi
  alındı, Meta App'te ("Sparro", `developers.facebook.com/apps/1605447844442171`) eksik 3 izin
  (`instagram_basic`, `instagram_content_publish`, `instagram_manage_insights`) eklendi — kod
  değişikliği gerekmedi (BE-121). Facebook girişinde şifre kabul edildi ama 2FA telefon onayı
  (Çiğdem Londra'da, telefonu yanında değildi) tamamlanamadı.
  **Sıradaki adım:** Çiğdem müsait olunca Postiz'de "Add Channel → Instagram (Facebook Business)"
  tekrar denenmeli, `tascigdem@hotmail.com` ile giriş yapılıp telefon bildirimi ("61" gibi bir
  sayı) hemen onaylanmalı (birkaç dakika içinde zaman aşımına uğruyor). Onaydan sonra consent
  ekranında `facebook.com/TalkandHealUK` sayfası + bağlı `instagram.com/talkandhealuk` hesabı
  seçilip "Allow" denmeli.
- **LinkedIn şirket sayfası paylaşımı — kurumsal e-posta erişiminde bekliyor:** Şirket sayfası
  (`talkandheal-uk`) adına paylaşım için "Community Management API" ürünü mevcut Developer
  App'te istenemedi (LinkedIn kuralı: bu ürün App'te TEK ürün olmalı). Bunun için ayrı bir yeni
  Developer App oluşturuldu ("Talk & Heal Postiz Page", Client ID `77ooimhpvmpzkl`), Talk & Heal
  sayfasına bağlandı, şirket doğrulaması (company verification) tamamlandı. Ama "Community
  Management API" isteği kurumsal domain e-postası istiyor — Talk & Heal'in kendi domaininde
  (`talkandheal.co.uk` benzeri) bir e-posta VAR ama şu an kimsenin erişimi yok (Gmail/Hotmail
  LinkedIn tarafından reddediliyor). Detay: BE-122.
  **Sıradaki adım:** o kurumsal e-postaya erişim sağlanınca `developers.linkedin.com/apps/
  264422020/products` → Community Management API → Request access → o e-postayı gir → gelen
  kodu onayla. Kod tarafı zaten hazır (`linkedin.page.provider.ts`'deki `prompt=none` düzeltmesi),
  sadece Client ID/Secret Netcup'a yazılıp Postiz'de "Add Channel → LinkedIn Page" denenmesi
  yeterli olur. **Not:** aynı Developer App Sparrow'un kendi LinkedIn ihtiyacını da çözebilir.

## Önceki oturumdan kalan, henüz dokunulmamış bekleyenler

- **YouTube:** Şifre hâlâ bulunamadı, gerçek kanala (@cigdemtas8612, 4 gerçek video) geçiş
  blokede; Postiz bağlantısı yeni/boş kanalda (@talkandheal-uk) kalıyor.
- **Facebook — kişisel hesap bilgisi hâlâ tam netleşmedi:** `facebook.com/TalkandHealUK`
  sayfasını yöneten hesabın Instagram ile aynı (`tascigdem@hotmail.com`) olduğu bu oturumda
  doğrulandı, 2FA'da bekliyor (yukarıya bakın) — Facebook Page bağlantısı da aynı akışla
  (Instagram ile birlikte) gelir, ayrı adım gerekmez.
- **Pinterest:** App oluşturuldu (client_id `1605453`), "Trial erişimi" onayı bekleniyor.
- **Google İşletme Profili:** Posta ile gönderilen doğrulama kodu bekleniyor (Flat 5, 164
  Lordship Road, London, N16 5HB).
- **Threads:** Facebook/Instagram çözülünce ele alınacak (aynı Meta ekosistemi).
- **LinkedIn şirket sayfası — takipçi/içerik:** Sayfa (0 takipçi) henüz boş — Postiz bağlantısı
  kurulunca ilk içerik/gönderi planlanmalı.

## Çözülen temel mimari sorunlar (önceki oturum, 2026-09-01)

`GET /events`'in yazma-yolu için tasarlanmış `ensureEventsTab()`'ı public okuma ucuna kopyalamış
olması — bkz. `talk-and-heal-hata-gunlugu/10-Izleme-Bakim/10-izleme-bakim.md` (IZL-01), evrensel
ders diğer projelere de uygulanabilir (bir "ensure/setup" fonksiyonunu her çağıran göz kapalı
miras almamalı).

## ⚠️ Terk edilen/kapatılmış konular (tekrar denenmesin)

- **LinkedIn e-posta tutarlılığı:** Gerçek hesabın e-postasını marka kiti e-postasıyla
  (`tascigdem1977@gmail.com`) tek/tutarlı hale getirme denemesi TERK EDİLDİ — o e-posta zaten
  ayrı, boş/0-bağlantılı bir "gölge" hesaba bağlıydı, oradan kurtarmaya çalışırken LinkedIn
  hesabı şüpheli aktivite gerekçesiyle kilitledi (devlet kimliği istiyor). Karar: kurtarılmayacak,
  değersiz bir kabuk hesap. Gerçek hesap `tascigdem@hotmail.com` ile devam ediyor, hiç
  etkilenmedi. Detay: `TALK_AND_HEAL_HESAPLAR.md`.
- **LinkedIn Community Management API doğrulaması için `tascigdem1977@gmail.com` denemesi:**
  reddedildi (kişisel domain), bu hesap zaten yukarıdaki madde yüzünden şüpheli/kilitli — bu
  adımda BİR DAHA denenmesin, sadece gerçek kurumsal domain e-postası kullanılmalı.

Detaylı gerekçe ve tam kurulum adımları: `TALK_AND_HEAL_HESAPLAR.md` (Marka Kiti bölümü dahil),
platform-bazlı ilerleme takibi: `TALK_AND_HEAL_SOSYAL_MEDYA_ENTEGRASYON_STATE.md`.
