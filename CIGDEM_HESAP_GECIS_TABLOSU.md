# Çiğdem'den Alınacak Hesap Bilgileri — Test → Gerçek Hesap Geçişi

**Tarih:** 2026-07-27
**Amaç:** Geliştirme/test aşamasında Selen'in kendi hesaplarıyla kurulan tüm entegrasyonların
(Google Calendar/Sheets, Stripe, WhatsApp, e-posta, panel şifresi) canlıya geçmeden önce
Çiğdem'in KENDİ hesaplarına devredilmesi gerekiyor. Bu, `NOTES.md`'deki kritik pre-launch
şartıdır — aşağıdaki tablo doldurulmadan `git push`/deploy yapılmayacak.

Çiğdem bu dosyayı (veya bir kopyasını) alıp sağ sütunu doldurabilir; bilgiler geldiğinde
`form-backend/.dev.vars` ve ilgili dış servis panelleri buna göre güncellenecek.

| # | Kategori | Ne gerekiyor / neden | Çiğdem'in dolduracağı bilgi |
|---|----------|----------------------|------------------------------|
| 1 | **Google hesabı** | Takvim ve Sheets (veritabanı) bu hesaba bağlanacak. Google hesap e-postası + bu hesaba ait bir Google Takvim | |
| 2 | **Google Calendar erişimi** | Backend'in randevu event'i oluşturabilmesi için bir servis hesabı e-postasını takvime "değişiklik yapabilir" yetkisiyle davet etmesi gerekiyor (davet linki bizden gidecek, sadece kabul etmesi yeterli) | Kabul edildi mi? (Evet/Hayır) |
| 3 | **Stripe hesabı** | Ödeme/iade işlemleri şu an test modunda (Selen'in test hesabı). Gerçek ödeme almak için Çiğdem'in kendi (live) Stripe hesabı | Stripe hesap e-postası |
| 4 | **Stripe banka hesabı (payout)** | Alınan ödemelerin yatacağı hesap | IBAN / banka hesap bilgisi (Stripe panelinden kendisi de girebilir) |
| 5 | **WhatsApp iş numarası** | Müşteri bildirimleri şu an test numarasından gidiyor (`447000000000` placeholder) | Gerçek WhatsApp iş numarası |
| 6 | **Meta Business / WhatsApp Cloud API erişimi** | WhatsApp mesajlarının gerçek numaradan gönderilebilmesi için Meta Business hesabı kurulumu/erişimi gerekiyor | Meta Business hesabı var mı? (Evet/Hayır) — yoksa kurulum için birlikte bir oturum planlanacak |
| 7 | **Bildirim e-postası** | Şu an `help@talkandheal.co.uk` kullanılıyor ama teyitli değil, değişebilir dendi | Kesin/nihai e-posta adresi |
| 8 | **E-posta gönderim servisi (Resend)** | Otomatik e-postalar (onay, hatırlatma) şu an test Resend hesabından gidiyor | Kendi Resend hesabı kurulacak mı, yoksa mevcut domain e-postası mı kullanılacak? |
| 9 | **Bildirim WhatsApp numarası** | Şu an yeni randevu bildirimleri Selen'in WhatsApp'ına gidiyor (test amaçlı) | Bildirimlerin gitmesini istediği kendi WhatsApp numarası |
| 10 | **Panel şifresi** | Randevu notları panelinin girişi için, kendisinin seçeceği ve unutmayacağı bir şifre | Seçtiği panel şifresi |
| 11 | **Domain/DNS erişimi (talkandheal.co.uk)** | E-posta gönderim doğrulaması (SPF/DKIM) ve olası diğer DNS kayıtları için erişim/yetki gerekebilir | DNS paneline erişimi var mı, yoksa hosting sağlayıcısı üzerinden mi ilerlenecek? |

## Notlar
- Yukarıdakilerin hiçbiri aynı anda istenmek zorunda değil — Çiğdem hangisini şu an biliyorsa onu
  doldurup gönderebilir, eksikler sonra tamamlanır.
- Stripe/Meta/Google gibi hesapların *kurulumunda* (hesap açma adımları) gerekirse birlikte bir
  ekran paylaşımlı oturum yapılabilir; sadece bilgi istemek şart değil.
- Bu tablo doldukça `form-backend/.dev.vars` (gizli, git'e girmez) ve varsa ilgili şifre yöneticisi
  notu güncellenecek.

## Gidiş Yolu (madde madde ne yapılacak)

### 1. Google hesabı
- Zaten kullandığınız bir Gmail/Google hesabı varsa onu kullanabilirsiniz, yeni açmanıza gerek yok.
- Hiç Google hesabınız yoksa: `https://accounts.google.com/signup` adresine gidin, formu doldurup
  hesabı oluşturun.
- Bu hesapla `https://calendar.google.com` adresine girip bir takviminizin olduğundan emin olun
  (varsayılan takvim yeterli, yeni bir takvim açmanız gerekmiyor).
- Yapılacak: kullanacağınız Google hesabının e-posta adresini tabloya (madde 1) yazın.

### 2. Google Calendar erişimi
- Bu adımda önce bize (Selen'e) madde 1'deki e-posta adresini iletmeniz gerekiyor.
- Biz, backend'in randevu oluşturabilmesi için bir "servis hesabı" adresini sizin takviminize
  paylaşım daveti olarak göndereceğiz.
- Siz `https://calendar.google.com` adresinde soldaki takvim listesinin yanındaki üç noktaya
  tıklayıp **Ayarlar ve paylaşım**'a girerseniz gelen paylaşım isteğini burada görüp
  onaylayabilirsiniz; ya da doğrudan Gmail'inize gelecek "sizi bir takvimi paylaşmaya davet etti"
  e-postasındaki **Bu daveti kabul et** butonuna tıklamanız yeterli.
- Yapılacak: daveti kabul ettikten sonra tabloya (madde 2) "Evet" yazın.

### 3. Stripe hesabı
- `https://dashboard.stripe.com/register` adresine gidin.
- İş e-postanızı ve bir şifre belirleyip kayıt olun.
- Kayıt sonrası çıkan "İşletme bilgileri" formunda: işletme adı olarak **Talk and Heal**, ülke
  **United Kingdom**, iş türü olarak terapi/danışmanlık hizmetine en yakın seçeneği işaretleyin.
- Yapılacak: kayıt olduğunuz e-posta adresini tabloya (madde 3) yazın.

### 4. Stripe banka hesabı (payout)
- `https://dashboard.stripe.com` üzerinden giriş yapın.
- Sol menüden **Settings (Ayarlar)** → **Bank accounts and scheduling** (Banka hesapları ve
  ödeme takvimi) bölümüne girin.
- **+ Add bank account** ile IBAN/hesap bilgilerinizi ekleyin.
- Yapılacak: eklemeyi tamamladıktan sonra tabloya (madde 4) "eklendi" yazın (IBAN'ı bize ayrıca
  yazmanıza gerek yok, bilgi doğrudan Stripe'ta kalıyor).

### 5. WhatsApp iş numarası
- Müşteri bildirimleri için kullanılacak telefon numarasına karar verin.
- Dikkat: bu numara WhatsApp Business API'ye bağlandığında, o numarayla normal (kişisel) WhatsApp
  uygulamasını aynı anda kullanamazsınız — mevcut kişisel numaranızdan ayrı, sadece iş için
  kullanacağınız bir numara olması önerilir.
- Yapılacak: seçtiğiniz numarayı tabloya (madde 5) yazın, kurulumu madde 6'da birlikte yapacağız.

### 6. Meta Business / WhatsApp Cloud API erişimi
- `https://business.facebook.com` adresine gidip bir Meta Business hesabınız olup olmadığına
  bakın; yoksa aynı sayfadan **Hesap oluştur**'a tıklayarak açabilirsiniz.
- Bu adımın devamı (WhatsApp Business hesabının bağlanması, numaranın doğrulanması) teknik
  adımlar içerdiği için ekran paylaşımlı birlikte yapılması en sağlıklısı.
- Yapılacak: şimdilik sadece tabloya (madde 6) "Meta Business hesabım var" veya "yok" yazmanız
  yeterli.

### 7. Bildirim e-postası
- Müşterilere/size giden otomatik e-postalarda görünmesini istediğiniz nihai adrese karar verin
  (mevcut `help@talkandheal.co.uk` kalabilir ya da yeni bir adres olabilir).
- Yapılacak: karar verdiğiniz adresi tabloya (madde 7) yazın, başka bir işlem gerekmiyor.

### 8. E-posta gönderim servisi (Resend)
- `https://resend.com/signup` adresinden bir hesap oluşturun (Google hesabınızla da
  kaydolabilirsiniz).
- Giriş yaptıktan sonra sol menüden **Domains** sekmesine girip **Add Domain** ile
  `talkandheal.co.uk` domainini ekleyin.
- Resend size birkaç DNS kaydı (TXT/SPF/DKIM) verecek — bunların domain sağlayıcınızın DNS
  panelinden eklenmesi gerekiyor (bkz. madde 11, DNS erişimi).
- Yapılacak: hesabı oluşturduktan sonra tabloya (madde 8) "hesap oluşturuldu" yazın; API anahtarı
  ve domain doğrulama adımını birlikte tamamlayabiliriz.

### 9. Bildirim WhatsApp numarası
- Yeni randevu bildirimlerinin (şu an test amaçlı Selen'e giden) hangi WhatsApp numarasına
  gelmesini istediğinize karar verin — bu, madde 5'teki iş numarasından farklı, kendi kişisel
  numaranız da olabilir.
- Yapılacak: seçtiğiniz numarayı tabloya (madde 9) yazın.

### 10. Panel şifresi
- Randevu notları panelinde giriş için kullanacağınız, kolay unutmayacağınız bir şifre belirleyin.
- Güvenlik için bu şifreyi doğrudan bu dosyaya/Word'e yazmak yerine WhatsApp veya telefonla ayrıca
  iletmeniz daha güvenli olur.
- Yapılacak: tabloya (madde 10) "belirledim" yazıp şifreyi ayrı bir mesajla iletin.

### 11. Domain/DNS erişimi (talkandheal.co.uk)
- Domain'in hangi sağlayıcıda (hosting firması, GoDaddy, Namecheap vb.) kayıtlı olduğunu ve o
  hesabın giriş bilgilerine erişiminizin olup olmadığını kontrol edin.
- Erişiminiz yoksa domain/hosting sağlayıcınızla iletişime geçip yönetici erişimi (ya da gerekli
  DNS kayıtlarını sizin adınıza eklemelerini) talep edin.
- Yapılacak: tabloya (madde 11) "erişimim var" veya "erişimim yok, sağlayıcıyla görüşülecek" yazın.

## Durum (2026-07-27 oturumu — Çiğdem fiziksel olarak yanımızdaydı, adım adım birlikte yapıldı)

Gerçek değerler `form-backend/.dev.vars.cigdem` dosyasına yazılıyor (gitignored, git'e girmiyor —
launch anında bu dosyadan `wrangler secret put` ile production'a taşınacak).

1. **Google hesabı — BİTTİ.** `tascigdem1977@gmail.com`, mevcut/varsayılan (primary) takvim
   kullanılıyor, yeni takvim açılmadı.
2. **Google Calendar erişimi — BİTTİ.** Takvim saat dilimi Türkiye'den **Europe/London**'a
   çevrildi (önemli düzeltme). Servis hesabına "Değişiklik yapma ve tüm etkinlik ayrıntılarını
   görme" izniyle paylaşıldı. `GOOGLE_CALENDAR_ID=tascigdem1977@gmail.com` yazıldı.
   Ayrıca `GOOGLE_SHEET_ID` de bu oturumda karara bağlandı: Çiğdem'in kendi Drive'ında yeni bir
   Sheet (`13W3GtiBW1kdcFadVxbdsVMVuENg1VTU0jBDTigWuuPM`) açıldı, "Sayfa1" adlı sekme oluşturuldu,
   servis hesabına Editor izniyle paylaşıldı — sütun başlıkları/mirror sekmeleri ("2 Seans" vb.)
   elle kopyalanmadı, kod (`ensureHeaderRow`) ilk yazımda kendisi oluşturacak.
3. **Stripe hesabı — BİTTİ (sandbox/test modu).** Yeni, ayrı bir Stripe hesabı açıldı (Çiğdem'in
   kendi girişiyle — dikkat: tarayıcıda önce yanlışlıkla Selen'in eski test hesabına düşülmüştü,
   incognito ile doğru şekilde yeniden açıldı). Ürün seçimi: sadece "Non-recurring payments"
   (Invoicing/Tax collection kaldırıldı). "Go to sandbox" seçildi — launch'a kadar test modunda
   kalınacak. Test `sk_test_...` secret key `.dev.vars.cigdem`'e yazıldı.
   **Ertelenen:** `STRIPE_WEBHOOK_SECRET` (canlı URL gerektiriyor, deploy'da) ve madde 4/banka
   hesabı (live hesaba geçince anlamlı).
4. **Stripe banka hesabı — ERTELENDİ**, go-live adımına kadar yapılmayacak.
5. **WhatsApp iş numarası — KARAR VERİLDİ: (a) ikinci/ayrı numara.** Çiğdem mevcut kişisel
   numarasından (`447595455398`) vazgeçmeyecek, WhatsApp Business/Cloud API için **yeni, ayrı bir
   numara** alacak. Numara henüz elimizde değil — Çiğdem numarayı aldığında bize iletecek, o zaman
   tabloya işlenip madde 6'ya devam edilecek.
6. **Meta Business / WhatsApp Cloud API — KISMEN BİTTİ, yeni numara bekleniyor.**
   Meta Business hesabı oluşturuldu ("Talk and Heal", ilk denemede "hesap çok yeni" hatasıyla
   karşılaşıldı, biraz bekleyip tekrar denenince başarılı oldu). Meta for Developers hesabı +
   "Talk and Heal Backend" adlı app oluşturuldu, "Connect with customers through WhatsApp" use
   case'i eklendi, iş bilgileri + WhatsApp Business profili dolduruldu (saat dilimi Europe/London'a
   düzeltildi). **Numara ekleme adımında duruyoruz — Çiğdem'in yeni numarayı bildirmesini
   bekliyoruz.** Numara gelince sıradaki adımlar: numarayı ekle/doğrula → kalıcı (System User)
   access token oluştur (quickstart'ın geçici/24 saatlik tokenını DEĞİL) → `WHATSAPP_ACCESS_TOKEN`/
   `WHATSAPP_PHONE_NUMBER_ID` yaz. Webhook (Callback URL/`WHATSAPP_VERIFY_TOKEN`, zaten üretilmiş
   durumda) canlı URL gerektirdiği için deploy'a ertelendi.
7. **Bildirim e-postası — BİTTİ.** `EMAIL_FROM` (müşteriye giden mailin "kimden" adresi) domain
   doğrulaması gerektirdiği (gmail'den gönderilemez) için `help@talkandheal.co.uk` olarak KALIYOR
   (madde 8/11 üzerinden). `SELEN_NOTIFICATION_EMAIL` (sadece iç "yeni randevu" uyarısı) ise
   `tascigdem1977@gmail.com` olarak `.dev.vars.cigdem`'e yazıldı.
8. **Resend hesabı — BİTTİ (kayıt + API key + domain ekleme).** `tascigdem1977@gmail.com` ile
   kayıt olundu, API key üretilip `.dev.vars.cigdem`'e yazıldı. `talkandheal.co.uk` domaini
   Resend'e eklendi (region: Ireland/EU), 3 DNS kaydı alındı (aşağıda madde 11'de).
9. **Bildirim WhatsApp numarası — KARAR VERİLDİ: başka bir numara (kişisel numarası değil),
   numara henüz bilinmiyor.** Çiğdem'den bilgi gelmediği için numaranın kendisi elimizde yok —
   madde 5/6'daki iş numarasıyla birlikte "Çiğdem'den beklenenler" listesine eklendi, gelince
   tabloya işlenecek.
10. **Panel şifresi — BİTTİ.** Çiğdem kendi şifresini belirledi, `.dev.vars.cigdem`'deki
    `PANEL_PASSWORD` placeholder'ı (`choose-a-panel-password`) yerine gerçek şifre elle yazıldı
    (2026-07-28, TextEdit üzerinden, chat'e hiç yazılmadan).
11. **Domain/DNS erişimi — DIŞ BLOKAJ, cevap bekleniyor.** Bu, daha önce (2026-07-22) Çiğdem'e/
    hosting kişisine gönderilmiş olan consolidated bilgi talebiyle (bkz.
    `project_hosting_bilgi_talebi` hafıza notu, iki Artifact linki) aynı bekleyen konu — henüz
    cevap gelmedi. Resend'den alınan 3 DNS kaydı (DKIM TXT, SPF MX+TXT — tam değerler
    `.dev.vars.cigdem`'in yanında bu oturumun transcript'inde) hazır, sadece DNS paneline
    eklenmesi gerekiyor, kimin ekleyeceği (hosting kişisi mi, Çiğdem'in kendisi mi) belli olunca
    yapılacak.

**Çiğdem'den beklenen bilgi — sadece TEK yeni numara (2026-07-28'de güncellendi):**
Aşağıdaki karşılaştırma sonucu öneri: mevcut numara (`447595455398`) **bildirim numarası** olarak
kalsın (hiçbir işlevini kaybetmez), sadece **iş numarası** için yeni bir numara alınsın. Böylece
Çiğdem'den tek bir yeni numara beklemek yeterli — mevcut 25 yıllık, itibarlı, aile/sosyal çevrede
kullanılan numaraya hiç dokunulmuyor.

**Sıradaki oturumda ilk iş:** Sadece madde 5/6 (iş numarası) kaldı — Çiğdem'in yeni numarayı
bildirmesi bekleniyor. Madde 9 (bildirim numarası) mevcut kişisel numarayla karşılanabileceği için
artık ayrı bir numara beklemiyor, Çiğdem'in yukarıdaki karşılaştırmayı onaylamasına bağlı. Madde 10
bitti.

---

## İş Numarası mı, Bildirim Numarası mı? — Çiğdem'e gönderilecek karşılaştırma (2026-07-28)

**Öneri:** Yeni alınacak numara (aşağıda `44xxxxxxxxxx`) **iş numarası** olsun, mevcut numara
(`447595455398`) **bildirim numarası** olsun.

**Neden:** İş numarası WhatsApp Business Cloud API'ye bağlandığı an, o numarayla normal WhatsApp
uygulamasına bir daha giriş yapılamıyor — numara sadece kodun otomatik mesaj gönderdiği bir uç
noktaya dönüşüyor, sohbet/arama/dosya paylaşımı gibi hiçbir normal özelliği kalmıyor. Bildirim
numarasında ise hiçbir kısıtlama yok, numara normal WhatsApp gibi çalışmaya devam ediyor, sadece
ekstra bir bildirim mesajı alıyor. Mevcut numara 25 yıldır iş+sosyal çevrede kullanılan, itibarlı,
aileyle iletişim kurulan bir numara olduğu için işlevlerinin kaybolacağı iş numarası rolüne değil,
hiçbir şey kaybetmeyeceği bildirim numarası rolüne uygun.

| Özellik | `447595455398` (mevcut) — **bildirim numarası önerisi** | `44xxxxxxxxxx` (yeni) — **iş numarası önerisi** |
|---|---|---|
| Müşterilere otomatik mesaj gönderme (onay, hatırlatma) | Hayır, bu numaradan müşteriye mesaj gitmez | Evet, bunun için var |
| Çiğdem'e "yeni randevu" bildirimi alma | Evet, bunun için var | Hayır |
| Normal WhatsApp / WhatsApp Business uygulamasına giriş | Evet, normal şekilde devam eder | Hayır — Cloud API'ye bağlandıktan sonra hiçbir cihazda normal uygulamaya giriş yapılamaz |
| Sesli arama | Yapılabilir | Yapılamaz |
| Görüntülü arama | Yapılabilir | Yapılamaz |
| Sesli not gönderme/alma (elle) | Yapılabilir | Yapılamaz (sadece kodun otomatik gönderdiği mesajlar gider) |
| Fotoğraf/dosya paylaşımı (elle) | Yapılabilir | Yapılamaz |
| Aile/arkadaşlarla serbest sohbet | Yapılabilir | Yapılamaz |
| Grup sohbetleri | Kullanılabilir | Kullanılamaz |
| Durum (status) paylaşımı | Kullanılabilir | Kullanılamaz |
| Kişi rehberi | Normal şekilde kullanılır | Uygulama olmadığı için rehber işlevi yok |
| Müşteriye 24 saatlik pencere dışında serbest metin | Konu dışı (müşteriyle konuşmuyor) | Sadece Meta onaylı hazır şablon mesajlarıyla mümkün, serbest metin yok |
| Mesaj/gün limiti | Yok, normal WhatsApp limitleri geçerli | Var — Meta'nın "kalite puanı"na göre başlangıçta günde ~250 yeni müşteri, zamanla puana göre artar |
| 25 yıllık itibar/geçmiş | Korunur, hiç dokunulmaz | Yeni numara olduğu için zaten kaybedilecek bir geçmiş yok |
| Geri normal kullanıma dönüş | Zaten hep normal kullanımda, dönüş diye bir şey yok | Zor/karmaşık — Meta'nın resmi "numarayı Cloud API'den çıkarma" sürecini gerektirir, düz bir "çıkış" tuşu yok |

**Çiğdem'in yapması gereken:** Yukarıdaki tabloya bakıp onaylarsa, sadece yeni bir numara (iş
numarası olacak) alıp bize iletmesi yeterli — mevcut numarasına hiç dokunulmayacak.
