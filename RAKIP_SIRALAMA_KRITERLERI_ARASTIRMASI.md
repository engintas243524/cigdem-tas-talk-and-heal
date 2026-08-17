# Rakip Sıralama Kriterleri Araştırması — Google'ın 60 Sonuç Seçimi + Yerel/Genel Rakip Değerlendirme Kriterleri (2026-08-17)

**Neden bu dosya var:** Kullanıcı, geniş yarıçaplı aramalarda Google'ın yüzlerce işletme arasından
hangi 60'ı döndürdüğünü sordu, ardından planlanan "Faz 3" (5 yerel + 5 genel rakip otomatik
sınıflandırma, bkz. `INTEGRASYON_TODO.md`) için somut/ölçülebilir kriter önerisi istedi — WASK
uygulaması + akademik/sektör kaynakları + Türkiye'deki meslek-etiği kısıtları dahil. Bu dosya sadece
**araştırma raporu**dur, kod içermez.

**2026-08-17 güncellemesi (Bölüm 8-12):** Kullanıcı bu araştırmayı iki katmanlı bir mimariye
genişletti — Parametre Seti 1 ("rakip BULMA/sıralama", 1-10 formül+ağırlıklandırma) ve Parametre
Seti 2 ("rakip ANALİZ", tek/çoklu rakip raporlaması için gruplu parametre seti). Kullanıcı bunu
Sparrow'da satılacak premium ürünlerin temeli olarak işaretledi — bu yüzden Bölüm 9-10'daki
formüller **kalibre edilmesi gereken başlangıç taslakları** olarak sunuluyor, "kesin bilim" olarak
değil (dürüstlük notu: sektörde de evrensel/kesin bir formül yok, bkz. Bölüm 9.1).

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

---

## 8. Arama limitini artırmak "ortalama veriye yakınsama"ya mı yol açar?

**Kısa cevap: Kullanıcının sezgisi doğru yönde, ama doğru terim "regresyona/ortalamaya yakınsama"
değil — bu iki AYRI, doğrulanmış kavramın birleşimi: (a) bilgi erişiminde (information retrieval)
"precision/recall dilution" ve (b) ekonomide "pazar tanımı" (market definition) hatası.**

**(a) Precision/Recall Dilution (bilgi erişimi literatürü):** Dönen aday havuzu (K) büyüdükçe
recall (gerçek rakipleri yakalama oranı) artar ama precision (dönen sonuçların ne kadarının GERÇEKTEN
alakalı olduğu) düşer — bu, arama/öneri sistemleri literatüründe iyi belgelenmiş bir örüntü. Güncel
araştırmalar bunu somut sayılarla gösteriyor: bazı yöntemlerde havuz büyüdükçe doğruluk **%79'a
kadar** göreceli düşüş gösterebiliyor, ve sabit precision'da recall, havuz büyüklüğüyle
**log-doğrusal** olarak bozuluyor. Bir çalışma, küçük/kürate edilmiş 200'lük bir havuzun büyük
havuzlara göre **3,1 kat** daha iyi performans verdiğini bulmuş.

**(b) Pazar Tanımı Hatası (ekonomi/rekabet hukuku literatürü):** Rekabet ekonomisinde "coğrafi pazar
tanımı" (SSNIP testi mantığı) tam olarak bu soruyu çözmeye çalışır: pazarı çok DAR tanımlarsanız
gerçek rakipleri kaçırırsınız, çok GENİŞ tanımlarsanız alakasız oyuncuları rakip sayıp **"rekabetin
durumu hakkında yanlış sonuçlara"** varırsınız (resmi AB Komisyonu kaynağı). Yarıçapı büyütmek,
tam olarak bu ikinci hataya (pazarı fazla geniş tanımlama) davetiye çıkarır.

**Sonuç — kullanıcının önermesi DOĞRULANDI (farklı terimle):** Arama yarıçapını/sonuç sayısını
SADECE artırmak (sıralama/filtreleme kriterini iyileştirmeden) gerçek rakip sinyalini
seyreltir — hem Çiğdem'in (kendi rakip listesini kalabalık, alakasız sonuçlarla doldurur) hem panel
kullanıcısının (Google'ın "relevance" sıralamasına, Çiğdem'in gerçek ihtiyacıyla birebir
örtüşmeyen bir sıralamaya, körü körüne güvenmiş olur) dezavantajına. **Bu yüzden harita altına bir
uyarı eklenmeli.**

