# Talk & Heal — Tasarım Speki (Keşif Aşaması)

Referans: https://www.wholenesscollectivetherapy.com/ — "yan yana konunca aynı aile"
hissi hedeflenir, piksel kopya değil. Bu spek `web_tasarim_yetenegi.md` anayasasına
uyar (mor-mavi yasak, emoji ikon yasak, jenerik hero şablonu yasak, 8px sistemi,
tek başlık + tek gövde fontu, kırık simetri, gerçek metin, türetilmiş gölge).

---

## 1. Referanstan çıkarılan somut kanıtlar (curl + CSS analizi)

Referans sitesi Squarespace'tir; renk paleti runtime'da enjekte edildiği için
statik CSS'ten ham hex çekilemedi, ANCAK şu tokenlar doğrulandı:

- **Başlık fontu:** `brandon-grotesque` (Typekit `use.typekit.net/ik/1c6Qc...`),
  ücretli/lisanslı — gömemeyiz. Kanıt: referansın `custom.css` dosyası
  `font-family:brandon-grotesque` ile eyebrow/etiket stilini tanımlıyor.
- **Eyebrow/etiket imzası (kritik vibe unsuru):** `font-weight:700; font-size:14px;`
  `letter-spacing:.19em; text-transform:uppercase; line-height:1.6em`. Referansın
  "havasının" büyük kısmı bu geniş harf aralıklı, küçük, versal etiketlerden gelir.
- **Gövde fontu (fallback):** `helvetica, arial, sans-serif` (nötr grotesk).
- **Metin rengi:** `#2B2622` (önceki oturumda DevTools ile doğrulandı) — sıcak,
  siyaha yakın kahve-gri. Saf siyah değil; bu sıcaklık önemli.
- **İkincil ikonlar:** referans `Montserrat`'ı da yüklüyor (yardımcı geometrik sans).
- **Görsel dil:** tam-taşan (full-bleed) sıcak fotoğraf arka planları (Background1-7.jpg),
  üstüne sola/sağa hizalı, ortalanmamış metin blokları; bol beyaz alan; yumuşak,
  organik his. **Bu fotoğraflar Wholeness Collective'e ait — kullanılamaz.**

---

## 2. Renk paleti (1 ana + 1 nötr ailesi + 1 vurgu)

Yön: sıcak "kil-gül" (clay-rose) + "adaçayı" (sage), KEMİK/TAŞ (bone/stone) zemin, sıcak
mürekkep. Not: trend "terracotta + krem" klişesinden bilinçli sapma — ana renk
turuncu-terrakota değil DUSTY kil-gülüdür, ve ikinci bir canlı renk (adaçayı) paleti
klişeden ayırır. Pembe kalp-logosuyla uyumludur.

**Zemin revizyonu (kullanıcı geri bildirimi):** İlk `--paper #F4ECE0` (yulaf kremi)
hafif pembemsi/sıcaktı; hedef kitle (ruhsal olarak yıpranmış/kırılgan ziyaretçiler)
için zemin daha nötr, dinlendirici ve AYDINLIK olmalı. Zemin **kemik/taş** ailesine
kaydırıldı: `--paper #F2EEE7` (kırık beyaz / bone) + `--surface #FBF8F3` (near-white).
Statik düz renk yerine yavaş, "nefes alan" aydınlık gradyen kullanılır (bkz. Bölüm 6).

| Token | Hex | Rol | HSL türetme notu |
|---|---|---|---|
| `--ink` | `#2B2622` | Ana metin, başlıklar | Referanstan doğrulandı; sıcak near-black |
| `--clay` (ANA) | `#BC5A5E` | Butonlar, linkler, eyebrow, marka vurgusu | Dusty kil-gülü, pembe logoyla köprü |
| `--clay-deep` | `#9A4247` | Hover/pressed, aktif durum | `--clay`'in L değeri ~-13 türevi |
| `--sage` (VURGU) | `#6E8A6E` | Etiket/tag, ikincil aksan, ikon vuruşu | Muted adaçayı, ana renge analog-tamamlayıcı |
| `--paper` (NÖTR) | `#F2EEE7` | Sayfa zemini | Kemik/bone; nötr, `--ink`'e çok hafif sıcak bias |
| `--surface` | `#FBF8F3` | Kart / alt bölüm zemini | Near-white taş tonu |
| `--taupe` | `#8C7B70` | İkincil metin | `--ink`'in düşük doygunluk, yüksek L türevi |
| `--border` | `rgba(43,38,34,.12)` | Kenarlıklar | `--ink`'ten türetildi — gri değil |

