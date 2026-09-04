# Talk & Heal Sosyal Medya / Postiz Entegrasyonu — İşlem Durumu (State Dosyası)

Amaç: 11 platformun Postiz'e bağlanma sürecini adım-adım, madde işaretli takip etmek — anlatı
(`TALK_AND_HEAL_HESAPLAR.md`) yerine buradan "tam olarak hangi adımda kaldık" hızlıca görülür.
Yarıda kesilirse buradan devam edilir, baştan araştırılmaz. Detaylı gerekçe/karşılaşılan hata için
her maddenin yanındaki dosyaya bakılır.

## Platform bazlı checklist

- [x] Mastodon — TAMAMLANDI (2026-08-26)
- [x] Bluesky — TAMAMLANDI (2026-08-26)
- [x] TikTok — TAMAMLANDI (2026-08-27, hesap Public kalıyor, bkz. HESAPLAR.md riski)
- [x] YouTube — Postiz'e bağlı AMA yanlış/boş kanalda (@talkandheal-uk) — [ ] gerçek kanala
      (@cigdemtas8612) taşınması şifre bulununca yapılacak
- [x] X (Twitter) — TAMAMLANDI (2026-08-27)
- [ ] Pinterest — App oluşturuldu (client_id `1605453`), [ ] Trial erişim onayı bekleniyor →
      onay gelince client_secret al → redirect URI ekle → Netcup'a yaz → Postiz'e bağla
- [ ] Google İşletme Profili — Profil oluşturuldu, [ ] posta doğrulama kodu bekleniyor (Flat 5,
      164 Lordship Road, London, N16 5HB) → gelince "Add Channel → Google My Business" tekrar
- [x] **Telegram — TAMAMLANDI (2026-09-02):** Postiz'e bağlandı, "Talk & Heal" grubunda görünüyor.
      **Kök neden bulundu:** bot Telegram sunucusu tarafında aslında "left" (kanaldan ayrılmış)
      durumundaydı — telefon arayüzü admin listesinde gösteriyordu ama bu önbelleklenmiş/hatalı
      bir görünümdü, Bot API `getChat`/`getChatMember` sürekli "chat not found" veriyordu, private
      mesajlar bota ulaşıyordu ama kanal mesajları hiç ulaşmıyordu (`getUpdates` hep boş). Çözüm:
      botu kanaldan kaldırıp (Administrators → sil) tekrar yönetici olarak eklemek — bu, Telegram'ın
      `my_chat_member` event'ini "left → administrator" olarak tetikledi ve kanal postları akmaya
      başladı. Doğrulama tamamen Telegram Bot API'sinden (curl ile `getUpdates`) yapıldı, tahmin
      kullanılmadı. Detay: `talk-and-heal-hata-gunlugu/05-Backend-Entegrasyon/
      05-backend-entegrasyon.md` BE-119.
