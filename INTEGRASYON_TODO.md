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

## Arşiv — 2026-07-22 → 2026-07-31 arası kapanmış kayıtlar taşındı (2026-08-10)

Bu tarih aralığındaki (Sheets başlık denetiminden çok-haftalı "hafta atlama" kararına kadar) TÜM
madde/oturum kayıtları `INTEGRASYON_TODO_ARSIV.md`'ye **birebir** taşındı — hiçbir içerik
silinmedi, sadece bu dosyanın context/token maliyetini düşürmek için ayrıldı (bu dosya tek
başına ~111K token'a çıkmıştı, her session'da otomatik yükleniyordu). Belirli bir eski
kararın/hatanın tam metnini arıyorsan: `grep -n "aradığın başlık" INTEGRASYON_TODO_ARSIV.md`.
Arşivde bu sırayla duran başlıklar:

- Kullanıcı isteği — Sheets başlık/veri tutarlılığı denetimi (2026-07-22)
- Kullanıcı isteği — Hosting kişisinden istenecek bilgiler listesi (2026-07-22)
- Kullanıcı isteği — Oturum kapanışı (2026-07-23)
- Kullanıcı isteği — Çoklu-cihaz test sonrası 12 maddelik düzeltme listesi (2026-07-23)
- İlerleme Durumu (2026-07-23, compact öncesi kayıt) — **NOT:** buradaki `[ ]` işaretler o
  tarihte açıktı, sonraki oturumlarda kapandı; güncel açık iş için ana dosyanın kendisine bak,
  bu sadece tarihi bir anlık görüntü.
- MADDE 7 — KONSOLİDE TASARIM (2026-07-23)
- İlerleme Durumu (2026-07-24, compact öncesi kayıt — aynı NOT geçerli)
- Kullanıcı isteği — Çiğdem'in Mac'ine geçiş, GitHub tek-kanal iş akışı (2026-07-24)
- Kullanıcı isteği — hata günlüğü + GitHub push + dosyanın son hali (2026-07-24)
- Kullanıcı isteği — "Hakkımda" (About) sayfa içeriği + kalıcı içerik ekleme süreci (2026-07-26)
  (tam EN/TR metin blokları dahil: Hikayenin Başladığı Yer / Where the Story Begins vb.)
- Kullanıcı isteği — "Meet Cigdem" bölümü başlık + resim çerçevesi yerleşimi (2026-07-26)
- Kullanıcı isteği — "Approach" (Yaklaşım) sayfa içeriği (2026-07-26)
- Kullanıcı isteği — Services kutucuklarına tıkla-genişlet içerik (2026-07-26, + 2 takip düzeltmesi)
- Kullanıcı isteği — hakkimda.html 3 foto çerçevesine gerçek fotoğraf (2026-07-26)
- Kullanıcı isteği — index.html "05 Contact" teaser kaldırma + iletisim.html'i tamamen kaldırma (2026-07-26)
- Kullanıcı isteği — İptal akışı: iade politikası + manuel/müşteri iptal tasarımı (2026-07-26)
- Karar — İade matematiği NETLEŞTİ + no-show senaryosu (2026-07-26)
- Uygulandı — per-seans iade kuralı + 72 saat altı %0 + Çiğdem'in override'lı manuel iptali (2026-07-26)
- Canlı test oturumu + panel override'a kısmi (seans bazlı) seçim (2026-07-26/27)
- Çözüldü — WhatsApp şablonları + 2 gerçek bug (2026-07-27)
- Kullanıcı isteği — iptal bilgilendirmesi (2026-07-27)
- Uygulandı — müşterinin /cancel linkinden kısmi seans seçimi (2026-07-27)
- Kullanıcı isteği — Sheets kısmi iptalde seans sayısı düşümü + mirror taşıma (2026-07-27)
- Karar — sütunlar sağdan/soldan büyüyebilir, `activeSessionCount` AX'e taşındı (2026-07-27)
- Kullanıcı isteği — birebir (2026-07-27)
- Kullanıcı isteği — 10 seans sınırının kaldırılması + Sheet bütünlüğü (2026-07-28)
- Uygulandı — 20 seans limiti + başlık-adı bazlı dinamik sütun çözümlemesi (2026-07-28)
- Kullanıcı isteği — GitHub public/private + 100 kişilik test verisi planı (2026-07-31)
- Düzeltme — "kayıp" 100 kişi + kazara sızan test verisi (2026-07-31)
- Uygulandı — çok haftalı randevularda "hafta atlama" serbest bırakıldı (2026-07-31)