Nötr, saf gri DEĞİL: kemik/taş zemin `--ink`'in sıcak tonuna çok hafif bias'lı — soğuk/steril değil.
Gölge de gri değil, `--clay`'den türetilir (bkz. Bölüm 6).

**Tema politikası (kritik):** PRIMARY/varsayılan görünüm HER ZAMAN AÇIK'tır. `prefers-color-scheme:dark`
media query'si KULLANILMAZ — böylece ziyaretçinin işletim sistemi koyu modda olsa bile
site ilk açılışta karanlık bir yüzeyle karşılamaz. Koyu tema yalnızca kullanıcı tema
düğmesiyle açıkça seçerse (`:root[data-theme="dark"]`) ikincil seçenek olarak gelir.
Karanlık tema tokenları (mockup'ta tanımlı, yalnızca opt-in): `--ink #EDE6DC`,
`--paper #241C18`, `--surface #2E251F`, `--clay #DB7B7F`, `--sage #8FB08F`, `--taupe #A8968B`.
Kontrast WCAG AA hedeflenir (clay-on-paper metni yalnızca ≥18px/bold; gövde metni `--ink`).

---

## 3. Tipografi (gerekçeli font çifti)

**Hedef değişti (kullanıcı isteği):** Artık referans Brandon Grotesque değil,
kullanıcının istediği **Avenir Next Condensed Ultra Light** yönü esas alınır.
Bu font Monotype/Linotype'a aittir, ücretli/lisanslıdır ve web'e @font-face ile
gömülemez (Apple cihazlarda yalnızca cihaz-içi gömülü). Bu yüzden en yakın
ÜCRETSİZ, kondanse + gerçek ultra-light ağırlığı olan bir eşlenik seçilir.

**Başlık: Barlow Condensed** (Google Fonts, ücretsiz; @font-face data-URI ile
gömülür — CDN yok). Ağırlıklar: h1/hero için **ExtraLight 200**, eyebrow/Thin
vurguları için **100**, UI/h2/h3/nav/buton için **500**.
**Gövde: sistem humanist sans stack** (`-apple-system, "Segoe UI", Helvetica, Arial`).

### Neden Barlow Condensed — kondanse ultra-light adaylarıyla karşılaştırma

Avenir Next Condensed Ultra Light'ın kimliği: KONDANSE (dar) + GERÇEK ULTRA-LIGHT
ağırlık + geometrik-hümanist yumuşaklık. Eşlenik bu üç özellikle belirlenir:

- **Barlow Condensed** ✔ — Kondanse + Thin 100 / ExtraLight 200 gerçek ince cut'lar
  + geometrik-hümanist karakter. Avenir Next Condensed'in havadar/ince hissine en
  yakın ücretsiz eşleşme. Tam ağırlık ailesi (100–900) gerçek hiyerarşi verir.
- **Oswald** — Kondanse ve Light 300 mevcut ama harfler daha dar/sıkışık, "gotik/afiş"
  karakterde; Avenir'in yumuşaklığından uzak, daha sert. Runner-up değil.
- **Fjalla One** — Tek ağırlık (400, orta-kalın); ince/ultra-light cut YOK, hiyerarşi
  kurulamaz. Elenir (yalnızca karşılaştırma için panelde).
- **Archivo Narrow** — Dar/nötr-grotesk; en ince cut'ı 400, gerçek ultra-light YOK.
  Temiz ama Avenir'in geometrik inceliği yerine düz editoryal his verir. Elenir.

Sonuç: **Barlow Condensed KİLİTLENDİ** (kullanıcı onayladı) — tek "kondanse + gerçek
ultra-light + yumuşak" kombinasyonunu sunan aday. Font karşılaştırma paneli artık
mockup'tan kaldırıldı; Barlow tek başlık fontu olarak kesinleşti. (Önceki
Jost/Poppins/Montserrat/Questrial/Sora ve Oswald/Fjalla/Archivo karşılaştırmaları
geçmişe ait; kayıt için burada duruyor.)

