# Görsel/Video Stratejisi Kriterleri Araştırması — İçerik/Trend Bulma-Sıralama + Değerlendirme Formülleri (2026-08-17)

**Neden bu dosya var:** `RAKIP_SIRALAMA_KRITERLERI_ARASTIRMASI.md`'de Rakip Analizi için kurulan
iki katmanlı mimari (Parametre Seti 1 "Bulma/Sıralama" + Parametre Seti 2 "Analiz") kullanıcı
tarafından Görsel/Video Stratejisi (icerikStrateji) özelliğine de uygulanması istendi — Sparrow'da
satılacak premium ürünlerin temeli olarak "AŞIRI ÖNEMLİ" işaretlendi. Bu dosya, o raporla AYNI
derinlik/formatta, YouTube'un resmi dokümantasyonu, VidIQ/TubeBuddy/Google Trends/GitHub'ın gerçek
(disclosed) skorlama pratikleri ve 2024-2026 akademik kaynaklar taranarak yazıldı. **Sadece araştırma
raporudur, kod içermez.**

---

## 1. Mevcut sistem özeti — ne yapıyor, ne yapmıyor

`form-backend/src/routes/rakipAnalizi.ts`'deki `ICERIK_STRATEJI_SYSTEM_PROMPT` + `handleIcerikStrateji`:

- Claude'un native web arama aracını (`web_search_20250305`, 2-4 hedefli arama) kullanıyor —
  "terapi/danışmanlık/ruh sağlığı sektöründe son birkaç aydaki görsel/video içerik trendlerini"
  araştırıyor.
- **Rakip içeriği ASLA kopyalanmaz** — sadece stratejiden (platform/sıklık/format) ilham alınır,
  orijinal/AI-üretilmiş öneriler sunulur.
- **YAPILANDIRILMIŞ bir trend-verisi kaynağı YOK.** Web arama Claude'un kendi muhakemesiyle
  serbest metin sonuçlarını yorumluyor — Rakip Analizi'ndeki Google Places API gibi sayısal
  alanlara (puan, yorum sayısı, mesafe) sahip bir API entegrasyonu burada YOK.
- YouTube Data API v3 (ücretsiz, günde 10.000 unit — `MALIYET_ANALIZI_GORSEL_VIDEO_STRATEJISI.md`'de
  doğrulandı) **planlandı ama henüz entegre edilmedi.** Bu, aşağıdaki Set 1'in "gerçek sayısal
  formül" olup olamayacağını doğrudan etkiliyor (bkz. Bölüm 7).

**Bu, Rakip Analizi'nden mimari olarak önemli bir farkı ortaya koyuyor:** Rakip Analizi'nde Set 1
gerçek API alanları üzerinden HESAPLANABİLEN bir formüldü. Burada, structured bir veri kaynağı
kurulana kadar Set 1 bir **PROMPT REHBERİ** (Claude'un web arama sonuçlarını nasıl
değerlendireceğine dair yapılandırılmış talimat) olarak uygulanabilir — sayısal bir formül değil.
Bu fark raporun her yerinde açıkça işaretlendi, gizlenmedi.

---

## 2. Görev A — Parametre Seti 1: "İçerik/Trend Bulma-Sıralama" formülü

### 2.1 YouTube'un resmi sinyalleri (support.google.com/youtube/answer/16533387)

İki ana kategori resmen açıklanıyor:
- **Viewer Personalization** — izleyicinin izleme geçmişi + "interest affinity" (beğendiği
  tema/konu/format).
- **Content Performance** — *"how well the video performs when it's offered to viewers, like
  whether they choose to click, watch, or positively engage."*
- **2026 güncellemesi (kritik):** "satisfaction" artık ham izlenme süresinin ÜSTÜNDE birincil
  kalite sinyali — video-sonrası anketler, tekrar ziyaretler. Yani **"kaç kişi izledi" tek başına
  yeterli değil, "izleyenler memnun kaldı mı" daha önemli.**

Bu, YAYINLANMIŞ bir videonun BAŞARISINI ölçüyor — bizim ihtiyacımız (yayından ÖNCE hangi konu/
formatın denemeye değer olduğunu bulmak) için dolaylı bir kaynak, ama "başarı neye benziyor"
sorusuna resmi bir cevap veriyor: retention/memnuniyet > ham izlenme > tıklama/beğeni/yorum.

### 2.2 VidIQ/TubeBuddy'nin gerçek (disclosed) "Fırsat Skoru" mantığı