## Kullanıcı isteği — karşılıklı erişim/test/bildirim altyapısı (2026-08-10, birebir metin)

Kullanıcı isteği, birebir: "talk and heal linkini hem ben hem çiğdem in saatlerce karşılıklı
olarak her sayfasını inceleyebileceği ve her ikimizinde (o Londra daki bilgisayarı ve cep
telefonunda ya da başka bir cihazda), ben kendi bilgisayarımda gerekli bütün testleri karşılıklı
olarak aynı anda-sırayla yapabileceğimiz, birimizin yaptığı değişiklik ya da testin sonucunu onun
ve benim bilgisayarımda ya da whatsapp ımızda ya da verdiğin linkteki web sitesinde
görebileceğimiz şekilde ayarlama yap ve sitenin linkini ver. tascigdem1977@gmail.com ortak
olduğu için onun üzerinden ilerleyebiliriz, ayarlamalarda bunu da göz önünde bulundur, whatsapp
bildirim ve hatırlatma mesajları için bazen benim cep numaram bazen onun ingiltere cep numarasına
mesajlar gidecek şekilde ayarlama yapabiliriz bunun için hangimizi telefonun mesaj gitsin diye
istersek o aşamada gerekli ayarlamaları adım adım bana yaptırırsın. dediğim gibi web sitesinden o
da ben de karşılıklı teams görüşmesi esnasında birbirmizle iletişim halinde iken sayfaların
UI/UX tasarımları, randevu alma panelden randevu notu ekleme/silme randevu iptal etme vs
karşılıklı olarak yapabilelim."

Henüz faz planına işlenmedi — bir sonraki adım kullanıcıyla netleştirme (hangi parçalar zaten
mevcut altyapıyla karşılanıyor — GitHub Pages linki, panel.html — hangi parçalar yeni
kurulum/kod gerektiriyor — WhatsApp bildirim hedef numarası seçilebilirliği, tascigdem1977@gmail.com
hesabına geçiş).

4 bağımsız parçaya ayrıldı, kullanıcı 1. parçayla başlanmasını istedi: (1) WhatsApp bildirim
hedefi, (2) tascigdem1977@gmail.com ortak hesabına geçiş (Faz 5 ile örtüşüyor), (3) erişim/link
durumu doğrulama, (4) karşılıklı canlı test/inceleme oturumu (Teams sırasında) — bu son madde
altyapı kurulumu değil, mevcut linkle zaten yapılabilecek bir çalışma biçimi.

### Karar (2026-08-10) — WhatsApp bildirim hedef numarası: tek aktif numara, elle değiştirilebilir

Kullanıcı "bazen benim numarama bazen Çiğdem'in numarasına" ifadesini netleştirdi: aynı anda
SADECE bir numara bildirim alacak (ikisine birden veya bildirim-tipine-göre DEĞİL). Bu zaten
mevcut mimariyle karşılanıyor — `env.SELEN_WHATSAPP_NUMBER` tek bir Worker secret'ı, yeni
randevu/iptal/hatırlatma-gönderildi bildirimlerinin üçü de bu tek numarayı okuyor
(`stripe-webhook.ts`, `cancellation.ts`, `scheduled.ts`). **Kod değişikliği gerekmiyor** — numara
değişimi = secret değerini değiştirmek: canlıda `wrangler secret put SELEN_WHATSAPP_NUMBER`,
yerelde `.dev.vars`'taki satırı elle güncelleyip `wrangler dev`'i yeniden başlatmak.

**Çiğdem'in numarası kullanıcıdan alındı:** `+44 7595 455398` (E.164/no-plus format:
`447595455398`). İlk test mesajı buraya gidecek, kullanıcı isterse sonra kendi numarasına
çevirecek — bu geçiş her seferinde tek komutluk bir işlem olacak.

### Blocker bulundu ve çözülüyor — WhatsApp access token süresi dolmuş (2026-08-10)