### Tip ölçeği (gerçek hiyerarşi)
- h1 (display): `clamp(2.6rem, 6.5vw, 4rem)`, **weight 200 (ultra-light)**, `line-height:1.04`
- h2: `clamp(1.9rem, 4.4vw, 2.6rem)`, weight 500
- h3: `1.25rem`, weight 500
- Eyebrow (etiket): `.9rem`, weight 500, `letter-spacing:.22em`, uppercase, renk `--clay`
  (kondanse harflerde tracking Brandon-tarzı eyebrow imzasını taşır)
- Gövde: `1.05–1.1rem`, `line-height:1.6`, ölçü `~62ch`
- Alıntı bloğu: Barlow Condensed **weight 200**, `1.7rem` (italik değil — italik cut
  gömülmedi, ultra-light düz hali daha zarif)
- Künye rakamları (`.cred-list .k`): Barlow Condensed 200, `2.2rem` — ince, iri, editoryal

---

## 4. 8px boşluk sistemi (nerede uygulanır)

Ölçek: `8 / 16 / 24 / 32 / 48 / 64 / 96` (`--space-1..7`). Keyfi px yok.

- Bölüm dikey ritmi (`section padding-block`): **96** (space-7), alt bölümlerde 64.
- Grid `gap` (about iki sütun): **48** (space-5).
- Başlık → paragraf arası: **16** (space-2); eyebrow → başlık: **16**.
- Kart iç dolgu: **24–32** (space-3/4). Buton dolgu: **16×32** tabanlı (14×28 hedef → 16/32 ailesine hizalı).
- Header dikey dolgu: **16** (space-2). "Kimlik & Yöntem" bölümü: **96** (space-7).
- Portre çerçevesi ile metin ofseti: **32** (space-4).

---

## 5. Layout / grid (kırık simetri)

- **Ortalanmış-eşit-sütun YOK.** About bölümü asimetrik iki sütun:
  sol portre `minmax(280px, 5fr)` / sağ metin `7fr` — eşit değil.
- Portre ORTADA değil; üst kenarı metin bloğunun eyebrow hizasından **32px** aşağı
  başlar (dikey kırık hiza) → "insan eli" ritmi.
- Metin blokları sola dayalı, `max-width:62ch` ile sağda kasıtlı boşluk.
- Hero KLİŞESİ ("büyük başlık + alt başlık + iki buton") KULLANILMAZ — bunun yerine
  editoryal bir "açılış ifadesi": tek güçlü tez cümlesi + eyebrow + tek eylem linki
  + yanında asimetrik portre. (Referansın deseni de tek-mesaj bloklarıdır.)

### 5a. Header (revize — kullanıcı isteği)
- **Künye şeridi kaldırıldı:** eskiden header altında duran "BACP · 20+ yıl ·
  Existential-Phenomenological · BDT · ACT · İngilizce & Türkçe" satırı header'dan
  TAMAMEN kaldırıldı. Bilgi kaybolmadı.
- **"Kimlik & Yöntem" bölümü de KALDIRILDI (revize):** ayrı `section.creds` bölümü
  tamamen silindi; içeriği (BACP kaydı, 20+ yıl deneyim, yöntemler, diller)
  **"Hakkında" (About) bölümünün içine** taşındı — alıntının altında, `.about-creds`
  künye satırı olarak (uzmanlık/kimlik akışın parçası; kaybolmadı).
- **"Randevu Al" butonu kaldırıldı:** artık header'da yok. İleride **İletişim
  sayfasına** taşınacak (bu mockup'ta ayrı Contact sayfası yok; header'dan kaldırılması
  yeterli). Hero'daki "Kısa bir mesajla başla" birincil eylemi bu işlevi zaten karşılıyor.
- **Nav + dil anahtarı sağda tek grup (revize):** nav başlıkları header'ın sağındaki
  EN/TR anahtarına YAKLAŞTIRILDI — brand solda, nav+dil sağda birlikte (`.header-right`,
  aralarında `--space-3`). Ortada büyük boşluk yok.