- [x] **LinkedIn (kişisel profil) — TAMAMLANDI (2026-09-02):** Postiz'de "Cigdem Tas" kanalı
      olarak bağlandı, "Talk & Heal" grubuna taşındı.
  - [x] Şirket Sayfası oluşturuldu: `linkedin.com/company/talkandheal-uk` (gerçek kişisel hesap
        `tascigdem@hotmail.com`'dan, 434 bağlantı)
  - [x] Developer App oluşturuldu: "Talk & Heal Postiz", Client ID `7842l6rkg2wg9w`
  - [x] "Share on LinkedIn" ürünü onaylandı (Default Tier, anında)
  - [x] "Sign In with LinkedIn using OpenID Connect" ürünü eklendi (2026-09-02) — Postiz'in
        `openid`/`profile` scope'ları için ayrıca gerekiyormuş, ilk denemede
        `unauthorized_scope_error` bu yüzden çıktı
  - [x] Client Secret alındı, Netcup'a `LINKEDIN_CLIENT_ID`/`LINKEDIN_CLIENT_SECRET` yazıldı,
        Postiz konteyneri restart edildi
  - [x] **Postiz'in kendi LinkedIn OAuth kodunda bug bulundu ve düzeltildi:** hem kişisel hem
        page provider'da `generateAuthUrl()` LinkedIn'e `prompt=none` (sessiz yetkilendirme)
        gönderiyordu — ilk bağlantıda LinkedIn bunu reddediyor (bilinen upstream sorunu,
        gitroomhq/postiz-app#1580, #1582). Ayrıca kişisel profil scope listesinde
        `rw_organization_admin`/`w_organization_social`/`r_organization_social`/`r_basicprofile`
        vardı — bunlar ayrı "Community Management API" ürünü gerektiriyor (henüz onaylı değil),
        `unauthorized_scope_error` veriyordu. Düzeltme: `libraries/nestjs-libraries/src/
        integrations/social/linkedin.provider.ts` ve `linkedin.page.provider.ts`'de `prompt=none`
        kaldırıldı, kişisel scope'lar `['openid','profile','w_member_social']`'a indirildi.
        Commit `7b395525`, `github.com/engintas243524/postiz-app` main'e push edildi. Detay:
        `talk-and-heal-hata-gunlugu/05-Backend-Entegrasyon/05-backend-entegrasyon.md` BE-120.
  - [x] Netcup'ta yeni image build edildi (`ghcr.io/engintas243524/postiz-app:sparro-v4`) ve
        canlıya alındı — **not:** build bitiminin hemen ardından (sistem hâlâ I/O yoğunken)
        deploy edilince backend sessizce başlayamadı (port 3000 dinlemiyordu, health check yine
        de "healthy" gösteriyordu); `sparro-v3`'e geri alınıp sistem sakinleşince tekrar
        `sparro-v4`'e geçilince sorunsuz başladı. Gelecekte: build bitişiyle deploy arasına
        birkaç dakika payı bırak. Detay: `talk-and-heal-hata-gunlugu/08-Deploy/08-deploy.md`
        DEPLOY-09.
  - [x] **Yeni, ayrı LinkedIn Developer App oluşturuldu (2026-09-02):** "Talk & Heal Postiz Page",
        Client ID `77ooimhpvmpzkl` — çünkü LinkedIn "Community Management API"yi sadece App'te
        TEK ürün olarak izin veriyor ("legal and security reasons"), mevcut
        "Talk & Heal Postiz" App'inde zaten "Share on LinkedIn" + OpenID Connect kurulu olduğu
        için oraya eklenemezdi. Talk & Heal sayfası (aynı `tascigdem@hotmail.com` hesabıyla admin
        olarak) app'e "şirket sorumluluğu" (company verification) onayı verildi.
  - [ ] **Bekleyen — TIKANDI:** "Community Management API" isteği bir "business email"
        doğrulaması istiyor, kişisel domain (Gmail/Hotmail) kabul etmiyor —
        `tascigdem1977@gmail.com` denendi, reddedildi ("This email address uses a personal email
        domain"). Talk & Heal'in kendi domaininde (`talkandheal.co.uk` veya benzeri) bir e-posta
        VAR ama şu an erişim yok. **Sıradaki adım:** o kurumsal e-postaya erişim sağlanınca,
        LinkedIn Developer App (`developers.linkedin.com/apps/264422020/products`) → Community
        Management API → Request access → o e-postayı gir → gelen kodu onayla. Onaylanınca
        `linkedin-page.provider.ts`'deki `prompt=none` düzeltmesi zaten hazır (bu oturumda
        Postiz koduna uygulandı), Client ID/Secret'ı Netcup'a yazıp Postiz'de
        "Add Channel → LinkedIn Page" denemek yeterli olur. Detay:
        `talk-and-heal-hata-gunlugu/05-Backend-Entegrasyon/05-backend-entegrasyon.md` BE-122.
  - ⚠️ **Terk edilmiş yan konu (tekrar denenmesin):** e-posta tutarlılığı (`tascigdem1977@gmail.com`
    gerçek hesaba taşıma) denemesi bir gölge/boş hesabı kilitledi, kurtarılmayacak — bkz.
    HESAPLAR.md. Gerçek hesap `tascigdem@hotmail.com` ile devam ediyor, etkilenmedi.
- [ ] **Instagram/Facebook — AKTİF ÇALIŞILAN, EN GÜNCEL DURUM (2026-09-02):** Çiğdem'in kişisel
      hesap bilgisi (`tascigdem@hotmail.com` + şifre) alındı, Postiz'de "Add Channel → Instagram
      (Facebook Business)" denendi.
  - [x] Postiz'in Instagram provider'ında da (LinkedIn'e benzer) Meta App izin eksikliği
        bulunup düzeltildi: Facebook OAuth `unauthorized/invalid scope` hatası verdi
        (`instagram_basic`, `instagram_content_publish`, `instagram_manage_insights` — Postiz'in
        istediği 7 scope'tan 3'ü). Sebep kod hatası değildi — bu üç izin Meta App'e
        (`developers.facebook.com/apps/1605447844442171`, "Sparro" App, aynı App Sparrow'da da
        kullanılıyor) hiç eklenmemişti. "Permissions and features" sayfasından "Add" ile üçü de
        anında eklendi ("Ready for testing" durumuna geçti), App tarafında Postiz kod değişikliği
        GEREKMEDİ. Detay: `talk-and-heal-hata-gunlugu/05-Backend-Entegrasyon/
        05-backend-entegrasyon.md` BE-121.
  - [ ] **SIRADAKI ADIM — Çiğdem'in 2FA onayı bekleniyor:** Facebook girişinde şifre kabul
        edildi ama telefon onayı (2FA, ekranda "61" sayısı) isteniyor — Çiğdem Londra'da,
        telefonu yanında değildi, onaylanamadı. Çiğdem müsait olunca: Postiz'de "Add Channel →
        Instagram (Facebook Business)" tekrar denenmeli, `tascigdem@hotmail.com` ile giriş
        yapılıp telefon bildirimi ("61" gibi bir sayı) hemen onaylanmalı (birkaç dakika içinde
        zaman aşımına uğruyor).
  - [ ] Onaydan sonra: Facebook consent ekranında `facebook.com/TalkandHealUK` sayfası + bağlı
        `instagram.com/talkandhealuk` hesabı seçilip "Allow" denmeli.
  - ⚠️ **Not:** Facebook Login akışı Instagram'ın Facebook Sayfası'na bağlı olmasını gerektiriyor
        (Postiz'in "Instagram (Standalone)" seçeneği farklı bir akış, denenmedi). `talkandhealuk`
        hesabının gerçekten `TalkandHealUK` sayfasına bağlı olduğu bu adımda doğrulanacak.
- [ ] Threads — Facebook/Instagram çözülünce ele alınacak (aynı Meta ekosistemi).

## Bu oturumda AYRICA yapılan, entegrasyondan bağımsız bir düzeltme

- [x] Backend bug: `GET /events` gereksiz `ensureEventsTab()` çağrısı kaldırıldı, deploy edildi,
      doğrulandı. Detay: `talk-and-heal-hata-gunlugu/10-Izleme-Bakim/10-izleme-bakim.md` (IZL-01).
      Bu, sosyal medya işinin ortasında Uptime Kuma uyarısı fark edilince araya girildi — LinkedIn
      işine kaldığı yerden geri dönüldü.
