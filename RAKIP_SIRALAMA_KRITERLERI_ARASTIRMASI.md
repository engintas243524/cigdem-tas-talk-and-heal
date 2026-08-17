# Rakip Sıralama Kriterleri Araştırması — Google'ın 60 Sonuç Seçimi + Yerel/Genel Rakip Değerlendirme Kriterleri (2026-08-17)

**Neden bu dosya var:** Kullanıcı, geniş yarıçaplı aramalarda Google'ın yüzlerce işletme arasından
hangi 60'ı döndürdüğünü sordu, ardından planlanan "Faz 3" (5 yerel + 5 genel rakip otomatik
sınıflandırma, bkz. `INTEGRASYON_TODO.md`) için somut/ölçülebilir kriter önerisi istedi — WASK
uygulaması + akademik/sektör kaynakları + Türkiye'deki meslek-etiği kısıtları dahil. Bu dosya sadece
**araştırma raporu**dur, kod içermez.

---

## 1. Google Text Search (New), 60 sonucu hangi kritere göre seçiyor?

**Kısa cevap: Google buna "relevance" (alaka/prominence) diyor ama bu skorun içindeki ağırlıkları
resmen açıklamıyor — kısmen dokümante, kısmen kara kutu.**

Resmi dokümantasyondan (`developers.google.com/maps/documentation/places/web-service/text-search`)
doğrulanan noktalar:

- **`rankPreference` parametresi var**, iki değer alıyor: `RELEVANCE` ve `DISTANCE`.
- **Varsayılan davranış**: "market", "psikolog" gibi kategorik sorgular için varsayılan
  `RELEVANCE`'tır (dokümantasyondaki örnek birebir "Restaurants in New York City" — bizim
  `sorgu` parametremizle (`market`, `psikolog`, `terapi merkezi`) aynı kategori). **Bizim
  `lib/places.ts` kodumuz `rankPreference` hiç göndermiyor — yani şu an sessizce
  `RELEVANCE` varsayılanını kullanıyoruz**, rastgele değil.
- **"Relevance" tam olarak neyden oluşuyor, Google söylemiyor.** Dokümantasyondaki tek somut
  cümle: *"The API returns candidate matches based on this string and orders the results based
  on their perceived relevance."* Puan/yorum sayısı/mesafe/açılış saatleri gibi faktörlerin
  ağırlıkları resmen yayınlanmamış — bu, Google Arama'nın kendi sıralama algoritması gibi kısmen
  ticari sır.
- **`locationRestriction` (bizim kullandığımız dikdörtgen sınır) bir FİLTRE, bir "öncelik verme"
  değil** — alan dışındaki sonuçlar hiç dönmüyor, ama alan İÇİNDEKİ yüzlerce sonuçtan hangi 20/60
  tanesinin seçileceğini "relevance" belirliyor.

