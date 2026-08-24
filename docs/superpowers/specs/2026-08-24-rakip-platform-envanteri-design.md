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

## DURUM (2026-08-24) — Task 1-5 kodlandı, ek bir katman TASARIM AŞAMASINDA (henüz kodlanmadı)

Yukarıdaki checkbox-bazlı manuel tasarım (Task 1-5) **tamamen kodlandı ve commit edildi**
(`3aeedea`, `23d4e7d`, `a1f67c5`, `096988f`, ayrıca frontend değişikliği `5f8930e`'ye karışmış
durumda — içerik doğru, sadece commit mesajı bunu anmıyor). Ama kullanıcı, manuel checkbox'ın
TEK mekanizma olmasının ürünün otomasyon vaadini boşa çıkardığını haklı olarak belirtti (20
rakiplik bir aramada kullanıcının her birini elle işaretlemesi gerekiyor). Bu yüzden **ek bir
otomatik tespit katmanı** tasarlandı ama **henüz koda dökülmedi** — bir sonraki oturumda buradan
devam edilmeli:

**Kararlaştırılan (ama kodlanmamış) tasarım:**
1. Rapor üretimi anında (icerikStrateji/aksiyonAnaliz), analiz edilen rakip(ler) için Claude'un
   web_search aracıyla hangi platformlarda aktif olduğu **canlı tespit edilir** — ephemeral,
   `rakipYorumBaglamiGetir`'in yorum metni için yaptığı gibi, `aktifPlatformlar` sütununun ANA
   DEĞERİNE hiç yazılmaz.
2. Bu tespit, o rakibin `aktifPlatformlar` hücresine **Sheets native hücre notu** (comment,
   `lib/sheets.ts`'e yeni bir `setCellNote` yardımcısı gerekir) olarak yazılır — "LLM tespiti,
   [tarih]: Instagram, Facebook" gibi. Hücrenin asıl değeri (checkbox'lardan gelen, kullanıcı
   onaylı) bu notla asla karışmaz/üzerine yazılmaz.
3. `platformDagilimOzetiGetir`'in **deterministik** "X/Y rakip Platform'de aktif" sayısı SADECE
   checkbox'tan gelen (kullanıcı onaylı) `aktifPlatformlar` hücre değerini kullanır — LLM'in
   ephemeral notundaki tahmini ASLA bu koda-yazılı agregasyona karıştırmaz (bu fonksiyon zaten
   böyle, DEĞİŞMİYOR).
4. Ayrı olarak, LLM'in ephemeral platform-tespiti (her analiz edilen rakip için ayrı ayrı, ham
   veri olarak) userPrompt'a EK bir bölüm olarak girer. Rapor LLM'i bu ham veriyi kullanarak
   HEM tekil rakip karşılaştırmasında HEM birden fazla rakibi birlikte yorumlayarak ("rakiplerin
   şu kadarı Instagram'da, biz de ağırlık vermeliyiz" gibi) serbestçe akıl yürütebilir — kısıtlanan
   sadece kod-tarafı deterministik sayı, LLM'in kendi prose-seviyesi sentezi DEĞİL.
5. **Maliyet (gerçek ölçüm, 2026-08-24):** rakip başına ~$0.11 (3 web_search çağrısı, Sonnet 5).
   Kullanıcı sert bir üst sınır istemiyor — sadece mevcut kota + "bu kadar rakip için kalan
   kotanız yetmez" uyarısı (kullanıcı fazla rakip seçerse kota kadarı işlenir, gerisi atlanır,
   neden eksik geldiği rapor arayüzünde açıklanır). Ayrı bir kota kategorisi (`KULLANIM_KATEGORILERI`)
   gerekiyor, tutarı henüz netleşmedi.
6. **Sparrow'a da (kod değil, doküman notu) işlenmesi gerekiyor** — hem Sparrow'un kendi
   RakipTakip'i hem müşteri-yüzü modülü için, `SPARROW_RAKIPTAKIP_CFO_VERI_KAYNAGI_ARASTIRMASI.md`'ye.