TubeBuddy'nin Keyword/Opportunity Score'u **Arama Hacmi + Rekabet + Optimizasyon/Kanal Otoritesi**
üzerine kurulu; VidIQ'nun Keyword Score'u da benzer şekilde **rekabet yoğunluğu**na dayanıyor.
Bu, gerçek bir ticari üründe **"bu konuyu şimdi denemeye değer mi"** sorusuna verilen somut,
disclosed bir cevap — Rakip Analizi'ndeki otelcilik "competitive set" örneğinin buradaki karşılığı.

### 2.3 Google Trends'in resmi normalizasyon yöntemi (support.google.com/trends/answer/4365533)

Ham arama sayısı değil, **o dönemin/bölgenin TOPLAM aramasına oranı** kullanılıyor, en yüksek
dönem 100 kabul edilip diğerleri buna göre indekslenir. **Bu, "oran, ham sayı değil" prensibinin
(WASK'tan, önceki raporda) bir başka doğrulanmış örneği.**

### 2.4 GitHub'ın gerçek trend mantığı + açık kaynak bir örnek formül

GitHub'ın trending algoritması ham yıldız sayısını değil, **mevcut hızın kendi TARİHSEL
ORTALAMASINA göre ne kadar yüksek olduğunu** kullanıyor (günde 2 yıldız alan bir repo 10 yıldız
alınca, günde 50 alan 60 almaktan daha "trend" sayılır) — **velocity-vs-baseline**, ham sayı değil.

Açık kaynak bir örnek (`trend-pulse` projesi, GitHub) gerçek/disclosed bir ağırlıklı formül
kullanıyor: Engagement Trigger %25, Conversation Durability %20 (72 saatlik pencere), Velocity
Potential %15, Format Score %15 (+ kalan bileşenler) — harf notlarına (S/A/B/C/D) dönüştürülüyor.
**Bu, tam olarak istediğimiz türde bir formülün gerçek dünyada var olduğunun kanıtı.**

### 2.5 Akademik dürüstlük notu (Rakip raporundaki Bölüm 9.1'in karşılığı)

Nature Scientific Reports (2024, hakemli, 1000+ Avrupa haber kanalının 2018-2023 zaman serisi
analizi): *"most viral events do not significantly increase engagement and rarely lead to
sustained growth"* — yani viral olma tahmini literatürde bile **doğası gereği gürültülü/
belirsiz.** Bu, aşağıdaki formülün "kesin bilim" değil bir başlangıç taslağı olduğunu bir kez
daha doğruluyor.

### 2.6 Önerilen Set 1 yapısı — İKİ AŞAMALI (Rakip Analizi'nin 9.2+9.3 deseniyle aynı)

**Aşama 1 — Gate (skorlanmadan ÖNCE eler):** Meslek etiği uygunluğu (bkz. Bölüm 4) — yasaklı
ifade kalıbı/vaat içeren bir içerik fikri, ne kadar "trend" olursa olsun ASLA öneri havuzuna
girmemeli. Bu bilinçli olarak Rakip Analizi'nden FARKLI: orada rakibin davranışı sadece
GÖZLEMLENİYORDU (skorsuz not), burada KENDİ ÜRETECEĞİMİZ içerik söz konusu — gerçek bir hard
filtre gerekiyor.

**Aşama 2 — Sıralama formülü (0-1 normalize, 10 ile çarpılır):**

```
Skor(1-10) = 10 × [
    0.35 × ilgi_orani        // "arama/gündem ilgisi ŞU AN, bu konunun KENDİ tarihsel ortalamasına
                              //   göre ne kadar yüksek" (Google Trends + GitHub velocity mantığı —
                              //   ORAN, ham sayı değil)
  + 0.30 × doygunluk_tersi   // ne kadar AZ doymuş/rekabetçi (VidIQ/TubeBuddy "rekabet" mantığı —
                              //   çok işlenmiş bir konu düşük puan alır)
  + 0.35 × format_uygunlugu  // Talk & Heal'in gerçekçi üretebileceği formatla (kısa video/karusel/
                              //   metin) örtüşme + sektöre özgü güçlü format sinyali (bkz. 2.7)
]
```

### 2.7 Format uygunluğu bileşeni — sektöre özgü somut bulgu

PubMed/JMIR Mental Health (2024-2025) kaynaklı bulgu: **60 saniyelik, insan-anlatımlı kişisel
hikaye videoları** damgalama (stigma) azaltmada etkili bulundu; kısa-form (60-90sn) içerik genç
kitlede özellikle güçlü. **Bu, `format_uygunlugu` bileşeninde kısa-video+kişisel-anlatı formatına
somut bir ağırlık avantajı verilmesini haklı çıkarıyor** — varsayımsal değil, kaynaklı bir tercih.

### 2.8 Mimari gerçeklik — Set 1 şu an neyle beslenecek?

`ilgi_orani` ve `doygunluk_tersi` bileşenleri GERÇEK SAYISAL veri ister — bu şu an YOK. İki yol
var: **(a)** YouTube Data API entegre edilir (`search.list`/`videos.list`, zaten $0 maliyetli
onaylandı) ve `viewCount`/`publishedAt`'ten gerçek bir velocity/doygunluk sayısı türetilir — bu,
gerçek bir mimari değişiklik, bu raporun kapsamı DIŞINDA (Rakip Analizi'ndeki "sosyal medya API
entegrasyonu ayrı karar" notuyla aynı desen). **(b)** YouTube API'siz, Claude'un web arama
sonuçlarını bu 3 bileşene göre YAPILANDIRILMIŞ şekilde değerlendirmesini isteyen bir PROMPT
REHBERİ olarak uygulanır — sayısal formül değil, ama tutarlı bir çerçeve. **Kısa vadede (b),
uzun vadede (a) önerilir.**

---

## 3. Görev B — Parametre Seti 2: "İçerik Değerlendirme/Üretim Planı" formülü

İçerik pazarlaması editoryal planlama pratiğinden (funnel stage ToFU/MoFU/BoFU + format + arama
hacmi/zorluk skoru, sektör kaynağı) ve JMIR/PMC'nin sektöre özgü bulgularından **4 grup** çıkarıldı
— Rakip Analizi'nin Set 2'sindeki 4-gruplu yapıyla PARALEL, ama içerik tamamen farklı:

### 3.1 Grup A — Format & Sunum Uygunluğu
Kısa video (60-90sn)/karusel/statik görsel/uzun-metin; kişisel-anlatı tonu (JMIR bulgusu, bkz.
2.7); animasyon (soyut kavramları basitleştirmede etkili, kaynaklı).

### 3.2 Grup B — Platform-Algoritma Uyumu
YouTube'un resmi "content performance" (tıklama/izleme/olumlu etkileşim) + "satisfaction" (2026
güncellemesi) tanımına göre hangi platformda hangi format daha iyi karşılık bulur (ör. Instagram/
YouTube Shorts kısa-video, LinkedIn uzun-metin/profesyonel ton için).

### 3.3 Grup C — Mesaj-Ton ve Meslek Etiği Uygunluğu (SERT GATE, sadece gözlem DEĞİL)
Bölüm 4'teki somut yasaklı kalıp listesi burada UYGULANIR — üretilecek her içerik önerisi
yayınlanmadan önce bu kontrolden geçmeli. Rakip Analizi'ndeki "gözlem notu, skorlanmaz"
yaklaşımından BİLE daha katı: orada rakip davranışını izliyorduk, burada KENDİ yayınlayacağımız
içeriği üretiyoruz.

### 3.4 Grup D — Zamanlama-Trend Sinyalleri
Mevsimsellik (ör. sınav dönemi kaygısı, yılbaşı hedefleri gibi öngörülebilir döngüler), güncel
gündemle bağlantı (web aramanın zaten yaptığı işin yapılandırılmış hali).

### 3.5 Tek vs Çoklu İçerik Modu — AYNI parametre seti, farklı sunum

- **Tek içerik fikri:** 4 grup tam anlatı olarak işlenir (mevcut rapor formatına uyar).
- **Çoklu (bir içerik takvimi/birden fazla fikir):** her grup fikirler ARASI karşılaştırmaya
  döner (ör. "Format uygunluğu: Fikir A kısa-video için güçlü, Fikir B uzun-metin için güçlü") —
  parametre seti aynı kalır, sadece sunum tekil-anlatıdan çoklu-karşılaştırmaya döner (Rakip
  Analizi Bölüm 10.5'teki desenle birebir aynı).

---

## 4. Görev C — Türkiye/sektöre özgü kısıt: SOMUT yasaklı kalıplar (KRİTİK)

Önceki raporun Bölüm 4'ündeki TPD/TTB reklam-etiği kısıtı burada DAHA KRİTİK, çünkü bu kez
gerçekten YAYINLANACAK içerik üretiliyor — sadece bir rakibi gözlemlemiyoruz. Araştırma somut
örnekler buldu:

**Yasaklı/riskli kalıplar (kaynak: sektör rehberleri + TPD etik ilkeleri sentezi):**
- Sonuç/garanti dili: *"Garantili iyileşme"*, *"X seansta çözdük"*.
- Örtük garanti fiilleri: *"Kaygı bozukluğunu birlikte AŞIYORUZ"* (riskli — "aşmak" sonuç garantisi
  ima ediyor) → güvenli alternatif: *"Kaygı bozukluğu terapisi SÜRECİNDE birlikte çalışıyoruz."*
- Tanı koyar nitelikte genel ifadeler (DM/yorum yanıtı formatında bile).
- Diğer terapist/yaklaşımları karalayan/karşılaştıran içerik.
- Danışan teşviki amacıyla duygusal baskı yaratan dil ("talep yaratıcı" — temel yasak kural).

**Set 1 ve Set 2'ye işlenişi:**
- **Set 1'in Aşama-1 gate'i:** Yüksek `ilgi_orani`/`doygunluk_tersi` skoru alan bir konu bile, önerilen
  MESAJLAŞMA kalıbı yukarıdaki listeye girerse ASLA öneri havuzuna girmemeli — bu, ham "viral
  potansiyel" ile "yayınlanabilir mi" sorularını AYIRIYOR.
- **Set 2'nin Grup C'si:** Üretilen HER içerik önerisi bu kontrolden geçmeli — rapor bu grubu
  "öneri" olarak değil, yayından önce geçilmesi gereken bir **denetim adımı** olarak sunmalı.
- Psikiyatrist (TTB+Sağlık Bakanlığı, kanun düzeyinde) için kısıt psikologdan (TPD, dernek düzeyinde)
  daha sıkı — önceki raporla tutarlı, tekrar edilmiyor (bkz. o rapor Bölüm 4/6).

---

## 5. Sektöre göre farklılaşma

Önceki rapordaki meslek-grubu ayrımı (psikolog/psikiyatrist/danışmanlık, ayrı havuzlarda
değerlendirilmeli) burada da geçerli — AMA ek olarak: **danışmanlık/koçluk grubu için önerilecek
içerik fikirleri, meslek örgütü kısıtına tabi OLMADIĞI için sistematik olarak daha "agresif"
format/mesaj önerebilir** (ör. doğrudan vaat içeren başlıklar) — psikolog/psikiyatrist havuzunun
Set 2 Grup C gate'i bu gruba UYGULANMAMALI çünkü zaten farklı bir yasal/etik rejime tabi; ama
BU AYRIM açıkça sisteme (hangi meslek grubu seçiliyse o grubun gate kurallarının uygulanması)
kodlanmalı, aksi halde yanlışlıkla ya çok gevşek ya çok katı bir filtre tüm gruplara uygulanır.

---

## 6. Sıradaki adım (öneri, kod değil)

1. **Set 2'nin 4 grubu + Grup C'nin somut yasaklı-kalıp listesi**, `ICERIK_STRATEJI_SYSTEM_PROMPT`'a
   (Aksiyon/Hedef Analizi'nde `AKSIYON_ANALIZ_SYSTEM_PROMPT`'a yapılan entegrasyonla BİREBİR AYNI
   desen — bir sabit metin bloğu + prompt'a eklenir) doğrudan eklenebilir. Bu, KOD gerektirmeyen,
   düşük riskli bir ilk adım — Claude zaten prompt talimatlarını takip ediyor, yeni bir veri
   kaynağına ihtiyaç yok.
2. **Set 1, YouTube Data API entegre edilmeden gerçek sayısal formül OLAMAZ** (bkz. 2.8) — kısa
   vadede sadece bir prompt-rehberi (Claude'un web arama sonuçlarını 3 bileşene göre
   değerlendirmesini isteyen yapılandırılmış talimat) olarak eklenebilir; gerçek `lib/
   rakipBulmaSiralama.ts` benzeri deterministik bir modül için ÖNCE YouTube API entegrasyonu
   (ayrı bir mimari karar, maliyeti zaten $0 olarak doğrulandı) gerekir.
3. Meslek grubuna göre ayrı gate kuralları (Bölüm 5) — `handleIcerikStrateji`'nin zaten aldığı
   rakip verisinden meslek grubu bilgisi çıkarılabiliyorsa (ör. Not alanında/isimde geçen unvan)
   kullanılabilir; şu an bu bilgi yapılandırılmış bir alan değil, bu da ayrı bir küçük veri-modeli
   kararı.