Numara değişimini test etmeden önce token geçerliliği kontrol edildi (Graph API'ye HTTP isteğiyle,
token hiç ekrana yazdırılmadan): `401 OAuthException` — "Session has expired on Friday,
31-Jul-26 07:00:00 PDT." 31 Temmuz'da (BE-19/reminder testleri sırasında) kullanılan token
kalıcı değil, Meta'nın "Try it out" sayfasından alınan **24 saatlik geçici** bir tokenmiş.

**Bu sefer kalıcı çözüm:** 21 Temmuz'da zaten kurulmuş olan System User (`form-backend`, Admin
erişimi, WABA'ya "Test WhatsApp Business Account" + "Talk and Heal" app'ine Tam erişim atanmış —
ekran görüntüsüyle doğrulandı) üzerinden **"Asla süresi dolmasın"** seçeneğiyle yeni bir kalıcı
token üretiliyor. Kullanıcı Business Settings → Sistem kullanıcıları → form-backend sayfasında,
"Jeton oluştur" adımında. Devamı: izin seçimi (whatsapp_business_messaging +
whatsapp_business_management), süre="Never", `.dev.vars`'a yapıştırma, doğrulama.

## Kullanıcı isteği — Çiğdem ile birlikte tespit edilen 18 maddelik eksik/hata/geliştirme listesi (2026-08-10, birebir metin)

Kullanıcının talimatı, birebir: "Çiğdem ile birlikte aşağıdaki 17 eksik ve ileride web sitesine
eklenmesi gerekenleri içerek 18 maddeyi olduğu gibi talk and heal ın ilgili dosyasına kaydet,
listeyi öncelik sıralamaısı ve bağlam hiyerarşisine göre yine 18 madde olacak şekilde  kaydet.
Hatta basit olanları şimdi hallederek ilerleyebilriz. Önce dediğim şekilde listele, sonra her
madde için bana sor şimdi mi sonra mı halledelim diye her bir adım tamamladnığında onay alıp
diğerine geçelim."

18 maddenin birebir metni:

1- Şu anda Çiğdem'le karşılıklı sayfayı incelerken book a consultation butonunun yanındaki notadan
müziği kendisi açtı ama sayfayı değiştirirken müziğin kaldığı yerden devam etmesi gerekiyordu. Bu
gerçekleşmedi. Yeni girdiği sayfada tekrar o nota simgesine bastığında müzik devam etmeye başladı.
Bu bir bug, bir hata. Öncelikle bu düzeltilecek. Bu bir.

2- Çiğdem'in sitesinde zaman zaman sosyal medyasında da paylaşabileceği reklamlar için Çiğdem'in
sitesinde veya sosyal medyasında yapacağı reklamlarla alakalı veya tanıtımlarla alakalı video
çekimleri ve bunların editlenmesi için video editi ekleyeceğiz. Aynı Open Cut'ı Sparrow'a
eklentilediğimiz gibi bu ikinci madde olarak kayıt edilsin.

3- Ayrıca Çiğdem'in sitesine kendisinden randevu alan danışanlardan gerekli yasal izni alarak
danışanlarının özel bilgilerini, danışanlarının isimlerini paylaşmadan ileride oluşturacağı bir
teze konu yapmak için danışanların bu verilerini depolamayı da istiyoruz. Bununla ilgili de bir
altyapı oluşturmamız lazım.

4- Şimdi ileriki aşamada da çok önemli ve ilk bir uygulama yapacağız. Sanırım dünyada örneği
yoktur bunu gerekirse araştıracağız. Örneklerinden de kendimize bazı fikirler klonlayabiliriz.
Bir app geliştireceğiz. Bu app'te insanlar danışana gelmeden önce veya danışanla seansları
sırasında veya danışanla psikoterapistle, psikoloğuyla görüşmesinden sonra kendi mevcut psikolojik
durumuyla alakalı mevcut app'ten destek alabileceği, kendi kendine uygulayabileceği mini tedavi
yöntemlerini aslında kendisi yapıyor olacak. Bunun için de altını desteklemek için her psikolojik
tedavi, kişisel tedavi veya danışanla yapılan tedaviye ait gerekli uluslararası referansları
yüksek olan klinik çalışmaların da atıflarını, referanslarını her uygulamada ve her kendi kendine
uygulamada kişi açıp isterse tamamını isterse kendi istediği dilde ve özet şekilde de görebilecek
şekilde ve kendisiyle alakalı tedavinin de tüm sürecini not alabileceği ileride aynı sorunla
karşılaştığında tekrar bunu uygulayabileceği bir depolama, raporlama alanı da olsun.

