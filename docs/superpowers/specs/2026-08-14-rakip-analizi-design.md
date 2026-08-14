# Rakip Analizi & Strateji Altyapısı — Tasarım

## Bağlam

Çiğdem (Talk and Heal), Londra'da ve zaman zaman Türkiye ofisinde danışan kabul ediyor.
Rakiplerini analiz edip hem "hangi görsel/video içeriği üretmeliyim" sorusuna küratif bir
strateji önerisi, hem de "hedeflerime göre nerede duruyorum" sorusuna hedef/projeksiyon/
realizasyon takibi sağlayan, kendisinin istediği zaman kendi kendine kullanabileceği bir
altyapı istiyor — bir kerelik bir analiz raporu değil, kalıcı bir araç.

Bu, daha büyük bir talebin (rakip analizi + video-editör + sosyal medya otomasyonu +
Linktree-benzeri yapı) ilk alt-projesi. Diğerleri ayrı spec'lerle ele alınacak — bu belge
sadece Rakip Analizi'ni kapsar.

**Kapsam dışı (ayrı alt-projeler):** Video/Görsel Düzenleme Arayüzü (OpenCut), Sosyal Medya
Otomasyonu, Linktree-benzeri Analytics Yapısı, "Hermes" tarzı konuşan AI ajanı (bkz.
`INTEGRASYON_TODO.md` ve `~/.claude/gundem.md`).

## Mimari

Mevcut `form-backend` Cloudflare Worker'ı genişletilir — ayrı bir servis kurulmaz (proje
CLAUDE.md'sindeki "Çoklu Ajan Mimarisi'ne geçme" ilkesiyle tutarlı, tek-müşterili bir internal
araç için operasyonel yük gereksiz).

- Yeni route: `src/routes/rakipAnalizi.ts` — `requirePanelAuth` ile korunur (mevcut panel
  şifresiyle aynı).
- Yeni `lib/` dosyaları:
  - `lib/places.ts` — Google Places (Nearby Search) + Google Maps JS entegrasyonu
  - `lib/claude.ts` — Claude Sonnet 5 (Anthropic API) çağrıları
- Yeni Worker secret'ları: Google Places/Maps API key, `ANTHROPIC_API_KEY`
- Frontend: `panel.html`'e yeni "Rakip Analizi" bölümü. Tıklanınca iki seçenek çıkar:
  **Görsel/Video Stratejisi** ve **Aksiyon/Hedef Analizi**. Her ikisinde de mevcut `micBtn`
  deseniyle aynı yazı + mikrofon-dikte girişi kullanılır.

## Veri İzolasyonu

Rakip analiz verisi, Google Sheet'te **ayrı, izole bir sekmede** ("RakipAnalizi") tutulur —
Talk and Heal'in gerçek danışan/randevu verisiyle (Sayfa1) hiçbir şekilde karışmaz. Bu,
kullanıcının açık isteği (aksi halde "kaos" riski).

## Veri Toplama

İki yöntem birlikte:

1. **Manuel giriş** — Çiğdem rastgele karşılaştığı bir rakibin isim/link/gözlemini yazıyla
   veya sesle girer.
2. **Konum+yarıçap arama** — Çiğdem bir merkez nokta ve yarıçap (metre-km) belirler; backend
   Google Places Nearby Search'ü proxy'ler (API key sızmasın diye client-side değil
   server-side çağrılır), sonuçlar Google Maps JS ile haritada pin + liste olarak gösterilir.
   Çiğdem istediği sonuçları seçip üzerine not ekler (yazı/sesle).

Araç seçimi (maliyet/performans protokolüyle araştırıldı, kullanıcı onayladı): **Google
Places + Google Maps** — bu kullanım hacminde (ayda 10-50 arama) $0 (5.000 ücretsiz
istek/ay kotasının çok altında), OpenStreetMap'e göre Londra+Türkiye'de daha güncel/
doğrulanmış veri.

## İki Dal

### Dal A — Görsel/Video İçerik Stratejisi