- **Nav başlıkları BÜYÜK HARF:** HAKKIMDA · SERVİSLER · BLOG · YAKLAŞIM · FİYAT & BİLGİ ·
  İLETİŞİM. (Türkçe versal İ/ş için harfler HTML'de zaten büyük yazılır; CSS
  `text-transform` Türkçe locale'de yanlış çevirir, bu yüzden metin kaynakta uppercase.)
- **EN/TR:** minimal pill, künyeden bağımsız.
- **Alt kenarlık yerine gradyen geçiş:** header'ın sert alt çizgisi kaldırıldı;
  yarı-saydam paper gradyeni + `backdrop-blur` + `::after` gradyen katmanıyla header
  hero alanına YUMUŞAKÇA karışır — görünür sınır yok.

### 5b. Navigasyon mimarisi — HİBRİT (kod/mimari; görsel ok YOK)
- Nav başlıkları (Hakkımda, Servisler, **Blog**, Yaklaşım, Fiyat & Bilgi, İletişim)
  **hem** ana sayfada sırayla bölümdür (tek uzun kaydırmalı deneyim, `#anchor`) **hem de**
  header'dan tıklanınca kendi **bağımsız sayfasına** gider (`services.html`, `blog.html` vb.).
- **Blog** başlığı nav'a **Servisler'den hemen sonra** eklendi; diğerleriyle aynı hibrit
  davranışı + uppercase kuralını taşır. Mockup'ta örnek Blog bölümü (`section.blog`,
  2 örnek yazı kartı — kaygı/sinyal ve iki kültür arası aidiyet/yas temalı, gerçek ton).
- **Görsel `↓↗` ok işaretleri KALDIRILDI** (kullanıcı isteği): hibrit davranış yalnızca
  kod/mimari olarak burada tanımlıdır; nav'da görsel ikon yoktur.
- Uygulama notu (Fable 5 için): her başlık için hem ana sayfada `<section id>` bölümü,
  hem ayrı sayfa üret; nav linki varsayılan olarak ayrı sayfaya gider, ana sayfadaki
  karşılık bölüme de anchor ile ulaşılabilir.
- **TEYİT — tüm başlıklar ana sayfada bölümdür:** Servisler, Yaklaşım ve özellikle
  **İletişim (Contact)** da tıpkı Blog gibi, ana sayfa aşağı kaydırıldıkça header'daki
  sıralamaya (Hakkımda → Servisler → Blog → Yaklaşım → Fiyat & Bilgi → İletişim) uygun
  biçimde kendi içerikleriyle bölüm olarak görünür. Mockup'ta `#about`, `#blog` ve
  `#contact` bölümleri canlıdır; İletişim bölümü (`section.contact#contact`) sayfanın
  sonunda e-posta/telefon/WhatsApp + çalışma saatleriyle yer alır. Servisler/Yaklaşım
  bölümleri uygulama aşamasında aynı desenle eklenecek (nav linkleri ayrıca bağımsız
  sayfalara gider).