5- Bu yazdırdığım maddeler veya bundan sonra yazdıracağım maddeleri şu anda sistemimizdeki
uygunluk durumuna, iş sırasına göre zaman hiyerarşisini ekle. Hangisini önce, hangisini sonra
yapacağımız konusunda maddeleri sırala.

6- BACP Registered 20+ Years in practice Existential-Phenomenological · CBT · ACTEnglish &
Turkish hero nun altındaki bu bantta BACP Registered yerine BACP Acretided  20+ Years yerine de 3
Decades yazılacak Existential-Phenomenological · CBT · ACT . EMDRCBT · ACT ·
Existential-Phenomenological olacak

7- Hero kısmı altındaki Services(Servsiler) kımsındaki ilk 2 paragraf 'Individual therapy,
couples counselling, and organisational consultation — delivered in person in London or online,
wherever you are.
Every first conversation is a chance to see whether the fit is right, with no pressure to
continue.' şöyle değişecek : 'Individual therapy, couples counselling, group psychotherapy,
somatic craticve practice, supervision organisational consultation, workshops/ Trainings and
Re-treats
Every initial consultation is an inviting opportunity to share what you're looking for and see if
we feel like the right match.'

8- Not panelinde Çiğdem İngilizce bir dikte yazdırmak istedi ama not panelinde yazdırmaya
çalışırken neredeyse Almanca kelimeler bile gördüm ben yazının içerisinde. Ben sana zaten bunu
veriyor olacağım. Onu bir incele. Ama ben kendi bilgisayarımda not panelinde bir dikte not
yazdırmak istediğimde Türkçe olarak tamamen doğru olarak kayıt aldı. Çiğdem'de bu sorunun neden
yaşandığını anlamak istiyorum. Varsa bir sorun bunu çöz ki var. Ona göre bir çözüm üretelim.
Çiğdem in bozuk şekilde not paneline dikta edilen konuşması ''İngilizce okay ameli ya dedin come
tu her Station Tutay endişe dedin sen en iyi en Formation States Sessions mest Defor centro Mail
edecek en aşırı Meinhard unattended sesiniz Vedat Notice Estepe invest ''

9- Panel sekmesinde bir danışana ait danışan notunu mikrofonla dikte ettiğimde doğal olarak
konuşma içerisinde duraksadığımda "ee" gibi eklemeler görünüyor. Bunların elenip ona göre
diktenin Google Sheet'e gönderilmesi için bir araç, ücretli araç bulmamız gerekiyor. Ayrıca aynı
araç gramatik ve noktalama imla hatalarını da düzeltebilmeli, Yani düzgün bir aktarım yapacak,
dili düzgün aktaracak bir araç. Bu İngilizce için de geçerli olacak bu arada. Örnek ''Ameliye
Brown bu oturumuna gelmedi Eee o nedenle kendisine bir hatırlatma Eee maili mesajı göndermek
istiyorum Eee ayrıca Eee kendisine bu iptali yapmadığı için son 72 saatte bilgilendirme yapmadığı
için Eee seans ücretinin tamamını kesileceği bilgisini de iletmeni istiyorum''.

10- Çiğdem kendi bilgisayarında karşı tarafta Londra'da randevu oluştururken sesli not kısmında
İngilizce diktede bir sorun yaşamadı ancak translate'e bastığında şu anda translate yapılamıyor
uyarısı verdi. Bunu da hata olarak hataların içerisine diyelim.

11- Randevu alma bölümünde ilk hafta seçtiğim tekli seansla bir sonraki haftalarda aslında çoklu
seçime devam etmek için sonraki haftaya girdiğimde sadece kural gereği o gün ve o saatteki tek
seans görüyor. Ancak ben bir sonraki hafta seans sayımı artırmak isteyebilirim. Bu durumu çözmek
için çoklu seçimlerde ilk haftada tek seans, sonraki haftalarda çoklu seçim yapabilmesi için bu
algoritmada bir düzenleme yapmamız gerekiyor.

