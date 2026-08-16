# Görsel/Video Stratejisi — Web Arama Maliyet Analizi (2026-08-16)

**Neden bu dosya var:** Kullanıcı, Görsel/Video Stratejisi raporunun (icerikStrateji) artık web
araması ile güncel trend verisine dayanmasını istedi (bkz. `INTEGRASYON_TODO.md` 2026-08-16
kaydı). Bu, `form-backend/src/lib/claude.ts`'deki `generateReport`e `web_search_20250305` tool'u
eklenerek yapıldı. Bu dosya, o değişikliğin **gerçek** (tahmini değil, 4 canlı API çağrısıyla
ölçülmüş) maliyetini kayıt altına alıyor.

## Teknik karar: neden `web_search_20250305`, `web_search_20260209` değil

İlk denemede daha yeni sürüm (`web_search_20260209`, "dynamic filtering") kullanıldı. Gerçek
testte bu sürüm:
- Rapor başına input token'ı **66.566**'ya çıkardı (kod-çalıştırma/thinking döngüsü yüzünden)
- `max_tokens: 4096` ile raporu **ORTASINDA KESTİ** (`stop_reason: max_tokens`)

`web_search_20250305` (basic, kod-çalıştırma katmanı yok) ile aynı istek:
- Input token ~3 kat azaldı (22K-48K arası)
- Rapor **tam ve kesintisiz** üretildi (`stop_reason: end_turn`)
- 2-4 hedefli arama için dynamic filtering'in getirisi (büyük sonuç kümesini filtreleme) zaten
  gereksiz — o yüzden basic sürüm hem daha ucuz hem daha güvenilir.

Koda `max_tokens: 8192` (webSearch açıkken) ve `max_uses: 4` (arama sayısı sert üst sınırı) de
eklendi.

## Gerçek ölçüm sonuçları (4 canlı test çağrısı, 2026-08-16)

Sistem talimatı + gerçekçi bir örnek rakip verisi/istek ile, gerçek Anthropic API'sine karşı:

| Test | Input token | Output token | Arama sayısı | Durum |
|---|---|---|---|---|
| 1 (dynamic filtering, eski sürüm) | 66.566 | 5.478 | 3 | **KESİLDİ** (kullanılmıyor artık) |
| 2 (basic) | 22.368 | 3.069 | 2 | Tam |
| 3 (basic) | 47.658 | 6.725 | 3 | Tam |
| 4 (basic) | 47.411 | 5.237 | 3 | Tam |

**Fiyatlandırma (resmi, platform.claude.com/docs, 2026-08-16 doğrulandı):**
Sonnet 5 — $2/milyon input token, $10/milyon output token. Web arama — $10/1.000 arama ($0.01/arama).

**Rapor başına maliyet (basic sürüm, 3 temiz test):**

| Test | Input maliyeti | Output maliyeti | Arama maliyeti | **Toplam** |
|---|---|---|---|---|
| 2 | $0.0447 | $0.0307 | $0.02 | **$0.095** |
| 3 | $0.0953 | $0.0673 | $0.03 | **$0.193** |
| 4 | $0.0948 | $0.0524 | $0.03 | **$0.177** |

**Ortalama: ~$0.155/rapor. Gözlenen en yüksek: ~$0.19/rapor. `max_uses:4` ile teorik en kötü
senaryo ~$0.22-0.25/rapor** (4. arama + orantılı ek input token varsayımıyla).

Karşılaştırma: web arama EKLENMEDEN önce aynı rapor türü ~$0.03-0.05'e mal oluyordu — yani web
arama, rapor başına maliyeti **kabaca 3-5 kat artırıyor**.

## Talk and Heal için aylık/yıllık etki

`config.ts`'deki `icerikStrateji` kotası ayda **12 rapor** (hem manuel buton hem RakipTakip'in
otomatik periyodik üretimi bu kotayı paylaşıyor).

| Senaryo | Rapor başına | 12 rapor/ay | Yıllık (×12 ay) |
|---|---|---|---|
| Ortalama | $0.155 | **~$1.86** | **~$22.32** |
| Gözlenen en yüksek | $0.19 | ~$2.28 | ~$27.36 |
| Teorik en kötü (4 arama + PDF eki) | ~$0.35 | ~$4.20 | ~$50.40 |

**Bütçe riski notu:** Toplam Anthropic bütçesi (icerikStrateji + aksiyonAnaliz) ayda $5 olarak
ayrılmıştı (kullanıcı teyidi, 2026-08-16), 12/13 rapor limitiyle. Bu limit, web aramadan ÖNCEKİ
maliyet varsayımıyla (~$0.20/rapor tavan, iki kategori için ortak) hesaplanmıştı. Web arama
eklendikten sonra icerikStrateji'nin TEORİK en kötü senaryosu (~$0.35/rapor × 12 = $4.20) tek
başına bütçenin büyük kısmını tüketebilir — aksiyonAnaliz'in kendi 13 raporu da eklenince MUTLAK
en kötü ay $5'i aşabilir. **Ortalama/gerçekçi kullanımda** (rapor başına ~$0.15-0.19, PDF eki
nadiren en üst sınırda) toplam ayda ~$2.50-3'ü geçmez, rahat sınırlar içinde kalır — risk sadece
"her rapor aynı anda hem 4 arama hem maksimum PDF eki" gibi gerçekleşmesi olası düşük bir uç
senaryoda. Anthropic'in kendi bakiye kontrolü (`InsufficientCreditError`) zaten nihai güvenlik
ağı olarak duruyor, bu yüzden en kötü senaryo "sürpriz devasa fatura" değil, "bütçe ayın ortasında
biter" riski. **Öneri:** şimdilik 12/13 limitini değiştirmeye gerek yok (ortalama kullanım güvenli
aralıkta), ama birkaç ay gerçek kullanım verisiyle (Sheets'teki `KullanimKaydi` sekmesi) tekrar
gözden geçirilmeli.

## YouTube Data API v3 maliyeti (tamamlayıcı, henüz eklenmedi)

Resmi kaynak (developers.google.com, 2026-08-16 doğrulandı): günlük **10.000 ücretsiz unit**,
`videos.list` (trending) çağrısı **1 unit**. Bu ölçekte pratikte **$0** — günde 10.000 çağrıya
kadar ücretsiz, bizim ihtiyacımız (günde birkaç trend sorgusu) bunun çok altında. Ücretli bir üst
katman resmi dokümantasyonda tanımlı değil (büyük ölçek için Google'a özel talep gerekiyor, bizim
ölçeğimizde alakasız). **Sonuç: YouTube API eklemesi Talk and Heal'e ek maliyet getirmez.**

## Sparrow tarafı

Ayrı analiz: `/Users/selencelik/Desktop/PROJELER/Sparrow/SPARROW_API_MALIYET_MARJ_GORSEL_VIDEO.md`
(çok-müşterili/çok-sektörlü yeniden satış senaryosu, arama baremleri, marj hesabı orada).
