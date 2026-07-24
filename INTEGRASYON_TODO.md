# WhatsApp + Calendar + E-posta + Drive Entegrasyonu — Bağımlılık Sıralı TODO

**Kritik kural (bkz. NOTES.md "⚠️ KRİTİK" bölümü):** Tüm Phase 1-4 **Selen'in test
hesaplarıyla** kurulacak. Phase 5 (gerçek hesap geçişi) tamamlanmadan **yayına alma/deploy/git
push/müşteriyle paylaşma YAPILMAYACAK.**

**10 Aşamalı çerçeveyle ilişki:** Bu iş `AI_DESTEKLI_WEB_GELISTIRME_REHBERI.md`'nin **5. Aşaması**
(Backend/Entegrasyon, Cloudflare Wrangler) kapsamına giriyor. Yeni bir stack icat edilmedi, mevcut
plan genişletildi. Bitince **6. Aşama (Test/QA)** ve **10. Aşama (İzleme)** yeni endpoint'leri de
kapsayacak şekilde güncellenmeli — bu ilişkiler aşağıda ilgili maddelerde not edildi.

Durum işaretleri: `[ ]` başlanmadı · `[~]` ayarları bitti ama uçtan uca test edilemedi (bağımlı
olduğu adım bitmediği için) · `[x]` test edilip çalıştığı doğrulandı.

---

## Phase 0 — Mimari kararlar (her şeyin önü, blocker)

- [x] Backend: **Cloudflare Workers** (Wrangler) — 5. Aşama'daki plana uyumlu
- [x] Ödeme: **Stripe Checkout** (test-mode)
- [x] Takvim: **Google Calendar API** (freebusy sorgusu) + kendi tasarımımızla özel slot/form UI
      (Calendly değil — kullanıcının istediği özel form alanları/iptal metni Calendly'nin hazır
      UI'ında tam kontrol edilemez)
- [x] **NETLEŞTİRİLDİ (2026-07-21):** Danışan HİÇBİR ZAMAN Google Calendar'ın kendi arayüzüne
      yönlendirilmeyecek. Google Calendar API sadece backend'de (freebusy sorgusu + event
      oluşturma) kullanılacak. Danışanın gördüğü slot seçimi, 4 alanlı form, iptal politikası
      onayı ve ödeme yönlendirmesi **tamamen talk and heal web sitesinin kendi sayfası** —
      hem marka tutarlılığı hem site trafiği için (kullanıcının önerisi, onaylandı).
- [x] Kayıt: **Google Sheets API** (ham .xlsx yerine — aynı "Excel" hissi, çok daha basit yazım)
- [x] Test Google hesabı: **engintass19@gmail.com** (kullanıcı onayladı, 2026-07-21)
- [x] KVKK/gizlilik: Drive klasörü sadece Selen + Çiğdem'e kısıtlı paylaşımla kurulacak
      ("Sorun Özeti" alanı hassas veri sayılır) — kullanıcı onayladı
- [ ] **Zaman dilimi tespiti (yeni, 2026-07-21):** Danışanın ülkesi/yerel saati, WhatsApp
      telefon numarasının ülke koduna bakılarak (örn. `libphonenumber-js` ile) tespit edilecek,
      sonra ülke → IANA timezone eşlemesiyle (basit statik tablo) yerel 13:00'ün UTC karşılığı
      hesaplanacak. **Bilinçli sınır:** birden fazla saat dilimi olan ülkelerde (ABD, Rusya vb.)
      en yaygın/başkent dilimi kullanılacak, sorun çıkarsa detaylandırılır.
- [ ] **WhatsApp mesaj şablonları Meta onayına gönderilecek (yeni):** utility kategorisindeki
      şablon mesajlar (ödeme onayı, hatırlatma) Meta Business Manager'da önceden onaylanmalı —
      bu bir kurulum adımı, anlık değil, süre alabilir. Phase 1'e eklendi.