12- Şu anda karşılıklı olarak Çiğdem Londra'daki bilgisayarında, ben buradaki bilgisayarımda
birer randevu oluşturduk. Onun oluşturduğu randevudaki veriler de, benim oluşturduğum randevu
verileri de hiçbiri Stripe aşamasında ödemeyi yapıp ödemenin alınmasına rağmen ne Google Sheet'e
eklendi ne de Çiğdem'in İngiltere numarasına hem müşteriye hem Çiğdem'in kendisine gitmesi
gereken WhatsApp şablon mesajları gitmedi ve Google Sheet'te de her ikimizin yaptığı randevu
kayıtları eklenmedi.

13- İleride Çiğdem bir psikoterapi, psikokliniği kliniği gibi İçerisinde aynı zamanda
fizyoterapistlerin de bulunduğu çok çeşitli bir klinik gibi düşün bunu. gibi çalışacağı için kendi
altında çalıştıracağı psikoterapistler ve psikologlar olacak. Dolayısıyla onların da Hem kişisel
verilerin hem çalışma alanlarının ek sayfalarda görüneceği bir altyapı olacak Talk and Heal web
sitemizde. Şimdiden onun altyapısı için de gerekli notları, gerekli dosyalara işleyelim ve o
aşamaya geçtiğimizde bana neler yapılması gerektiğini, front end, back end, debug ve deploy
aşamaları, tüm o aşama için hangi önlemleri almamız gerektiği konusunda beni uyar.

14- Web sitesindeki randevu oluştur panelinden iki kişi veya üç kişi yani birden çok kişi aynı
anda ödeme yapıp çıktıklarında sistem bunu aynı satıra, aynı kişiye veya önceliklendirdiği
kişinin bilgilerini eklememesi lazım. Bu çok ciddi bir hata olur. Bu hem mevcut toplamdaki
danışan sayısında hem de aynı anda işlem giren danışanların verilerinin birbirinin içerisine
girip kaybolmasına ve Çiğdem panelden istediği ve aynı anda giriş yapmış herhangi bir danışanın
notlarını almak istediğinde, bunlar üzerinde düzeltme yapmak istediğinde ve kişiye tıbbi bir
teşhis koymak istediğinde çok ciddi sorunlar yaratır. Aynı anda ödeme yapılması durumunda Google
Sheet'e ve Çiğdem'e veya danışanlara gitmesi gereken notların her birini ayrı ayrı satıra,
WhatsApp'ına ve Çiğdem'e bilgi olarak gitmesi gerektiği konusunda çok ciddi bir filtre
uygulamamız ve araç koymamız, gerekirse oraya bir hook eklememiz gerekiyor. Bu çok önemli bir
detay.

15- Google Sheet'te iptal politikası kademeleri olan 72 saat başlığındaki 48 ve 24'ün artık
elenmesi lazım. Her şey 72 saat politikasına döndü ve onun altındaki veriler de 48 ve 24
verilerinin işlenmesine gerek yok. Otomatik olarak hepsi 72 olarak doldurulması gerekiyor.

16- Not panelinde Çiğdem kendisi manuel olarak bir danışanının bir veya birden fazla randevusunu
iptal ettiğinde, iptal nedeni eğer hastalık, ailevi durum veya herhangi bir şeyse fark etmez,
seçtiğinde altında kişiye konu ile alakalı geçmiş olsun veya kendi belirleyeceği bir içeriği
WhatsApp mesajı olarak gönderebileceği bir mesaj yazsın ve bunu gönder dediğinde hem kişinin
iptal nedenleri ile ilgili veriler Google Sheet'e işlensin hem de WhatsApp tetiklenerek kişiye
Çiğdem'in gönderdiği geçmiş olsun veya yazacağı herhangi bir mesaj WhatsApp şablon mesajı olarak
gitmiş olsun.