**Bir sonraki oturumda yapılacak:** ~~Bu maddeler henüz ayrı bir "Rapor Entegrasyonu — Otomatik
Platform Tespiti" spec bölümü olarak yazılmadı~~ → **TAMAMLANDI (2026-08-25)**, bkz. aşağıdaki
"Rapor Entegrasyonu — Otomatik Platform Tespiti" bölümü (kod örnekleri, tam fonksiyon imzaları,
test planı dahil). Bütçe kararı da kullanıcı tarafından onaylandı (2026-08-25: $5/ay → $8/ay, yeni
kategoriye $3/ay = aylikLimit 27) — bkz. o bölümün "Maliyet/Kota Kararı" alt başlığı. Sıradaki adım:
`writing-plans` → `executing-plans` akışına sokmak.

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

## Rapor Entegrasyonu — Otomatik Platform Tespiti (TASARIM, henüz kodlanmadı)

Yukarıdaki "DURUM (2026-08-24)" bölümünün kararlaştırdığı tasarımın resmi hâli. `rakipYorumBaglamiGetir`
(satır 502) ile AYNI ephemeral desen: canlı iste, kullan, hiçbir Sheet ana değerine yazma — tek fark,
veri kaynağı Google Places API değil, Claude'un kendi `web_search` aracı.

### Yeni mini-çağrı fonksiyonu: `platformTespitiYap` (`lib/claude.ts`)

`generateReport` bu iş için uygun değil — o, rapor-seviyesi genel bir sistem promptu + 8192 token'lık
tam metin rapor bekliyor; burada tek satırlık yapılandırılmış bir liste isteniyor. Ayrı, küçük bir
fonksiyon:

```ts
// Rakip Platform Tespiti (TASARIM, 2026-08-25) — rakipYorumBaglamiGetir'in Google Places yerine
// Claude'un web_search aracını kullanan eşdeğeri. generateReport'un aksine dar bir soru sorup
// TEK SATIRLIK yapılandırılmış yanıt bekler — büyük max_tokens/genel sistem promptu gereksiz.
export async function platformTespitiYap(env: Env, rakipIsim: string, rakipAdres: string): Promise<string> {
  const body = {
    model: MODEL,
    max_tokens: 512,
    system: `Sana verilen işletmenin hangi sosyal medya/iş platformlarında aktif olduğunu web
aramasıyla tespit et. SADECE şu listeden seç, başka platform adı uydurma:
${RAKIP_PLATFORM_LISTESI.join(', ')}.
Yanıtını TEK SATIRDA, virgülle ayrılmış platform adları olarak ver (ör. "Instagram, Facebook").
Emin olmadığın bir platformu ASLA ekleme. Hiçbir platform bulamazsan tamamen boş yanıt ver — açıklama
veya özür cümlesi yazma.`,
    messages: [{ role: 'user', content: `İşletme: ${rakipIsim}${rakipAdres ? ` (${rakipAdres})` : ''}` }],
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
  };
  const response = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`platformTespitiYap API çağrısı başarısız: ${response.status}`);
  const data = (await response.json()) as { content?: { type: string; text?: string }[] };
  return (data.content ?? []).filter((b) => b.type === 'text' && b.text).map((b) => b.text).join(' ').trim();
}
```

