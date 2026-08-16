# Talk and Heal — Tam Kapsamlı Aylık/Yıllık Gider ve Marj Tablosu (Çiğdem için, güncellendi 2026-08-17)

Bu tablo iki bölümden oluşuyor: (1) şu an aktif kullanılan araçların **gerçek/ölçülmüş**
maliyeti, (2) planlanan gelecek özelliklerin (video edit, otomatik paylaşım, linktree benzeri
yapı) maliyete etkisi. **Vergi ve gelir-bağımlı satırlar (marj) için gerçek rakam yok** — uydurma
rakam koymadım, bunlar açıkça "TBD" (belirlenecek) işaretli. Sebebini her satırda açıklıyorum.

## Bölüm 1 — Şu an aktif olan araçlar (kalem kalem)

| Gider kalemi | Ne işe yarıyor | Aylık | Yıllık | Kaynak/Not |
|---|---|---|---|---|
| Yapay zeka rapor üretimi (Claude/Anthropic) | Rakip Analizi raporları (Görsel/Video Stratejisi + Aksiyon/Hedef Analizi) | ~2-3 $ (üst sınır 5 $) | ~24-36 $ (üst sınır 60 $) | Gerçek ölçüm, `MALIYET_ANALIZI_GORSEL_VIDEO_STRATEJISI.md` |
| Google Haritalar (rakip arama/adres bulma) | Rakip Analizi'nde rakip aramak için | 0 $ | 0 $ | Ücretsiz kullanım sınırının çok altında |
| YouTube trend araması | Video trend verisi (planlanan, henüz eklenmedi) | 0 $ | 0 $ | Google resmi kota: günde 10.000 ücretsiz sorgu hakkı |
| talkandheal.uk (yedek domain) | IONOS hesabı açmak için alındı | — | ilk yıl 1 £, sonra ~10 £ | Gerçek satın alma fiyatı |
| Site barındırma (GitHub Pages) | Ana site (talkandheal.co.uk) | 0 $ | 0 $ | Ücretsiz hizmet |
| Arka plan sunucusu (Cloudflare Workers) | Randevu/ödeme/panel sistemi | 0 $ | 0 $ | Ücretsiz kullanım sınırı (günde 100.000 istek), sitenin ihtiyacının çok üzerinde |
| **Ara toplam (Bölüm 1)** | | **~2-3 $ + yaklaşık 1 £ (ilk yıl)** | **~24-36 $ + ~10 £/yıl (2. yıldan itibaren)** | |

## Bölüm 2 — Kullanım bazlı, gelire bağlı kalemler (rakam formülü var, tam £ değeri Çiğdem'in gerçek işlem hacmine bağlı)

| Gider kalemi | Oran (resmi, doğrulandı) | Aylık/Yıllık £ | Neden tam rakam yok |
|---|---|---|---|
| Stripe (ödeme komisyonu) | UK kartı: **%1.5 + 20p**/işlem. Aylık sabit ücret YOK. | Formül: (aylık randevu sayısı) × (seans ücreti × %1.5 + 0.20£) | Çiğdem'in aylık randevu adedi + seans ücreti (pricing.html'de hâlâ "TBD") belli değil |
| WhatsApp Business API (randevu bildirimleri) | Yapı doğrulandı: kod `sendTemplate` ile önceden onaylı "utility" şablon kullanıyor (bkz. `lib/whatsapp.ts`) — bu, işletmenin başlattığı bir mesaj olduğu için Meta'nın "24 saat içi ücretsiz" istisnasına muhtemelen GİRMİYOR (o istisna müşterinin kendi mesajıyla açtığı pencere içindir) | Yapı: (aylık randevu sayısı) × (mesaj başına £ oranı) × (randevu başına ~2-3 mesaj: onay+hatırlatma) | Meta'nın UK'ye özel £/mesaj oranı sadece indirilebilir bir CSV rate card'da, otomatik erişemedim — `developers.facebook.com/docs/whatsapp/pricing`'den manuel indirilmeli |
| **Ara toplam (Bölüm 2)** | | **Hesaplanamaz — girdi eksik** | Randevu hacmi + seans ücreti + WhatsApp rate card gerekiyor |