**Önerilen uyarı metni (Türkçe, yalın, alarmcı olmayan taslak):**
> *"Geniş yarıçaplarda sonuç sayısı artar ama bu sonuçların size ne kadar yakın gerçek rakip
> olduğu değişkenlik gösterebilir — büyük listelerde hizmet türü ve konum uyumuna dikkat ederek
> seçim yapmanız önerilir."*

Bu uyarının **kesinleşmiş versiyonu**, Bölüm 9'daki Parametre Seti 1 (sıralama/filtreleme formülü)
gerçekten devreye girdiğinde gözden geçirilmeli — çünkü iyi bir sıralama formülü bu sorunu tamamen
çözmese de büyük ölçüde azaltır (precision'ı geri kazandırır). Formül olmadan sadece limit artırmak
riskli; formülle birlikte artırmak, riski kabul edilebilir kılar.

---

## 9. Parametre Seti 1 — "Rakip Bulma/Sıralama" formülü (1-10)

### 9.1 Dürüstlük notu — sektörde bile evrensel bir formül yok

Otelcilik sektörünün onlarca yıllık "competitive set" (rekabet kümesi) seçim metodolojisini
inceledim — bu, "hangi işletmeler gerçek rakibim" sorusuna en olgun, en yerleşik sektörel cevaptır.
Sonuç dürüst olmak gerekirse çarpıcı: *"there is no formal scoring system"* — sektör resmi bir
puanlama formülü kullanmıyor, bunun yerine **bağlamsal ağırlıklandırma** (segment/konum/fiyat
bandına göre nitel değerlendirme) kullanıyor. Bu, aşağıdaki formülün "kesin bilim" değil,
**kalibre edilmesi gereken bir başlangıç taslağı** olduğunu doğruluyor.

### 9.2 Aşama 1 — Dahil Etme (Inclusion) filtreleri — SKORLANMAZ, geçer/kalır

Skorlamadan ÖNCE, aday havuzunu daraltan sert filtreler (otel sektöründeki "segment/fiyat bandı
uyumu" karşılığı):

1. **Hizmet tipi eşleşmesi** — Places `types` alanı arama kategorisiyle örtüşmeli (zaten var).
2. **İşletme durumu** — `businessStatus !== CLOSED_PERMANENTLY` (kalıcı kapanmışsa havuza hiç
   girmemeli — bu alan şu an field mask'te yok, eklenmeli, bkz. Bölüm 5.4).
3. **Coğrafi sınır** — zaten var (`locationRestriction`).

### 9.3 Aşama 2 — Sıralama (Ranking) formülü — 1-10 skor

Yerel SEO sektör ağırlıklarını (Bölüm 3.1: GBP %32, sayfa-içi %19, yorum %16, backlink %15,
davranışsal %8, citation %7, kişiselleştirme %3) DOĞRUDAN kopyalamadım — onlar "Google'da nasıl
üst sıraya çıkarım" sorusuna cevap, bizim sorumuz "bu işletme gerçek/güçlü bir rakip mi". Ama
mantığı uyarladım: puan+yorum ağırlığı yüksek, çünkü rekabet gücünün en doğrudan kanıtı.

**Ortak formül (0-1 normalize edilmiş bileşenler, 10 ile çarpılır):**

```
Skor(1-10) = 10 × [
    0.30 × normalize(rating)                          // Google puanı (1-5 → 0-1)
  + 0.20 × normalize(log(userRatingCount + 1))         // yorum HACMİ, log-ölçek (10 yorum ile
                                                        //   1000 yorum arasındaki fark doğrusal
                                                        //   değil, azalan getiri var)
  + 0.20 × proximity_veya_erisim(tip)                  // bkz. aşağı, tipe göre değişir
  + 0.15 × profil_tamligi                              // website var mı + GBP alan doluluğu
  + 0.15 × tip_eslesme_ozguculugu                       // arama kategorisiyle ne kadar TAM eşleşiyor
                                                        //   (ör. "psikolog" araması "psikolog" type'ı
                                                        //   ile eşleşen, "genel sağlık merkezi"nden
                                                        //   daha özgül/yüksek puan alır)
]
```

**`proximity_veya_erisim(tip)` — YEREL ve GENEL için FARKLI hesaplanır (mimarinin can alıcı
noktası):**

- **Yerel tip:** `proximity_veya_erisim = 1 − (mesafe / yarıçap)` — merkeze ne kadar yakınsa o
  kadar yüksek. Yerel rekabetin doğası zaten mesafeye dayalı.
- **Genel tip:** `proximity_veya_erisim = erisim_proxy` — mesafe ÖNEMSİZ (genel rakip şehrin öbür
  ucunda ya da tamamen online olabilir); bunun yerine "genel erişim" sinyali kullanılır: web sitesi
  var mı (✅ otomatik) + adı geçen birden fazla şube/lokasyon var mı (⚠️ yarı-otomatik, Places'te
  aynı isim birden fazla kayıt olarak görülebilir) — bu, Bölüm 5.3'teki "çoklu platform/şube
  kapsamı" kriterinin formüle bağlanmış hali.

**Ağırlıkların kalibrasyonu için somut, ucuz bir yöntem:** Çiğdem'in ELLE eklediği (kaynak=`manuel`)
mevcut "Kayıtlı Rakipler" satırları zaten var — bunlar onun sezgisel olarak "gerçek rakip" dediği
işletkeler. Formül devreye girdiğinde, bu formülün Çiğdem'in elle eklediği rakiplere yüksek skor
verip vermediği kontrol edilerek ağırlıklar kalibre edilebilir (ücretsiz bir "ground truth" seti —
ayrı bir araştırma/anket gerektirmez).

---

## 10. Parametre Seti 2 — "Rakip Analiz" formülü (rapor/projeksiyon/hedef/realizasyon)

Bu set, Set 1'den TAMAMEN BAĞIMSIZ — zaten "rakip" olarak belirlenmiş bir işletmeyi derinlemesine
incelemek için. Modern rekabet istihbaratı (CI) pratiği ve SWOT/Porter'ın Beş Gücü çerçevelerinin
ortak paydası **5 boyut**: rakip araştırması, pazar analizi, kıyaslama (benchmarking), dijital
görünürlük, SWOT. Bunu Talk & Heal'e uyarlayıp **4 gruba** indirdim (kullanıcının istediği
"kendi içinde gruplandırma"):

### 10.1 Grup A — Hizmet Profili
Hizmet çeşitliliği (bireysel/çift/aile terapisi vb.), fiyatlandırma/paket yapısı (biliniyorsa),
uzmanlık alanları, seans formatı (yüz yüze/online/hibrit).

### 10.2 Grup B — Dijital Varlık
Web sitesi kalitesi/SEO, sosyal medya varlığı + **etkileşim oranı** (Bölüm 3.2'deki JMIR/PMC
bulgusu — takipçi sayısı değil), online randevu sistemi var mı.
**⚠️ Türkiye etik-kısıt hatırlatması (Bölüm 4):** Bu grupta yüksek skor = "güçlü rakip" değil,
özellikle psikiyatrist rakiplerde yüksek sosyal-medya-agresifliği aynı zamanda **etik/yasal risk
sinyali** olabilir — Set 2'nin raporunda bu grup asla "taklit edilecek başarı" olarak
sunulmamalı, nötr bir gözlem olarak sunulmalı.

### 10.3 Grup C — Yerel Erişim & İtibar
Google puanı/yorum hacmi+kalitesi, GBP profil tamlığı, fiziksel erişilebilirlik, personel
sayısı/klinik büyüklüğü (manuel).

### 10.4 Grup D — Değişim-Trend Sinyalleri
`businessStatus` değişimi (kapanma/taşınma tespiti — Faz 3'ün "yedek listeden terfi" tetikleyicisi
tam burada), yorum hacmindeki artış/azalış hızı (büyüme/küçülme proxy'si), yeni hizmet/paket
eklenmesi (web sitesi/GBP güncellemesi gözlemlenerek — manuel).

### 10.5 Tek vs Çoklu Rakip Modu — AYNI parametre seti, farklı sunum

- **Tek rakip:** 4 grup da tam anlatı (narrative) olarak işlenir — mevcut İçerik Stratejisi/Aksiyon
  Analizi rapor formatına birebir uyar.
- **Çoklu rakip:** Her grup, rakipler ARASI KARŞILAŞTIRMA tablosuna dönüşür (ör. Grup C'de "puan
  ortalaması", "en yüksek/en düşük" gibi) — kullanıcının notu doğru: parametre seti AYNI kalıyor,
  sadece gruplama iç sunumu tekil-anlatıdan çoklu-karşılaştırmaya dönüşüyor.

---

## 11. İki setin çoklu-rakip raporunda birleşimi

Kullanıcının tarif ettiği "ikinci katmanda birinci katmandan faydalanma" şöyle işler:

1. **Sıralama (Set 1):** Çoklu-rakip raporundaki rakipler, Set 1 skoruna göre GÜÇLÜDEN ZAYIFA
   sıralı listelenir (zaten Faz 3'ün 1-10 sıralamasıyla aynı skor, yeniden hesaplamaya gerek yok).
2. **Ağırlıklı özet (öneri):** Rapor sonundaki "genel eğilim" cümleleri (ör. "yerel rakipleriniz
   genelde X yapıyor") TÜM rakiplere eşit ağırlık vermemeli — Set 1 skorunu ağırlık olarak
   kullanarak en güçlü/en alakalı rakiplerin davranışı özet cümlede daha baskın olmalı (zayıf/
   marjinal bir rakibin tek başına genel eğilimi çarpıtmasını önler — Bölüm 8'deki dilution
   sorununun rapor-üretim aşamasındaki karşılığı).
3. **Bireysel + toplu birlikte:** Her rakip Grup A-D detayıyla ayrı ayrı listelenir (Set 2), AMA
   sıralama sırası ve "genel eğilim" ağırlıklandırması Set 1'den gelir — iki set birbirini
   TAMAMLAR, biri diğerinin yerine geçmez.

Bu, kod değil kavramsal bir akış önerisidir — gerçek implementasyon ayrı bir tasarım kararı.

---

## 12. Güncellenmiş sıradaki adım (öneri, kod değil)

1. `lib/places.ts` field mask'ine `rating`, `userRatingCount`, `businessStatus`, `websiteUri`
   ekle (Set 1'in 5 bileşeninden 3'ünün, Set 2 Grup C/D'nin veri temeli — tek değişiklik, çok
   fazla formülü aynı anda açar).
2. Set 1 formülünü (Bölüm 9.3) `rakipParametreSkor.ts`'e YENİ bir fonksiyon olarak ekle (mevcut
   skorlama sistemine dokunmadan) — Çiğdem'in mevcut manuel rakip listesiyle kalibre et
   (Bölüm 9.3'ün ücretsiz ground-truth önerisi).
3. Set 2'nin 4 grubunu (Bölüm 10.1-10.4) mevcut rapor prompt'larına (İçerik Stratejisi/Aksiyon
   Analizi) yapılandırılmış girdi olarak ekle — tek/çoklu ayrımı sadece SUNUM katmanında.
4. Bölüm 8'deki uyarı metnini, arama limiti gerçekten artırılmadan/Set 1 formülü devreye
   girmeden ÖNCE haritanın altına ekleme — limit zaten 60'a çıkarıldı (bkz. Bölüm 1), bu yüzden
   uyarı şimdiden eklenebilir, Set 1 formülü gelince metni güncellemek yeterli.
5. Görsel/Video Stratejisi için AYNI ikili mimari (Set 1 + Set 2 mantığı) — bu rapor kapsamında
   DEĞİL, ayrı bir derinlemesine araştırma turu gerektiriyor (kullanıcı bunu ayrı, sonraki bir
   iş olarak işaretledi).
