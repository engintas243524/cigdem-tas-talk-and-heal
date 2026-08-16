# Talk & Heal — Açık Maddeler / Beklenenler

## Senden bekleniyor
- [x] **Palet + font (DevTools):** metin rengi `rgb(43,38,34)` → `#2B2622` olarak uygulandı. Font
      `brandon-grotesque` — bu **ücretli/lisanslı** bir font, Google Fonts'ta yok, hakkımız/lisansımız
      olmadan gömemeyiz. Yerine geometrik/yuvarlak karakteri çok yakın, **ücretsiz** bir alternatif olan
      **"Jost"** kullanıldı (başlık fontu). Gövde metni Squarespace'in kendi varsayılanı olan
      "Helvetica Neue" ile aynı bırakıldı. Arka plan: tek düz renk yerine marka renklerinden
      (mercan-gül + adaçayı) türetilmiş yumuşak radyal gradyen + kendi ürettiğimiz (kopyalanmamış,
      SVG ile üretilen) ince kağıt-dokusu grain efekti eklendi — referans sitedeki gerçek
      "Background1-7.jpg" görsellerini indirip kullanmadım, o görseller Wholeness Collective'e ait,
      bize ait değil; benzer hissi orijinal kodla ürettim.
- [x] **Logo:** çerçevesiz sürüm onaylandı, `assets/logo-clean-candidate.png` olarak kullanımda.
- [ ] **WhatsApp numarası:** `index.html` içinde `wa.me/447000000000` placeholder — gerçek numarayı ver.
- [x] **Fotoğraf** (Çiğdem'in gerçek fotoğrafı) — `index.html` hero bölümü, `index.html` #hakkimda
      About teaser'ı VE `hakkimda.html`'deki 3 story-photo çerçevesinin hepsi gerçek fotoğraflarla
      dolduruldu (2026-07-26): `cigdem-hero-photo.png`, `cigdem-about-teaser.png`,
      `cigdem-about-childhood.png`, `cigdem-about-park.png`, `cigdem-about-training.png`. Servisler
      (`services-window-teaser.png`), Yaklaşım (`approach-tree-teaser.jpg`) ve Blog
      (`blog-quill-teaser.png`, 2026-07-26) teaser fotoğrafları da eklendi — `index.html`'deki
      tüm "Photo coming soon" placeholder'ları bitti (#iletisim teaser'ı zaten tamamen
      kaldırılmıştı, bkz. INTEGRASYON_TODO.md).
- [x] **E-posta:** şimdilik help@talkandheal.co.uk kullanılıyor (teyitli, sonra değişebilir)
- [ ] **Gelecek plan (2026-08-14, kullanıcı notu):** `cigdemtas@talkandheal.com` altyapısı
      kurulacak; WhatsApp bilgilendirme mailleri buraya yönlendirilecek, aynı e-posta diğer
      sosyal medya hesaplarında da görünür hale getirilecek. Henüz aksiyon alınmadı, ilgili
      aşama geldiğinde ele alınacak.
- [ ] **Rakip Analizi API hesabı (2026-08-14):** Anthropic + Google Places API key'leri
      Çiğdem'in kendi hesabı **`tascigdem1977@gmail.com`** üzerinden alınacak (test hesabı
      değil, baştan gerçek hesap — Phase 5 taşıma ihtiyacını bu özellik için ortadan kaldırır).
- [ ] **Fiyat & Bilgi sayfası gerçek verisi** (Ücretler/Ödeme/İptal Politikası — `pricing.html`
      içinde açıkça "TBD" etiketiyle işaretli, uydurma rakam konulmadı)
- [x] **İletişim formu** — `iletisim.html` bağımsız sayfası (Formspree placeholder'lı contact
      formu) 2026-07-26'da kullanıcı isteğiyle tamamen kaldırıldı, artık Formspree endpoint'ine
      gerek yok. Çiğdem'e ulaşmanın tek yolu booking akışı (randevu formu + iptal sayfasındaki
      WhatsApp/e-posta).

## ⚠️ KRİTİK: WhatsApp / Calendar / E-posta entegrasyonları — TEST hesabı → GERÇEK hesap geçişi

**Durum (2026-07-21):** WhatsApp, Calendar (randevu) ve E-posta entegrasyonları yapılacak.
Geliştirme/test aşamasında bu 3 servis **Selen'e (proje sahibi) ait test hesaplarıyla**
bağlanacak. Bunlar **kalıcı DEĞİL** — canlıya (production/yayın) almadan önce **Çiğdem Taş'ın
kendi WhatsApp numarası, kendi Calendar hesabı, kendi e-posta adresiyle** değiştirilmesi
ZORUNLU. Bu değişmeden siteyi yayına alma / müşteriyle paylaşma.

- [ ] **WhatsApp:** şu an test numarası kullanılıyor → Çiğdem'in gerçek WhatsApp iş numarasıyla
      değiştirilecek (mevcut placeholder zaten `wa.me/447000000000` idi, aşağıya güncel test
      numarası da eklenecek).