**Parse/normalize:** ham yanıt, checkbox akışının zaten kullandığı `aktifPlatformlarNormalize`
(satır 72, `RAKIP_PLATFORM_LISTESI.filter((p) => secilenler.includes(p)).join(',')`) fonksiyonuna
verilir — filtre/sıralama mantığı İKİ YERDE ayrı ayrı yazılmaz, tek kaynak. Listede olmayan bir
kelime (LLM'in "SADECE listeden seç" talimatını çiğneyip uydurması ihtimaline karşı deterministik
bir filtre — [[feedback_llm_skorlama_kanit_zorunlulugu]]'ndaki "asla tahmin etme talimatı tek
başına garanti değil" dersiyle aynı gerekçe) `aktifPlatformlarNormalize`'in `filter`'ı tarafından
sessizce elenir, loglanmaz (rakipYorumBaglamiGetir'in per-item try/catch'inin sessiz atlama
deseniyle tutarlı).

### Kota kontrolü ve kısmi işleme

`rakipYorumBaglamiGetir`'in aksine (tek `kotaDolduMu` çağrısıyla ya hep ya hiç), burada **kısmi işleme**
gerekiyor — kullanıcı "kalan kotanız yetmezse kalan kadarı işlensin, gerisi atlansın" dedi. Bunun için
`kotaDolduMu` yerine `getKullanimOzet`'in zaten döndürdüğü `kullanilan`/`aylikLimit` çifti kullanılır:

```ts
// routes/rakipAnalizi.ts, rakipYorumBaglamiGetir'in hemen altına
async function rakipPlatformTespitiBaglamiGetir(
  env: Env,
  rakipler: { rowNumber: number; row: RakipAnalizRow }[],
  rakipIds: string[],
): Promise<string> {
  if (!rakipIds.length) return '';
  const secililer = rakipler.filter(({ row }) => rakipIds.includes(row.id));
  if (!secililer.length) return '';

  const ozet = await getKullanimOzet(env);
  const { kullanilan, aylikLimit } = ozet.rakipPlatformTespiti;
  const kalanKota = aylikLimit === null ? Infinity : Math.max(0, aylikLimit - kullanilan);
  const islenecekler = secililer.slice(0, kalanKota);
  const atlananSayisi = secililer.length - islenecekler.length;

  const bloklar: string[] = [];
  for (const { rowNumber, row } of islenecekler) {
    try {
      const ham = await platformTespitiYap(env, row.isim, row.adres);
      await logKullanim(env, 'rakipPlatformTespiti', row.isim);
      if (!ham) continue;
      const platformlarStr = aktifPlatformlarNormalize(ham.split(',').map((p) => p.trim()).filter(Boolean));
      if (!platformlarStr) continue;
      const goruntu = platformlarStr.split(',').join(', ');
      bloklar.push(`${row.isim}: ${goruntu}`);
      // Hücre notu yazımı hata verirse rapor üretimini ENGELLEMEMELİ — ayrı try/catch (guard-timestamp
      // deseniyle aynı gerekçe: bir yan etkinin başarısızlığı diğerini bloklamamalı).
      try {
        await setAktifPlatformlarNotu(env, rowNumber, `LLM tespiti, ${new Date().toISOString().slice(0, 10)}: ${goruntu}`);
      } catch (err) {
        console.error(`setAktifPlatformlarNotu başarısız oldu (${row.isim})`, err);
      }
    } catch (err) {
      console.error(`platformTespitiYap başarısız oldu (${row.isim})`, err);
    }
  }
  if (!bloklar.length && !atlananSayisi) return '';
  let sonuc = bloklar.length
    ? `\n\nSeçilen rakip(ler)in canlı platform tespiti (sadece bu analiz için arandı, ana veriye
YAZILMADI — kullanıcı onaylı checkbox verisinden AYRI, ham/tekil gözlem):\n${bloklar.join('\n')}`
    : '';
  if (atlananSayisi > 0) {
    sonuc += `\n\n(${atlananSayisi} rakip için platform tespiti YAPILMADI — aylık kota doldu:
${kullanilan}/${aylikLimit}. Sıradaki ay otomatik sıfırlanır.)`;
  }
  return sonuc;
}
```

**Çağrı noktaları:** `rakipYorumBaglami` ile AYNI yerde (satır 675 `handleIcerikStrateji`, satır 824
`handleAksiyonAnaliz`), paralel bir ek satır — `rakipPlatformTespitiBaglami` adıyla userPrompt'a eklenir.
`Promise.all` ile `rakipYorumBaglamiGetir` çağrısıyla PARALEL çalıştırılabilir (ikisi birbirinden
bağımsız, sıralı beklemek gereksiz gecikme eklerdi).

### Hücre notu yazımı: `setAktifPlatformlarNotu` (`lib/rakipSheets.ts`)

Sheets API'nin native `note` alanı (CellData üzerinde) — Sheets'in ayrı/karmaşık "comments" (Drive
tabanlı, threadli) API'sinden FARKLI, basit bir metin notu; hücreye sağ-üstte küçük bir üçgen olarak
görünür, üzerine gelince metni gösterir. `deleteRakipAnalizRows`'daki (satır 125) sheetId-bulma
deseniyle aynı:

```ts
export async function setAktifPlatformlarNotu(env: Env, rowNumber: number, notMetni: string): Promise<void> {
  const response = await sheetsFetch(env, '?fields=sheets.properties(sheetId,title)');
  const data = (await response.json()) as { sheets?: { properties?: { sheetId?: number; title?: string } }[] };
  const sheetId = data.sheets?.find((s) => s.properties?.title === RAKIP_ANALIZI_TAB_NAME)?.properties?.sheetId;
  if (sheetId === undefined) throw new Error('RakipAnalizi tab bulunamadı, not yazılamadı.');
  const colIndex = RAKIP_ANALIZI_COLUMNS.indexOf('aktifPlatformlar');
  await sheetsFetch(env, ':batchUpdate', {
    method: 'POST',
    body: JSON.stringify({
      requests: [
        {
          updateCells: {
            range: { sheetId, startRowIndex: rowNumber - 1, endRowIndex: rowNumber, startColumnIndex: colIndex, endColumnIndex: colIndex + 1 },
            rows: [{ values: [{ note: notMetni }] }],
            fields: 'note',
          },
        },
      ],
    }),
  });
}
```

**Kritik güvenlik özelliği:** `fields: 'note'` mask'ı SADECE `note` alanını hedefler — Sheets API bu
maskın dışındaki alanlara (`userEnteredValue`, yani checkbox'lardan gelen asıl `aktifPlatformlar`
değeri) DOKUNMAZ. Bu, "ana değerle asla karışmaz/üzerine yazılmaz" gereksinimini kod-seviyesinde
garanti eden native API semantiği — ayrı bir koruma kodu yazmaya gerek yok, ama test planında
AÇIKÇA doğrulanmalı (aşağıya bkz.).

### Sistem prompt eki

Mevcut `PLATFORM_DAGILIM_TALIMATI_*` (istatistiksel, TÜM rakipler) ile KARIŞTIRILMAMALI — bu ayrı, sadece
seçili/tekil rakip(ler) için ham gözlem verisi:

```ts
const PLATFORM_TESPITI_TALIMATI = `
Sana seçili rakip(ler) için "canlı platform tespiti" başlığıyla verilen veri, o rakibin hangi
platformlarda aktif olduğuna dair GÜNCEL bir web aramasının ham sonucudur (checkbox'tan gelen
kullanıcı-onaylı veriden AYRI, doğrulanmamış bir gözlem). Bunu hem tekil rakip değerlendirmende hem
(birden fazla rakip seçiliyse) rakipler arası karşılaştırmada serbestçe kullanabilirsin (ör. "rakibin
X platformunda da aktif, sen henüz değilsin" gibi somut bir gözlem/öneriye çevir). Bu veri hiç
verilmemişse (veri yoksa ya da kota nedeniyle atlandıysa), bu konudan hiç bahsetme.`;
```

`ICERIK_STRATEJI_SYSTEM_PROMPT` ve `AKSIYON_ANALIZ_SYSTEM_PROMPT`'a, `${PLATFORM_DAGILIM_TALIMATI_*}`
ile aynı yere (RAPOR_YAPISI_TALIMATI'ndan hemen önce) `${PLATFORM_TESPITI_TALIMATI}` eklenir.

### Yeni kota kategorisi: `rakipPlatformTespiti` (`config.ts`)

```ts
// Rakip Platform Tespiti (2026-08-25, kullanıcı kararı) — Anthropic web_search ile canlı platform
// tespiti, rakip başına ~$0.11 (3 web_search çağrısı, Sonnet 5, gerçek ölçüm 2026-08-24).
// icerikStrateji/aksiyonAnaliz'in AKSİNE rapor başına DEĞİL, RAKİP başına maliyetli — çok rakipli
// bir raporda (ör. 10 rakip) tek başına ~$1.10'a çıkabilir. Kullanıcı "ayrı bütçe payı" seçeneğini
// onayladı: toplam Anthropic bütçesi $5/ay'dan $8/ay'a çıkarılıyor (bkz. config.ts başındaki genel
// KULLANIM_KATEGORILERI notu, o da güncellenmeli), yeni ~$3'lük pay bu kategoriye ayrıldı —
// icerikStrateji/aksiyonAnaliz limitleri DEĞİŞMEDİ. $3 / $0.11 ≈ 27.
rakipPlatformTespiti: { etiket: 'Rakip Platform Tespiti (Canlı Arama)', aylikLimit: 27 as number | null },
```

`KullanimKategori` union'a otomatik eklenir (`keyof typeof KULLANIM_KATEGORILERI`). Gerçek bir $
Anthropic kredisi tükettiği için `icerikStrateji`/`aksiyonAnaliz` ile AYNI gerekçeyle
`KULLANIM_LIMIT_ARTTIRILABILIR_KATEGORILER`'e de eklenir (Çiğdem "Limiti Yükselt" ile bunu da
açabilmeli):

```ts
export const KULLANIM_LIMIT_ARTTIRILABILIR_KATEGORILER = ['icerikStrateji', 'aksiyonAnaliz', 'rakipPlatformTespiti'] as const;
```

### Maliyet/Kota Kararı — KARARLAŞTIRILDI (2026-08-25)

Kullanıcı **"ayrı bütçe payı"**nı onayladı: toplam Anthropic bütçesi $5/ay → **$8/ay**'a çıkıyor, yeni
**$3/ay**'lık pay `rakipPlatformTespiti`'ye ayrıldı (**aylikLimit: 27**, $0.11/rakip ölçümüne göre).
`icerikStrateji`/`aksiyonAnaliz` limitleri (12/13) DEĞİŞMEDİ. Implementasyon sırasında
`config.ts`'in `KULLANIM_KATEGORILERI` başındaki genel bütçe yorumu ($5/ay diyor) da $8/ay'a
güncellenmeli — tek kaynak orası, iki yerde çelişen sayı kalmamalı.

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

### Otomatik Platform Tespiti (TASARIM aşaması, implementasyonla birlikte yazılacak)

- `rakipPlatformTespitiBaglamiGetir`: `rakipIds` boşsa → `''`, hiç `platformTespitiYap` çağrılmadığını
  doğrula (fetch mock hiç tetiklenmemeli).
- Kota tam doluyken (`kullanilan >= aylikLimit`) → hiçbir rakip işlenmez, dönen metin sadece "X rakip
  için platform tespiti YAPILMADI" notu içerir, `platformTespitiYap` hiç çağrılmaz.
- Kota kısmen doluyken (ör. 3 rakip seçili, kalan kota 1) → sadece ilk 1 işlenir, `atlananSayisi: 2`
  notu doğru sayıyla rapora eklenir.
- `platformTespitiYap`'ın döndürdüğü ham metinde `RAKIP_PLATFORM_LISTESI` DIŞI bir kelime (ör. LLM
  "Snapchat" derse) varsa bu deterministik olarak filtrelenip atıldığını doğrula — [[feedback_llm_skorlama_kanit_zorunlulugu]]
  dersiyle aynı gerekçe: LLM'in "sadece listeden seç" talimatına güvenmek tek başına yetmez.
  `web_search` boş/hiç sonuç dönmezse (ham metin boş) o rakip sessizce atlanır, hata fırlatmaz.
  Bir rakip için `platformTespitiYap` hata fırlatırsa (API hatası) diğer rakiplerin işlenmesi
  ENGELLENMEZ (per-item try/catch izolasyonu, `rakipYorumBaglamiGetir` ile aynı desen).
- `setAktifPlatformlarNotu`: gönderilen `batchUpdate` body'sinde `fields: 'note'` dışında hiçbir alan
  hedeflenmediğini doğrula (mock `sheetsFetch` çağrı argümanı assert) — bu, ana `aktifPlatformlar`
  değerinin (checkbox onaylı) LLM notuyla ASLA karışmadığının kod-seviyesi kanıtı. `setAktifPlatformlarNotu`
  hata fırlatırsa (ör. sheetId bulunamadı) `rakipPlatformTespitiBaglamiGetir`'in genel akışının
  ENGELLENMEDİĞİNİ (diğer rakiplerin/raporun üretilmeye devam ettiğini) doğrula.
- `platformDagilimOzetiGetir` (mevcut, deterministik istatistik) bu yeni ephemeral veriden hiç
  etkilenmediğini doğrula — iki fonksiyon birbirinden tamamen bağımsız veri kaynağı kullanmalı.
