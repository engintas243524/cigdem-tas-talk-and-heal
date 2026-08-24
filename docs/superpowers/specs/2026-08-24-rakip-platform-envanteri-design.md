# Rakip Platform Envanteri — Tasarım

_(İlk taslakta "+ Kaynak Notu" başlığı, Sheets hücre-notu mekanizmasına atıfla vardı — bu
mekanizma 2026-08-24 düzeltmesiyle kaldırıldığı için başlıktan çıkarıldı, bkz. Veri Modeli
bölümündeki DÜZELTME notu.)_

## Bağlam

Mevcut `RakipAnalizi` sekmesinde (bkz. `2026-08-14-rakip-analizi-design.md`) rakiplerin 20
analiz parametresinden sadece `konum` (arama yarıçapından hesaplanır) ve kısmen `googlePuani`
(2026-08-23'te eklenen ephemeral yorum-metni analiziyle) otomatik toplanıyor — geri kalan 18'i
tamamen Çiğdem'in serbest metin `not` alanına yazdığı gözleme bağlı (kod taraması ile
doğrulandı, `ANALIZ_PARAMETRE_ACIKLAMALARI`).

Bu özellik, bir parametreyi ("sosyal medya aktifliği") **yapılandırılmış** hale getiriyor:
Çiğdem her rakip için hangi platformlarda aktif olduğunu işaretleyebiliyor, bu veri raporlara
otomatik istatistik olarak besleniyor. **Kapsam: sadece Talk & Heal'de kodlanacak.** Sparrow'un
`SPARROW_RAKIPTAKIP_CFO_VERI_KAYNAGI_ARASTIRMASI.md`'sindeki aynı 11 platform matrisiyle
tutarlı tutulacak ama Sparrow'a kod değil, doküman notu olarak işlenecek.

## Platform Listesi