Girdi: toplanan rakip verisi (manuel + harita) + Çiğdem'in serbest metin/ses isteği.
Çıktı: Claude Sonnet 5 ile üretilen **küratif** öneri raporu — rakip içeriği kopyalanmaz,
rakibin stratejisinden (hangi platformda, ne sıklıkla, hangi format/konu daha çok etkileşim
alıyor) içgörü çıkarılıp kendi orijinal/telifsiz-stok/AI-üretilmiş içerik önerisi üretilir
(telif/KVKK riskini önlemek için — Sparrow'daki aynı ilke).

Bu rapor `RakipAnalizi` sekmesine kaydedilir VE aynı bulut ortamındaki Video-Edit
alt-projesinin (henüz ayrı bir spec, ileride tasarlanacak) API üzerinden doğrudan
okuyabileceği bir çıktı olarak saklanır — Video-Edit de web/bulut-tabanlı kalacağı için
(bkz. Mimari Not) ayrı bir senkronizasyon köprüsü gerekmez.

### Dal B — Aksiyon/Hedef/Projeksiyon Analizi

Kapsamı sadece görsel/video değil — rakiplerin çalışma şekilleri hakkında toplanabilecek her
tür veriyi de içerir. Girdi (hibrit):
- **Otomatik/sayısal:** mevcut booking Sheet'inden (Sayfa1) randevu sayısı, hizmet dağılımı,
  gelir gibi ölçülebilir veriler otomatik çekilir.
- **Manuel/yorum:** Çiğdem bunun üzerine kendi gözlem/yorumunu (yazı/sesle) ekler.

Çıktı: Claude Sonnet 5 ile haftalık/aylık/3-6-9-12 aylık hedefler + roadmap + Talk and Heal'in
atması gereken somut adım önerileri. Her dönemin sonunda (vade geldiğinde) "neredeydik / ne
yaptık / neredeyiz" üçlemesiyle realizasyon analizi: plana uyulduysa aynı şablonla devam,
sapma varsa nedeni analiz edilip bir sonraki dönem için yeni hedef/roadmap üretilir (aynı
sapmanın tekrarlanmaması için).

## Mimari Not — Video-Edit / Sosyal Medya Otomasyonu ile İlişki

Kullanıcı, Rakip Analizi çıktısının Video-Edit'e girdi olacağını, ve bu ikisi arasında
internet kesintisi senaryolarında (cihaz-yerel + bulut arası senkronizasyon) veri kaybı riski
olup olmayacağını sordu. Karar: **Video-Edit ve Sosyal Medya Otomasyonu da sadece web/bulut
tabanlı tutulacak** (Sparrow'un OpenCut motoru için zaten kabul ettiği "sekmeyi kapatma"
riskiyle aynı model) — cihaza kurulu offline bir uygulama olarak inşa edilmeyecek. Bu, tam bir
offline-first senkronizasyon motoru (çakışma yönetimi dahil) kurma ihtiyacını ortadan
kaldırıyor; Çiğdem herhangi bir cihazdan tarayıcıyla aynı buluta erişir.

## AI Motoru Seçimi

Maliyet/performans protokolüyle araştırıldı (Claude Sonnet 5 vs GPT-5.6-sol vs Gemini 3.1
Pro): üçü de kullandıkça-öde, kod-dışı yazı kalitesinde otoriter bağımsız kıyas kaynağı yok
(Arena.ai'de üçü de yakın). **Claude Sonnet 5** seçildi — tanıtım fiyatıyla ($2/$10 per MTok,
2026-08-31'e kadar) en dengeli seçenek, bu hacimde (ayda birkaç-birkaç düzine rapor) toplam
maliyet ayda $1-10 civarı, önemsiz düzeyde.

## Erişim

Mevcut panel şifresiyle aynı (`PANEL_PASSWORD`, tek paylaşılan şifre) — ayrı bir kullanıcı
sistemi kurulmaz.

## Hata Yönetimi

- Google Places/Maps API hatası → "harita şu an yüklenemedi, manuel giriş yapabilirsin"
  fallback mesajı, manuel giriş yolu her zaman çalışır durumda kalır.
- Claude API hatası/timeout → mevcut `fixGrammar` hata deseniyle tutarlı, kullanıcıya net hata
  mesajı, retry.
- Ses dikte hatası → mevcut `micBtn`'in zaten sahip olduğu Web Speech API sınırıyla aynı
  (Chrome-only) — yeni bir kısıt eklenmiyor.

## Test

- Backend: vitest, mevcut desen (`test/rakipAnalizi.spec.ts`), Google Places ve Claude API'leri
  mock'lanır.
- Frontend: mevcut `python3 -m http.server` ile manuel önizleme + Chrome DevTools'ta
  mikrofon/harita testi (mevcut proje konvansiyonu, gerçek/test hesaplarla).

## Açık Sorular (spec onaylanmadan önce netleştirilmeli)

- Yok — bu spec'teki tüm kararlar konuşma sırasında kullanıcı tarafından onaylandı.