**Sonuç:** Rastgele DEĞİL — Google'ın kendi (kısmen kapalı) alaka/önem skoruna göre en "öne çıkan"
60 işletme geliyor. Bu, muhtemelen puan, yorum sayısı/kalitesi, işletme profilinin tamlığı ve
büyük ihtimalle mesafeyi birlikte ağırlıklandıran bir skor — ama kesin formül yayınlanmamış.
**Pratik sonucu:** Geniş yarıçapta (20.000m gibi) yüzlerce rakip varsa, Google'ın döndürdüğü 60,
muhtemelen zaten "öne çıkan" (yüksek puanlı/çok yorumlu/profili dolu) işletmelere ağırlık veriyor
— ama bu bizim "yerel" ya da "genel" tanımımızla BİREBİR ÖRTÜŞMÜYOR (Google'ın "relevance"i kendi
arama motoru başarısını optimize ediyor, Çiğdem'in rekabet analizi ihtiyacını değil). Bu yüzden
60 sonuç, ikinci sorunuz için **iyi bir başlangıç havuzu** ama kendi başına yeterli bir sıralama
değil — kendi kriterlerimizle bu havuzu (ya da gerekirse daha geniş bir havuzu, örn. grid-tarama
ile) yeniden puanlamamız gerekiyor.

---

## 2. WASK — ilham var mı?

[WASK](https://www.wask.co) ([SelectHub incelemesi](https://www.selecthub.com/p/digital-advertising-software/wask-co/),
[Capterra](https://www.capterra.com/p/215384/WASK/)), **reklam HARCAMASI verimliliğini** optimize
eden bir araç — organik/yerel rakip keşfi yapmıyor. Temel metrikleri: Spend, Impressions, CTR,
Clicks, CPC, CPM + 400'den fazla özel KPI; Google/Facebook/Instagram/LinkedIn/Twitter reklam
hesaplarını tek ekranda birleştiriyor; "Creative Analyze" ile hangi görsel/video reklamın daha iyi
performans gösterdiğini karşılaştırıyor.

**"Yerel vs genel işletme" gibi bir ayrımı YOK** — WASK tamamen ÜCRETLİ reklam performansı için,
organik/rakip analizi için tasarlanmamış. Yine de iki fikir alınabilir:

1. **"Ham sayı yerine oran" prensibi** — WASK, "kaç kişi gördü" yerine "kaç kişi tıkladı/etkileşti"
   (CTR gibi oranlar) öne çıkarıyor. Bu, aşağıdaki kriter önerimizde de aynen uygulanacak: takipçi
   SAYISI yerine etkileşim ORANI.
2. **"Creative Analyze" (içerik kalitesi karşılaştırması)** fikri — rakibin paylaşım SIKLIĞI kadar
   paylaşım KALİTESİ/çeşitliliği de bir sinyal olabilir (aşağıda "genel" kriterlerine eklendi).

WASK kendi başına doğrudan uygulanabilir bir kriter seti vermiyor; asıl kriter kaynağı aşağıdaki
akademik/sektör kaynakları oldu.

---

## 3. Akademik/sektör kaynakları

### 3.1 Yerel rekabet — "Local Pack" sıralama faktörleri (sektör konsensüsü)

[Local SEO Ranking Factors](https://www.clickrank.ai/local-seo-ranking-factors/) ve
[Search Atlas'ın sektör-bazlı analizi](https://searchatlas.com/blog/local-seo-ranking-factors-by-industry/)'ne
göre (Whitespark/Moz tarzı yıllık sektör anketlerinin sentezi — akademik değil ama SEO
endüstrisinin en çok atıf yapılan kaynak türü), yerel arama sıralamasında ağırlıklar şöyle:

| Faktör grubu | Ağırlık |
|---|---|
| Google Business Profile (GBP) sinyalleri | %32 |
| Sayfa-içi (web sitesi) sinyalleri | %19 |
| Yorum sinyalleri (puan + metin + hacim) | %16 |
| Bağlantı (backlink) sinyalleri | %15 |
| Davranışsal sinyaller (tıklama, arama hacmi) | %8 |
| Referans/dizin (citation) tutarlılığı | %7 |
| Kişiselleştirme | %3 |

Ayrıca: *"Proximity is the strongest overall driver of local Google rankings, while reviews and
relevance determine competitive advantage."* — yani mesafe zaten Google'ın kendi filtrelemesinde
var, rekabet gücünü asıl AYIRAN şey puan/yorum kalitesi.

### 3.2 Genel (sosyal medya) etkinliği — akademik kaynak

[JMIR (Journal of Medical Internet Research) 2025 — sosyal medya kampanyalarının ruh sağlığı
farkındalığına etkisi üzerine kapsam taraması](https://www.jmir.org/2025/1/e68124) (26 çalışmanın
sistematik incelemesi, hakemli akademik dergi): kampanya etkinliği ölçümünde kullanılan
metrikler **exposure (erişim), reach, ve düşük/orta/yüksek ETKİLEŞİM** kategorileri — ham
takipçi sayısı değil.

Destekleyici: [PMC — sosyal medya gönderilerinde kullanıcı etkileşimini etkileyen unsurlar üzerine
sistematik derleme](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11624458/): *"User engagement
metrics provide a quantifiable representation of users' interactions... high user engagement
indicating resonance between posts and audience interests."* — nicel analiz (beğeni/yorum/paylaşım
oranı) NİTEL analizle (yorumların tonu) birlikte değerlendirilmeli deniyor.

**Bu iki kaynağın ortak sonucu:** "genel" rakip gücünü ölçerken takipçi SAYISI yanıltıcı bir
metrik — asıl anlamlı olan **etkileşim oranı** (beğeni+yorum+paylaşım / takipçi sayısı) ve
**içerik sıklığı/tutarlılığı**.

---

## 4. Türkiye'ye özgü kısıt: meslek etiği/reklam yasağı (KRİTİK)

Bu nokta, "genel" kriterlerin doğrudan uygulanmasını **imkansız kılmıyor ama anlamını
değiştiriyor** — mutlaka rapora eklenmesi gerekiyordu:

### Psikolog (Türk Psikologlar Derneği — dernek düzeyinde etik kural)

[TPD Etik Yönetmeliği özeti](https://www.coby.agency/blog/psikologlar-reklam-verebilir-mi/):
*"Psikologlar hizmetlerini tanıtırken yanıltıcı, abartılı veya KARŞILAŞTIRMALI ifadelerden
kaçınmalı... Temel kural değişmedi: **talep yaratıcı her faaliyet yasak**."* Bilgilendirme
sınırını aşan her tanıtım "reklam" sayılıp disiplin cezasına (kınama → uyarma → üyelikten
çıkarma) tabi. Bu, gönüllü dernek üyeliğine bağlı bir kural — TPD üyesi olmayan bir psikolog
için doğrudan bağlayıcı değil ama mesleki itibar açısından hâlâ risk.

### Psikiyatrist (devlet/yasa düzeyinde, çok daha sıkı)

Psikiyatristler hekim olduğu için TTB + Sağlık Bakanlığı mevzuatına tabi — bu artık dernek
etiği değil, **kanun**: *Sağlık Hizmetlerinde Tanıtım ve Bilgilendirme Yönetmeliği (2023)*,
*Tıbbi Deontoloji Tüzüğü (1928/1960)*, *1219 Sayılı Tababet Kanunu*, *6023 Sayılı TTB Kanunu*
([kaynak özet](https://kadimhukuk.com.tr/makale/saglikta-reklam-yasagi-cezalari/)). *"Yazılı ve
görsel basın ile internet siteleri ve sosyal medyada... tanıtım kurallarını ihlal eden, reklam
niteliğinde yayınlar"* disiplin cezası gerektiriyor — sosyal medya paylaşımları da aynı kurala
tabi.

**Bunun kriterlere etkisi:** Bir rakibin sosyal medyada çok agresif/karşılaştırmalı/"talep
yaratıcı" içerik üretmesi, WASK gibi bir e-ticaret bağlamında "güçlü rakip" sinyali olurdu — ama
Talk & Heal'in sektöründe bu, **rakibin kendi etik/yasal riskini gösteren bir sinyal olabilir**,
mutlaka kopyalanacak bir başarı göstergesi değil. Bu yüzden aşağıdaki "genel" kriter setinde
**içerik SIKLIĞI/ERİŞİMİ ölçülüyor ama içerik TONU/agresifliği ayrı, dikkatli bir gözlem notu
olarak** tutulmalı — otomatik "yüksek skor = taklit et" mantığına asla bağlanmamalı.

---

## 5. Talk & Heal için önerilen somut kriterler

Her kriterin yanında **ölçülebilir mi** ve **hangi veri kaynağından geliyor** etiketi var —
bu, "otomatik/API ile şu an ölçülebilir" ile "manuel gözlem gerektirir" ayrımını netleştiriyor.

### 5.1 Ortak kriterler (hem yerel hem genel sıralamada geçerli)

| Kriter | Ölçülebilir mi | Kaynak |
|---|---|---|
| Google puanı (rating) | ✅ Otomatik | Places API (`rating` alanı — şu an field mask'imizde YOK, eklenmeli) |
| Yorum sayısı | ✅ Otomatik | Places API (`userRatingCount` — şu an çekilmiyor, eklenmeli) |
| İşletme durumu (açık/kapalı/taşınmış) | ✅ Otomatik | Places API (`businessStatus`: OPERATIONAL/CLOSED_TEMPORARILY/CLOSED_PERMANENTLY — düşme tespiti için doğrudan kullanılabilir) |
| Web sitesi var mı/güncel mi | ⚠️ Yarı-otomatik | Places API `websiteUri` alanı var/yok kontrolü otomatik, güncellik manuel |
| Hizmet türü uyumu (psikolog/psikiyatrist/danışmanlık) | ✅ Otomatik | Places API `types` alanı + arama sorgusuyla eşleşme |

### 5.2 Yerel'e özgü kriterler

| Kriter | Ölçülebilir mi | Kaynak |
|---|---|---|
| Mesafe (Çiğdem'in konumuna yakınlık) | ✅ Otomatik | Zaten hesaplıyoruz (arama merkezinden lat/lng farkı) |
| GBP profil tamlığı (fotoğraf, çalışma saati, telefon, adres tam mı) | ✅ Kısmen otomatik | Places API'nin döndürdüğü alan sayısı sayılabilir (Place Details ile daha zengin — ek maliyet) |
| Fiziksel erişilebilirlik (metro/otobüs yakınlığı, otopark) | ❌ Manuel | Places API'de yok, gözlemle not edilmeli |
| Personel sayısı / klinik büyüklüğü | ❌ Manuel | Places API'de YOK — web sitesi taraması veya elle gözlem gerekir |
| Yerel etkinlik/işbirliği görünürlüğü (seminer, panel, kurum işbirliği) | ❌ Manuel | Hiçbir otomatik kaynak yok — bu, orijinal Faz 3 notundaki tanımdı, gerçekten ölçülemez |

### 5.3 Genel'e özgü kriterler

| Kriter | Ölçülebilir mi | Kaynak |
|---|---|---|
| Sosyal medya varlığı (Instagram/LinkedIn en anlamlı — bu sektörde YouTube/TikTok daha nadir) | ⚠️ Yarı-otomatik | Places API `websiteUri`/harici linkler bazen sosyal hesaba çıkar; asıl veri için ayrı bir sosyal medya API entegrasyonu gerekir (şu an YOK) |
| Takipçi sayısı YERİNE etkileşim oranı | ❌ Manuel/ayrı entegrasyon | Instagram/LinkedIn resmi API'leri (Graph API vb.) gerekir — şu an mimaride yok, JMIR/PMC kaynaklarına göre bu zaten daha doğru metrik |
| İçerik sıklığı (haftada kaç paylaşım) | ❌ Manuel/ayrı entegrasyon | Aynı, sosyal medya API'si gerekir |
| Çoklu platform/şube kapsamı (birden fazla ilçe/il, online seans sunuyor mu) | ⚠️ Yarı-otomatik | Places API'de aynı isimli birden fazla şube görülebilir; "online seans" bilgisi web sitesi taramasıyla |
| İçerik tonu/agresifliği (dikkat notu, skorlanmaz) | ❌ Manuel, SADECE gözlem | Bkz. Bölüm 4 — etik risk göstergesi, "iyi" sinyali değil |

### 5.4 Mimari gerçeklik özeti

**Şu an otomatik/API-only olarak güvenilir şekilde ölçülebilenler:** puan, yorum sayısı, mesafe,
işletme durumu (açık/kapalı), tip eşleşmesi, web sitesi var/yok. **Bunların hepsi zaten Google
Places API'den geliyor ama bizim kodumuz şu an SADECE isim/adres/lat-lng çekiyor** — `rating`,
`userRatingCount`, `businessStatus`, `websiteUri` field mask'e eklenmeli (ek maliyet yok, aynı
çağrının içinde ek alan istemek ücretsiz).

**Sosyal medya tabanlı "genel" kriterlerin hiçbiri şu an otomatik değil** — bunlar için ya (a)
manuel gözlem/not akışı (Çiğdem'in kendi girdiği bir alan), ya (b) ayrı bir sosyal medya API
entegrasyonu (Instagram Graph API vb., yeni bir mimari karar ve muhtemel maliyet) gerekiyor.
"Yerel etkinlik/işbirliği" ve "personel sayısı" da aynı şekilde tamamen manuel kalacak.

---

## 6. Sektöre göre farklılaşma

- **Psikolog:** TPD'nin gönüllü dernek etiği bağlayıcı — reklam/karşılaştırma sınırlı ama devlet
  düzeyinde bir ceza mekanizması yok, sosyal medya varlığı nispeten daha rahat.
- **Psikiyatrist:** Kanun düzeyinde (TTB + Sağlık Bakanlığı) çok daha sıkı reklam yasağı —
  "genel" kriterlerdeki sosyal medya aktifliği bu grup için hem daha nadir görülür hem de
  yüksek skor aldığında ekstra dikkatle (muhtemel ihlal olarak) değerlendirilmeli.
- **Genel danışmanlık/koçluk (psikolog/psikiyatrist unvanı olmayan):** Bu meslek örgütü
  kurallarına tabi değil — bu yüzden bu grup rakiplerin "genel" skorları muhtemelen sistematik
  olarak daha yüksek çıkacak (daha agresif pazarlama yapabiliyorlar). Sıralama yaparken bu
  gruplar arası **karşılaştırma yapılmamalı** — psikolog rakip havuzu, psikiyatrist rakip havuzu
  ve danışmanlık rakip havuzu ayrı ayrı değerlendirilmeli, aksi halde etik kısıtı olmayan
  danışmanlar sistematik olarak "daha güçlü rakip" gibi görünüp yanıltıcı bir sıralama çıkar.

---

## 7. Sıradaki adım (öneri, kod değil)

1. `lib/places.ts`'in field mask'ine `rating`, `userRatingCount`, `businessStatus`, `websiteUri`
   ekle — bu, otomatik ölçülebilen 6 ortak/yerel kriterin veri temelini kurar, ek maliyeti yok.
2. Manuel kriterler (personel sayısı, yerel etkinlik görünürlüğü, sosyal medya etkileşimi) için
   Çiğdem'in rakip ekleme formuna opsiyonel not alanları eklenmesi düşünülebilir — bunlar
   otomatikleştirilemez, ama en azından KAYDEDİLEBİLİR olmalı ki 1-10 sıralamasına dahil edilsin.
3. Sosyal medya API entegrasyonu (Instagram Graph API vb.) ayrı bir mimari/maliyet kararı — bu
   rapor kapsamında ÖNERİLMİYOR, sadece "genel" kriterlerinin sosyal medya kısmının bugün
   otomatikleştirilemediği açıkça not ediliyor.
4. Meslek grubuna göre (psikolog/psikiyatrist/danışmanlık) ayrı havuzlarda sıralama yapılması,
   Bölüm 6'daki etik-kısıt farkını hesaba katmanın tek güvenilir yolu.
5. Bu kriterlerin gerçek 1-10 sıralama formülüne (ağırlıklandırma) dönüştürülmesi ve
   `rakipParametreSkor.ts`'e nasıl bağlanacağı — ayrı bir tasarım/plan konuşması gerektirir,
   bu rapor sadece kriterleri belirliyor, ağırlıkları/formülü değil.