Sabit sıralı 11 platform (Sparrow'un matrisiyle aynı):

```ts
export const RAKIP_PLATFORM_LISTESI = [
  'Facebook', 'Instagram', 'LinkedIn', 'X', 'TikTok', 'YouTube',
  'Bluesky', 'Threads', 'Google Business', 'Pinterest', 'Mastodon',
] as const;
```

`config.ts`'e, `RAKIP_ANALIZI_COLUMNS`'un üstüne/yanına eklenir.

## Veri Modeli

`RAKIP_ANALIZI_COLUMNS`'a (config.ts) 4 yeni sütun, mevcut `insertDimension` prosedürüyle
(CLAUDE.md'deki "yeni sütun ekleme" kuralı — önce Sheets API'de `insertDimension`, sonra kod)
`placeId`'nin hemen yanına eklenir:

- **`aktifPlatformlar`** — virgülle ayrılmış tek metin sütunu (11 ayrı sütun DEĞİL). Gerekçe:
  Sheet okunabilirliği + gelecekte yeni platform eklemenin şema migrasyonu gerektirmemesi.
  Sıra her zaman `RAKIP_PLATFORM_LISTESI` sırasına göre normalize edilir (backend'de
  birleştirilirken), böylece aynı platform kümesi her zaman aynı string'i üretir.
- **`googlePuaniGozlemi`** — Çiğdem'in Google Maps'te kendi gözüyle gördüğü puan (ör. `"4.7"`),
  **elle girilir**.
- **`googleYorumSayisiGozlemi`** — Çiğdem'in gördüğü toplam yorum sayısı (ör. `"128"`), **elle
  girilir**.
- **`gozlemTarihiUtc`** — bu iki alanın (+ `aktifPlatformlar`'ın) en son ne zaman güncellendiği
  (ISO tarih), otomatik damgalanır.

**DÜZELTME (2026-08-24, bu oturumda bulundu — Bölüm 2026-08-14'teki ilk tasarımın aksine):**
İlk tasarımda bu iki alanın `kaynak==='harita'` + `placeId` varsa mevcut Text Search
çağrısından **otomatik** doldurulması planlanmıştı ("Sparrow'un ToS-uyumlu 'gözlem kaydı'
deseni" gerekçesiyle). Bu oturumda birincil kaynaklardan (Google'ın resmi Places API caching
policy sayfası + Sparrow'un kendi `sparrow-hata-gunlugu/13-.../13-raktiptakip-cfo-veri-kaynagi-
hukuki-arastirma.md` dosyası, satır 178-183: "kritik bulgu" diye işaretli, hiç geri
alınmamış) doğrulandı ki bu gerekçe geçersiz — Google Maps Platform ToS'un "must not pre-fetch,
cache, or store Places API content beyond the allowed exceptions" kısıtı **tier'dan bağımsız**
(ücretli planda da istisna yok, ayrıca doğrulandı) ve **tek istisna Place ID**. "Gözlem kaydı"
diye adlandırmak veya ekran görüntüsü alıp sonra elle tabloya işlemek bu kısıtı dolanmıyor —
API'den (veya otomatik ekran görüntüsüyle Google Maps sayfasından) gelen içerik hangi ara
adımdan geçerse geçsin kalıcı saklanamıyor. Tek hukuka uygun yol: bu iki alanın **API'den hiç
çekilmeden**, Çiğdem'in (ya da ileride Sparrow müşterisinin) kendi gözlemine dayalı **manuel
giriş** olması — tıpkı rakip-analizi araçlarının (Rival IQ, Sprout Social — Sparrow'un kendi
araştırmasında zaten belgelenmiş) Google puanı için "manuel inceleme gerekiyor" dediği gibi.
Otomatik doldurma tamamen kaldırıldı, aşağıdaki "Panel UI + Backend Mantığı" bölümü buna göre
güncellendi.

`RAKIP_ANALIZI_COLUMN_LABELS`'a karşılık gelen 4 Türkçe başlık eklenir: `'Aktif Platformlar'`,
`'Google Puanı (Gözlem)'`, `'Google Yorum Sayısı (Gözlem)'`, `'Gözlem Tarihi (UTC)'`.

## Panel UI + Backend Mantığı

**Form:** `rakip-analizi.html`'deki Rakip Ekle/Düzenle formuna (`rakipEkleField`, satır ~79) 11
checkbox eklenir — `RAKIP_PLATFORM_LISTESI`'nden dinamik üretilir (JS içinde diziden DOM
oluşturulur, 11 checkbox'ı elle HTML'e yazmak yerine). Düzenleme akışı, mevcut
`rakipEkleDuzenleAlanlarPaneliOlustur`'daki "sadece işaretlenen/değiştirilen alan gönderilir"
deseniyle tutarlı olacak şekilde entegre edilir.

**Backend birleştirme:** `handleRakipEkle`/`handleRakipDuzelt`, gelen checkbox listesini
`RAKIP_PLATFORM_LISTESI` sırasına göre normalize edip virgülle birleştirir, `aktifPlatformlar`
sütununa yazar.

**Google puanı/yorum sayısı — tamamen manuel giriş:** `googlePuaniGozlemi`/
`googleYorumSayisiGozlemi`, forma eklenen iki serbest sayı alanı — Çiğdem Google Maps'te kendi
gözüyle gördüğü değerleri buraya yazar. Backend bu iki alanı **hiçbir Google API çağrısından
otomatik doldurmaz** (`kaynak==='harita'`/`'manuel'` farketmez, ikisinde de aynı davranış).
`handleRakipEkle`/`handleRakipDuzelt`, bu iki alandan en az biri değiştiyse `gozlemTarihiUtc`'yi
o anki UTC zamanına günceller (aynı davranış `aktifPlatformlar` değiştiğinde de geçerli —
`gozlemTarihiUtc` üçünün ortak "son güncelleme" damgası).

**Rating gözlem zamanlaması:** Çiğdem ne zaman Google Maps'e bakıp bu alanları
güncellerse o an kaydedilir — otomatik cron/periyodik tazeleme YOK (zaten mümkün değil, API'den
hiç çekilmiyor).

## Rapor Entegrasyonu

### `platformDagilimOzetiGetir` fonksiyonu

`routes/rakipAnalizi.ts`'e, `rakipYorumBaglamiGetir`'in (satır 439) yanına eklenir:

```ts
function platformDagilimOzetiGetir(rakipler: { row: RakipAnalizRow }[]): string {
  const kayitliRakipler = rakipler.filter(({ row }) => row.kaynak === 'manuel' || row.kaynak === 'harita');
  const platformluRakipler = kayitliRakipler.filter(({ row }) => row.aktifPlatformlar.trim());
  if (!platformluRakipler.length) return '';

  const sayaclar: Record<string, number> = {};
  for (const platform of RAKIP_PLATFORM_LISTESI) sayaclar[platform] = 0;
  for (const { row } of platformluRakipler) {
    for (const p of row.aktifPlatformlar.split(',').map((x) => x.trim()).filter(Boolean)) {
      if (p in sayaclar) sayaclar[p]++;
    }
  }
  const toplam = platformluRakipler.length;
  const satirlar = RAKIP_PLATFORM_LISTESI.filter((p) => sayaclar[p] > 0)
    .sort((a, b) => sayaclar[b] - sayaclar[a])
    .map((p) => `${sayaclar[p]}/${toplam} rakip ${p}'de aktif`);
  return `\n\nRakip platform envanteri (${toplam} rakip için platform bilgisi girildi):\n${satirlar.join('\n')}`;
}
```

**Kapsam kararı:** Her zaman **TÜM kayıtlı rakipler** üzerinden hesaplanır — `rakipIds`
seçimine bakılmaz (mevcut iki dalın farklı `rakipIds`-boş davranışından bağımsız, tutarlı tek
davranış). Payda (`toplam`) sadece platform bilgisi girilmiş rakip sayısıdır, tüm kayıtlı
rakip sayısı değil — Sparrow'un "hiç doldurulmamış rakipler paydaya dahil edilmez" kuralıyla
tutarlı (veri eksikliği "o platformda değil" anlamına gelmemeli). Hiç veri yoksa boş string
döner — çağrıldığı yerde userPrompt'a hiçbir şey eklenmez, ayrı bir "veri yok" cümlesi
üretilmez (mevcut `rakipYorumBaglamiGetir`'in kota/hata durumundaki sessiz atlama deseniyle
aynı).

**Çağrı noktaları:** Hem `handleIcerikStrateji` hem `handleAksiyonAnaliz`'de, `rakipIds`
boş/dolu farkı gözetmeksizin `userPrompt`'a koşulsuz eklenir — `aksiyonAnaliz`'deki mevcut
`rakipOzet ? ... : null` dalından tamamen bağımsız, ayrı bir ek satır.

### Sistem prompt talimatı

`routes/rakipAnalizi.ts`'e üç yeni sabit eklenir (`RAKIP_ANALIZ_PARAMETRE_GRUPLARI` /
`ICERIK_ETIK_UYARI_METNI` ile aynı kalıpta):

```ts
const PLATFORM_DAGILIM_TALIMATI_CEKIRDEK = `
Sana "Rakip platform envanteri" başlığıyla verilen istatistik, hangi platformda kaç rakibin aktif
olduğunu gösterir (payda sadece platform bilgisi girilmiş rakipleri kapsar, hiç işaretlenmemiş
rakipler sayılmaz). Bu ham sayıyı asla olduğu gibi tekrarlama ("5 rakipten 3'ü Instagram'da"
şeklinde okuyucuya aynen aktarma) — SEN bunu yorumlayıp somut bir öneriye çevir (ör. rakiplerin
çoğunun bulunmadığı bir platform bir fırsat mı, yoksa çoğunun bulunduğu bir platform zaten
kanıtlanmış bir kanal mı). Bu istatistik hiç verilmemişse (veri yoksa), bu konudan hiç bahsetme.`;

const PLATFORM_DAGILIM_TALIMATI_ICERIK = `${PLATFORM_DAGILIM_TALIMATI_CEKIRDEK}
Hangi platformda içerik önereceğine karar verirken bu envanteri gerekçelerinden biri olarak kullan
(ör. "rakiplerin çoğu bu platformda değil, boşluk var" ya da "rakipler burada yoğun, senin de
burada görünür olman gerekiyor").`;

const PLATFORM_DAGILIM_TALIMATI_AKSIYON = `${PLATFORM_DAGILIM_TALIMATI_CEKIRDEK}
"## Rakip Karşısında Konumlanma" (veya benzeri) bölümünde bu envanteri somut bir gözlem/aksiyon
maddesi olarak kullan.`;
```

`ICERIK_STRATEJI_SYSTEM_PROMPT` ve `AKSIYON_ANALIZ_SYSTEM_PROMPT` template literal'lerinin
sonuna, mevcut `${RAPOR_YAPISI_TALIMATI}` ekinden hemen önce sırasıyla
`${PLATFORM_DAGILIM_TALIMATI_ICERIK}` / `${PLATFORM_DAGILIM_TALIMATI_AKSIYON}` eklenir.

"Veri yoksa hiç bahsetme" talimatı fonksiyon seviyesinde zaten garanti edilse de (boş string
döner) prompt seviyesinde tekrar belirtiliyor — LLM'in kendi genel bilgisinden "muhtemelen
çoğu rakip Instagram'dadır" gibi halüsinasyon üretmesini önlemek için, `rakipOzetOlustur`'un
"(henüz rakip verisi yok)" dönüşüne benzer bir güvenlik katmanı.

## Test Planı

- `platformDagilimOzetiGetir`: boş rakip listesi → `''`; hiçbir rakipte `aktifPlatformlar`
  dolu değilse → `''`; karışık (bazıları dolu bazıları boş) → payda sadece dolu olanları
  sayar; sıralama azalan sayıya göre, eşitlikte `RAKIP_PLATFORM_LISTESI` sırası korunur.
- `handleRakipEkle`/`handleRakipDuzelt`: checkbox listesi → normalize edilmiş
  `aktifPlatformlar` string'i (sırasız gönderilen input bile `RAKIP_PLATFORM_LISTESI` sırasına
  normalize olmalı).
- `handleRakipEkle`/`handleRakipDuzelt`: `googlePuaniGozlemi`/`googleYorumSayisiGozlemi`/
  `aktifPlatformlar`'dan biri değiştiğinde `gozlemTarihiUtc`'nin güncellendiğini, hiçbiri
  değişmediğinde dokunulmadığını doğrula. Bu iki alanın hiçbir Google API çağrısı
  YAPILMADAN (mock/spy ile `searchCompetitorsInArea`/`getPlaceReviews` hiç çağrılmadığını
  doğrulayarak) sadece body'den gelen değeri yazdığını doğrula.