## Bölüm 3 — Planlanan gelecek özellikler (henüz inşa edilmedi, mimari kararı yok)

| Özellik | Planlanan yaklaşım | Beklenen maliyet etkisi |
|---|---|---|
| Video edit | Sparrow'un kendi editörü (OpenCut açık kaynak motoru, kendi altyapımızda) | Muhtemelen $0 marjinal (kendi sunucumuzda çalışıyor, dışarıya ödenen bir API yok) — ama bu HENÜZ inşa edilmedi, kesin rakam veremem |
| Otomatik sosyal medya paylaşımı | Sparrow'un kendi entegrasyonu (planlı) | Platformların resmi paylaşım API'leri (Instagram/TikTok Graph API vb.) genelde ücretsiz kota sunuyor — ama hangi platformlar/hangi hacim henüz netleşmedi |
| Linktree benzeri yapı | Kendi statik sayfamız (GitHub Pages/Cloudflare, mevcut altyapı) | $0 — zaten ücretsiz barındırdığımız altyapıyla aynı yerde çalışır |

**Önemli:** Bu üç özellik için "kesin rakam" vermiyorum çünkü hiçbiri henüz mimari kararı
verilmiş/inşa edilmiş değil — uydurma bir sayı koymak yanıltıcı olur. Genel eğilim: hepsi kendi
altyapımızda (Sparrow/Cloudflare) çalışacağı için marjinal maliyetleri muhtemelen düşük/sıfıra
yakın olacak, tıpkı Bölüm 1'deki mevcut $0'lık kalemler gibi. Mimari netleşince bu bölüm
güncellenecek.

## Vergi

**TBD — hesaplanamaz.** Vergi, Çiğdem'in gerçek gelir düzeyine, işletme yapısına (şahıs
şirketi/limited vb.) ve İngiltere'deki güncel vergi dilimine bağlı — bunlar elimde yok ve
tahminle bir rakam koymak yanlış/yanıltıcı olur. **Bu satır için bir muhasebeciye danışılması
gerekiyor**, ben bir vergi uzmanı değilim ve resmi bir kaynaktan doğrulanmamış bir rakam
vermeyeceğim.

## Brüt/Net Marj

**Hesaplanamaz — gelir rakamı eksik.** Marj = Gelir − Gider. Gider tarafının bir kısmını (Bölüm 1)
kesin biliyoruz, bir kısmını (Bölüm 2) formülle biliyoruz ama girdi eksik, vergiyi bilmiyoruz.
Gelir tarafında ise `pricing.html` içinde seans ücreti hâlâ açıkça "TBD" olarak işaretli (bkz.
`NOTES.md`). **Gerçek bir marj rakamı üretebilmemiz için önce Çiğdem'den şunlar gerekiyor:**
1. Seans ücreti (kaç £)
2. Aylık ortalama randevu/seans sayısı
3. İşletme yapısı (vergi hesabı için)

Bu üçü gelirse, formülü hazır (yukarıdaki Bölüm 2), marjı gerçek rakamlarla dakikalar içinde
hesaplarız.

## Toplam Maliyet (şu an hesaplanabilen kısım)

| | Aylık | Yıllık |
|---|---|---|
| **Kesin bilinen (Bölüm 1)** | ~2-3 $ (+ ilk yıl 1 £ domain) | ~24-36 $ (+ ~10 £/yıl domain 2. yıldan) |
| **Gelire bağlı (Bölüm 2 — Stripe + WhatsApp)** | Hesaplanamaz (girdi eksik) | Hesaplanamaz (girdi eksik) |
| **Vergi** | Hesaplanamaz (muhasebeci gerekli) | Hesaplanamaz (muhasebeci gerekli) |
| **Gelecek özellikler (Bölüm 3)** | Muhtemelen ~$0, kesinleşmedi | Muhtemelen ~$0, kesinleşmedi |

**Dürüst özet:** Şu anki sabit/ölçülebilir maliyetiniz ayda birkaç dolar (2-3$) — çok küçük.
Toplam gerçek maliyeti ve marjı görmek için eksik olan tek şey Çiğdem'in gerçek randevu
hacmi/fiyatı ve vergi durumu — bunlar gelince tablo tamamlanır.