- [ ] **KRİTİK — test→gerçek hesap geçişinde sorun yaşamamak için (2026-07-21):** Şablonlar
      Meta'da telefon numarasına değil **WABA'ya (WhatsApp Business Account)** bağlı onaylanıyor.
      Çiğdem'in gerçek numarası **AYNI test WABA'sına** eklenirse onaylı şablonlar oradan kalır,
      yeniden onay gerekmez. Eğer ayrı/yeni bir WABA açılırsa sadece "yüksek kaliteli" şablonlar
      otomatik kopyalanır, geri kalanı yeniden onaya girer. **Bu yüzden Phase 1'de Meta Business
      Manager kurulurken ayrı bir "test" yapısı değil, doğrudan tek bir WABA kurulacak** (test
      numarasıyla başlanır, ileride Çiğdem'in gerçek numarası aynı WABA'ya eklenir).
      Sources: [Meta — Business phone numbers](https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/phone-numbers), [Insider One — Migrate WhatsApp Phone Numbers](https://academy.insiderone.com/docs/migrate-whatsapp-phone-numbers)
- [ ] **Google/Stripe hesap geçişi için mühendislik kuralı:** Takvim ID'si, Sheets ID'si, Stripe
      API anahtarları koda GÖMÜLMEYECEK, Cloudflare Worker secret/env değişkenlerinde tutulacak
      — böylece Çiğdem'in hesaplarına geçiş, kod değişikliği değil sadece bu değerlerin
      güncellenmesi olur. Stripe: canlıya geçişte hesap zorunlu olarak Çiğdem'in kendi hesabı
      olacak (ödeme/para çekimi onun banka bilgisine bağlı, Stripe kuralı) — ama bu da sadece
      2 API anahtarının değişmesi demek, kod aynı kalır.

## Mesaj Akışı Spesifikasyonu (kullanıcı, 2026-07-21)

WhatsApp Cloud API maliyeti (Meta, 2025 sonrası mesaj-başı fiyatlandırma — kesin rakamlar ülkeye
göre değişiyor, gönderim anında Meta'nın rate calculator'ından teyit edilecek):
- **Service mesajları** (danışanın son 24 saat içindeki mesajına verilen yanıt): **ücretsiz**,
  sınırsız (Kasım 2024'ten beri).
- **Utility şablon mesajları** (24 saatlik pencere dışında gönderilen randevu onayı/hatırlatma
  gibi işlemsel mesajlar): **ücretli ama düşük** — marketing mesajlarından ~%80-90 daha ucuz,
  çoğu pazarda mesaj başı yaklaşık $0.01-0.02 bandı (kesin rakam ülkeye göre değişir).
- **Marketing şablonları:** en pahalı kategori (~$0.01-$0.14/mesaj) — bizim akışımızda kullanılmıyor.
- Randevu onayı ve gün-öncesi hatırlatma mesajları neredeyse kesin 24 saatlik pencere dışında
  gönderileceğinden **utility şablon** olarak sınıflandırılıp Meta'ya önceden onaylatılmaları
  gerekiyor (bkz. Phase 0). Beklenen hacim (küçük bir terapi pratiği) düşünüldüğünde toplam
  maliyet muhtemelen ayda birkaç dolar seviyesinde kalır.
- Sources: [WhatsApp Business Platform Pricing](https://whatsappbusiness.com/products/platform-pricing/), [Meta WhatsApp Pricing Docs](https://developers.facebook.com/docs/whatsapp/pricing), [Blueticks 2026 pricing guide](https://blueticks.co/blog/whatsapp-business-api-pricing-2026)

Danışana ve Selen'e giden mesajlar/loglar (kullanıcının netleştirdiği tam akış):

1. **Danışan formu doldurup ödemeyi tamamlar** →
   a. **Selen'e** kişisel veriler + randevu bilgisi **hem WhatsApp hem e-posta** ile iletilir.
   b. **Danışana** ödeme sonrası hemen, randevu ayrıntıları + yer bilgisiyle bir **WhatsApp
      hatırlatma mesajı** (onay niteliğinde) gönderilir.
   c. Sheets'teki danışan kaydına "onay mesajı gönderildi: [tarih-saat]" işlenir.
   d. Selen'e bu gönderim de WhatsApp ile bildirilir.
2. **Randevudan 1 gün önce, danışanın ülkesinin yerel saatiyle 13:00'te** →
   a. Danışana aynı randevu bilgisi + yer içeriğiyle ikinci bir **WhatsApp hatırlatma mesajı**
      gönderilir.
   b. Sheets'teki kayda "hatırlatma mesajı gönderildi: [tarih-saat]" işlenir.
   c. Selen'e bu gönderim de WhatsApp ile bildirilir.

**Varsayım (teyit bekliyor, yanlışsa düzelt):** Kullanıcı hem ödeme-sonrası mesajı hem gün-öncesi
mesajı ortak olarak "WhatsApp hatırlatma mesajı" diye adlandırdı — her iki gönderim de yukarıdaki
Sheets-log + Selen-bildirimi tetikleyicisini çalıştırır şeklinde uygulanacak.

## Phase 1 — Test hesapları (Selen'e ait)

- [x] **Meta Business Manager hesabı (2026-07-21):** "Facebook Account Too New" bekleme
      bloğu aşıldı, Business Portfolio + App (`Talk and Heal`) kuruldu. WABA ve test numarası
      alttaki maddede detaylı.
- [x] **WhatsApp test WABA + numarası kuruldu ve doğrulandı (2026-07-21):** Test number
      `+1 (555) 157-0699`, Phone Number ID `1238686782662234`, WABA ID `979906145080746`.
      "Order Confirmation" örnek şablonuyla Selen'in gerçek WhatsApp'ına test mesajı gönderildi
      ve sorunsuz ulaştı — uçtan uca çalıştığı doğrulandı. Geçici (24s) access token üretildi,
      kalıcı token Phase 2'de System User ile üretilecek (hiçbir token sohbette/dosyada
      paylaşılmayacak, sadece Cloudflare Worker secret'ı olarak saklanacak).
- [x] **Google Cloud projesi (2026-07-21):** engintass19@gmail.com hesabıyla,
      Calendar API + Sheets API etkinleştirilecek. **Yöntem kararı:** OAuth consent akışı değil,
      **Service Account** kullanılacak — çünkü backend (Cloudflare Worker) arkasında canlı bir
      kullanıcı olmadan çalışacak, Service Account'un kendi JSON anahtarıyla kimlik doğrular,
      refresh token süresi dolma derdi olmaz. Kurulum: (1) proje oluştur, (2) Calendar+Sheets
      API'lerini etkinleştir, (3) Service Account oluştur, JSON anahtarı indir (asla ekran
      görüntüsü/sohbette paylaşılmayacak, Worker secret'ı olacak), (4) kullanılacak Google
      Calendar ve Google Sheet'i Service Account'un e-postasıyla paylaş (Calendar: "Etkinlikleri
      düzenleme" yetkisi, Sheet: Editör).
      **İlerleme (2026-07-21):** Proje oluşturuldu (`talk-and-heal-503117`), Calendar API +
      Sheets API etkinleştirildi. Service Account oluşturuldu:
      `talk-and-heal-backend@talk-and-heal-503117.iam.gserviceaccount.com` — bu e-posta,
      Calendar/Sheet paylaşırken kullanılacak. **JSON anahtarı indirildi (2026-07-21, kullanıcı
      teyit etti — anahtar sohbette paylaşılmadı, paylaşılmayacak).**
      **Calendar oluşturuldu ve paylaşıldı (2026-07-21):** Ayrı bir "Talk and Heal – Randevular"
      takvimi oluşturuldu (kişisel takvimle karışmasın diye), zaman dilimi **Europe/London**
      olarak ayarlandı (Çiğdem Londra merkezli çalışıyor — kullanıcı Türkiye'yi seçmemiz
      gerekip gerekmediğini sorup düzeltti). Service Account e-postasına "Make changes to
      events" yetkisiyle paylaşıldı.
      **Sheet oluşturuldu ve paylaşıldı (2026-07-21):** "Talk and Heal – Danışan Kayıtları"
      adıyla yeni Google Sheet oluşturuldu, Service Account e-postasına Editör yetkisiyle
      paylaşıldı.
      Sırada: JSON anahtarı Cloudflare Worker secret'ı olarak eklenecek (Phase 2 başlarken,
      `wrangler secret put`), ve Worker config'inde bu Calendar ID'si + Sheet ID'si kullanılacak.
- [x] **Stripe hesabı (2026-07-21):** `engintass19@gmail.com` ile Google girişi kullanılarak
      kaydolundu. Business location: **United Kingdom** (Çiğdem'in gerçek işletmesiyle tutarlı,
      ülke sonradan değiştirilemediği için baştan doğru seçildi — kullanıcı sordu, teyit edildi).
      Business name: `Talk and Heal`, website: `talkandheal.co.uk`. Sandbox (test-mode) hesabı
      oluşturuldu, GBP para birimi doğru geldi. Developers → API keys sayfasında test anahtarları
      (`sk_test_...`, `pk_test_...`) görüldü — anahtarlar sohbette paylaşılmadı, Phase 2'de
      Cloudflare Worker secret'ı olarak eklenecek.
- [x] ~~WhatsApp Business App'te ücretsiz "Karşılama Mesajı" kurulumu~~ **İPTAL (2026-07-21):**
      Bu, normal WhatsApp Business uygulamasının bir özelliği — Cloud API/WABA'ya bağlı bir
      numarada çalışmıyor (ikisi karşılıklı dışlayıcı). Onun yerine karşılama mesajı Phase 2'de
      **webhook tetikli serbest-metin yanıt** olarak yazılacak (bkz. Phase 2) — bu da ücretsiz,
      hatta daha esnek (dinamik içerik mümkün), sadece kod gerektiriyor.
- [ ] **Utility şablon mesajlarını Meta'ya onaya gönder — 4 şablon (2026-07-21 netleşen tam liste),
      hepsi İngilizce (site varsayılan diliyle tutarlı):**
      1. [~] `randevu_onay_danisan` — danışana, ödeme sonrası hemen. **GÖNDERİLDİ (2026-07-21),
         durum: Değerlendiriliyor (In Review).** WhatsApp Manager → Mesaj şablonları'nda görünüyor.
      2. [~] `randevu_hatirlatma_danisan` — danışana, randevudan 1 gün önce yerel 13:00.
         **GÖNDERİLDİ (2026-07-21), durum: Değerlendiriliyor.**
      3. [~] `yeni_randevu_bildirimi` — Selen'e, yeni randevu geldiğinde (Sorun Özeti dahil,
         kullanıcı onayladı 2026-07-21). **GÖNDERİLDİ (2026-07-21, düzeltilmiş haliyle — sabit
         kapanış cümlesi eklendi), durum: Değerlendiriliyor.**
      4. [~] `hatirlatma_gonderildi_bildirimi` — Selen'e, hatırlatma danışana gittiğinde.
         **GÖNDERİLDİ (2026-07-21), durum: Değerlendiriliyor.**
      **Sonuç: 4/4 şablon gönderildi (2026-07-21), hepsi "Değerlendiriliyor" durumunda. Onay
      bildirimini (Aktif-Kaliteli olunca) bir sonraki oturumda WhatsApp Manager'dan kontrol et.**
      **GÜNCELLEME (2026-07-22): Kullanıcı WhatsApp Manager'da bu şablonların "Değerlendiriliyor"
      durumundan çıkıp aktifleştiğini bildirdi.** Aşağıdaki "GERİ DÖNÜLECEK" maddesindeki gerçek
      uçtan uca doğrulama artık yapılabilir (Selen'in gerçek numarasıyla).
      Tam metinler aşağıdaki "WhatsApp Mesaj Şablonları" bölümünde. Onay süresi olabileceğinden
      erkenden başlatılmalı. Karşılama/booking-sayfası-linki mesajı şablon DEĞİL (yukarıya bkz).

## WhatsApp Mesaj Şablonları (tam metinler, Meta onayına bu haliyle gönderilecek)

**Dil kararı (2026-07-21):** Site varsayılan dili İngilizce olduğu için (kullanıcı onayladı),
şablonlar da İngilizce yazılıyor — Türkçe değil. Site zaten çift dilli (data-en/data-tr) olduğu
için ileride aynı şablon adına ikinci bir dil (Turkish) eklemek istersek WhatsApp bunu destekliyor
(aynı isim, farklı dil, ayrı onay), ama şimdilik sadece İngilizce yeterli. Şablon adları (teknik,
kullanıcıya görünmez) Türkçe kalabilir, sorun değil.

**Karşılama mesajı (ŞABLON DEĞİL — webhook, serbest metin, ücretsiz):**
```
Hello! To see available times and book an appointment, please tap the link below:
👉 [talk and heal booking page link]
```

**1. `randevu_onay_danisan`** (utility, İngilizce, danışana — ödeme sonrası hemen)
```
Hi {{1}}, your payment has been received. Your appointment details:

📅 Date/Time: {{2}}
📍 Location: {{3}}

Feel free to reach out on this number if you have any questions.
```

**2. `randevu_hatirlatma_danisan`** (utility, İngilizce, danışana — 1 gün önce, yerel 13:00)
```
Hi {{1}}, just a reminder about your appointment tomorrow:

📅 Date/Time: {{2}}
📍 Location: {{3}}

See you soon!
```

**3. `yeni_randevu_bildirimi`** (utility, İngilizce, Selen'e — yeni randevu/ödeme geldiğinde)

**Düzeltildi (2026-07-21):** Meta ilk halini reddetti — "değişken sayısı uzunluğa göre fazla,
değişkenler başta/sonda olamaz" uyarısı (şablon `{{4}}` ile bitiyordu). Sona sabit bir kapanış
cümlesi eklenerek düzeltildi:
```
New booking received ✅

Client: {{1}}
Contact: {{2}}
Appointment: {{3}}
Summary: {{4}}

Please check your email or Google Sheets record for the full details.
```

**4. `hatirlatma_gonderildi_bildirimi`** (utility, İngilizce, Selen'e — hatırlatma danışana gittiğinde)

**Önceden düzeltildi (2026-07-21):** Aynı "değişkenle bitemez" kuralına takılmaması için sona
sabit kapanış eklendi:
```
Reminder message sent to client.

Client: {{1}}
Appointment: {{2}}

This has been logged in the booking sheet.
```

## Phase 2 — Backend iskeleti (Cloudflare Worker)

- [x] `form-backend` projesi oluşturuldu (2026-07-21, Cloudflare Workers + TypeScript,
      kullanılmayan statik dosya sunumu iskeleti temizlendi).
- [x] **E-posta servisi kararı (2026-07-21): Resend.** `engintass19@gmail.com` ile test hesabı
      açılacak, API anahtarı Worker secret'ı olacak. Phase 5'te Çiğdem'in kendi hesabına geçecek
      (bkz. Phase 5 checklist) — gerçek şifre/anahtar değerleri hiçbir dosyaya yazılmaz.
- [x] **Session 5 — Gelen mesaj webhook'u (2026-07-22):** `routes/whatsapp.ts` — `GET
      /webhook/whatsapp` Meta'nın `hub.verify_token` doğrulama handshake'ini yapar (doğru token →
      `hub.challenge`'ı 200 ile döner, yanlış token → 403). `POST /webhook/whatsapp` gelen
      `messages`/`statuses` karışık payload'ını ayrıştırır (statuses'ta `messages` alanı olmadığı
      için doğal olarak atlanır), her gönderen numaraya karşılama metnini (randevu sayfası
      linkiyle, `config.ts`'teki TBD `BOOKING_PAGE_URL`) serbest-metin olarak yanıtlar — şablon
      değil, Meta onayı gerekmez. Bozuk JSON veya boş mesaj listesinde bile her zaman 200 döner
      (Meta'nın non-200'de tüm payload'ı tekrar denemesini önlemek için). **Gerçek `wrangler dev`
      üzerinden test edildi:** doğru/yanlış token ile GET handshake ve `statuses`-only POST payload
      gerçek HTTP istekleriyle doğrulandı; gerçek gönderim mantığı zaten Session 3'te doğrulanan
      `lib/whatsapp.ts`'i kullanıyor. 5 yeni mock'lu test (`test/whatsapp-webhook.spec.ts`) +
      router testi güncellendi, toplam 28/28 test yeşil, `tsc --noEmit` ve `prettier --check`
      (dokunulan dosyalarda) temiz. **Not:** karşılama mesajına iptal politikası notu/linki
      eklenmesi kasıtlı olarak yapılmadı — bkz. yukarıdaki "Gelecek Session — İptal Politikası +
      Kanal Takibi" (ayrı, henüz netleşmemiş bir iş).
- [x] **Session 1 — Foundation (2026-07-21):** `src/config.ts` (fiyatlar £120/£150 sabitlendi,
      randevu saatleri Pazartesi-Cuma 09:00-17:00 Londra + uzatılmış seans 80dk **TBD varsayılan**
      olarak işaretli — `pricing.html`'deki "TBD" kuralıyla tutarlı), `src/types.ts` (Env +
      Booking/SheetRow tipleri), `src/lib/timezone.ts` (telefon→ülke→IANA tz +
      "randevu -1 gün yerel 13:00→UTC" hesaplama, ABD/Rusya çoklu-saat-dilimi edge case'leri dahil
      test edildi), router iskeleti `src/index.ts`. 14/14 test yeşil, `tsc --noEmit` ve
      `prettier --check` temiz. Bağımlılık: `libphonenumber-js` eklendi.
- [ ] Google Calendar freebusy endpoint'i → boş slot listesi döner
- [x] **Session 2 — Google auth + Calendar okuma (2026-07-21):** `lib/google-auth.ts` (jose ile
      Service Account JWT → OAuth2 access token, önbellekli), `lib/calendar.ts` (freebusy sorgusu
      + iş saatlerine göre slot dilimleme + Stripe session id'sinden deterministik event id
      üreten `createCalendarEvent`), `routes/availability.ts`. **Gerçek Calendar'a karşı
      `wrangler dev` ile test edildi** — Pzt-Cuma 09:00-17:00 Londra saatine göre doğru
      filtrelenmiş slotlar, hafta sonu doğru atlandı. JSON anahtarı `.dev.vars`e taşındı
      (içeriği hiç ekrana yazdırılmadan, script ile), diskteki orijinal dosya silindi.
      Calendar ID + Sheet ID kullanıcıdan alındı, `.dev.vars`e eklendi.
- [x] **Session 4 — Booking → Stripe Checkout (2026-07-21):** `lib/stripe.ts` (resmi `stripe`
      SDK, `createFetchHttpClient` ile Workers uyumlu), `routes/booking.ts` (4 alan + iptal
      onayı doğrulaması, slot'un hâlâ boş olduğunu Stripe oturumu açmadan hemen önce tekrar
      kontrol eder — yarış durumunu azaltır ama tamamen çözmez, gerçek Calendar yazımı ödeme
      webhook'unda olacak). Fiyatlar `config.ts`'ten (£120/£150) okunuyor. Doğrulama mantığı
      8 testle kapsandı (400 durumları). **Gerçek uçtan uca test edildi (`wrangler dev`):**
      `/availability`'den gerçek boş slot alınıp `/booking`'e gönderildi, gerçek bir Stripe
      Checkout oturumu (`cs_test_...`) başarıyla oluşturuldu. Stripe test-mode Secret key
      `.dev.vars`e eklendi (sohbette paylaşılmadı).
- [x] **Session 3 — Sheets + mesajlaşma kütüphaneleri (2026-07-21):** `lib/sheets.ts` **gerçek
      Sheet'e karşı uçtan uca test edildi** (header yazma, satır ekleme, session id ile bulma,
      hücre güncelleme, okuma — hepsi çalıştı, test verisi temizlendi). Sekme adı varsayımı
      ("Sheet1") yanlış çıktı, API'den sorgulanıp gerçek ad ("Sayfa1" — Türkçe hesap ayarı)
      `config.ts`'e işlendi. `lib/whatsapp.ts` + `lib/email.ts` yazıldı, mock'lu testlerle
      doğrulandı. **WhatsApp kalıcı token üretildi (2026-07-21):** System User (`form-backend`,
      Admin rolü) oluşturuldu, WABA'ya Tam erişim + Talk and Heal uygulamasına "Uygulamayı
      yönetir" izniyle atandı (iki ayrı atama gerekiyormuş — biri asset, diğeri app-kişi
      ataması), "Asla süresi dolmasın" seçilerek kalıcı token üretildi. **`hello_world`
      şablonuyla gerçek gönderim test edildi, Selen'in telefonuna ulaştığı doğrulandı.** Token +
      Phone Number ID + Selen'in bildirim numarası `.dev.vars`e eklendi (token hiç sohbette
      paylaşılmadı, kullanıcı doğrudan dosyaya yapıştırdı). **Resend hesabı da kuruldu
      (2026-07-21):** `engintass19@gmail.com` ile kaydolundu, "Sending access" kapsamlı API
      anahtarı üretildi (sohbette paylaşılmadı, doğrudan `.dev.vars`e yapıştırıldı). **Gerçek
      gönderim test edildi** — `onboarding@resend.dev`den Selen'in e-postasına test maili
      başarıyla ulaştı. Session 3 tamamen bitti: 3 kütüphane de (Sheets, WhatsApp, e-posta)
      hem kodda hem gerçek API çağrısıyla doğrulandı.
- [x] Telefon numarasından ülke/timezone tespiti (`libphonenumber-js` + statik ülke→IANA tz tablosu) — Session 1'de yapıldı.
- [x] **Session 6 — Stripe webhook cascade (2026-07-22):** `routes/stripe-webhook.ts` — imza
      doğrulama (`constructEventAsync` + `createSubtleCryptoProvider`, ham body tek sefer okunuyor),
      `checkout.session.completed` dışındaki event tipleri hemen 200 ile yok sayılıyor. 6 adımlı
      cascade sırayla: 1) Calendar event (deterministik id, 409 = zaten var), 2) Sheets satırı
      (session id zaten loglanmışsa atlanır), 3-4) danışana onay şablonu + `confirmationSentAt`
      işleme (bu ikisi guard'lı — tekrarlanan teslimat danışanı asla ikinci kez rahatsız etmez),
      5-6) Selen'e yeni randevu + "onay gönderildi" bildirimleri (guard'sız — en kötü ihtimalle
      Selen'e çift bildirim gider, danışana asla). **Gerçek uçtan uca test edildi:** Stripe CLI
      (`stripe login` + `stripe listen --forward-to localhost:8787/webhook/stripe`) ile gerçek bir
      Checkout ödemesi (test kartı `4242 4242 4242 4242`) iki kez tamamlandı; gerçek Calendar
      event'leri ("Talk and Heal – Randevular" takviminde, doğru Londra saatiyle) ve gerçek Sheets
      satırları oluştuğu doğrulandı, test verisi sonra temizlendi. **Bulunan ve düzeltilen gerçek
      hata:** `config.ts`'teki `WHATSAPP_TEMPLATE_LANGUAGE` `'en_US'` olarak ayarlıydı, ama Meta bu
      4 şablonu düz `'en'` diliyle kaydetmiş — WABA'nın `message_templates` endpoint'i sorgulanarak
      teyit edildi, `'en'` olarak düzeltildi. **Bilinen blocker (kod değil, dış bağımlılık):** 4
      şablon da hâlâ Meta'da **PENDING** (2026-07-22) — bu yüzden adım 3/5/6'daki gerçek WhatsApp
      gönderimi şu an başarısız oluyor (`132001 Template name does not exist`), ama hata mesajı
      artık doğru dil kodunu gösteriyor, yani onay gelince çalışacak. Onay durumunu bir sonraki
      oturumda tekrar kontrol et (yukarıdaki "4/4 şablon gönderildi" notuna bkz). 9 yeni test
      (`test/stripe-webhook.spec.ts`, ilk teslimat + guard'lı retry senaryosu dahil), toplam
      32/32 test yeşil, `tsc --noEmit` ve `prettier --check` temiz.
- [x] **Session 7 — Cron hatırlatma sweep (2026-07-22):** `src/scheduled.ts` (`runReminderSweep`)
      + `wrangler.jsonc`'e `"triggers": {"crons": ["*/15 * * * *"]}` eklendi, `src/index.ts`'in
      default export'una `scheduled()` metodu eklendi. Her 15 dakikada bir tüm Sheets satırlarını
      okur, `reminderDueUtc` (randevu zamanında bir kere hesaplanmış, burada yeniden hesaplanmıyor)
      geçmişte kalan ve `reminderSentAt` boş olan satırlar için: danışana hatırlatma şablonu →
      `reminderSentAt` işaretle (guard, webhook cascade'deki aynı sıralama) → Selen'e bildirim.
      Bir satırdaki hata (ör. WhatsApp gönderim hatası) süpürmeyi durdurmaz, sadece o satır için
      loglanır ve `reminderSentAt` boş kaldığı için bir sonraki 15dk'lık turda otomatik tekrar
      denenir. 4 yeni test (`test/scheduled.spec.ts` — zamanı gelen/gelmeyen/zaten gönderilmiş
      satır + bir satırın hatasının diğerini etkilememesi), toplam 36/36 test yeşil. **Gerçek
      `wrangler dev --test-scheduled` ile test edildi:** gerçek Sheets'e geçmişte kalan bir
      hatırlatma satırı eklendi, `/__scheduled` tetiklendi, satır doğru bulundu ve gönderim
      denendi (sahte test numarası "izinli alıcı listesinde değil" hatası verdi — beklenen, çünkü
      test numarası Meta'nın izin listesinde değildi; önemli olan sweep'in satırı doğru bulup
      hatayı çökmeden loglaması ve `reminderSentAt`'ı boş bırakması, ikisi de doğrulandı), test
      verisi sonra temizlendi. `tsc --noEmit` ve `prettier --check` temiz.
      **Not:** bu adımın WhatsApp gönderim kısmı da Session 6'daki ile aynı "4 şablon hâlâ Meta'da
      PENDING" engeline bağlı — bkz. aşağıdaki "GERİ DÖNÜLECEK" maddesi.
- [x] **GERİ DÖNÜLECEK — WhatsApp şablonları onaylandı, gerçek doğrulama tamamlandı (2026-07-22):**
      Selen'in gerçek WhatsApp numarasıyla (hem "danışan" hem Selen rolünde, tek izinli test alıcısı
      olduğu için) gerçek bir Stripe test ödemesi tamamlandı: webhook cascade 200 döndü,
      `confirmationSentAt` gerçekten yazıldı (danışan onay şablonu gönderildi), cron sweep manuel
      tetiklenince `reminderSentAt` de yazıldı (hatırlatma şablonu gönderildi) — kod, gönderim
      başarısız olsa 500 dönecek şekilde tasarlı olduğu için 200 dönmesi + alanların yazılması
      gerçek başarılı gönderimin kanıtı (Selen'e giden 2 bildirim şablonu da aynı cascade'in parçası,
      aynı şekilde doğrulandı). Test verisi (Sheets satırları + Calendar etkinliği) temizlendi.
      **Yan bulgu:** cron sweep sırasında ilgisiz, gerçek bir Sheets veri-hijyeni sorunu bulundu —
      bkz. hata günlüğü BE-18 (kök nedeni araştırılmadı, kullanıcıya bildirildi, kasıtlı dokunulmadı).
      Phase 2 artık tamamen bitti; sıradaki adım Session 13.

## Gelecek Session — İptal Politikası + Kanal Takibi (2026-07-22, henüz Session 1-8 sırasına dahil DEĞİL)

Kullanıcının netleştirdiği tam kapsam, Session 5-8 bittikten sonra kendi bağımsız session'ında
(örn. "Session 9") ele alınacak. Şimdi sadece not ediliyor, build sırası bozulmayacak.

**İptal/iade politikası:**
- Randevuya **72 saat veya daha fazla** kala iptal → **%100 iade**.
- Randevuya **72 saatten az** kala (71 saat 59 dakika ve altı) iptal → **%50 kesinti** (yani %50 iade).
- Ödeme öncesi danışan bu politikayı okuduğunu onaylayan bir tik kutucuğunu işaretlemeden Stripe
  Checkout'a yönlendirilmeyecek. **Altyapı kısmen hazır:** `cancellationAck` alanı zaten
  `routes/booking.ts`'te doğrulanıyor (Session 4) ama şu an sadece "işaretli mi" kontrolü var —
  gerçek politika metni (frontend'de gösterilecek) ve asıl iade mantığı henüz yok.

**İptal akışı (danışan tarafından tetiklenir):**
- Web sitesinin ilgili sayfasından (Phase 3'te henüz tasarlanmadı) danışan iptali tetikler.
- İptal gerçekleştiğinde, randevu onayı akışıyla simetrik şekilde:
  1. Danışana WhatsApp bilgilendirme mesajı (booking confirmation'daki gibi).
  2. Selen'e (ileride Çiğdem'e) WhatsApp bilgilendirme mesajı (booking notification'daki gibi).
  3. Stripe üzerinden gerçek iade işlemi (%100 veya %50, yukarıdaki kurala göre).
  4. "Talk and Heal – Danışan Kayıtları" Sheet'indeki ilgili satıra şu **yeni sütunlar** işlenir:
     - İptal Saati
     - İptal Nedeni (opsiyonel, zorunlu değil)
     - Stripe İptal İşlem No
     - Stripe Kesinti Oranı (%0 / %50)
     - Stripe Kesinti Tutarı

**Kanal takibi (yeni Sheets sütunu: "Ulaşılan Kanal"):** danışanın Çiğdem'e (test aşamasında
Selen'e) ilk ulaştığı kanal loglanacak. Şimdilik 3 değer:
- **WhatsApp**
- **Web Sitesi** (Google/WhatsApp'tan geçmeden doğrudan siteyi ziyaret edip randevu alanlar)
- **E-posta**

**İlk temas kanalına göre otomatik bilgilendirme + iptal linki:**
- **WhatsApp:** ilk gelen mesaja verilen karşılama yanıtının (Session 5'te yazılacak) EN BAŞINA
  iptal politikası notu + randevu/iptal sayfası linki eklenecek.
- **E-posta:** ⚠️ kullanıcının açıklaması bu kanal için net değildi (danışana otomatik bir yanıt
  e-postası mı gidecek, yoksa Selen'e/Çiğdem'e WhatsApp ile "yeni e-posta teması geldi" bildirimi
  mi, yoksa ikisi de mi) — bu session'a başlamadan ÖNCE kullanıcıya tekrar sorulup netleştirilecek,
  varsayımla ilerlenmeyecek.
- **Instagram DM:** ileride (Instagram reklamları başlayınca) WhatsApp ile aynı desende eklenecek,
  şimdilik uygulanmayacak — sadece ileride genişletilebilir olacak şekilde akılda tutulacak.

## Phase 3 — Frontend (mevcut siteye entegre)

- [x] **Randevu sayfası (2026-07-22):** `booking.html` oluşturuldu — site tasarım sistemine
      (Jost fontu, sage/brand renkleri, `.field`/`.btn` desenleri, çift dilli `data-en`/`data-tr`)
      tam uyumlu. Tek sayfada: 1) seans türü seçimi (Standart 50dk £120 / Uzatılmış 80dk £150,
      kart-tarzı radyo butonlar), 2) `/availability`'den gerçek boş slotları çekip güne göre
      gruplayan saat seçici (ziyaretçinin kendi yerel saatiyle gösteriliyor, gönderilen değer UTC),
      3) 4 alanlı form (isim/e-posta/telefon+ülke kodu ipucu/sorun özeti, 450 karakter sayaçlı),
      4) gerçek 72 saat %100 / 72 saatten az %50 iade metniyle iptal politikası + onay checkbox'ı,
      5) submit → `/booking`'e POST → dönen Stripe Checkout `url`'ine yönlendirme. Site genelinde
      "Book a consultation" header CTA'sı da `iletisim.html`'den `booking.html`'e çekildi (6
      sayfa). `style.css`'e yeni sınıflar eklendi, cache-busting versiyonu v33→v34.
      **Gerçek uçtan uca test edildi (Playwright + gerçek `wrangler dev` + gerçek statik sunucu,
      `localhost:5173`↔`localhost:8787`, CORS dahil):** slot yükleme, seans türü değişince
      slotların yeniden yüklenmesi, form doldurma, İngilizce/Türkçe geçiş (tüm metinler doğru
      çevrildi), submit → gerçek bir Stripe Checkout oturumu (`cs_test_...`, doğru ürün adı ve
      £150 tutarıyla) oluşturulup tarayıcının oraya yönlendirildiği doğrulandı — konsolda hiç JS
      hatası yok. Mobil görünüm (390px, hamburger menü dahil) de kontrol edildi. Ekran görüntüleri
      `/tmp/booking-*.png`'de.
      **Not:** `API_BASE` şu an `http://localhost:8787` olarak sabit (TBD) — Session 8'de backend
      workers.dev'e deploy edilince gerçek URL'e güncellenecek.
- [ ] WhatsApp karşılama mesajındaki link bu randevu sayfasına işaret edecek (şu an
      `config.ts`'teki `BOOKING_PAGE_URL` de aynı TBD durumda, gerçek domain'e çıkınca ikisi
      birlikte güncellenecek)

## Randevu Sistemi Genişletmesi (2026-07-22, canlı test sırasında istendi)

Kapsamlı plan: `~/.claude/plans/delightful-dreaming-reddy.md` (fiyatlandırma matrisi, çoklu/haftalık
seans, kompakt takvim, İngiltere resmi tatilleri, iptal+iade). Session 8'in (deploy) önüne geçti —
deploy artık bu genişletme bitince yapılacak.

**Netleşen kurallar (kullanıcı onayı):** İptal politikası kademeleri (72/48/24 saat) gerçek
uygulanan kural (sadece metin değil), 24 saat altı sabit %50; çoklu seans iptali şimdilik sadece
toplu (3+ kalan seansta en yakın seansın ücreti kesilir, kalanı iade edilir); İngiltere resmi
tatilleri gov.uk'nin ücretsiz API'sinden otomatik çekilecek.

**Unutulmaması için not edilenler (şimdi yapılmıyor):** 10+ seans toplu alımlarda indirim; çoklu
paketten tek seans iptali (şimdilik sadece tüm paket iptali var).

- [x] **Session 9 — Fiyatlandırma matrisi + yeni rezervasyon alanları (2026-07-22, backend):**
      `config.ts`'teki düz `PRICING` yerine `sessionMode` (online/inPerson) × `therapyMode`
      (individual/couple) × `sessionType` (standard/extended) = 8 fiyatlık tam matris geldi (online
      bireysel £120/£150 [değişmedi], online çift £200/£250, yüzyüze bireysel £140/£175, yüzyüze
      çift £350/£425). `IN_PERSON_ADDRESS` TBD placeholder eklendi. `lib/policy.ts` (yeni) —
      rezervasyon anındaki "ilk seansa kaç saat kaldı"ya göre 72/48/24 kademesini hesaplayıp
      kaydeden `computePolicyTier`. `types.ts`: `SheetRow` artık `SHEET_COLUMNS`'tan otomatik türeyen
      bir `Record` (48 sütunu elle iki kere yazmamak için) — `BookingRequest` `therapyMode`/
      `sessionMode` kazandı. `SHEET_COLUMNS` ~11'den ~48 sütuna çıktı: yeni tekil alanlar
      (therapyMode, sessionMode, priceGBP, sessionCount, policyTier) + Session 10 için şimdiden
      ayrılmış 2-10. seans üçlü sütunları (sessionNStartUtc/ReminderDueUtc/ReminderSentAt × 9) +
      Session 13 için ayrılmış iptal sütunları (cancelledAt, cancellationReason, stripeRefundId,
      refundPercent, refundAmount). **Gerçek bulunan/düzeltilen hata:** `lib/sheets.ts`'teki sütun
      harfi hesaplama tek harfle sınırlıydı (`String.fromCharCode`), 48 sütun 'Z'yi geçtiği için
      kırılıyordu — çok-harfli (AA, AB, ...) doğru A1-stil dönüştürücü yazıldı. `routes/booking.ts`
      yeni alanları doğruluyor, doğru fiyatı buluyor, `policyTier`'ı hesaplayıp Stripe metadata'sına
      koyuyor. WhatsApp `{{3}}` Location alanı artık `sessionMode`'a göre online/yüzyüze metni
      arasında geçiş yapıyor — **yeni Meta şablonu gerekmedi**, mevcut onaylı(bekleyen) şablonun
      genel değişkeni yeniden kullanıldı. 51/51 test yeşil (yeni `pricing.spec.ts`,
      `policy.spec.ts` dahil), `tsc`/`prettier` temiz. **Gerçek `wrangler dev` ile doğrulandı:**
      yüzyüze+çift+uzatılmış seçimi gerçek bir Stripe Checkout oturumunda tam **£425.00** olarak
      ve doğru ürün adıyla (`Talk and Heal — inPerson couple extended session`) onaylandı.
- [x] **Session 10 — Çoklu/haftalık seans (2026-07-22, backend cascade + cron):**
      `types.ts`: `BookingRequest.slotStartUtc` → `slotStartUtcs: string[]` (1-10 giriş).
      `lib/calendar.ts`: `LOOKAHEAD_DAYS` 14 → 75 (10 haftalık görünürlük için).
      `routes/booking.ts`: dizi doğrulaması + **haftalık ardışıklık kuralı** (her hafta sadece bir
      seans, atlanan hafta yok — sunucu tarafında da doğrulanıyor, sadece frontend'e güvenmiyor),
      Stripe Checkout artık `quantity: sessionCount` ile tek kalemde toplam tutarı alıyor, metadata
      `slotStartUtcsJson` (tüm seansların ISO dizisi) taşıyor — `slotStartUtc`/`slotEndUtc`/
      `reminderDueUtc` tekil alanları kaldırıldı, webhook artık bunları `sessionType` +
      `clientTimeZone`'dan yeniden hesaplıyor (veri tekrarı yok). `routes/stripe-webhook.ts`:
      seans başına Calendar event (1. seans eski ID şemasıyla, 2-N `_sN` son ekiyle), Sheets
      satırına 1. seans eski sütunlara, 2-N `sessionNStartUtc/ReminderDueUtc` sütunlarına yazılıyor;
      Selen'e giden bildirimler çoklu seansta "(first of N weekly sessions)" etiketi alıyor (yeni
      şablon gerekmedi). `src/scheduled.ts`: sweep artık her satırda 10 olası seans sütununu ayrı
      ayrı kontrol ediyor, her biri bağımsız hatırlatma gönderip kendi sütununu işaretliyor.
      **Gerçek bulunan ve düzeltilen ciddi hata:** `lib/calendar.ts`'teki
      `eventIdForStripeSession`'ın base32 kodlama çıktısı 100 karakterde kesiliyordu; gerçek 3
      seanslık bir rezervasyonla test edilince (Playwright ile gerçek Stripe ödemesi tamamlanarak)
      Calendar'da sadece **1 event** oluştuğu görüldü — 2. ve 3. seansların `_s2`/`_s3` son ekli
      ID'leri, farklılaşan kısım kesilen kuyrukta kaldığı için AYNI ID'ye kısalıyor, ikinci
      event 409 alıp sessizce "zaten var" sayılıyordu. Kesme sınırı 100'den 300'e çıkarıldı
      (Google'ın 1024 sınırının çok altında), regresyon testi eklendi
      (`test/calendar.spec.ts`), sonra AYNI booking'i sıfırdan tekrar gerçek ödemeyle test ederek
      3 Calendar event'in de doğru oluştuğu doğrulandı, test verisi temizlendi. 60/60 test yeşil
      (yeni `calendar.spec.ts` + genişletilmiş `booking.spec.ts`/`scheduled.spec.ts` dahil),
      `tsc`/`prettier` temiz. **Not:** mevcut `booking.html` henüz bu yeni `slotStartUtcs` dizi
      şeklini göndermiyor (hâlâ eski tekil `slotStartUtc`) — Session 11'de güncellenecek, o ana
      kadar frontend/backend uyumsuz.
- [ ] Session 11 — Frontend: fiyat matrisi UI, kompakt çok-haftalık takvim, çoklu seçim, Translate
      butonu, dinamik iptal metni, mobil `API_BASE` düzeltmesi
      - [x] Kompakt çok-haftalık takvim (booking.html "2. Choose a time"): eski günlük
        başlık+grid yapısı yerine, günlük tek satır (tarih + satır-içi saat "chip"leri) ve
        haftalara göre gruplama, aralarında soluk gradient ayırıcı. Varsayılan 4 hafta gösterip
        "Show more weeks" butonuyla 10 haftaya kadar açılıyor (MAX_SESSION_COUNT ile aynı sınır,
        haftada bir seans mantığına uyumlu). style.css'te `.slot-btn`/`.slot-grid`/`.slot-day`
        kaldırılıp `.slot-week`/`.slot-day-row`/`.slot-chip` ile değiştirildi, cache-busting
        v34→v35. Playwright ile doğrulandı: başlangıçta 4 hafta/18 gün satırı render ediyor,
        "More"a tıklayınca 8 haftaya çıkıyor, slot seçimi ve seçili chip stili çalışıyor, console
        hatası yok. Session 11'in geri kalanı (fiyat matrisi UI, çoklu/haftalık seçim UX, Translate
        butonu, dinamik iptal metni, mobil `API_BASE` düzeltmesi ve `slotStartUtcs` dizi geçişi)
        hâlâ yapılmadı.
      - [x] Fiyat matrisi UI (Madde 1, 2026-07-22): "1. Session type" altına Bireysel/Çift ve
        Online/Yüz yüze pill-toggle eklendi, Standard/Extended fiyatları seçime göre canlı
        güncelleniyor (JS-side PRICING mirror, gerçek fiyat her zaman backend'de hesaplanıyor).
        Form gönderimi `therapyMode`/`sessionMode`/dizi `slotStartUtcs` gönderecek şekilde
        düzeltildi — önceden eksik olan bu alanlar backend'den 400 aldırıyordu, booking akışı
        kırıktı. Playwright ile uçtan uca doğrulandı (fiyat değişimi + gerçek Stripe Checkout
        yönlendirmesi). cache-busting v36→v37.
      - [x] Çoklu/haftalık seçim UX (Madde 2, 2026-07-22, Opus ile kodlandı): "1. Session type"
        altına "Book multiple sessions (recurring)" checkbox'ı + 3 bilgilendirme notu (çoklu seçim,
        1 haftadan fazla boşluk olamaz, 10+ için terapistle görüşün) eklendi. Checkbox kapalıyken
        eski tekli-seçim davranışı korunuyor; açıkken slot chip'leri checkbox gibi davranıyor,
        haftada-bir-seans kuralı client-side canlı uygulanıyor (aynı haftada yeni tıklama eskisinin
        yerine geçiyor), 1 haftadan fazla boşluk kuralı "Continue to payment"da kontrol ediliyor ve
        ihlalde tam istenen uyarı metni gösteriliyor, POST gönderilmiyor. Geçerliyse sıralı
        `slotStartUtcs` dizisi gönderiliyor. Hem agent'ın hem benim bağımsız Playwright testlerimle
        doğrulandı: boşluklu seçim (1. ve 3. hafta) engellendi/POST atılmadı, ardışık 3 hafta
        seçimi 200 döndü ve gerçek Stripe Checkout'a yönlendirdi, tekli modda 2. tıklama öncekini
        değiştiriyor (üst üste eklemiyor). cache-busting v37→v38. Backend'e dokunulmadı (Session 10
        zaten karşılıyordu).
      - [x] Slot saatleri düzeni + dil-bazlı saat dilimi görünümü (Madde 3 iyileştirmesi,
        2026-07-22, Opus ile kodlandı): iş saatleri artık Londra yerel saatiyle sabit 9,10,11,
        [12-13 öğle molası atlanır],14,15,16 (`config.ts` `BUSINESS_HOURS.lunchBreak`,
        `calendar.ts`'te öğle saatleri atlanıyor, `timezone.ts`'in `getLocalDateParts`'ı artık
        `hour` da döndürüyor). Extended (80dk) seansta 16:00 doğal olarak düşüyor (17:20 bitiş,
        endHour 17'yi aşıyor) — hata değil, beklenen davranış. Frontend'de tarih/saat etiketleri
        artık `undefined` (tarayıcı varsayılanı) yerine seçili dil bayrağına göre kilitli:
        İngilizce bayrak → Europe/London + en-GB, Türkçe bayrak → Europe/Istanbul + tr-TR. Bayrak
        değiştirildiğinde ekrandaki slotlar yeniden render ediliyor (`lastFetchedSlots` + mevcut
        seçim state'i korunarak). Hem agent hem benim bağımsız testlerimle doğrulandı: tam hafta içi
        günde Londra saatiyle tam olarak [9,10,11,14,15,16], hiçbir yerde 12/13 yok; aynı slot EN'de
        "Wed 22 Jul 15:00", TR'ye geçilince "22 Tem Çar 17:00" (bağımsız hesaplanan beklenen
        İstanbul saatiyle birebir eşleşti), seçili kalma durumu korunuyor, console hatası yok.
        60/60 test hâlâ yeşil, tsc temiz.
      - [x] Translate butonu düzeltmeleri (2026-07-22, Opus ile kodlandı): (1) Türkçe çoklu-seçim
        notunda "Choose a time" İngilizce kalmıştı → "Saat Seç" olarak düzeltildi. (2) MyMemory API
        (kalabalık-kaynaklı/crowd-sourced çeviri belleği) "Merhaba" için gerçek kullanıcı testinde
        iki kez "Ciao Mondo!" (İtalyanca) döndürdü — ilk seferinde eklenen dil-etiketi kontrolü
        (matches[0].target) yetersiz kaldı çünkü hatalı girdi muhtemelen yine "en" etiketiyle
        gelebiliyor (crowd-sourced veri kalite sorunu, etiket değil). Kalıcı çözüm: MyMemory
        tamamen kaldırılıp Google Translate'in anahtar gerektirmeyen `translate_a/single` (gtx)
        endpoint'ine geçildi — 6 gerçek çağrının 6'sında da "Merhaba"→"Hello" tutarlı sonuç verdi
        (hem EN hem TR bayrak durumunda), ters yönde ve çok cümlelik girdide de doğru/tutarlı.
        Ağ hatası/500 gibi durumlar hâlâ düzgün hata mesajına düşüyor, kutuda çöp metin kalmıyor.
        **Not:** `iletisim.html`'in Translate butonu hâlâ MyMemory kullanıyor — aynı gizli hatayı
        taşıyor olabilir, henüz dokunulmadı (kullanıcıya soruldu, onay bekleniyor).
      - [x] `iletisim.html` Translate motoru da Google Translate'e geçirildi (2026-07-22, Opus ile
        kodlandı) — booking.html ile birebir aynı düzeltme, bağımsız 3/3 "Merhaba"→"Hello" ile
        doğrulandı.
      - [x] Takvim tasarımı yenilendi — tek-haftalık kaydırmalı carousel (2026-07-22, Opus ile
        kodlandı): önce bir Artifact prototipiyle (tarihler üstte/saatler altta, ok+sürükle+nokta
        navigasyonu, sitenin gerçek buton gradyeni ve renk tonlarıyla, kullanıcıyla 3 revizyon
        turunda onaylandı — yeşil-gradyenli panel fonu, kontursuz mavi-yeşil gradyen slot dolgusu),
        sonra gerçek `booking.html`'e uygulandı. Eski "4 hafta + Show more" istiflemeli tasarım
        tamamen kaldırıldı; artık `#slotContainer` içinde tek hafta gösteriliyor (ok butonları,
        sürükleme/swipe, ok tuşları, nokta navigasyonu ile 10 haftaya kadar gezinilebiliyor).
        Tüm haftalar DOM'da aynı anda tutulup `translateX` ile kaydırılıyor — bu sayede tekli/çoklu
        seçim durumu (`selectedSlots`, `syncChipChecks`, `hasWeekGap`, dil bayrağına göre saat
        dilimi/yerelleştirme) hiç değişmeden haftalar arası gezinmede korunuyor. Yeni CSS token'ları
        `--slot-border-a`/`--slot-border-b` (açık/koyu tema) eklendi, cache-busting v38→v39. Hem
        agent hem benim bağımsız Playwright testlerimle doğrulandı: açık/koyu tema görsel olarak
        doğru, tekli modda 3. haftaya gidip geri dönünce seçim hâlâ işaretli, çoklu/haftalık modda
        3 ardışık hafta seçimi POST'ta doğru sıralı `slotStartUtcs` ile gerçek Stripe Checkout'a
        yönlendirdi, boşluklu seçim engellendi, dil değişince aynı hafta gösterilmeye devam edip
        etiketler yeniden yerelleşiyor, sürükleme/ok tuşu/nokta navigasyonu çalışıyor, fiyat/
        Translate/iptal onayı bozulmadı. 60/60 backend testi hâlâ yeşil, tsc temiz, sayfa hatası yok.
      - [x] Mobil `API_BASE` düzeltmesi + dinamik iptal politikası metni (2026-07-22, Opus ile
        kodlandı): `API_BASE` artık `window.location.hostname`'den türetiliyor (`localhost` veya
        LAN IP'de doğru çalışıyor; gerçek production origin'e geçiş hâlâ deploy adımının işi).
        `http.ts`'teki LAN IP zaten CORS listesindeydi, tekrar eklenmedi. İptal politikası kutusu
        artık seçilen ilk seansa kalan saate göre 3 kademe arasında dinamik değişiyor (72/48/24,
        `form-backend/src/lib/policy.ts`'teki `computePolicyTier` ile birebir aynı eşik ve hesap),
        varsayılan (seçim yokken) 72 saatlik metin. Bağımsız doğrulandı: varsayılan metin 72
        saatlik, en yakın (gerçek, <48 saat kalan) bir slot seçilince doğru şekilde 24 saatlik
        kademe metnine (EN+TR) geçiyor; tam rezervasyon akışı hâlâ gerçek Stripe Checkout'a
        ulaşıyor (localhost senaryosu bozulmadı). Bu düzeltmeyle Session 11 tamamen bitti —
        fiyat matrisi UI, kompakt/carousel takvim, çoklu-haftalık seçim, Translate (her iki
        sayfada da), mobil düzeltme, dinamik iptal metni hepsi tamam.
- [x] Session 12 — İngiltere resmi tatilleri (gov.uk API) (2026-07-22, Opus ile kodlandı): yeni
      `form-backend/src/lib/holidays.ts` gov.uk'nin ücretsiz `bank-holidays.json` API'sini çekiyor
      (sadece `england-and-wales`), 24 saat modül-içi önbellekli (google-auth.ts'teki token önbellek
      deseniyle aynı), hata durumunda güvenli tarafa düşüyor (boş liste döner, booking'i çökertmez,
      hata önbelleğe alınmıyor ki bir sonraki çağrı tekrar dener). `calendar.ts`'in slot üretim
      döngüsü artık tatil günlerini tamamen atlıyor (hem görüntüleme hem `booking.ts`'in yeniden-
      doğrulaması üzerinden gerçek rezervasyon engeli de otomatik sağlanıyor). `/availability`
      artık `{ slots, holidays: [{date, title}] }` döndürüyor. `booking.html`'de tatil günü artık
      hiç slot göstermeyip HER ZAMAN görünür (hover'a bağlı değil, mobilde de çalışır) bir etiket
      gösteriyor — orijinal istekte "imleç üstüne gelince" deniyordu ama plan bunu bilinçli olarak
      her-zaman-görünür yaptı çünkü mobilde hover yok. Yeni test dosyası `test/holidays.spec.ts`
      (4 test, mock'lu). 64/64 backend testi yeşil, tsc temiz. Gerçek gov.uk API'siyle canlı
      doğrulandı: 2026-08-31 "Summer bank holiday" gerçekten `holidays`'te, `slots`'ta yok. Frontend
      Playwright ile bağımsız doğrulandı (ilk denemede scope'suz seçici yanlış haftayı buldu, düzgün
      scope'lanınca doğrulandı): carousel'de 6 hafta ileri gidince "31 Ağu – 4 Eyl" haftasında 31'i
      0 slot + doğru etiketle, diğer günleri normal 6 slotla gösteriyor. cache-busting v39→v40.
- [x] Ek düzeltmeler (2026-07-22, Session 12 sonrası, Opus ile kodlandı + bağımsız doğrulandı):
      kullanıcı 4 yeni madde istedi, hepsi tamamlandı:
      1. **Aynı gün rezervasyon engeli + 18:00 kayması**: `calendar.ts`'e `earliestBookableDayOffset`
         eklendi — saat 18:00'den önce ziyaret edilirse en erken rezerve edilebilir gün yarın, 18:00
         ve sonrasında bir gün daha kayarak öbür gün oluyor (Europe/London saatine göre). Unit test
         (17:59 → yarın, 18:00 → öbür gün) + gerçek `wrangler dev` ile canlı doğrulandı (curl anında
         Londra saati 16:34 idi, ilk slot doğru şekilde yarına düştü).
      2. **Uzatılmış (80 dk) seans sonrası bir sonraki saat rezerve görünsün**: `/availability`
         artık `{ slots: [{iso, status, holidayTitle?}] }` döndürüyor (`status`: available/reserved/
         holiday). `getSlotStatuses` yeni fonksiyonu tüm aday saatleri (dolu/boş fark etmeden) real
         Calendar freebusy'ye göre etiketliyor. `booking.html` artık HER saat için bir chip
         gösteriyor — dolu olanlar tıklanamaz, soluk "reserved" görünümünde. Gerçek bir Stripe test
         ödemesiyle (uzatılmış + 2 seanslık tekrarlayan rezervasyon) uçtan uca doğrulandı: her iki
         seansın Calendar etkinliği 80 dk sürdü, bir sonraki saatlik slot (`/availability`
         sorgusunda) doğru şekilde `"status":"reserved"` olarak döndü.
      3. **Tüm slot değişiklikleri Google Takvim'e yansısın**: zaten Session 10'daki döngü (her
         seans için ayrı Calendar etkinliği) bunu sağlıyordu; bu turda uzatılmış+tekrarlayan gerçek
         bir rezervasyonla yeniden doğrulandı (2 gerçek Calendar etkinliği, her biri 80 dk, doğru
         haftalarda). Bu doğrulama sırasında **ilgisiz ama ciddi, gerçek bir üretim hatası** bulundu
         ve düzeltildi: `sheets.ts`'teki `appendBookingRow` tek seferde ~48 sütunluk satırı
         `values:append` ile yazıyordu; Google'ın "mevcut tabloyu bul, devam et" sezgiseli, sayfada
         çok daha önceki bir test'ten kalma "hayalet" veri (uzak sütunlarda, AM-AZ civarı) yüzünden
         yeni rezervasyonları TAMAMEN YANLIŞ sütunlara yazıyordu (gerçek bir booking AM:CH sütunlarına
         düştü, A:AV yerine). Kalıcı düzeltme: artık önce sadece `stripeSessionId` A sütununa tek
         başına append edilip (belirsizliğe yer bırakmayan tek-sütunlu aralık) satır numarası oradan
         okunuyor, sonra geri kalan sütunlar o satıra doğrudan `PUT` ediliyor — Google'ın sezgisel
         tablo-bulma mekanizmasına hiç bağımlı değil artık. Yeni `test/sheets.spec.ts` (3 test, hem
         tek-hücre hem çok-hücre `updatedRange` biçimlerini kapsıyor). Sheets'teki eski hayalet test
         satırları temizlendi.
      4. **Tatil günleri: slotlar görünsün ama "reserved" notuyla, Çiğdem Takvim'den açabilsin**:
         `calendar.ts`'teki statik tarih-engelleme kaldırıldı — artık tatil günleri sadece GERÇEK
         Google Takvim'deki tüm-gün "bloke" placeholder etkinlikleri üzerinden (freebusy ile)
         engelleniyor. 2026'nın kalan 3 resmi tatili (31 Ağustos, 25 Aralık, 28 Aralık — gov.uk
         API'sinden canlı çekildi) için bu placeholder etkinlikler gerçek takvime eklendi (idempotent
         script, tekrar çalıştırılabilir). Çiğdem isterse bu etkinliği Google Takvim'den silerek o
         günü tekrar rezervasyona açabilir — kod tarafında hiçbir değişiklik gerekmez, mevcut
         freebusy mekanizması otomatik halleder. `booking.html`'de tatil günü artık chip'leri
         GİZLEMİYOR — günün üstünde tek bir tatil-adı etiketi + altında o günün tüm saatleri "reserved"
         (soluk, tıklanamaz) chip olarak görünüyor. Playwright ile canlı doğrulandı: 31 Ağustos
         haftasına gidince "Summer bank holiday" etiketi + 6 reserved chip (0 gerçek input) + komşu
         günlerde normal 6 tıklanabilir chip.
      Tüm değişiklikler: 72 backend testi yeşil, tsc temiz, cache-busting v41.
- [x] Ek düzeltme (2026-07-22, aynı gün): kullanıcı canlı testte fark etti — uzatılmış (80 dk)
      seanslarda saat 16:00 slotu, "seans 17:00'den önce bitmeli" kısıtı yüzünden gösterilmiyordu
      (sadece 5 saat: 09,10,11,14,15). `candidateSlotStarts` artık sessionType almıyor — 6 sabit
      başlangıç saati (09,10,11,14,15,16) artık HER seans türü için aynı, seans süresi sadece
      gerçek Calendar/freebusy çakışma kontrolünde kullanılıyor (bitiş saatini aşsa bile). tsc temiz,
      72 test yeşil, canlı `/availability` ile hem standard hem extended için 6/6 saat doğrulandı.
      Ayrıca kullanıcının "iade politikası hep 72 saat gösteriyor" sorusu araştırıldı: kod zaten
      doğru çalışıyordu — "yarın" seçimi doğası gereği her zaman <48 saat kaldığından 24 saatlik
      metni gösteriyor; 48-71 saatlik metin ancak seçim 2-3 gün sonrasına denk geldiğinde görünür
      (bug değil, beklenen davranış — kullanıcıya açıklandı).
- [x] Madde 5 — Çiğdem'in kendi Google Takvim'inden manuel müsaitlik bloke etmesi (2026-07-22):
      plan dokümanındaki gibi zaten mevcut freebusy mekanizmasıyla ücretsiz sağlanıyordu, hiçbir kod
      değişikliği gerekmedi — sadece canlı doğrulandı. Gerçek Takvime "Çiğdem — kişisel randevu"
      test etkinliği eklendi (24 Temmuz 09:00-09:50): `/availability` o slotu anında `"reserved"`
      olarak işaretledi, `/booking` o slot için "artık müsait değil" hatasıyla reddetti, site
      arayüzünde o saat 1 adet tıklanamaz "reserved" chip olarak göründü (aynı günün diğer 5 saati
      normal tıklanabilir kaldı). Etkinlik silinince slot anında tekrar "available" oldu — bu, Madde
      4'teki tatil-günü-açma mekanizmasıyla birebir aynı alt yapı, ikisi de canlı doğrulanmış oldu.
      Test etkinliği temizlendi.
- [ ] Session 13 — İptal + iade akışı (2 yeni WhatsApp şablonu gerekiyor, en riskli dilim)

## Phase 4 — Uçtan uca test (Selen'in test hesaplarıyla)

**Ön koşul (2026-07-22):** Bu fazın WhatsApp'a bağlı maddeleri (onay/hatırlatma mesajları), Phase 2
Session 6/7'deki "GERİ DÖNÜLECEK" maddesindeki 4 şablonun Meta onayına bağlı — onay gelmeden bu
fazın tamamı bitirilemez.

- [ ] WhatsApp'a ilk mesaj → otomatik karşılama + randevu sayfası linki (serbest metin, ücretsiz)
- [ ] Slot seç → form doldur → Stripe test kartıyla öde
- [ ] Onay mesajı WhatsApp'tan danışana geldi mi kontrol et
- [ ] Selen'e yeni randevu bildirimi (WhatsApp + e-posta) ve "onay mesajı gönderildi" bildirimi geldi mi kontrol et
- [ ] Sheets'e satır düştü mü, "onay mesajı gönderildi" alanı doğru işlendi mi kontrol et
- [ ] Farklı ülke kodlu test numaralarıyla timezone tespitinin doğru çalıştığını doğrula
- [ ] Cron job'ı manuel tetikleyip gün-öncesi hatırlatma mesajının doğru saatte/formatta gittiğini,
      Sheets logunun ve Selen bildiriminin doğru işlendiğini doğrula
- [ ] 6. Aşama (Test/QA) betiğine yeni endpoint'ler için testler eklenir

## Phase 5 — GERÇEK HESABA GEÇİŞ (yayına almadan önce ZORUNLU)

- [ ] Çiğdem'in gerçek WhatsApp Business numarası + Meta Business hesabı
- [ ] Çiğdem'in kendi Google hesabı (Calendar + Drive/Sheets) — ya da onun adına kısıtlı
      paylaşılan bir klasör/hesap yapısı
- [ ] Stripe hesabı **live mode**'a alınır (Çiğdem'in banka bilgileriyle)
- [ ] **Resend (Selen'e e-posta bildirimi) hesabı Çiğdem'in kendi hesabına geçer** (2026-07-21
      karar) — e-posta gönderiminde `talkandheal.co.uk` alan adı doğrulaması, o alan adının
      DNS ayarlarını kontrol eden hesaba bağlı olduğu için Stripe'ın "canlı hesap = Çiğdem'in
      banka bilgisi" kuralıyla aynı mantık. Sadece API anahtarı değişir, kod aynı kalır.
- [ ] Yukarıdaki 4 madde tek tek Çiğdem'in bilgileriyle değiştirildi mi diye NOTES.md'deki
      checklist ile çapraz kontrol
- [ ] 10. Aşama (İzleme/Uptime Kuma) yeni Worker endpoint'lerini de izleyecek şekilde genişletilir
- [ ] Çiğdem'in kendi gerçek Sheet'inde de (BE-25, 2026-07-23) not/özet sütunlarına wrap-text
      (metin kaydırma) + tüm başlıklara filtre uygulanmalı — bu bir Sheet ayarı olduğu için Google
      hesabı değişince otomatik taşınmaz, aynı `batchUpdate` adımı yeni Sheet'te tekrarlanmalı.
- [ ] Çiğdem panele geçmeden önce `PANEL_PASSWORD` geçici test şifresinden Çiğdem'in kendi seçtiği
      (unutmayacağı) şifreye değiştirilmeli (bkz. `project_cigdem_panel_password_reminder.md`
      hafıza kaydı).

---

**Nereden başlıyoruz:** Phase 0 kararları tamamlandı (2026-07-21). Sırada **Phase 1** var: Meta
Business Manager (test) hesabı ve WhatsApp Business Platform numarası açılması — bu adımlar
kullanıcının kendi işlemi (kimlik/telefon doğrulama gerektirir, ben açamam), ardından Google Cloud
projesi + API etkinleştirme ile devam edilir.

---

## Kullanıcı isteği — Sheets başlık/veri tutarlılığı denetimi (2026-07-22, birebir metin)

> Önce 5'teki kalıntıyı hallet sonra yaptığın bu testte müşteriden alabileceğin nekadar parametre
> ayrıntısı varsa hepsini ekrana yaz, bunlar google sheet teki başlıklar olacak, sonra test
> aşamasındayken google sheet e eklediğin müşteri bilgilerinin bu başlılar altına doğru işlenip
> işlenmediğini kontrol et, doğru işlenmemişlerse müşteriden aldığın parametre ayrıntılarından
> oluşturduğun başlıkları google sheet te başlık olarak kullanıp doğru müşteri verisini doğru
> başlık altına ekle. bunun için tek döngülük bir test yapman yeterli. Unutma müşteriden
> alabileceğin tüm ayrıntılı değişken parametreleri ve başlık olarak uygun başlık diliyle kullan
> ve altına uygun veriyi işle. Çünkü şu adna google sheet e işlediğin veriler ile başlıkların
> bazıları tutarsız görünüyor. Bunu yaptıktan sonra bana haber ver kontrol edeyim, onayladıktan
> sonra bunu da gerekli yerlere kodlarsın. İlk ödeme stripe işlem no var ancak iade işlemi
> olduğunda oluşacak stripe işlem noı için bir sütun yok, yani bukadar ince ayrıntılı düşünmen
> gerekiyor, sadece test aşamasında olanlar değil ileride olabilecekler ile alakalı başlıkları da
> verisi olmasa dahi (5 seans alan birisinin 1., 2., 3., ... seans tarihleri vs.) uygun bir yere
> sütun başlığı olarak ekle. Sonrasında session 13'e geçebiliriz.

**Sıralama:** (1) satır 5'teki kalıntıyı çöz, (2) tüm olası müşteri parametrelerini ekrana yaz
(Sheet başlığı olacaklar), (3) tek bir test rezervasyonuyla mevcut verinin doğru başlık altına
işlenip işlenmediğini kontrol et, (4) tutarsızsa gerçek Sheet'in başlık satırını (ileride
kullanılacak ama şu an verisi olmayan sütunlar dahil, ör. iade Stripe işlem no'su, çoklu seans
1..10 tarihleri) düzelt, (5) kullanıcıya rapor et ve onay bekle, (6) onay sonrası ancak kod
(`config.ts`/`types.ts` vb.) güncellenir, (7) sonra Session 13'e geçilir.

**Sonuç (2026-07-22, aynı gün, tamamlandı):** Satır 1-15 (A:BZ) tamamen temizlendi, `config.ts`'in
gerçek 48 sütunluk `SHEET_COLUMNS` sırasıyla birebir eşleşen Türkçe başlık gerçek Sheet'e yazıldı
(tam liste + her sütunun `config.ts` anahtarı, kullanıcıya sohbette gösterildi). Ayrı bir temiz test
rezervasyonuyla (yüzyüze+çift+uzatılmış, £425) doğrulandı: 15 dolu sütunun hepsi doğru başlığın
altına düştü. **Kod değişikliği gerekmedi** — `config.ts`/`types.ts`'teki iç şema zaten eksiksizdi
(iade Stripe işlem no'su, 2-10. seans üçlüleri dahil hepsi zaten reserved'di), sorun sadece gerçek
Sheet'in görünen başlık metninin Session 9'daki şema büyümesinden beri hiç güncellenmemiş olmasıydı.
Detay: hata günlüğü BE-18 (çözüldü olarak güncellendi).

**Kullanıcı onayladı (2026-07-22) — kod tarafına da işlendi:** `form-backend/src/config.ts`'e
`SHEET_COLUMN_LABELS` (her `SHEET_COLUMNS` anahtarı için Türkçe başlık, `Record<...>` tipiyle
eksiksizlik derleme zamanında garanti) eklendi; `lib/sheets.ts`'teki `ensureHeaderRow` artık ham
İngilizce anahtarlar yerine bu Türkçe başlıkları yazıyor. Böylece Phase 5'te Çiğdem'in gerçek
hesabına yeni bir Sheet açılırsa header otomatik doğru gelir, bu düzeltmeyi tekrar manuel yapmaya
gerek kalmaz. `tsc`/`prettier`/72 test hepsi temiz. Kalıcı referans tablo (kod anahtarı → gerçek
Sheet başlığı, `config.ts`'teki sıra ile birebir):

| # | Kod anahtarı (`config.ts`) | Google Sheet başlığı |
|---|---|---|
| 1 | `stripeSessionId` | Stripe İşlem No (İlk Ödeme) |
| 2 | `name` | Ad Soyad |
| 3 | `email` | E-posta |
| 4 | `phone` | Telefon |
| 5 | `summary` | Sorun Özeti |
| 6 | `sessionType` | Seans Türü (Standart/Uzatılmış) |
| 7 | `therapyMode` | Terapi Türü (Bireysel/Çift) |
| 8 | `sessionMode` | Seans Şekli (Online/Yüz Yüze) |
| 9 | `priceGBP` | Toplam Ücret (GBP) |
| 10 | `sessionCount` | Toplam Seans Sayısı |
| 11 | `policyTier` | İptal Politikası Kademesi (72/48/24s) |
| 12 | `appointmentStartUtc` | 1. Seans Tarihi/Saati (UTC) |
| 13 | `clientTimeZone` | Danışan Saat Dilimi |
| 14 | `reminderDueUtc` | 1. Seans Hatırlatma Zamanı (UTC) |
| 15 | `confirmationSentAt` | Onay Mesajı Gönderildi (Zaman) |
| 16 | `reminderSentAt` | 1. Seans Hatırlatma Mesajı Gönderildi (Zaman) |
| 17-43 | `session2..10` × (`StartUtc`/`ReminderDueUtc`/`ReminderSentAt`) | "N. Seans Tarihi/Saati (UTC)" / "N. Seans Hatırlatma Zamanı (UTC)" / "N. Seans Hatırlatma Mesajı Gönderildi (Zaman)" (N=2..10) |
| 44 | `cancelledAt` | İptal Edilme Zamanı |
| 45 | `cancellationReason` | İptal Nedeni |
| 46 | `stripeRefundId` | Stripe İşlem No (İade) |
| 47 | `refundPercent` | İade Oranı (%) |
| 48 | `refundAmount` | İade Tutarı (GBP) |

Sonraki adım: Session 13.

**Session 13 başladı (2026-07-22):** Kullanıcıyla 2 açık nokta netleşti önce: (1) iade yüzdeleri
kesinleşti — 72→%100, 48→%50, 24→%50 (48'in ayrı bir yüzdesi yokmuş, 24 ile aynı çıktı); Sheets'te
booking anında zaten kayıtlı `policyTier` iptalde YENİDEN HESAPLANMADAN doğrudan okunacak. (2)
İptal linki danışana YENİ bir e-posta ile gidecek (mevcut onaylı WhatsApp şablonuna dokunulmayacak,
Meta'ya yeniden onay göndermek gerekmesin diye). 2 yeni WhatsApp şablonu (`iptal_onay_danisan`,
`iptal_bildirimi_selen`) taslak metinleri kullanıcıya verildi, Meta'ya bağımsız gönderilecek. Kodun
kendisi builder agent'a (opus) devredildi — `CANCEL_LINK_SECRET` + HMAC iptal linki, `routes/cancel.ts`
+ `cancel.html`, gerçek Stripe iade çağrısı, Calendar event silme, Sheets güncelleme, danışana yeni
onay e-postası, `test/cancel.spec.ts`. Bitince gerçek uçtan uca canlı doğrulama ayrıca yapılacak.

**Session 13 tamamlandı (2026-07-22) — bağımsız kod incelemesi + gerçek canlı test.** Builder
agent'ın kendi işaretlediği 2 karar noktası doğrulandı: (1) birim seans fiyatı — agent görev
metnindeki "priceGBP/sessionCount" formülünü BİLİNÇLİ OLARAK uygulamadı, çünkü `booking.ts`'i okuyup
`priceGBP`'nin zaten SEANS BAŞINA fiyat olduğunu (Stripe `unit_amount: priceGBP*100, quantity:
sessionCount`) tespit etti — kendi kodumu okuyarak bunu doğruladım, agent haklıydı, görevimdeki
formül yanlıştı. (2) `refundPercent` = kalan seansların değerine göre efektif yüzde (72/48/24
kademesinde temiz 100/50, 3+ kalan seansta blend) — mantıklı, onaylandı.

**Bağımsız incelemede/canlı testte bulunan ve düzeltilen 2 gerçek hata:**
1. Danışana giden yeni onay e-postası (`stripe-webhook.ts`), WhatsApp onayıyla aynı korumasız
   try/catch'teydi — Resend hesabı hâlâ sandbox modunda olduğu için (sadece Selen'in kendi
   e-postasına gönderebiliyor) gerçek bir danışan e-postasına gönderim başarısız olup tüm cascade'i
   çökertiyordu, bu da `confirmationSentAt` hiç yazılmadığı için Stripe her webhook'u tekrar
   denediğinde danışana WhatsApp onayının SONSUZA KADAR tekrar tekrar gitmesi demekti. E-posta
   gönderimi kendi try/catch'ine alındı (hata loglanır, cascade/guard etkilenmez).
2. **Canlı testte bulundu:** `routes/cancel.ts`'te iptal WhatsApp bildirimleri de aynı şekilde
   korumasızdı — gerçek bir iptal testinde (gerçek Stripe iadesi + gerçek Calendar silme + gerçek
   Sheets güncellemesi hepsi BAŞARIYLA tamamlandığı halde) sadece WhatsApp şablonları henüz Meta
   onaylı olmadığı için (beklenen 132001) kullanıcıya "iptal başarısız, bizimle iletişime geçin"
   diye YANLIŞ bir 500 hatası dönüyordu — para/takvim/kayıt tarafı zaten bitmiş olsa da. Aynı
   şekilde kendi try/catch'ine alındı, artık `cancelled:true` doğru dönüyor.

**Gerçek canlı doğrulama (2026-07-22):** Gerçek Sheet başlığı 49 sütuna güncellendi ("Seans Süresi"
sütunu `sessionType`'tan hemen sonra eklendi). Gerçek bir Stripe test rezervasyonu (tier=72,
online/bireysel/standart, £120) oluşturulup gerçek kartla ödendi — Sheets satırı 16/16 alanın
doğru sütuna düştüğünü doğruladı (`sessionDurationMinutes: "50 dk"` dahil). Gerçek HMAC iptal
token'ı üretilip `GET /cancel` (önizleme: £120/%100 doğru) ve `POST /cancel` çağrıldı: gerçek Stripe
refund oluştu (Stripe CLI ile bağımsız doğrulandı: `status: succeeded, amount: 12000, gbp`), gerçek
Calendar event iptal edildi (`status: cancelled`), Sheets doğru güncellendi, `/availability` slotu
tekrar `available` gösterdi. İkinci bir gerçek rezervasyon+iptalle (madde 2'deki fix sonrası)
`{"cancelled":true}` doğru dönüşü ve idempotency (`{"alreadyCancelled":true}` ikinci POST'ta, tekrar
refund yok) doğrulandı. 85/85 test yeşil, tsc/prettier temiz. Test verileri temizlendi.

**Henüz yapılmadı / kullanıcıya kalan:** 2 yeni WhatsApp şablonu (`iptal_onay_danisan`,
`iptal_bildirimi_selen`) hâlâ Meta onayı bekliyor (kullanıcıya metin+örnek değerler verildi, gönderim
kullanıcının işi).

**3+ kalan seans dalı da canlı test edildi (2026-07-22):** Gerçek 3 haftalık/3 seanslık bir
rezervasyon (standart/online/bireysel, £120/seans, toplam £360) oluşturulup gerçek kartla ödendi —
Sheets satırı `sessionCount=3` ve her 3 seansın tarihini doğru sütunlara (`appointmentStartUtc` +
`session2StartUtc` + `session3StartUtc`) yazdı. `GET /cancel` önizlemesi beklenen hesabı verdi: 3
kalan seansta en yakını (1.) feda, £240 iade, %67. Gerçek `POST /cancel` çağrıldı: gerçek Stripe
iadesi oluştu (Stripe CLI ile bağımsız doğrulandı: `status: succeeded, amount: 24000, gbp` = tam
£240), **3 seansın hepsinin** gerçek Calendar event'i `cancelled` durumuna geçti, Sheets doğru
güncellendi (`refundAmount: 240, refundPercent: 67, stripeRefundId` dolu, 3 seansın da
start/reminder sütunları temizlendi), `/availability` her 3 slotu da tekrar `available` gösterdi.
Test verisi temizlendi. **Booking sistemi backend'inin tüm iptal/iade dalları (tek seans tier
72/48/24 + çoklu seans 3+ forfeit-nearest) artık gerçek uçtan uca doğrulanmış durumda.**

**`cancel.html` gerçek tarayıcıda test edildi (2026-07-22, Meta onayını beklerken yapılan iş):**
Playwright ile gerçek bir rezervasyon + gerçek iptal linkiyle 5 durum kontrol edildi: (1) normal
önizleme (EN+TR, doğru randevu/iade metni), (2) gerçek "Cancel my booking" butonuna tıklayarak tam
akış (gerçek POST /cancel, gerçek Stripe iadesi tetiklendi), (3) sayfa yeniden yüklenince "zaten
iptal edilmiş" durumu doğru gösterildi, (4) geçersiz token için anlaşılır hata mesajı, (5) hiç
parametre olmadan direkt erişimde de aynı temiz hata mesajı (çökme yok). Tasarım sistemi (Jost,
sage/brand renkleri, header/footer) `booking.html` ile birebir tutarlı, hiçbir durumda konsol/sayfa
hatası yok. Ekran görüntüleri kullanıcıya gönderildi. Test verisi temizlendi.

**Resend domain doğrulaması — DNS kayıtları alındı (2026-07-22).** Alan adının DNS'i Çiğdem'in
kendisinde değil, siteyi kuran/host eden başka bir kişide. O kişiden istenecek 3 DNS kaydı gerçek
Resend API'siyle üretilip bir Artifact olarak yayınlandı (link kullanıcıda) — Çiğdem'e iletilip
oradan hosting kişisine geçecek. Teknik detay: geçici bir "Full access" Resend API anahtarıyla
`talkandheal.co.uk` Resend'e domain olarak eklendi (`POST /domains`), dönen 3 kayıt (1 TXT DKIM
`resend._domainkey`, 1 MX `send`→`feedback-smtp.us-east-1.amazonses.com` öncelik 10, 1 TXT SPF
`send`→`v=spf1 include:amazonses.com ~all`) alındı, geçici anahtar hem `.dev.vars`'tan hem Resend
panelinden silindi/silinecek. **Bekleniyor:** hosting kişisi kayıtları eklesin, DNS yayılınca
Resend tarafında doğrulama durumu kontrol edilecek (`GET /domains/{id}`, `status: verified`
bekleniyor).

---

## Kullanıcı isteği — Hosting kişisinden istenecek bilgiler listesi (2026-07-22, birebir metin)

> ozaman bu aşamada ya da bu aşamadan sonra istememiz gereken bilgileri alternatifleri(basit
> FTP/cPanel mi, WordPress mi, Netlify/Vercel/GitHub Pages gibi bir şeyler olması olasılığına karşı
> hangisi ise onun sonraki adımları için gerekecek tüm detayları) ile birlikte istemek için bir
> istek listesi oluştur ve hafızaya al. Hangisini nezaman istememiz gerektiğini de istek listesinde
> belirt. Sen bana gerektiğinde bu listeyi bana, ben çiğdem'e o da talk and hela sitesini yöneten
> kişiye gönderecek ve istediğimiz bilgilere ulaşacağız.

**Bağlam:** Frontend'in (booking.html, cancel.html, güncellenmiş index.html vb.) gerçek
`talkandheal.co.uk` sitesine yüklenmesi, sitenin NASIL host edildiğine göre tamamen farklı adımlar
gerektiriyor (basit FTP/cPanel / WordPress / Netlify-Vercel-GitHub Pages gibi statik host /
başka bir şey) — bu henüz bilinmiyor. İstenen: tek seferde, hangi cevap gelirse gelsin bir daha
geri dönüp soru sormaya gerek kalmayacak kapsamlı bir talep listesi + her bilginin NE ZAMAN
istenmesi gerektiği (şimdi keşif amaçlı mı, yoksa deploy anına kadar beklenmeli mi).

## Kullanıcı isteği — Oturum kapanışı (2026-07-23, birebir metin)

compact bittikten sonra,
1- Hata günlüğünü güncelle
2- Clear yap
3- Oturumu kapat
4- Bilgisayarı kapat

(Not: 1. madde kontrol edildi, hata günlüğü zaten güncel — BE-18/19/20 işlenmiş, .md/.docx eşleşiyor.
2-4. maddeler kullanıcının kendisinin yapacağı işlemler; asistan tarafından çalıştırılamaz/çalıştırılmamalı.)

## Kullanıcı isteği — Çoklu-cihaz test sonrası 12 maddelik düzeltme listesi (2026-07-23, birebir metin)

> süper şimdi düzeltmemiz gereken bazı şeyler var, madde madde yazacağım her maddeyi sen
> düzelttikten sonra bana linkten kontrol et diyeceksin, ben kontrol edip onaylayacağım sen gerekli
> verileri hata günlüğünde ilgili dosyaya işleyeceksin ve bir sonraki adıma geçeceğiz:
> 1- Danışan randevu sayfasında telefon numarasını girerken telefonunun başına ülke kodunu doğru
> girmesi için 'örneğin 90537........ şeklinde x haneli olarak girin' gibi bir uyarı alsın ki
> whatsapp bilgilendirmelerinde aksaklık yaşanmasın,
> 2- Translate yine çalışmadı, ingilizce sayfadaykn What would you like to talk about? kutusuna
> türkçe bir metin yazıp Translate butonuna bastığımda kutudaki metin aynen türkçe olarak kaldı. Bu
> konuya artık kalıcı bir çözüm bulana kadar gerekirse agantic loop mantığıyla çalış,
> 3- Çokmlu seçim yaptığımda ilk seansa 72 saatten fazla zaman olduğu için İptal politikası uyarısı
> mantıklı olarak 72 saat kademesi üzerinden görüntülendi, ancak aklıma şöyle birşey takıldı: Örneğin;
> kişi çoklu seçiminin 2. veya daha sonraki herhangi bir seansından 49 saat-47 saat veya 25 saat-23
> saat veya 13 saat-11 saat önce iptal etmek istediğinde bu Çiğdem taş'ın bu saat dilimleri için
> uyarlamış olduğu iptal politikalarını nasıl işletecek, bunu birlikte düşünüp algoritma mantığını
> birlikte oturtalım, çünkü kişi iptal politikasında en başta sadece 72 saat kademsi ile alakalı
> bilgilendirildi ama sonraki seanslarında diğer kademelere denk düşecek şekilde iptal yaptı ama
> hiçbir kesinti olamdan parasını iade aldı, bu durumda Çiğdem Taş zarar etmiş olacak,
> 4- Danışanın What would you like to talk about? bölümüne yazdığı not hem Çiğdem Taş(şu anda
> bana)'a hem de Gooogle Sheet e olduğu gibi giti, adı üstünde biz Summary yani özet istiyoruz,
> 5- Çoklu seçimlerde hem Çiğdem Taş'a hem danışana ilk seansın saat ve tarihi ayrıntılı gitmiş,
> parantez içinde de ( X seansın ilki) yazılmış. Eğer diğer seanslar için seans tarihinden bir gün
> önce hatırlatma mesajtları whatsapp'tan sorunsuz bir şekilde gidecekse no problem, ancak herhangi
> bir aksaklığa karşı ilk seansın bitiminden sonra önlem olarak Çiğdem Taş bir kontrol panelinden O
> danışan ile alakalı izlenimler, gelişmeler, vs. ile ilgili not tutabileceği ve sonunda tıkladığında
> sadece danışana bir sonraki randevu tarihinin otomatik olarak gitmesini tetikleyen bir buton olsun.
> Bu butone tıklandığında hem Çiğdem Taş'ın danışan ile alakalı aldığı notlar Google Sheet te veya
> senin önereceğin tamamen ücretsiz ve grafik arayüzü çok basit ve anlaşılır oaln bir uygulamaya(varsa
> google sheet in böyle bir özelliği yine orda olması dağınık çalışmayı önler) hastanın kişsel ve
> iletişim bilgileriyle push edilecek-eklenecek ve aynı zamanda danışana bir sonraki seans bilgileri
> gönderilmiş olacak,
> 6- Danışan slot seçimi yaparken düzenli seans mantığını işletmek için bu hafta seçim yaptığı gün ve
> saat ne ise haftaya da o gün ve saatteki slotu seçebilsin, bununla ilgili uyarıyı da ilgili
> yere(uygunsa üstteki tikli kutunun altındaki yere9 ekle,
> 7- Çoklu seçim yapan danışanlardan örneğin 2'şer, 3'er, veya X'er seçim yapanlar Google Sheet te
> 2'şer seçim yapanlar bir yerde, 3'er seçim yapanlar bir yerde, X'er seçim yapanlar bir yerde
> toplanacak şekilde bir düzen oluşturabilir miyiz! Bu karışıklık yaratırsa kişi seçimini yapıp
> ödemeyi tamamladıktan sonra standart olarak Google Sheet2te en alt satıra herzamanki gibi eklensin,
> ama Toplam Seans Sayısı sütunu altında 1'den fazla bir seans sayısı görüldüğünde Google Sheet'in
> alttaki sayfa sekmelerinde 2 seans alanlar için açılan 2 Seans başlıklı sayfaya, X Seans alanlar
> için açılan X Seans başlıklı sayfaya da bütün bilgileri tekrar işlensin, yani hem google Sheet
> teki Sayfa 1 sayfasında hem seans sayısına göre toplandığı diğer sayfada aynı veriler eş zamanlı
> olarak toplansın. Hatta bu maddeye geldiğimizde test edip birlikte ilerleyelim.
> 8- Testleri yaparken bayraklara tıkladığımda her iki sayfada da sadece Türkçe içerik göründü,
> 9- About bağımsız sayfasında ingilizce seçenekli sayfayı açtığımda sol üstte ingilizce ABOUT
> CIGDEM yazması gerekirken ABOUT ÇIĞDEM yazıyor , yani yanrı ingilizce yarı türkçe ÇIĞDEM yazıyor,
> 10- More butonlarının grafiği oldukça iyi ancak Book a consultation, Send a message ve Continue to
> paymet butonlarının grafik tasarımında şöyle bir sorun var, çerçevelerin konturlarının bazı
> yerlerinde beyaz çizgiler görünüyor, oldukça amatör bir görüntü. Bu botonların tümünü(more
> butonları da dahil) altları hafif gölgeli yap ve More hariç diğer butonlarda bahsettiğim beyaz
> çizgileri kaldır,
> 11- Used to detect your local time zone for reminders — please include the country code. uyarısı
> ile What would you like to talk about? arasına biraz satır boşluğu ver, What would you like to
> talk about? başlığı Used to detect your local time zone for reminders — please include the
> country code. uyarısının devamı gibi görünüyor,
> 12- Bireysel Terapi / Kaygı, depresyon, travma, kimlik ve hayat geçişleri için birebir seanslar. /
> Çift Danışmanlığı / Eşlerin birbirini yeniden duyabileceği, yapılandırılmış bir alan. / Yaşam
> Koçluğu / Kariyer, özgüven ve yaşam yönü için hedef odaklı çalışma. / Klinik Süpervizyon / Aktif
> olarak çalışan terapist ve danışmanlar için süpervizyon. / Kurumsal Programlar / Ekipler ve
> kurumlar için tasarlanmış iyi oluş ve ruh sağlığı desteği., Varoluşçu-Fenomenolojik / Bir tanı
> veya teknikten değil, senin gerçek, yaşanmış deneyiminden yola çıkar — bir zorluğu kendi hayatının
> bağlamında anlamlandırır. / CBT / Bir zorluğu sürdüren düşünce ve davranış kalıplarıyla doğrudan
> çalışır; seanslar arasında kullanabileceğin pratik araçlar sunar. / ACT / Zor düşünce ve
> duyguların hayatı yönetmesini engelleyecek psikolojik esneklik kurar; senin için önemli olana
> yönelmeni sağlar., Kaygının sana asıl anlatmaya çalıştığı şey / Kaygı nadiren sorunun kendisidir —
> genelde henüz adlandırılmamış bir şeye işaret eder. / Tam olarak "ev" diyemediğin bir yeri yaslamak
> / Londra ile İstanbul arasında yaşamak, nadiren doğrudan adlandırılan, sessiz ve kendine özgü bir
> yasla gelir. / İlk seans gerçekte nasıl geçer / Divan yok, önceden doldurulacak formlar yok —
> sadece eşleşmenin doğru hissedip hissetmediğini görmek için bir sohbet., iletişim bölümündeki Ad
> Soyad E-posta Mesaj Seanslar / İngiltere'de yüz yüze veya dünya genelinde çevrimiçi. / Diller /
> Seanslar İngilizce ve Türkçe olarak sunulur. / E-posta / help@talkandheal.co.uk / WhatsApp'tan Yaz,
> Randevu al bölümündeki 1. Seans Türü / Bireysel / Çift / Online / Yüz Yüze / Standart Seans / 50
> dakika / £120 / Uzatılmış Seans / 80 dakika / £150 / Birden çok seans al (tekrarlayan) / 2. Saat
> Seç 3. Bilgilerin / Ad Soyad / E-posta / Telefon (ülke koduyla) / +44 7911 123456 / Hatırlatmalar
> için yerel saat dilimini tespit etmede kullanılır — lütfen ülke kodunu ekle. / Ne hakkında konuşmak
> istersin?, 4. İptal Politikası / Randevundan 72 saat veya daha önce yapılan iptallerde ücretin
> tamamı iade edilir. Randevuna 72 saatten daha az bir süre kala yapılan iptallerde ücretin %50'si
> iade edilir. / İptal veya değişiklik için WhatsApp'tan yaz ya da help@talkandheal.co.uk adresine
> e-posta at. / Yukarıdaki iptal politikasını okudum ve kabul ediyorum. ve tüm bölümlerde yanlış
> seçimle ilerlendiğinde beliren veya bir kutu tik edildiğinde beliren uyarı yazılarının tümünün
> font weight'lerini 100'er birim ve 200'er birim arttırarak 2 link, bütün bu yazıların font
> weightleri sabit-mevcut haliye kalarak yerine yazı boyutunu - örneğin 9 birim ise 10, 10 birim ise
> 11, x birim ise x+1 birim- artırarak link paylaş bu 3 linki kıyaslayıp ona göre karar vereceğim.
>
> Unutma her bir adım tamamlandığında linkten kontrol > onay > hata günlüğü güncellemesi > bir
> sonraki adım akışını uygulayacağız. Hatta öncesinde compact ihtiyacın varsa söyle, ponytail
> istemiyorum, kodlamada hata yapmak istemniyorsan opus u kullan kalanını sonnet ye devret, burası
> senin kararın, compact a ihtiyaç duyduğunda söyle, telefonda remote kontrolde olacağım otomatik
> modda devam et, istediğin bütün izinlere şimdiden onay veriyorum, böyle bir talimatla bütün
> izinleri almış sayılmam şu modu açarsan bütün izinleri alarak çalışabilirim dersen söyle o modu /
> ile nasıl çalıştıracaksam öyle başlayalım.

**Akış kuralı (kullanıcı belirledi):** Her madde için: düzelt → linkten kontrol ettir → kullanıcı
onaylar → hata günlüğüne (`talk-and-heal-hata-gunlugu/04-Frontend/04-frontend.md` veya
`05-Backend-Entegrasyon/05-backend-entegrasyon.md`, hangisi ilgiliyse) işle → sıradaki maddeye geç.
Sıra yukarıdaki numaralandırmayla birebir (1→12). Madde 3 (iptal politikası kademe algoritması) ve
madde 5 (kontrol paneli + not sistemi) ayrıca kullanıcıyla birlikte tasarlanacak, doğrudan koda
geçilmeyecek. Madde 7'de test birlikte yapılacak.

## İlerleme Durumu (2026-07-23, compact/clear öncesi kayıt — kaldığımız yer)

- [x] **Madde 1 (telefon ülke kodu uyarısı):** Tamam, onaylandı, hata günlüğüne işlendi (FE-03,
      `04-frontend.md`). 13. madde (backend normalizasyonu) ayrı not olarak bırakıldı, aşağıda.
- [x] **Madde 2 (Translate butonu):** Tamam, onaylandı, hata günlüğüne işlendi (FE-04,
      `04-frontend.md`). Kök neden CORS'tu (Google'ın gtx endpoint'i tarayıcıdan çağrılamıyor),
      çözüm: `form-backend`'e yeni `GET /translate` proxy route'u (`src/routes/translate.ts`) —
      hem `booking.html` hem `iletisim.html` artık bu proxy'yi kullanıyor.
- [x] **Madde 3 (iptal politikası kademe algoritması):** Tamam, onaylandı, hata günlüğüne işlendi
      (BE-21, `05-backend-entegrasyon.md`). `lib/refund.ts` artık `policyTier`'ı Sheets'ten okumak
      yerine iptal ANINDA kalan seansların en yakınına göre yeniden hesaplıyor (`computePolicyTier`
      tekrar çağrılıyor); 3+ kalan seans için eski sabit kural kaldırıldı, tek formül (72→%100,
      48/24→%50) her durumda uygulanıyor. `booking.html`'deki 3-kademeli dinamik metin de tek,
      sade bir metne indirildi (madde 3 sırasında kullanıcı ayrıca dili resmileştirmemi istedi —
      bkz. `feedback_uyari_metni_resmiyet.md` hafıza kaydı, bundan sonraki TÜM yeni metinler için
      geçerli). 88/88 test yeşil.
- [x] **Madde 4 (Sorun Özeti gerçek özet olsun):** Tamam, onaylandı, hata günlüğüne işlendi (BE-22,
      `05-backend-entegrasyon.md`). Cloudflare Workers AI eklendi (`ai` binding, `wrangler.jsonc`),
      `lib/summarize.ts` (`summarizeNote`, model `@cf/meta/llama-3.1-8b-instruct-fp8`) danışanın
      ham notunu gerçek 1 cümlelik özete çeviriyor, hem Sheets'e hem Çiğdem'e giden WhatsApp/
      e-postaya bu özet gidiyor (ham metin değil). AI hatası olursa ham metne düşüyor (booking'i
      asla engellemiyor). Test paketi için `ai` binding'i OLMAYAN ayrı bir `wrangler.test.jsonc`
      oluşturuldu (`vitest.config.mts` ona yönlendirildi), `env.AI` testlerde stub'lanıyor — gerçek
      `wrangler dev`'de AI binding'i çalıştırmak `npx wrangler login` gerektirdi (kullanıcı yaptı,
      `engintass19@gmail.com`), ek olarak hesapta bir workers.dev subdomain'i (`engintass19-358.
      workers.dev`) zaten kayıtlıymış. Gerçek kullanıcı testiyle (astrofizik hakkında uzun bir
      paragraf) doğrulandı: gerçek, doğru bir tek-cümlelik özet üretildi (kırpma değil).
- [ ] **Madde 5 (kontrol paneli + not sistemi) — TASARIM AŞAMASINDA, henüz koda geçilmedi.** Önerilen
      tasarım kullanıcıya sunuldu, kullanıcının cevaplaması gereken AÇIK SORU: Çiğdem panele HER
      danışan için ayrı bir link (rezervasyon bildirimine eklenen HMAC-imzalı link, `cancel.html`
      ile aynı desen) üzerinden mi erişecek, yoksa TÜM danışanları listeleyen tek bir genel/parola
      korumalı panel sayfası mı istiyor? Önerilen tasarımın geri kalanı: not → aynı Google Sheet'e
      yeni bir sütuna zaman damgalı eklenir (ayrı bir uygulama YOK, dağınıklığı önlemek için);
      "Sonraki seansı bildir" butonu → o an için WhatsApp hatırlatma şablonunu hemen gönderir +
      Sheets'teki ilgili `reminderSentAt` hücresini işaretler (cron'un aynısını tekrar göndermemesi
      için). Bu, otomatik gün-öncesi hatırlatmaların YERİNE değil, YEDEĞİ olarak tasarlandı.

      **Madde 5 devamı — kullanıcının detaylandırması (2026-07-23, birebir metin):**

      > ve çoklu seansa ait her seans sonrası Çiğdem danışan hakkında bu ortamda not alsın ya da
      > almasın(yani not yerini boş bırakmak da isteyebilir) belirttiğim butona bastığında hem
      > google sheet e (boş bıraktığında 'Bu seansta not alınmadı.' notu yazsın) gerekli not
      > iletilsin hem de danışana bir sonraki randevu bilgisi whatsapp tan ulaşsın, bu sondan bir
      > önceki seansa kadar bu şekilde devam etsin. En son seanstan sonr Çiğdem Taş hasta notu alıp
      > (almayıp butona basmayı unutsa dahi, bu durumda yine 'Bu seansta not alınmadı.' notu yazsın)
      > butona tıkladığında sadece not iletilsin(veya not alıp butona basmayı unutsa bile  o günün
      > sonunda Çiğdem in bulunduğu yerdeki yerel saate göre 23:59'da otomatik olarak gerekli yere
      > not yazıldığı kutuda otomatik olarak algılanarak iletilsin.). Atladığım başka bir senaryo
      > varsa sen de katkıda bulun.

      **Ek netleştirme (2026-07-23, birebir metin):**

      > Ek-Son seanstan sonraki çiğdem in not alması ya da almamasına bağlı olmaksızın Çiğdem için
      > google Sheet ya da önereceğin platforma gerekli not iletilirken danışana herhangi bir not
      > iletilmesin.

      (Yani: not alanı tamamen Çiğdem'e özel/dahili — danışana hiçbir koşulda notun içeriği ya da
      "not alınmadı" metni gitmez, sadece Sheets/panel tarafına yazılır. Danışana giden şey varsa
      sadece "sonraki randevu bilgisi" mesajıdır, not değil.)

      **Bu detaydan çıkan, henüz netleşmemiş noktalar (asistanın tespiti, kullanıcıya soruldu):**
      1. Not için Sheets'te sütun şeması: her seans için ayrı sütun (N. Seans Notu, N=1..10) mu,
         yoksa tek biriktirilen sütun mu?
      2. Ara seanslarda (son hariç) buton hiç tıklanmazsa not tarafı için de son-seanstaki gibi
         23:59 fallback uygulanacak mı, yoksa sadece son seansa mı özel?
      3. Ara seanslarda buton unutulursa "sonraki randevu" WhatsApp'ı için ayrıca fallback gerekir
         mi, yoksa zaten bağımsız çalışan otomatik gün-öncesi cron hatırlatması (Session 7) yeterli
         yedek sayılır mı?
      4. "Günün sonu" = seansın kendi takvim günü mü?
      5. Çiğdem'in "yerel saati" sabit Europe/London mu, yoksa ayarlanabilir mi?
      6. Panel erişim şekli (kişiye özel link / tek genel parola korumalı sayfa) henüz cevaplanmadı
         — bu, notun hangi danışan/seansa ait olduğunun nasıl belirleneceğini de etkiliyor.
      7. Bu not/panel sistemi sadece çoklu (2+) seanslarda mı, tekli rezervasyonlarda da var mı?
      8. İptal edilen bir paketin kalan seans not/bildirim döngüsü ne olur (muhtemelen zaten
         Calendar'dan silindiği için hiç tetiklenmez, teyit gerekiyor)?

      **Panel erişimi sorusuna kullanıcının cevabı + UI detaylandırması (2026-07-23, birebir metin):**

      > Bu panelde klavyeye ilaveten bir mikrofo ikonuyla çalışan ve tamamne ücretsi sesli not alma
      > özelliği de olsun ve kullanıcı konuşurken yazı ekranda aynı anda yazılıyor olsun ki hatalı
      > yazımı durdurum devam edebilsin ve hatta imleci nereye tıklarsa mikrofon ile konuşmaya devam
      > ettiğinde konuşulan kelime-metin oraya eklensin. Bunun için gerçekten Gemini gibi iyi
      > çalışan bir mikrofon olması önemli, ama dediğim gibi kullanıcı konuşurken konuşulan
      > metnin-kelimenin görünür bir şekilde aynı anda ekranda görünmesi önemli. Gelelim senin
      > soruna, danışanların hepsi bu platformun içinde Yazı yazılabilir metin kutusu-çerçevesi
      > özelliğiyle ayarlanabilsin, yani bu metin kutusunu Çiğdem tıkladığında örneğin; danışanın
      > ismini karşısında sorarak öğrendi ya da danışan daha önceden randevu alırken isim bilgisi
      > verdiği için bu danışana ait mevcut randevu zamanında bu paneli kullandığı iin bu metin
      > kutusunun içinde otomatik olarak-varssayılan isim olarak zaten görünsün ama danışanın
      > randevu alırken asıl simi yerine nick name yazma olasılığına karşı da bu varsayıla isim
      > metin kutusunda görünürken bu kutunun içine yazı yazılabilir özelliğinden dolayıo Çiğdem
      > tarafından düzenlenebilmesi gerekir, Ayrıca bu metin kutusunun yanında bir ok tuşu olsun ve
      > çiğdem danışan gittikten sonra bile bu oka bastığında danışanların isimlerinin bulunduğu
      > alfabetik bir isim listesi ve listenin başında isimleri aramak için arama motoru ve bir
      > scroll bar da olsun. ve çiğdem buradan istediği ismi seçtiğinde o kişi ile alakalı yeni bir
      > not ve eski notu düzenle, eski nota ek yap diyerek eski eski not listelerini görüntüleyip
      > istediği eski notun danışan ile alakalı not alma paneline yapışmasını sağlasın, bu panelin
      > altında 3 adet buton olsun, bu botonlar1- Eski nota ekle,2- Eski not ile değiştir ve 3- Ekle
      > butonları olsun. Ekle butonu hem danışana gidecek bir sonraki whatsapp bildirim mesajını(bu
      > son seansa ait not ise danışana bir mesaj gitmeyecek) hem de danışana ait Çiğdem tarafından
      > düzenlenen  notun google sheet e gitmesini tetikleyecek. Diğer 2 buton sadecce üzerine
      > düşen işi yapmak üzere google sheet e notu iletecek. Bu 3 butondan 1. si ve 2. ilk
      > tıklandıklarında küçük bir pencere açılarak bu not gooogle sheet e gönderilecek devam etmek
      > istiyor musun? sorusuna evet/hayır sorularından birine tıklandığına tetiklenerek google
      > sheet e not eklenecek ya da değiştirilecek, bunlarda 3.sü ilk tıklandığında küçük bir
      > pencere açılarak 'bu not google sheet egönderilecek ve danışan bir sonraki randevu(bu son
      > seans ise sadece ' bu not google sheet e gönderilecek' uyarısı görüntülenecek) için
      > bilgilendirilecek devam etmek istiyor musun? sorusuna evet/hayır sorularından birine
      > tıklandığına tetiklenerek google sheet e not gönderilecek ve eğer son seans değilse
      > danışana da bir sonraki seans bilgilendirmesi gidecek eğer son seans ise sadece Çiğdem in
      > danışan hakkında aldığı not google sheet e devam edecek. Bunu da gerekli yere kaybetmeden
      > kaydederek bu mantık algoritmasını incele ve bana fikrini söyle, eklemek istediğin
      > kaçırdığım başka bir ihtimal varsa öner.

      **Bu detaydan çıkan ek açık noktalar (asistanın tespiti):**
      9. Kullanıcının tarifi (danışan gittikten sonra bile TÜM danışanları arayabilme) fiilen tek
         genel panel modeline işaret ediyor — kişiye özel link modeliyle çelişiyor (bir linkte tüm
         danışan listesi olması, o linkin zaten genel panelle eşdeğer yetki taşıdığı anlamına gelir).
         Teyit gerekiyor.
      10. 3 buton hangi bağlamda görünür: her zaman birlikte mi, yoksa "Ekle" sadece o an kapatılan
          güncel seansta, "Eski nota ekle"/"Eski not ile değiştir" sadece ok/arama ile geçmiş bir
          danışan seçildiğinde mi?
      11. "Ekle" bir seansta sadece BİR KEZ mi kullanılabilir (guard) yoksa tekrar tıklanırsa
          WhatsApp bildirimi tekrar mı gider? Mevcut koddaki `confirmationSentAt`/`reminderSentAt`
          guard deseniyle aynı mantık burada da gerekiyor gibi görünüyor.
      12. Sesli not: "tamamen ücretsiz" + "Gemini kalitesinde" ikisi birlikte gerçekçi değil —
          tarayıcı-native Web Speech API ücretsiz ve gerçek-zamanlı ama Gemini kalitesinde değil,
          en iyi Chrome'da çalışır. Onay gerekiyor.

      **Kullanıcının cevapları (2026-07-23):**
      1. Ok tuşuyla her danışana erişim → panel TEK GENEL PANEL (parola korumalı) olarak
         onaylandı, kişiye özel link modeli terk edildi.
      2. Çiğdem Chrome kuracak/varsayılan tarayıcı yapacak → Web Speech API (native, ücretsiz,
         Chrome'da güvenilir) onaylandı, tarayıcı kısıtlaması sorun değil.
      3. 3 buton HER ZAMAN aynı anda görünecek (bağlama göre gizlenmeyecek) — Çiğdem'in kafası
         karışmasın diye.
      4. "Ekle" bir seans notunda ilk kez kullanıldıktan sonra KİLİTLENİR (soluk/tıklanamaz) —
         düzeltmeler sadece "Eski nota ekle"/"Eski not ile değiştir" ile yapılır, bu ikisi asla
         WhatsApp tetiklemez, danışana yanlışlıkla ikinci bildirim gitme riski böylece sıfırlanır.
      5. Not sütun şeması: HER SEANS İÇİN AYRI SÜTUN (N. Seans Notu, N=1..10).
      6. Ara seanslarda da (son seans gibi) 23:59 fallback ile not: "Bu seansta not alınmadı."
      7. Ara seanslarda buton unutulursa "sonraki randevu" WhatsApp bildirimi de aynı 23:59
         fallback'te OTOMATİK gönderilsin (sadece not değil, bildirim de) — yani "seansı kapatma"
         eylemi (not yaz-veya-varsayılan + varsa sonraki randevu bildirimi) ister manuel "Ekle"
         tıklamasıyla ister 23:59 cron sweep'iyle tetiklensin, ikisi aynı guard'ı paylaşır (hangisi
         önce olursa).
      8. Kapsam: bu not/panel sistemi TEKLİ randevularda da geçerli olacak (bildirim kısmı doğal
         olarak devre dışı kalır, çünkü "sonraki randevu" yok — sadece not tarafı çalışır).

      **Düşük riskli varsayımlar (2026-07-23, kullanıcıya sorulmadan belirtildi, itiraz gelmezse
      geçerli):**
      - "Günün sonu 23:59" = seansın kendi takvim günü, Çiğdem'in yerel saatiyle.
      - Çiğdem'in yerel saati = sabit Europe/London.
      - İptal edilen paketlerde kalan seansların not/bildirim döngüsü hiç tetiklenmez (Calendar
        event'leri zaten silinmiş olur).

      ---

      ## MADDE 5 — KONSOLİDE TASARIM (2026-07-23, kodlamaya geçmeden önce son onay bekleniyor)

      **Erişim:** Tek genel panel, parola korumalı (kişiye özel link YOK). Panel varsayılan olarak
      "kapatılması gereken güncel seans" bağlamıyla açılır (isim otomatik dolu, seans numarası
      bilinir); ok/arama butonuyla TÜM danışanların alfabetik listesine (üstte arama kutusu,
      scroll bar) geçilip herhangi bir danışanın herhangi bir geçmiş seans notuna ulaşılabilir.

      **Sheets şeması:** Her seans için ayrı sütun — "N. Seans Notu" (N=1..10, mevcut
      `sessionNStartUtc` deseniyle tutarlı) + guard alanı "N. Seans Notu İşlendi" (zaman damgası —
      hem manuel "Ekle" hem 23:59 cron fallback bunu kontrol eder, ikisi de aynı guard'ı paylaşır).
      Tekli randevularda da (sessionCount=1) aynı şema kullanılır, sadece bildirim adımı hiç
      tetiklenmez.

      **3 buton (her zaman birlikte görünür):**
      1. **Eski nota ekle** — yüklenmiş notun sonuna, kutudaki metni ekler. Sadece Sheets'e yazar,
         danışana asla hiçbir şey gitmez. Onay penceresi: "Bu not google sheet'e gönderilecek,
         devam etmek istiyor musun?" (Evet/Hayır).
      2. **Eski not ile değiştir** — yüklenmiş notun yerine kutudaki metni yazar. Aynı onay
         penceresi, aynı şekilde sadece Sheets.
      3. **Ekle** — o seansın notunu (boşsa "Bu seansta not alınmadı.") Sheets'e yazar VE (son
         seans değilse) danışana sonraki randevu WhatsApp bildirimini gönderir. Onay penceresi
         son seans değilse "...ve danışan bir sonraki randevu için bilgilendirilecek", son seansta
         sadece "...google sheet'e gönderilecek". **İlk kullanımdan sonra o seans için kilitlenir**
         (soluk/tıklanamaz) — bir daha WhatsApp tetiklenmesin diye; düzeltmeler artık sadece 1/2
         numaralı butonlarla yapılır.

      **23:59 fallback (yeni cron, mevcut 15dk'lık reminder sweep deseniyle aynı guard mantığı):**
      Her seans için, seans günü Çiğdem'in yerel saatiyle (Europe/London) 23:59 geçtiğinde VE o
      seansın "N. Seans Notu İşlendi" alanı hâlâ boşsa: not sütununa "Bu seansta not alınmadı."
      yazılır VE (son seans değilse) danışana sonraki randevu WhatsApp'ı gönderilir — yani manuel
      "Ekle" ile birebir aynı eylem, sadece tetikleyicisi farklı (buton yerine zaman). Guard alanı
      ikisi arasında paylaşılır: hangisi önce olursa, diğeri bir daha tetiklenmez.

      **Sesli not:** Klavyeye ek olarak mikrofon ikonu, tarayıcı-native Web Speech API (ücretsiz,
      gerçek-zamanlı, imleç konumuna ekleme) — Çiğdem Chrome kullanacağı için kalite/uyumluluk
      sorunu yok. Gemini-seviyesi kalite değil ama ücretsiz+native gereksinimini karşılıyor.

      **Kapsam:** Hem çoklu (2-10 seans) hem tekli (1 seans) rezervasyonlar için geçerli.

      **Sesli not ödünleşimi netleşti (2026-07-23):** Kullanıcı "ücretsiz Chrome + Web Speech API
      ile devam" dedi — Chrome, uyumluluk/güvenilirlik sorununu çözer (Safari/Firefox'ta API
      tutarsız/çalışmıyor) ama Gemini-seviyesi bağlamsal kalite tavanını değiştirmez; kullanıcı bunu
      kabul etti. Çiğdem'in Chrome'u varsayılan tarayıcı yapması gerekiyor — kullanıcı bunu
      Çiğdem'e iletmeyi unutmamak için bana zaman zaman hatırlatmamı istedi (bkz.
      `project_cigdem_chrome_reminder.md` hafıza kaydı).

      **TASARIM ONAYLANDI (2026-07-23) — kodlamaya hazır.**
- [ ] **Madde 6-12:** Henüz başlanmadı.

**Bilinen açık/bekleyen sorun — WhatsApp "API access blocked" (2026-07-23):** Test WABA'sında
tekrarlayan bir blok var; token'ı yenilemek (hatta YENİ bir token üretmek, "Asla süresi dolmasın"
seçeneğiyle) düzeltmedi — yani sorun token değil, hesap/uygulama seviyesinde (muhtemelen bugünkü
yoğun API trafiğinin tetiklediği Meta'nın otomatik kötüye-kullanım/hız sınırlama sistemi). Kalıcı
çözüm (Business Verification) kullanıcı isteğiyle SONRAYA bırakıldı. Bu, Calendar/Sheets/AI
özetleme testini ENGELLEMİYOR (o adımlar WhatsApp'tan önce çalışıyor), sadece WhatsApp mesajlarının
gerçekten gitmesini engelliyor. Devam ederken bunu göz önünde bulundur — bir cascade'in "WhatsApp
send failed: API access blocked" ile 500 dönmesi, Calendar+Sheets'in BAŞARISIZ olduğu anlamına
gelmez (onlar WhatsApp adımından önce çalışıyor).

**Aktif test altyapısı durumu (kalıcı değil, oturum bazlı — compact/clear sonrası kontrol et):**
- Local statik sunucu: `python3 -m http.server 5173` (proje kök dizininde).
- Backend: `cd form-backend && npx wrangler dev --port 8787` (AI binding gerektiği için artık
  `npx wrangler login` yapılmış olması ŞART, yoksa worker hiç başlamıyor).
- Stripe webhook forwarding: `stripe listen --forward-to localhost:8787/webhook/stripe`.
- Cloudflare quick tunnel'lar (frontend 5173, backend 8787) — **ücretsiz, garantisiz, saatte bir
  kendiliğinden geçersiz olabiliyor** ("Unauthorized: Tunnel not found" hatası → yeni tünel açıp
  `booking.html`/`cancel.html`/`iletisim.html`'deki API_BASE ve `http.ts`'teki ALLOWED_ORIGINS'i
  güncelle). En son bilinen linkler (muhtemelen artık geçersiz, kontrol et): frontend
  `reforms-ours-oecd-involves.trycloudflare.com`, backend
  `brad-substances-development-filter.trycloudflare.com`.
- D-1 hatırlatma sweep'i manuel tetikleme: `curl http://localhost:8787/cdn-cgi/handler/scheduled`
  (SADECE localhost'ta çalışır, tünel üzerinden değil — `/cdn-cgi/` Cloudflare'ın kendi edge'i
  tarafından yakalanıyor).

**13. madde (2026-07-23, 1. madde sırasında bulundu, henüz YAPILMADI — kullanıcı "not düş, sonra
2. maddeye geç" dedi):** `form-backend/src/lib/whatsapp.ts`, danışanın forma girdiği telefon
numarasını hiç normalize etmeden (E.164'e çevirmeden) WhatsApp API'sinin `to` alanına ham haliyle
gönderiyor. 1. maddede sadece frontend'e (placeholder + uyarı metni) doğru format örneği eklendi;
kullanıcı yine de yanlış girerse (boşluklu/parantezli/ülke kodsuz) mesaj sessizce gitmez. Kalıcı
çözüm: zaten bağımlılık olarak yüklü `libphonenumber-js` ile backend'de gerçek normalizasyon
(`parsePhoneNumberFromString(...).format('E.164')`, baştaki `+` atılarak) — tek yerde
(`whatsapp.ts`'teki `sendMessage`) yapılırsa tüm çağıranları kapsar. Ne zaman ele alınacağı kullanıcı
kararına bırakıldı.

## MADDE 7 — KONSOLİDE TASARIM (2026-07-23, kodlamaya geçmeden önce netleşen sonuç)

**Kullanıcının onayladığı kararlar:**
1. `sessionCount > 1` olan her rezervasyon, Sayfa1'e her zamanki gibi yazılmaya devam eder, AYRICA
   aynı satır **"{N} Seans"** adlı bir sekmeye (örn. "2 Seans", "3 Seans" — yoksa otomatik
   oluşturulur) de eş zamanlı işlenir. `sessionCount === 1` olan rezervasyonlar bu sisteme hiç
   girmez.
2. **Tam kopya (69 sütunun hepsi, Madde 5'in not sütunları dahil).** "{N} Seans" sekmesi Sayfa1
   ile birebir aynı `SHEET_COLUMNS`/`SHEET_COLUMN_LABELS` şemasını kullanır.
3. **Her güncelleme iki tarafta da senkron kalır** — sadece ilk yazımda değil: iptal
   (`cancelledAt`/`stripeRefundId`/`refundPercent`/`refundAmount`/iptal edilen seansların
   start/reminder sütunlarının temizlenmesi), hatırlatma gönderim damgaları
   (`reminderSentAt`/`sessionNReminderSentAt`), panel notları (`sessionNote`.. ve
   `sessionNoteSubmittedAt`..) — hepsi Sayfa1'e yazıldığı her an aynı satırın "{N} Seans"
   sekmesindeki karşılığına da yazılır.

**Mimari yaklaşım (asistanın kararı):** `lib/sheets.ts`'teki fonksiyonlar (`ensureHeaderRow`,
`appendBookingRow`, `findRowBySessionId`, `writeCell`, `getRow`, `getAllRows`) sekme adına göre
parametrelenir (şu an hepsi sabit `SHEET_TAB_NAME` kullanıyor). İkinci sekme, gerektiğinde (ilk
`sessionCount>1` rezervasyonda) otomatik oluşturulur (`spreadsheets.batchUpdate`'in `addSheet`
isteği) — 2-10 arası tüm sekmeler baştan oluşturulmaz. Her `writeCell` çağrısının yanına, satırın
`sessionCount`'u 1'den büyükse aynı değeri ilgili "{N} Seans" sekmesindeki (aynı `stripeSessionId`
ile bulunan) satıra da yazan bir "mirror" yardımcı eklenir — mirror yazımı KENDİ try/catch'inde
olur, başarısız olursa Sayfa1'e yazılan asıl veri/akış ASLA etkilenmez (BE-19'daki izolasyon
deseninin aynısı).

**Test:** Kullanıcı bu maddede birlikte canlı test yapmak istedi — kod + otomatik testler bittikten
sonra gerçek bir çoklu rezervasyonla (örn. 3 seanslık) birlikte doğrulanacak: Sayfa1 + "3 Seans"
sekmesinin ikisi de doğru satırı gösteriyor mu, sonra bir iptal/not işlemiyle ikisinin de senkron
güncellendiği kontrol edilecek.

## İlerleme Durumu (2026-07-24, compact/clear öncesi kayıt — kaldığımız yer)

**12 maddelik liste durumu:** Madde 1-11 tamamlandı+onaylandı (hata günlüğü FE-01..FE-14, BE-21).
**Madde 12 — TAMAMLANDI (2026-07-24).** Kullanıcı A varyantını seçti (`approach.html?warnVariant=a`
üzerinden), 17 seçiciye kalıcı olarak yazıldı, test mekanizmasının tamamı (style.css'teki 23
satır + 5 sayfadaki script'ler) kaldırıldı, cache-busting v47→v48, hata günlüğü FE-15 güncellendi.
**12 maddelik liste tamamen bitti.**

**Madde 12'nin tam kapsamı (kullanıcı netleştirdi):** Sadece uyarı mesajları değil, Madde 12'nin
başında sayılan TÜM metinler: Services/Blog kartları (`.service-card h2/p`), Approach kartları
(`.approach-item h2/p`), İletişim etiket/bilgileri (`.contact-info h2/p`, `.field label`,
`.whatsapp-link`), Booking bölüm başlıkları/seçenekleri/politikası (`.section-label`,
`.mode-pill span`, `.session-option-name/meta/price`, `.checkbox-field`, `.recurring-note p`,
`.policy-box p`, `.field label`) + tüm uyarı mesajları (`.form-note`, zaten vardı).

**Mekanizma:** `?warnVariant=a|b|c` URL parametresi → `style.css`'teki `html[data-warn-variant="X"]`
kuralları (a: ilgili elemanın kendi mevcut ağırlığına +100, b: +200, c: ağırlık aynı + boyut
`calc(mevcut + 1px)`). 5 sayfaya (`services.html`, `approach.html`, `blog.html`, `iletisim.html`,
`booking.html`) parametreyi okuyup `data-warn-variant` attribute'unu set eden aynı küçük script
eklendi. `booking.html`'de ayrıca otomatik bir örnek uyarı mesajı gösterip ona kaydırma da var (font
yüklenme zamanlamasına karşı 4 farklı gecikmede tekrar deneniyor, BE/FE-15'te detaylı).

**Test linkleri (tünel — kalıcı değil, saatlik geçersiz olabilir, gerekirse yenile):**
- `https://guam-serial-unlimited-labs.trycloudflare.com/services.html?warnVariant=a` (b/c için sonu değiştir)
- `https://guam-serial-unlimited-labs.trycloudflare.com/approach.html?warnVariant=a`
- `https://guam-serial-unlimited-labs.trycloudflare.com/blog.html?warnVariant=a`
- `https://guam-serial-unlimited-labs.trycloudflare.com/iletisim.html?warnVariant=a`
- `https://guam-serial-unlimited-labs.trycloudflare.com/booking.html?warnVariant=a`
- Backend tüneli (booking.html'in API_BASE'i): `https://stanley-relate-trial-web.trycloudflare.com`
- Not: tüneller muhtemelen bu oturum kapandıktan sonra geçersiz olacak — yarın devam ederken önce
  `cloudflared tunnel --protocol http2 --url http://localhost:5173` (frontend) ve aynısı 8787 için
  (backend) ile yenileyip `form-backend/src/lib/http.ts`'teki `ALLOWED_ORIGINS` ve
  `booking.html`/`cancel.html`/`panel.html`'deki `API_BASE`'i güncellemek gerekecek (bu oturumda
  defalarca yapıldığı gibi).

**Yarın devam ederken ilk iş:** Kullanıcıya A/B/C'den hangisini seçtiğini sor. Seçim gelince:
1. Seçilen varyantın değerlerini ilgili CSS seçicilerine KALICI olarak yaz (ör. B seçilirse
   `.form-note{font-weight:400}` gibi doğrudan, `html[data-warn-variant]` şartına bağlı kalmadan).
2. `html[data-warn-variant]` kurallarının TAMAMINI `style.css`'ten kaldır.
3. 5 sayfadaki (`services/approach/blog/iletisim/booking.html`) `?warnVariant=` okuyan script
   bloklarını kaldır (booking.html'deki otomatik uyarı-gösterme+kaydırma bloğu dahil).
4. cache-busting versiyonunu bir artır (şu an v47).
5. Hata günlüğüne (FE-15'i güncelle, "kaç denemede çözüldü" ve sonucu ekle) işle.
6. 12 madde bitmiş olacak — kullanıcıya bunu bildir, sıradaki iş için sor (INTEGRASYON_TODO.md'nin
   geri kalanına, ör. Session 13 sonrası Meta şablon onayı/Resend DNS/Phase 5 hazırlıklarına bakılabilir).

**Ayrıca bekleyen (bu oturumdan, henüz aksiyon alınmadı):** "Goker hosting görüşmesi" — Çiğdem'den
alan adı/DNS yöneticisinin kim olduğu netleşince kullanıcı haber verecek (bkz.
`hosting-devir-gorusmesi-goker.md`).

## Kullanıcı isteği — Çiğdem'in Mac'ine geçiş, GitHub tek-kanal iş akışı (2026-07-24, birebir metin)

> Bu arada şu anda proje üzerinde hala gidene kadar çalışacağım biraz daha zamanım var. Dosyaya
> ben gidene kadar işlenmesi gereken şeyler varsa not al ve bana hatırlat. Gittiğinde çalışacağın
> dosyaya eklememiz gerekenler var onları ekleyeyim. Çiğdem'e bunu WhatsApp'tan iş akışını öyle
> gönder. GitHub'ı da ona göre son halini güncelleyip gönderelim şeklinde bunu yap. Bir, ikincisi,
> ikincisi hazırladığın dosyanın içerisinde ben oraya gittiğimde hiçbir eksik olmadığı konusunda
> adımları hazırlarken bir uydurma yapmadığını, halüsinasyon görmediğini, yorum yapmadığını,
> tahmin yapmadığını check et ve bu işlemleri Yine bir Mac cihazı olan benim bu masaüstümde test
> ederek, sanki Çiğdem'in bilgisayarında yapılıyormuşçasına dört defa test ederek onayladıktan
> sonra dosyanın en son halini ver. En son bana iş akışı dosyasını hazırla.

**Bağlam:** Bu istek, önceki oturumda hazırlanan `MACBOOK_GECIS_REHBERI.md` dosyasının (Çiğdem'in
MacBook'una geçiş rehberi) gidilmeden önce hem içerik hem doğruluk açısından son haline
getirilmesini istiyor — bu masaüstünde (aynı zamanda bir Mac) rehberin adımlarını gerçekten
çalıştırarak (klonlama, kurulum, testler) 4 kez doğrulama yapılacak, kaynağı olmayan/tahmine
dayalı hiçbir adım kalmayacak. Ayrıca gidilene kadar tamamlanması gereken işler ayrıca not
edilecek ve kullanıcıya hatırlatılacak.

**Sonuç (2026-07-24):** 4 geçişte gerçek dry-run yapıldı (npm install, tsc, 108/108 test,
`wrangler dev` boot, frontend serve) — hepsi geçti. Gerçek bulgu: `wrangler dev`'in AI binding
yüzünden ~15-20 saniye geç ayağa kalktığı (hata günlüğüne BE-28 olarak işlendi). Yanlış kaynak
gösterilen bir not (panel şifresi → NOTES.md yerine gerçekte INTEGRASYON_TODO.md) düzeltildi.
Kritik bulgu: `form-backend/`, `booking.html`, `cancel.html`, `panel.html` GitHub'a hiç
push edilmemiş — bu G) bölümüne "gidene kadar yapılacaklar" olarak işlendi, push kullanıcı onayı
bekleniyordu.

## Kullanıcı isteği — hata günlüğü + GitHub push + dosyanın son hali (2026-07-24, birebir metin)

> 1-hata günlüğünü güncelle
> 2- gitbub daki eksikleri tamamla
> 3- dosyanın son halini bana ver

**Yorum:** Madde 2 ("gitbub daki eksikleri tamamla"), önceki turda tespit edilen ve push için
kullanıcı onayı beklenen eksikliği (form-backend + 3 HTML sayfası + değişiklikler GitHub'da yok)
tamamlama = ŞİMDİ commit+push etme talimatı olarak yorumlandı — kullanıcı daha önce "ben gidiyorum
deyince push edeceğiz" demişti, bu mesaj o onayı veriyor.