### 5c. Logo — diyagonal / basamaklı düzen (kullanıcı isteği)
- Üç eleman sol-üstten sağ-alta **merdiven/basamak** gibi diyagonal ilerler; elemanlar
  KENDİ İÇİNDE döndürülmez (rotate yok), yalnızca konumları çapraz kayar:
  **kalp (sol üst, sabit) → `TALK&` (kalbin sağ-alt çaprazı) → `HEAL` (TALK&'nın sağ-alt çaprazı).**
- Uygulama: `.brand` flex-column, `align-items:flex-start`; `.w1` (TALK&) `margin-left:16px`,
  `.w2` (HEAL) `margin-left:38px` → artan girinti = aşağı-sağa basamak. `line-height:.8`.
- **TALK& = BOLD (700)**, **HEAL = ince (200)**, ikisi de **BÜYÜK HARF**, "&" TALK'a bitişik.
- Kalp: pembe/kil-gül kalp-konuşma-balonu ikonu (referanstan sadece renk/şekil alınır).
  Referans logosu (talkandheal.co.uk .../talkandheal-copy2.png) YATAY dizilimdedir ve
  BİREBİR KOPYALANMADI; kompozisyon bu tarife göre yeniden kuruldu.

---

## 6. Orijinal görsel / doku stratejisi (fotoğraf yerine)

Referansın kendi telifli fotoğraflarını kullanamayız. Yerine ÖZGÜN, kodla üretilen
katmanlar + kullanıcının LİSANSLI (satın aldığı) hero görseli:

0. **Hero yaprak dokusu arka planı (LİSANSLI — kullanıcıya ait; revize):**
   dosya `assets/hero-leaf-texture.png` (1080×1817, çok açık/krem/kemik tonlarında
   damarlı yaprak dokusu — mevcut açık palete son derece uyumlu). Önceki muz yaprağı
   (`hero-banana-leaves.png`) BU görselle değiştirildi.
   - **Yerleşim:** SAĞDA belirgin/net, SOLA doğru gradyatif silikleşir —
     `mask-image:linear-gradient(to left, #000 0%, #000 20%, transparent 58%)`
     (önceki sürümde sol belirgindi; yön TERS çevrildi). `background-position:right center`.
   - **Kritik kısıt:** görsel ASLA profil fotoğrafının ÜZERİNE binmez ve metin
     okunabilirliğini bozmaz. Portre kartı opak ve üsttedir (hero-bg `z-index:-1`);
     metin solda, doku solda tamamen şeffaflaşır; genel `opacity:.55` ile foto/metin
     bölgelerinde yoğunluk düşüktür.
   - **Scroll-yönüne duyarlı hareket (revize):** aşağı kayınca doku SOLDAN SAĞA,
     yukarı kayınca SAĞDAN SOLA kayar. JS: `scrollY` deltasından yön; `targetX`
     birikir (±55px'de sınırlı), `requestAnimationFrame` + lerp (0.08) ile YUMUŞAK/
     yavaş eased geçiş (ani değil). `prefers-reduced-motion`'da tamamen kapalı.
   - Yalnızca **hero'ya** özel; diğer bölümlere sızmaz. Artifact self-contained
     olduğundan görsel web için küçültülüp (~950px, JPEG) **data-URI** olarak gömülür.
   - **Tutarlılık notu (Fable 5):** AYNI yaprak dokusu, header'daki başlıklara
     tıklanınca açılan BAĞIMSIZ sayfaların (Servisler, Yaklaşım, Blog, İletişim…)
     hero bölümlerinde de tekrar kullanılacak — tek bir görsel kimlik.

1. **"Nefes alan" aydınlık gradyen (revize):** kemik/taş zemin üzerinde `--clay`,
   `--sage` ve `--surface`'ten `color-mix` ile ÇOK düşük opaklıklı (%12–13) radyal
   yıkamalar; `body::before` sabit katmanında `@keyframes breathe` ile ~24s'lik yavaş,
   döngüsel `scale`/`translate`/`opacity` geçişiyle hafifçe genişleyip kayar — sakin,
   terapötik, dikkat dağıtmayan bir hareket. Mor-mavi DEĞİL, yalnızca marka tonu.
   Zemin bilinçli olarak AYDINLIK; hedef kitleyi karartmaz. `prefers-reduced-motion`
   ile animasyon tamamen durur (statik aydınlık gradyene düşer).
2. **Kağıt-grain dokusu:** SVG `feTurbulence` fraktal gürültü, opacity ~.025 —
   kendi ürettiğimiz, kopyalanmamış doku. Referans jpg'leri İNDİRİLMEDİ.
3. **Organik "kemer/blob" portre çerçevesi:** portre üstte kemerli (asimetrik
   `border-radius`) bir maskede — referansın yumuşak fotoğraf hissini fotoğrafsız verir.
4. **Tek-çizgi botanik motif (opsiyonel aksan):** sage renginde, kodla çizilmiş
   ince yaprak/dal SVG'si — stok/3D illüstrasyon DEĞİL, minimal marka aksanı.
5. **Gerçek portre (sonra):** Çiğdem'in gerçek fotoğrafı geldiğinde kemerli çerçeveye
   girecek — sıcaklığın asıl sürücüsü budur; şimdilik yer tutucu doku/blok.

---

## 7. Mikro-etkileşim kuralları

- **Buton:** `--clay` → hover `--clay-deep`, `translateY(-1px)` + `--clay`'den türetilmiş
  yumuşak gölge (`0 10px 24px -12px rgba(188,90,94,.5)`); `:active` `translateY(1px)`.
- **Kart:** hover'da kenarlık `--border` → `--sage` tonuna geçer + `translateY(-2px)`
  + marka-türevi gölge. Gölge/kenarlık gri DEĞİL.
- **Link:** alt-çizgi `text-underline-offset:3px`, hover'da `--clay`.
- **Eyebrow/etiket:** statik (dikkat dağıtmaz).
- `prefers-reduced-motion`: tüm transform/transition kapanır.
- Odak (focus-visible): `2px solid --clay`, offset 3px — klavye erişilebilirliği.

---

## 8. Bitiş şartı kanıtı (anayasa kontrolü)

- Marka renkleri kullanıldı: `--clay #BC5A5E` (buton/eyebrow/link), `--sage #6E8A6E`
  (etiket/aksan), nötr kemik/taş `--paper/#F2EEE7 · surface/#FBF8F3 · ink/#2B2622 · taupe/#8C7B70`. ✔
- Varsayılan görünüm AÇIK (prefers-color-scheme:dark yok); zemin "nefes alan" aydınlık gradyen. ✔
- Font çifti: Barlow Condensed (başlık, ultra-light, kilitli+gömülü) + sistem humanist sans (gövde). ✔
- 8px sistemi: bölüm 96, grid gap 48, başlık-metin 16, kart 24/32 — hepsi ölçekten. ✔
- Mor-mavi gradyen: YOK. Emoji ikon: YOK (SVG). Jenerik hero şablonu: YOK. ✔
- Gölge/kenarlık marka renginden türetildi (gri değil). ✔
- Kırık simetri: 5fr/7fr about grid + dikey kaydırılmış portre. ✔
- Gerçek metin: talkandheal.co.uk içeriği; uydurma istatistik yok. ✔

## 9. Dürüst "hava" değerlendirmesi (nerede yakın, nerede sınırlı)

- **Yakın:** renk sıcaklığı (kemik/taş zemin + dusty gül + adaçayı), düşük-x geometrik
  başlıklar + geniş versal eyebrow imzası, bol boşluk, sola-dayalı asimetrik ritim,
  yumuşak organik şekiller. Tahmini ~%80 "aynı aile".
- **Sınırlı (yasal/teknik):** referansın baskın duygusu tam-taşan GERÇEK FOTOĞRAF;
  onun yerine artık kullanıcının lisanslı yaprak dokusu + kodla üretilen katmanlar
  var. Gerçek portre eklenene dek insani sıcaklık bir tık eksik kalır. Ayrıca istenen
  Avenir Next Condensed Ultra Light lisanslı; Barlow Condensed en yakın ücretsiz eş.
  Kapatma yolu: Çiğdem'in gerçek portresi (kemerli çerçeveye girecek).

---

## 10. İleri aşama notları (ŞİMDİ UYGULANMAZ — yalnızca yapılacaklar)

- **Arka plan sesi/müziği (telifsiz):** İlerleyen bir aşamada ana sayfaya ve aşağı
  kaydırıldıkça görünen bölümlere telifsiz bir arka plan sesi/müziği (duyulabilir)
  eklenecek. **KISIT:** header'daki başlıklara tıklanınca açılan BAĞIMSIZ sayfalarda
  bu ses ÇALMAYACAK — yalnızca ana sayfa/scroll deneyimine özel. (Ör. daha önce anılan
  Sophie Hutchins "Billow Gently" benzeri sakin bir kompozisyon.) Bu aşamada
  implementasyon YOK; sadece kayıt.
- **"Randevu Al" → İletişim sayfası:** header'dan kaldırılan buton, uygulamada
  bağımsız İletişim sayfasına taşınacak (ana sayfadaki `#contact` bölümü + CTA zaten karşılıyor).
- **Servisler / Yaklaşım bölümleri:** ana sayfaya `#services` / `#approach` bölümleri
  olarak eklenecek (hibrit desen), ayrıca bağımsız sayfaları üretilecek.