17- Öncelikle senin en son yaptığın düzenlemeden sonra Google Sheet'e randevular verileri düştü.
Fakat iptal etmek istediğimizde, özellikle Rıza Keskin'in 8. randevusunu iptal etmek
istediğimizde ve iptal içinde diğer seçeneği ile çocuğu rahatsız notu ekleyerek iptal sürecini
işlettik. Fakat ne Çiğdem bu iptali yapabildi Londra'da bilgisayarıyla, pardon iptali yaptı ama
Google Sheet'e işlenmedi iptal değişiklikleri, ne de ben kendi bilgisayarımda yine Rıza Keskin 8.
seans ile ilgili aynı diğer deyip bu hasta seçeneği ile ilerleyip iptali yaptığımda gerçekleşti
fakat Google Sheet'e yine eklenmedi. Ayrıca Stripe ödemesi sonrası Çiğdem'e gitmesi gereken
şeyler, randevu bilgilerinin hiçbiri cep telefonuna, WhatsApp'ına gitmedi.

18- Şu anda Çiğdem Londra'daki bilgisayarından Hasan Taş isimli randevuyu oluşturdu. Not
panelinden bunu iptal etmek isterken 11 Ağustos saat 16:00 için yapılan seansı iptale geçtiğinde
%100 iade yapılacak onaylıyor musun çıktı. Ama 72 saat kuralına göre böyle bir iptalde %100
kesinti yapılması gerekiyor. Tam tersi bir durum var. Böyle bir hata var. Bunun düzeltilmesi
gerekiyor ve bu tarz hataların bir daha olmaması için gerekli bütün şeylerin yapılması gerek.

### Öncelik sıralaması ve bağlam hiyerarşisine göre yeniden sıralanmış liste (18 madde, aynı içerik — Claude'un analizi, 2026-08-10)

Parantez içindeki numara, yukarıdaki birebir listedeki orijinal madde numarasıdır.

1. (18) İade mantığı ters dönmüş — 72 saatten az kala iptalde %100 İADE çıkıyor, olması gereken
   %100 KESİNTİ. Yanlış para iadesi riski, EN KRİTİK.
2. (14) Eşzamanlı/çoklu ödemede satır çakışması — bugün canlı yaşandı, geçici olarak elle
   düzeltildi ama kod seviyesinde kalıcı çözüm (idempotent/kilitli satır ataması) yapılmadı.
3. (12) ✅ ÇÖZÜLDÜ (2026-08-10) — Stripe sonrası Sheet/WhatsApp hiç işlenmiyordu, kök neden
   (webhook endpoint hiç kayıtlı değilmiş) bulunup kalıcı endpoint kuruldu.
4. (17) ✅ ÇÖZÜLDÜ (2026-08-10) — İptal Sheet'e işlenmedi + WhatsApp gitmedi, kök nedenleri
   (aktif filtre + bozuk başlık hücresi + WhatsApp test numarası izin listesi) bulunup çözüldü.
5. (10) ✅ ÇÖZÜLDÜ (2026-08-10) — Randevu ekranındaki "Translate" özelliği canlı test edildi
   (EN→TR ve EN→EN), ikisi de 200 dönüyor; muhtemelen aynı gün erken saatte düzeltilen eski
   tünel-adresi sorunuyla aynı kökten kaynaklanıyordu.
6. (15) ✅ ÇÖZÜLDÜ (2026-08-10) — İptal politikası kademesi sadeleştirildi: Sheet başlığı
   "İptal Politikası Kademesi (72/48/24s)" → "İptal Politikası Kademesi" (Sayfa1 + 9 mirror
   sekmesinde, eski 24/48/72 veriler dokunulmadan kaldı), yeni randevularda alan artık her zaman
   "72"; `lib/policy.ts` (computePolicyTier/PolicyTier) tamamen kaldırıldı, `lib/refund.ts`
   doğrudan 72 saat eşiğini kontrol ediyor.