- [ ] **Calendar:** test hesabıyla kurulacak → Çiğdem'in kendi takvim hesabına (Google
      Calendar/Calendly, hangisi seçilirse) bağlanacak şekilde değiştirilecek.
- [ ] **E-posta:** test adresiyle kurulacak → Çiğdem'in gerçek iş e-postasıyla değiştirilecek
      (mevcut placeholder: help@talkandheal.co.uk, bu da teyitli değil, değişebilir).

**Yayına almadan önce (deploy/go-live) mutlaka:** yukarıdaki 3 madde tek tek kontrol edilip
Çiğdem'in gerçek hesap bilgileriyle değiştirildiği teyit edilmeden `git push`/deploy YAPILMAYACAK.
Bu kontrol her deploy öncesi hatırlatılacak (bkz. proje hafızası
`project_cigdem_tas_talk_and_heal.md` ve `feedback` notu).

## DevTools rehberi — palet/font çekmek için (adım adım)
1. https://www.wholenesscollectivetherapy.com/ adresini Chrome'da aç.
2. Bir başlık yazısına (örn. büyük bir bölüm başlığı) sağ tıkla → **İncele / Inspect**.
3. Açılan panelde sağ tarafta **Styles** sekmesinin yanındaki **Computed** sekmesine tıkla.
4. Computed panelinin üstündeki arama kutusuna `font-family` yaz, çıkan değeri kopyala.
5. Aynı arama kutusuna `color` yaz, çıkan değeri (hex/rgb) kopyala.
6. Şimdi sayfanın boş bir arka plan alanına (örn. bir bölüm arkaplanı) sağ tıkla → İncele,
   Computed'da `background-color` ara, değeri kopyala.
7. Bir buton varsa aynı işlemi buton için de yap (background-color + color).
8. Bu 4-5 değeri bana ilet (hangi elemandan aldığını da söyleyerek, örn. "h1 rengi: ...").

## DevTools ile localhost'ta kalıcı düzenleme (Workspace)
Rendered sayfada yazıya tıklayıp direkt yazamazsın çünkü statik HTML — ama Chrome DevTools'un
**Workspace** özelliğiyle dosyaları tarayıcı içinden düzenleyip diske kaydedebilirsin:
1. http://localhost:5173/index.html adresini Chrome'da aç, DevTools'u aç (Cmd+Option+I).
2. **Sources** sekmesine geç, sol tarafta **Filesystem** alt sekmesini bul (yoksa `>>` ikonundan aç).
3. **"+ Add folder to workspace"** → proje klasörünü seç:
   `/Users/selencelik/Desktop/PROJELER/cigdem-tas-talk-and-heal`
4. Chrome üstte izin ister, **Allow/İzin ver** de.
5. Artık soldaki dosya ağacında index.html, style.css vb. gerçek dosyalar görünür — üzerine
   tıklayıp doğrudan düzenleyebilir, **Cmd+S** ile diske kaydedebilirsin. Tarayıcıyı yenileyince
   (Cmd+R) değişikliği canlı görürsün.
6. Not: Elements panelinde bir yazıya çift tıklayıp anlık değiştirmek de mümkün ama bu SADECE
   o an için geçerli (sayfa yenilenince kaybolur) — kalıcı olması için Sources > Filesystem
   üzerinden düzenleyip kaydetmen gerekiyor.

## Kararlar / durum
- Marka: **Talk & Heal** korunuyor, Çiğdem Taş pratiğin sahibi/terapisti.
- Site, wholenesscollectivetherapy.com'un birebir klonu DEĞİL ama ona yakın, kendi
  özgünlüğünü koruyan bir yorum olacak (karar değişikliği — önceki "hiç klonlama" kararından
  yumuşatıldı).
- Sayfa haritası (nav davranışı, referans sitenin kendi deseni takip edilerek):
  - **Hakkımda** → index.html içinde `#about` anchor
  - **Servisler** → ayrı sayfa `services.html`
  - **Yaklaşım** → ayrı sayfa `approach.html` (referans sitede karşılığı yok, diğerlerine
    bakılarak tasarlandı)
  - **Fiyat & Bilgi** → ayrı sayfa `pricing.html`
  - **İletişim** → index.html içinde `#contact` anchor (WhatsApp ikon/link en altta)
  - Hero bölümü şimdilik kaldırıldı.
- Logo: talkandheal.co.uk'un kendi sunucusundan temiz (çerçevesiz) bir PNG bulundu
  (`assets/logo-clean-candidate.png`) — kullanıcı verdiği çerçeveli/render'lı görselin yerine
  bunu kullanmayı planlıyoruz, teyit bekleniyor.
- **Hatırlatma (kullanıcı isteği):** Uygun aşamada (UI/polish, deploy öncesi) siteye
  Sophie Hutchins'in "Billow Gently" kompozisyonuna benzer telifsiz bir müzik eklenmesi
  gündeme getirilecek.
- Yerel önizleme sunucusu: `python3 -m http.server 5173` (proje klasöründe) —
  http://localhost:5173/index.html — DevTools ile manuel inceleme/düzenleme için.