7. (1) ✅ ÇÖZÜLDÜ (2026-08-10) — Hero'daki müzik nota ikonu sayfa geçişinde duruyor, kaldığı yerden
   devam etmiyor (UX bug). Kök neden: pozisyon `localStorage`'a doğru yazılıp okunuyordu (kod
   testle doğrulandı, bozuk değildi) — asıl engel yeni sayfa yüklenirken sessiz `play()`
   çağrısının bazı durumlarda tarayıcının otomatik-oynatma (autoplay) politikasına takılıp
   reddedilmesi ve ikonun görünürde "çalıyor" kalsa da sesin başlamamasıydı. `assets/audio-player.js`:
   reddedilen `play()` artık ziyaretçinin yeni sayfadaki İLK tıklama/tuş/dokunuşunda otomatik
   tekrar denenecek şekilde düzeltildi (`armGestureRetry`/`clearGestureRetry`) — bu jest tarayıcı
   politikasını açmaya yetiyor. Manuel ikon tıklamasıyla regresyon yok (console hatasız
   doğrulandı). Gerçek düşük-etkileşimli bir tarayıcı profilinde (Çiğdem'in gerçek kullanımı)
   nihai doğrulama henüz alınmadı.
8. (6) ✅ ÇÖZÜLDÜ (2026-08-10) — Hero altı bant metni güncellendi (`index.html`, `.strip` div):
   "BACP Registered"→"BACP Accredited", "20+ Years in practice"→"3 Decades in practice", üçüncü
   madde "EMDR · CBT · ACT · Existential-Phenomenological" oldu (kullanıcının seçtiği sıra).
   Tarayıcıda görsel doğrulandı.
9. (7) ✅ ÇÖZÜLDÜ (2026-08-10) — `index.html`'deki Services teaser paragrafları (Hero altı,
   `.zig-copy`) verilen yeni İngilizce metinle güncellendi (dikte kaynaklı yazım hataları
   düzeltildi: "craticve"→"creative" vb.), TR karşılığı da eklendi (site data-en/data-tr kalıbı
   gereği).
10. (11) ✅ ÇÖZÜLDÜ (2026-08-10) — Kullanıcının önerdiği kesişim-kümesi çözümü uygulandı: ilk
    hafta 2+ slot seçilmişse eski davranış (tam weekday+saat kalıbı) aynen korunuyor; ilk hafta
    TEK slot seçilmişse ("day-only mode") sonraki haftalar sadece o slotun HAFTANIN GÜNÜ'ne
    kilitleniyor, saat serbest — yani o gün istediği kadar (başkası almadıysa) slot seçilebiliyor.
    Backend (`routes/booking.ts` `validateConsecutiveWeeks`) ve frontend (`booking.html`
    `referencePattern`/`recomputeSelection`/`renderSlots`) aynı mantıkla güncellendi, 2 yeni test
    eklendi (21/21 yeşil), `tsc`/`prettier` temiz. Tarayıcıda canlı UI testi henüz yapılmadı.
11. (16) Panelden manuel iptalde Çiğdem'in kendi yazacağı/seçeceği metnin WhatsApp şablonu
    olarak danışana gitmesi + Sheet'e işlenmesi — yeni özellik.
12. (8) Çiğdem'in bilgisayarında İngilizce dikte bozuk çıkıyor (Selen'in bilgisayarında Türkçe
    dikte sorunsuz) — kök neden araştırılacak (tarayıcı/mikrofon/dil ayarı ihtimali).
13. (9) Dikte temizleme (duraksama/"ee" dolgu kelimelerini eleme) + gramer/noktalama düzeltme
    aracı seçimi (ücretli, EN ve TR için) — araç araştırması + entegrasyon gerekiyor, madde 8
    ile ilişkili olabilir.
14. (13) Çoklu terapist/klinik altyapısı (Çiğdem'in yanına psikoterapist/psikolog ekleyeceği,
    her biri için ayrı sayfa/veri alanı) — büyük mimari değişiklik, ileride; o aşamaya
    geçilmeden önce front-end/back-end/debug/deploy önlemleri ayrıca çıkarılacak.
15. (3) Danışan verilerini isim paylaşmadan, yasal izinle, teze konu olacak şekilde saklama
    altyapısı — büyük, yasal + teknik, ileride.
16. (2) Video edit aracı entegrasyonu (Sparrow'daki OpenCut benzeri) reklam/tanıtım videoları
    için — ayrı proje kapsamı, ileride.
17. (4) Kendi-kendine-uygulanabilir mini tedavi + klinik referans/atıf + kişisel rapor/not
    alanı içeren app — en büyük, en uzun vadeli vizyon maddesi, muhtemelen benzersiz.
18. (5) [Süreç talimatı, ayrı bir görev değil] — bu ve sonraki maddelerin iş sırası/zaman
    hiyerarşisine göre sıralanması isteği; bu bölüm onun uygulanmış halidir.

