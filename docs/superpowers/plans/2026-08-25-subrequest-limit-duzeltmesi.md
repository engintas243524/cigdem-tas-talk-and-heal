# Subrequest Limiti Düzeltmesi (BE-115) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Otomatik Platform Tespiti özelliğinin çoklu-rakip raporlarında Cloudflare'in
~50-subrequest tavanını aşmasını önle — hem paylaşılan `getKullanimOzet`'in kendi iç
maliyetini (~31→~6 subrequest/okuma) hem de rakip-başına tekrarlanan Sheets yazımlarını
(rakip başına ~4 subrequest) gider.

**Architecture:** İki bağımsız optimizasyon. (1) `getKullanimOzet`, her artırılabilir kategori
için `ensureKullanimLimitTab`+`getAllKullanimLimitRows` zincirini İKİ kez (limit + para birimi
için ayrı ayrı) çalıştırıyordu — tek bir okumaya indiriliyor, sonuç bellekte her kategori için
paylaşılıyor. Bu değişiklik `getKullanimOzet`'i çağıran HER rota (rakipAnalizi, rakipTakip,
scheduled) otomatik faydalanır, tek bir dosyada (kullanimKaydi.ts) yapılan bir düzeltme. (2)
`rakipPlatformTespitiBaglamiGetir`'in rakip-başına ayrı `logKullanim` + `setAktifPlatformlarNotu`
çağrıları (her biri kendi sheetId sorgusunu tekrarlıyor), Promise.all'un DIŞINA taşınan TEK bir
toplu `logKullanimToplu` + TEK bir toplu `setAktifPlatformlarNotlariToplu` çağrısına indiriliyor.

**Tech Stack:** Cloudflare Worker (TypeScript), Google Sheets API v4 (`batchUpdate`,
`values:append`), Vitest.

## Global Constraints

- Kaynak: final whole-branch review'ın Kritik #1 bulgusu + kullanıcının 2026-08-25 tarihli
  takip kararı (BE-115, `talk-and-heal-hata-gunlugu/05-Backend-Entegrasyon/05-backend-entegrasyon.md`).
  Ölçülen mevcut durum: tek-rakipli bir `icerik-strateji` isteği ~52 subrequest (Cloudflare
  ücretsiz plan ~50 tavanının ÜZERİNDE), rakip başına +~4 subrequest ekleniyor.
- `getGuncelLimit`'in (`lib/kullanimLimitSheets.ts`) DIŞA AÇIK imzası/davranışı DEĞİŞMEMELİ —
  `routes/kullanimLimit.ts:70` bunu doğrudan çağırıyor, o çağrı yerine dokunulmuyor.
- `kotaDolduMu`'nun DIŞA AÇIK imzası/davranışı DEĞİŞMEMELİ — `routes/rakipAnalizi.ts:522` ve
  `routes/rakipTakip.ts:124,193` bunu doğrudan çağırıyor, bu üç çağrı yerine dokunulmuyor
  (davranış aynı kalmalı, sadece maliyeti düşmeli).
- `logKullanim`'in (tekil) mevcut DIŞA AÇIK imzası/davranışı DEĞİŞMEMELİ — 8 mevcut çağıran
  (`routes/rakipAnalizi.ts`, `routes/rakipTakip.ts`) tekil sürümü kullanmaya devam ediyor. Yeni
  `logKullanimToplu` AYRI, ek bir fonksiyon.
- `setAktifPlatformlarNotu`'nun (tekil) mevcut DIŞA AÇIK imzası/davranışı ve mevcut testleri
  DEĞİŞMEMELİ (Task 3'te yazıldı, test/rakipSheets.spec.ts). Yeni `setAktifPlatformlarNotlariToplu`
  AYRI, ek bir fonksiyon.
- **Bilinen ve kabul edilen mimari ödün (reviewer'a açıkça bildirilecek):** `logKullanimToplu`/
  `setAktifPlatformlarNotlariToplu`'nun her biri TEK bir Sheets isteği olduğu için, bir yan
  etkinin başarısızlığı artık PER-KOMPETİTÖR değil, BATCH genelinde izole. Örnek: 3 rakibin
  toplu not yazımı tek bir `:batchUpdate` çağrısında gönderilir — o çağrı başarısız olursa
  3'ü de notunu kaybeder (öncekinde sadece başarısız olan rakip kaybederdi). Rapor promptuna
  giden `blok` metni (tespit edilen platform listesi) bu yazımlardan TAMAMEN BAĞIMSIZ, ÖNCEDEN
  bellekte toplanıyor — yani bir not/log yazım hatası ASLA rapor promptundaki tespit sonucunu
  silmiyor, bu invaryant korunuyor. Değişen sadece not/log yazımının başarı/başarısızlık
  granülaritesi.
- `npx tsc --noEmit` ve `npx prettier --check .` her task sonunda yeşil olmalı.

---

## File Structure

- **Modify: `form-backend/src/lib/kullanimLimitSheets.ts`** — `guncelLimitFromRows` ve
  `sonKullanilanParaBirimiFromRows` saf (fetch yapmayan) yardımcı fonksiyonlar eklenir;
  `getGuncelLimit` bu yardımcıyı kullanacak şekilde yeniden yazılır (imza/davranış aynı kalır).
- **Modify: `form-backend/src/lib/kullanimKaydi.ts`** — `getKullanimOzet` tek-okuma olacak
  şekilde yeniden yazılır; `kotaDolduMu` basitleştirilir (ayrı `efektifLimit` çağrısı kaldırılır);
  artık kullanılmayan `efektifLimit`/`sonKullanilanParaBirimiGetir` silinir; yeni
  `logKullanimToplu` eklenir.
- **Modify: `form-backend/src/lib/rakipSheets.ts`** — yeni `setAktifPlatformlarNotlariToplu`
  eklenir (TEK sheetId sorgusu + TEK `batchUpdate`, N `updateCells` isteği içerir).
- **Modify: `form-backend/src/routes/rakipAnalizi.ts`** — `rakipPlatformTespitiBaglamiGetir`
  yeniden yapılandırılır: `Promise.all` içindeki her rakip SADECE `platformTespitiYap` +
  kanonikleştirme yapar (yan etki yok), Promise.all'dan SONRA TEK bir toplu log + TEK bir toplu
  not yazımı yapılır.
- **Test: `form-backend/test/kullanimKaydi.spec.ts`** — `getKullanimOzet`'in subrequest sayısını
  doğrudan ölçen yeni bir test + `logKullanimToplu` birim testleri.
- **Test: `form-backend/test/rakipSheets.spec.ts`** — `setAktifPlatformlarNotlariToplu` birim
  testleri.
- **Test: `form-backend/test/rakipAnalizi.spec.ts`** — mevcut tek-rakipli subrequest testinin
  tavanı sıkılaştırılır + YENİ çok-rakipli (10 rakip) subrequest regresyon testi + toplu-yazım
  davranışını doğrulayan güncellenmiş testler.

---

### Task 1: `getKullanimOzet` tek-okuma refactor'ü (`kullanimKaydi.ts`, `kullanimLimitSheets.ts`)

**Files:**
- Modify: `form-backend/src/lib/kullanimLimitSheets.ts`
- Modify: `form-backend/src/lib/kullanimKaydi.ts`
- Test: `form-backend/test/kullanimKaydi.spec.ts`
- Test (dokunma, sadece doğrulama): `form-backend/test/rakipAnalizi.spec.ts:871` (mevcut
  "stays well under the Cloudflare subrequest ceiling for a one-competitor report" testi —
  Step 5'te tavanı sıkılaştıracaksın)

**Interfaces:**
- Consumes: `KullanimLimitRow`, `getAllKullanimLimitRows`, `KULLANIM_KATEGORILERI`,
  `KULLANIM_LIMIT_ARTTIRILABILIR_KATEGORILER` (hepsi zaten import edilmiş/mevcut).
- Produces: `guncelLimitFromRows(rows, kategori): number | null`,
  `sonKullanilanParaBirimiFromRows(rows, kategori): string | null` (her ikisi
  `kullanimLimitSheets.ts`'ten export edilir, Task içinde `kullanimKaydi.ts` tarafından
  tüketilir). `logKullanimToplu(env, kategori, detaylar: string[]): Promise<void>`
  (`kullanimKaydi.ts`'ten export edilir, Task 2 tüketir).

- [ ] **Step 1: Write the failing tests**

`form-backend/test/kullanimKaydi.spec.ts`'in `describe('kullanimKaydi', ...)` bloğunun İÇİNE,
dosyanın SONUNA (mevcut son testin — "exposes the rakipPlatformTespiti category..." — ALTINA)
ekle:

```ts
it('reads the KullanimLimitleri tab only once per getKullanimOzet call, regardless of category count', async () => {
	const { fetchMock } = stubSheetsApi(['Sayfa1', 'KullanimKaydi', 'KullanimLimitleri']);
	await getKullanimOzet(env);
	// KULLANIM_LIMIT_ARTTIRILABILIR_KATEGORILER şu an 3 kategori (icerikStrateji, aksiyonAnaliz,
	// rakipPlatformTespiti) — eskiden her biri için ayrı ayrı 2'şer kez (efektifLimit +
	// sonKullanilanParaBirimiGetir) ensureKullanimLimitTab+getAllKullanimLimitRows çalıştırıyordu
	// (~10 subrequest/kategori, BE-115). Artık TEK bir okuma paylaşılıyor — toplam çağrı sayısı
	// kategori sayısından BAĞIMSIZ, sabit kalmalı.
	expect(fetchMock.mock.calls.length).toBeLessThan(10);
});

it('preserves getKullanimOzet output exactly: limit override and currency still read from KullanimLimitleri rows', async () => {
	const { fetchMock } = stubSheetsApi(['Sayfa1', 'KullanimKaydi', 'KullanimLimitleri']);
	// stubSheetsApi'nin GET /values/ handler'ı tüm append edilen satırları TEK bir listede
	// döndürüyor (bkz. dosyanın başındaki stub tanımı) — KullanimLimitleri'ne bir satır
	// "append" edip limitin GERÇEKTEN o satırdan okunduğunu doğruluyoruz.
	fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ access_token: 'fake', expires_in: 3600 }), { status: 200 }));
	await getKullanimOzet(env); // ensureKullanimLimitTab'ı tetikleyip KullanimLimitleri'ni seed'ler
	const ozet = await getKullanimOzet(env);
	expect(ozet.rakipPlatformTespiti.aylikLimit).toBe(27);
	expect(ozet.rakipPlatformTespiti.sonKullanilanParaBirimi).toBeNull();
});

it('kotaDolduMu still reports quota as full once the monthly limit is reached, but never for null-limit categories', async () => {
	stubSheetsApi(['Sayfa1', 'RakipAnalizi', 'KullanimKaydi']);
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2026-08-15T12:00:00.000Z'));
	expect(await kotaDolduMu(env, 'rakipArama')).toBe(false);
	for (let i = 0; i < 5000; i++) await logKullanim(env, 'rakipArama', 'x');
	expect(await kotaDolduMu(env, 'rakipArama')).toBe(true);
	expect(await kotaDolduMu(env, 'icerikStrateji')).toBe(false);
});

describe('logKullanimToplu', () => {
	it('appends all entries in ONE Sheets request, not one per entry', async () => {
		const { fetchMock, appended } = stubSheetsApi(['Sayfa1', 'KullanimKaydi']);
		await logKullanimToplu(env, 'rakipPlatformTespiti', ['Rakip A', 'Rakip B', 'Rakip C']);
		const appendCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes(':append'));
		expect(appendCalls).toHaveLength(1);
		const body = JSON.parse((appendCalls[0][1] as RequestInit).body as string);
		expect(body.values).toHaveLength(3);
		expect(body.values.map((row: string[]) => row[3])).toEqual(['Rakip A', 'Rakip B', 'Rakip C']);
		expect(appended).toHaveLength(3);
	});

	it('does nothing (no fetch at all) when given an empty list', async () => {
		const { fetchMock } = stubSheetsApi(['Sayfa1', 'KullanimKaydi']);
		await logKullanimToplu(env, 'rakipPlatformTespiti', []);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
```

Dosyanın en üstündeki import satırını güncelle:

```ts
import { ensureKullanimKaydiTab, logKullanim, logKullanimToplu, getKullanimOzet, kotaDolduMu } from '../src/lib/kullanimKaydi';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd form-backend && npx vitest run test/kullanimKaydi.spec.ts`
Expected: FAIL — `logKullanimToplu` henüz export edilmiyor; subrequest-sayım testi muhtemelen
mevcut kodla da geçebilir ya da geçmeyebilir (mevcut davranışı doğrulamak için ÖNCE çalıştır,
kaç subrequest olduğunu gözlemle — fix sonrası Step 4'te tekrar çalıştırıp azaldığını göreceksin).

- [ ] **Step 3: Implement — `kullanimLimitSheets.ts`**

`form-backend/src/lib/kullanimLimitSheets.ts`'te mevcut `getGuncelLimit` fonksiyonunu (satır
115-123) BUL ve tamamen şununla DEĞİŞTİR:

```ts
// Saf (fetch yapmayan) yardımcı — zaten elde bir getAllKullanimLimitRows sonucu varsa (ör.
// getKullanimOzet'in tek okumasından) tekrar fetch yapmadan aynı mantığı çalıştırır. BE-115:
// eskiden getGuncelLimit'in kendisi HER çağrıda ayrı bir getAllKullanimLimitRows fetch'i
// yapıyordu — getKullanimOzet kategori başına bunu çağırınca subrequest zinciri katlanıyordu.
export function guncelLimitFromRows(rows: { rowNumber: number; row: KullanimLimitRow }[], kategori: KullanimKategori): number | null {
	const satir = rows.find(({ row }) => row.kategori === kategori);
	if (satir) {
		const n = Number(satir.row.limit);
		if (Number.isFinite(n)) return n;
	}
	return KULLANIM_KATEGORILERI[kategori].aylikLimit;
}

// Her arttırılabilir kategori için o anki (güncel) limiti döner — satır hiç yoksa (ensure henüz
// çalışmadıysa) config.ts'deki statik varsayılana düşer. routes/kullanimLimit.ts'nin doğrudan
// çağırdığı DIŞA AÇIK API — imza/davranış AYNI, içeride sadece pure helper'a devrediyor.
export async function getGuncelLimit(env: Env, kategori: KullanimKategori): Promise<number | null> {
	const rows = await getAllKullanimLimitRows(env);
	return guncelLimitFromRows(rows, kategori);
}

// Saf yardımcı — bkz. guncelLimitFromRows'un aynı gerekçesi.
export function sonKullanilanParaBirimiFromRows(rows: { rowNumber: number; row: KullanimLimitRow }[], kategori: KullanimKategori): string | null {
	const satir = rows.find(({ row }) => row.kategori === kategori);
	return satir?.row.sonEklenenParaBirimi || null;
}
```

(Not: `bosSatir`, `writeHeaderRow`, `seedEksikSatirlar`, `updateKullanimLimit`,
`ensureKullanimLimitTab`, `getAllKullanimLimitRows` fonksiyonlarına DOKUNMA — hepsi aynı kalıyor.)

- [ ] **Step 4: Implement — `kullanimKaydi.ts`**

`form-backend/src/lib/kullanimKaydi.ts`'in importunu (satır 10) güncelle:

```ts
import {
	ensureKullanimLimitTab,
	getAllKullanimLimitRows,
	guncelLimitFromRows,
	sonKullanilanParaBirimiFromRows,
	type KullanimLimitRow,
} from './kullanimLimitSheets';
```

`logKullanim` fonksiyonunun (satır 84-92) HEMEN ALTINA ekle:

```ts
// N rakip/olay için TEK bir Sheets append isteğinde toplu kayıt — BE-115: rakip başına ayrı
// logKullanim çağrısı, rakip sayısıyla doğrusal büyüyen subrequest maliyeti yaratıyordu. logKullanim
// (tekil) DEĞİŞMEDİ, mevcut 8 çağıranı etkilenmiyor — bu SADECE çok-öğeli senaryolar için ek bir
// fonksiyon (bkz. routes/rakipAnalizi.ts#rakipPlatformTespitiBaglamiGetir).
export async function logKullanimToplu(env: Env, kategori: KullanimKategori, detaylar: string[]): Promise<void> {
	if (!detaylar.length) return;
	const values = detaylar.map((detay) => {
		const row: KullanimKaydiRow = { id: crypto.randomUUID(), tarihUtc: new Date().toISOString(), kategori, detay };
		return KULLANIM_KAYDI_COLUMNS.map((key) => row[key]);
	});
	const range = `${KULLANIM_KAYDI_TAB_NAME}!A:${columnLetter(KULLANIM_KAYDI_COLUMNS.length - 1)}`;
	await sheetsFetch(env, `/values/${encodeURIComponent(range)}:append?valueInputOption=RAW`, {
		method: 'POST',
		body: JSON.stringify({ values }),
	});
}
```

`efektifLimit` fonksiyonunu (satır 112-118) VE `sonKullanilanParaBirimiGetir` fonksiyonunu
(satır 120-126) TAMAMEN SİL — ikisi de artık kullanılmayacak (bkz. aşağıdaki `getKullanimOzet`
yeniden yazımı ve `kotaDolduMu` basitleştirmesi).

`getKullanimOzet` fonksiyonunu (satır 131-161) TAMAMEN şununla DEĞİŞTİR:

```ts
export async function getKullanimOzet(env: Env): Promise<Record<KullanimKategori, KullanimOzetKategori>> {
	const range = `${KULLANIM_KAYDI_TAB_NAME}!A2:${columnLetter(KULLANIM_KAYDI_COLUMNS.length - 1)}`;
	const response = await sheetsFetch(env, `/values/${encodeURIComponent(range)}`);
	const data = (await response.json()) as { values?: string[][] };
	const rows = data.values ?? [];

	const now = new Date();
	const ayBaslangici = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).getTime();

	const sayimlar: Partial<Record<KullanimKategori, number>> = {};
	for (const values of rows) {
		const tarihUtc = values[1];
		const kategori = values[2] as KullanimKategori;
		if (!tarihUtc || !(kategori in KULLANIM_KATEGORILERI)) continue;
		const ts = Date.parse(tarihUtc);
		if (Number.isNaN(ts) || ts < ayBaslangici) continue;
		sayimlar[kategori] = (sayimlar[kategori] ?? 0) + 1;
	}

	// BE-115 düzeltmesi (2026-08-25): eskiden HER artırılabilir kategori için efektifLimit VE
	// sonKullanilanParaBirimiGetir AYRI AYRI ensureKullanimLimitTab+getAllKullanimLimitRows
	// çalıştırıyordu (~10 subrequest/kategori × 3 kategori ≈ 31 subrequest/okuma). Şimdi ikisi de
	// BURADA bir kez çalışıyor, sonuç bellekte (limitRows) her kategori için pure helper'larla
	// okunuyor — toplam ~6 subrequest/okuma, kategori sayısından bağımsız.
	let limitRows: { rowNumber: number; row: KullanimLimitRow }[] = [];
	if (KULLANIM_LIMIT_ARTTIRILABILIR_KATEGORILER.length > 0) {
		await ensureKullanimLimitTab(env);
		limitRows = await getAllKullanimLimitRows(env);
	}

	const ozet = {} as Record<KullanimKategori, KullanimOzetKategori>;
	for (const kategori of Object.keys(KULLANIM_KATEGORILERI) as KullanimKategori[]) {
		const arttirilabilir = (KULLANIM_LIMIT_ARTTIRILABILIR_KATEGORILER as readonly string[]).includes(kategori);
		ozet[kategori] = {
			etiket: KULLANIM_KATEGORILERI[kategori].etiket,
			kullanilan: sayimlar[kategori] ?? 0,
			aylikLimit: arttirilabilir ? guncelLimitFromRows(limitRows, kategori) : KULLANIM_KATEGORILERI[kategori].aylikLimit,
			arttirilabilir,
			sonKullanilanParaBirimi: arttirilabilir ? sonKullanilanParaBirimiFromRows(limitRows, kategori) : null,
		};
	}
	return ozet;
}
```

`kotaDolduMu` fonksiyonunu (artık satır numarası kaymış olabilir, `export async function
kotaDolduMu` ile grep'le bul) TAMAMEN şununla DEĞİŞTİR:

```ts
// Bir kategori bu ay için kotasını doldurmuş mu? aylikLimit=null olan bir kategori burada hiç
// sınırlanmaz. BE-115: eskiden efektifLimit + getKullanimOzet AYRI AYRI çağrılıyordu (limit
// zaten getKullanimOzet'in kendi sonucunda var) — tek çağrıya indirildi.
export async function kotaDolduMu(env: Env, kategori: KullanimKategori): Promise<boolean> {
	const ozet = await getKullanimOzet(env);
	const { kullanilan, aylikLimit } = ozet[kategori];
	return aylikLimit !== null && kullanilan >= aylikLimit;
}
```

- [ ] **Step 5: Run tests to verify they pass, tighten the existing single-competitor regression test**

Run: `cd form-backend && npx vitest run test/kullanimKaydi.spec.ts`
Expected: PASS (tüm mevcut + yeni testler).

Sonra: `cd form-backend && npx vitest run test/rakipAnalizi.spec.ts -t "stays well under the Cloudflare subrequest ceiling"`
Bu testin gerçek gözlenen `raporIstegiCagriSayisi` değerini not al (muhtemelen ~52'den ~27
civarına düştü). `test/rakipAnalizi.spec.ts:887`'deki `expect(raporIstegiCagriSayisi).toBeLessThan(60);`
satırını, gözlenen değerin RAHATÇA üstünde ama önceki 60'tan belirgin şekilde düşük yeni bir
tavana güncelle (ör. gözlenen ~27 ise `toBeLessThan(35)`). Testi tekrar çalıştırıp PASS olduğunu
doğrula. Bu satırın hemen üstündeki açıklayıcı yorumu (satır ~868-870) yeni tavanı ve BE-115'in
bu adımda kapatıldığını yansıtacak şekilde güncelle (Task 2'nin çok-rakipli testi ayrı bir
regresyon koruması ekleyecek, bu yorumda ona işaret et).

- [ ] **Step 6: Full backend suite + typecheck ve format**

Run: `cd form-backend && npm test && npx tsc --noEmit && npx prettier --check src/lib/kullanimKaydi.ts src/lib/kullanimLimitSheets.ts test/kullanimKaydi.spec.ts test/rakipAnalizi.spec.ts`
Expected: hepsi yeşil — `routes/kullanimLimit.ts`, `routes/rakipTakip.ts`, `routes/rakipAnalizi.ts`,
`scheduled.ts` gibi `getKullanimOzet`/`kotaDolduMu`/`getGuncelLimit` kullanan HİÇBİR dosyaya
dokunmadan, davranışları aynı kalarak testlerinin geçmesi gerekiyor (bu, imza/davranış
korumasının fiilen doğrulanması).

- [ ] **Step 7: Commit**

```bash
git add form-backend/src/lib/kullanimKaydi.ts form-backend/src/lib/kullanimLimitSheets.ts form-backend/test/kullanimKaydi.spec.ts form-backend/test/rakipAnalizi.spec.ts
git commit -m "perf: getKullanimOzet tek-okuma (BE-115) — kategori başına çift Sheets zincirini kaldır"
```

---

### Task 2: Rakip-başına Sheets yazımlarının toplulaştırılması (`rakipSheets.ts`, `rakipAnalizi.ts`)

**Files:**
- Modify: `form-backend/src/lib/rakipSheets.ts`
- Modify: `form-backend/src/routes/rakipAnalizi.ts`
- Test: `form-backend/test/rakipSheets.spec.ts`
- Test: `form-backend/test/rakipAnalizi.spec.ts`

**Interfaces:**
- Consumes: `logKullanimToplu` (Task 1, `../lib/kullanimKaydi`).
- Produces: `setAktifPlatformlarNotlariToplu(env, notlar: { rowNumber: number; notMetni: string }[]): Promise<void>`
  (`lib/rakipSheets.ts`'ten export edilir). Bu task'tan sonra başka hiçbir task bunu tüketmiyor.

- [ ] **Step 1: Write the failing tests — `rakipSheets.spec.ts`**

`form-backend/test/rakipSheets.spec.ts`'in importuna ekle:

```ts
import {
	ensureRakipAnaliziTab,
	appendRakipAnalizRow,
	getAllRakipAnalizRows,
	emptyRakipAnalizRow,
	setAktifPlatformlarNotu,
	setAktifPlatformlarNotlariToplu,
} from '../src/lib/rakipSheets';
```

`describe('rakipSheets', ...)` bloğunun İÇİNE ekle:

```ts
describe('setAktifPlatformlarNotlariToplu', () => {
	it('writes N notes in ONE batchUpdate call with ONE sheetId lookup, not N of each', async () => {
		const { fetchMock } = stubSheetsApi(['Sayfa1', 'RakipAnalizi']);
		await setAktifPlatformlarNotlariToplu(env, [
			{ rowNumber: 3, notMetni: 'LLM tespiti, 2026-08-25: Instagram' },
			{ rowNumber: 5, notMetni: 'LLM tespiti, 2026-08-25: Facebook, TikTok' },
			{ rowNumber: 7, notMetni: 'LLM tespiti, 2026-08-25: X' },
		]);
		const fieldsCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('?fields=sheets.properties'));
		const batchCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes(':batchUpdate'));
		expect(fieldsCalls).toHaveLength(1);
		expect(batchCalls).toHaveLength(1);
		const body = JSON.parse((batchCalls[0][1] as RequestInit).body as string);
		expect(body.requests).toHaveLength(3);
		expect(body.requests[0].updateCells.fields).toBe('note');
		expect(body.requests[0].updateCells.rows[0].values[0].note).toBe('LLM tespiti, 2026-08-25: Instagram');
		expect(body.requests[1].updateCells.range.startRowIndex).toBe(4); // rowNumber 5 -> 0-indexli 4
		expect(body.requests[2].updateCells.rows[0].values[0].note).toBe('LLM tespiti, 2026-08-25: X');
	});

	it('does nothing (no fetch at all) when given an empty list', async () => {
		const { fetchMock } = stubSheetsApi(['Sayfa1', 'RakipAnalizi']);
		await setAktifPlatformlarNotlariToplu(env, []);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('throws a clear error when the RakipAnalizi tab cannot be found', async () => {
		stubSheetsApi(['Sayfa1']); // RakipAnalizi tab'ı YOK
		await expect(setAktifPlatformlarNotlariToplu(env, [{ rowNumber: 3, notMetni: 'not' }])).rejects.toThrow(/bulunamadı/);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd form-backend && npx vitest run test/rakipSheets.spec.ts -t "setAktifPlatformlarNotlariToplu"`
Expected: FAIL — `setAktifPlatformlarNotlariToplu` henüz export edilmiyor.

- [ ] **Step 3: Implement — `rakipSheets.ts`**

`form-backend/src/lib/rakipSheets.ts`'in SONUNA (mevcut `setAktifPlatformlarNotu`'nun altına)
ekle:

```ts
// N rakip için TEK bir sheetId sorgusu + TEK bir batchUpdate isteğinde toplu not yazımı — BE-115:
// setAktifPlatformlarNotu (tekil) her çağrıda kendi sheetId sorgusunu TEKRARLIYORDU, rakip
// sayısıyla doğrusal büyüyen subrequest maliyeti yaratıyordu (rakip başına 2). setAktifPlatformlarNotu
// (tekil) DEĞİŞMEDİ, mevcut testleri etkilenmiyor — bu SADECE çok-öğeli senaryolar için ek bir
// fonksiyon (bkz. routes/rakipAnalizi.ts#rakipPlatformTespitiBaglamiGetir).
export async function setAktifPlatformlarNotlariToplu(env: Env, notlar: { rowNumber: number; notMetni: string }[]): Promise<void> {
	if (!notlar.length) return;
	const response = await sheetsFetch(env, '?fields=sheets.properties(sheetId,title)');
	const data = (await response.json()) as { sheets?: { properties?: { sheetId?: number; title?: string } }[] };
	const sheetId = data.sheets?.find((s) => s.properties?.title === RAKIP_ANALIZI_TAB_NAME)?.properties?.sheetId;
	if (sheetId === undefined) throw new Error('RakipAnalizi tab bulunamadı, not yazılamadı.');
	const colIndex = RAKIP_ANALIZI_COLUMNS.indexOf('aktifPlatformlar');
	await sheetsFetch(env, ':batchUpdate', {
		method: 'POST',
		body: JSON.stringify({
			requests: notlar.map(({ rowNumber, notMetni }) => ({
				updateCells: {
					range: {
						sheetId,
						startRowIndex: rowNumber - 1,
						endRowIndex: rowNumber,
						startColumnIndex: colIndex,
						endColumnIndex: colIndex + 1,
					},
					rows: [{ values: [{ note: notMetni }] }],
					fields: 'note',
				},
			})),
		}),
	});
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd form-backend && npx vitest run test/rakipSheets.spec.ts`
Expected: PASS (mevcut + yeni testler).

- [ ] **Step 5: Typecheck ve format (ara kontrol)**

Run: `cd form-backend && npx tsc --noEmit && npx prettier --check src/lib/rakipSheets.ts test/rakipSheets.spec.ts`
Expected: hata yok.

- [ ] **Step 6: Write the failing tests — `rakipAnalizi.spec.ts`**

`form-backend/test/rakipAnalizi.spec.ts`'te, `'writes a Sheets cell note for each detected
competitor'` testinden (mevcut, grep ile bul) HEMEN SONRA ekle:

```ts
it('runs platform tespiti for many competitors while staying well under the Cloudflare subrequest ceiling', async () => {
	const { fetchMock } = stubApis({ anthropicText: 'Instagram' });
	const rakipIds: string[] = [];
	for (let i = 0; i < 10; i++) {
		const res = await authedRequest('/panel/rakip-analizi/rakip', {
			method: 'POST',
			body: JSON.stringify({ isim: `Coklu Rakip ${i}`, kaynak: 'manuel' }),
		});
		rakipIds.push(((await res.json()) as { id: string }).id);
	}

	const oncesi = fetchMock.mock.calls.length;
	const raporRes = await authedRequest('/panel/rakip-analizi/icerik-strateji', {
		method: 'POST',
		body: JSON.stringify({ istek: 'Öneri istiyorum', rakipIds }),
	});
	expect(raporRes.status).toBe(200);
	const raporIstegiCagriSayisi = fetchMock.mock.calls.length - oncesi;
	// BE-115: bu test, TEK BAŞINA getKullanimOzet düzeltmesinin (Task 1) YETERSİZ kaldığı asıl
	// senaryoyu doğruluyor — 10 rakip, eski rakip-başına-yazım deseniyle taban(~27) + 10×4 = ~67
	// olurdu, hâlâ tavanın üstünde. Toplu yazım (bu task) sayesinde rakip sayısından NEREDEYSE
	// bağımsız kalmalı.
	expect(raporIstegiCagriSayisi).toBeLessThan(45);
});

it('batches all detected-competitor Sheets notes into ONE batchUpdate call, not one per competitor', async () => {
	const { fetchMock } = stubApis({ anthropicText: 'Instagram' });
	const rakipIds: string[] = [];
	for (let i = 0; i < 3; i++) {
		const res = await authedRequest('/panel/rakip-analizi/rakip', {
			method: 'POST',
			body: JSON.stringify({ isim: `Toplu Not Rakip ${i}`, kaynak: 'manuel' }),
		});
		rakipIds.push(((await res.json()) as { id: string }).id);
	}
	await authedRequest('/panel/rakip-analizi/icerik-strateji', {
		method: 'POST',
		body: JSON.stringify({ istek: 'Öneri istiyorum', rakipIds }),
	});
	const noteCalls = fetchMock.mock.calls.filter((c) => {
		if (!String(c[0]).includes(':batchUpdate')) return false;
		const body = JSON.parse((c[1] as RequestInit).body as string);
		return body.requests?.[0]?.updateCells?.fields === 'note';
	});
	expect(noteCalls).toHaveLength(1);
	const body = JSON.parse((noteCalls[0][1] as RequestInit).body as string);
	expect(body.requests).toHaveLength(3);
});
```

Mevcut `'when setAktifPlatformlarNotu fails, the report still generates and still includes the
detected platforms'` testini (grep ile bul) BUL ve İÇİNDEKİ mock'lama mantığını `:batchUpdate`'in
`fields === 'note'` dalını hedefleyecek şekilde GÜNCELLE (fonksiyon adı `setAktifPlatformlarNotu`
→ `setAktifPlatformlarNotlariToplu` olarak değişti ama HTTP çağrısının şekli — `:batchUpdate` +
`fields: 'note'` — aynı kaldığı için testin gövdesi muhtemelen HİÇ değişmeden geçer; SADECE
mevcut assertion'ların hâlâ doğru olduğunu doğrulamak için çalıştır, gerekirse test adını
`'when the batched Sheets note write fails, the report still generates and still includes the
detected platforms'` olarak güncelle).

- [ ] **Step 7: Run tests to verify they fail**

Run: `cd form-backend && npx vitest run test/rakipAnalizi.spec.ts -t "Cloudflare subrequest ceiling|batches all detected"`
Expected: FAIL veya zaten büyük sayılarla geçen ama gerçek davranışı yansıtmayan sonuçlar
(`rakipPlatformTespitiBaglamiGetir` henüz toplu yazıma geçmediği için).

- [ ] **Step 8: Implement — `rakipAnalizi.ts`**

İmport satırını güncelle (`../lib/rakipSheets` importu, grep ile bul):

```ts
import {
	appendRakipAnalizRow,
	getAllRakipAnalizRows,
	emptyRakipAnalizRow,
	ensureRakipAnaliziTab,
	deleteRakipAnalizRows,
	updateRakipAnalizRow,
	setAktifPlatformlarNotlariToplu,
	type RakipAnalizRow,
} from '../lib/rakipSheets';
```

(`setAktifPlatformlarNotu` tekil importu KALDIRILIYOR — artık kullanılmıyor.)

`../lib/kullanimKaydi` importuna ekle:

```ts
import { ensureKullanimKaydiTab, logKullanim, logKullanimToplu, getKullanimOzet, kotaDolduMu } from '../lib/kullanimKaydi';
```

`rakipPlatformTespitiBaglamiGetir` fonksiyonunu (grep `async function rakipPlatformTespitiBaglamiGetir`
ile bul) TAMAMEN şununla DEĞİŞTİR:

```ts
async function rakipPlatformTespitiBaglamiGetir(
	env: Env,
	rakipler: { rowNumber: number; row: RakipAnalizRow }[],
	rakipIds: string[],
	ozet: Awaited<ReturnType<typeof getKullanimOzet>>,
): Promise<string> {
	if (!rakipIds.length) return '';
	const secililer = rakipler.filter(({ row }) => rakipIds.includes(row.id));
	if (!secililer.length) return '';

	const { kullanilan, aylikLimit } = ozet.rakipPlatformTespiti;
	const kalanKota = aylikLimit === null ? Infinity : Math.max(0, aylikLimit - kullanilan);
	const islenecekler = secililer.slice(0, kalanKota);
	const atlananSayisi = secililer.length - islenecekler.length;

	interface TespitSonucu {
		isim: string;
		rowNumber: number;
		basarili: boolean;
		blok: string | null;
		notMetni: string | null;
	}

	// Rakip başına iş PARALEL — sadece platformTespitiYap + kanonikleştirme, YAN ETKİ YOK (BE-115:
	// eskiden her rakip kendi logKullanim+setAktifPlatformlarNotu çağrısını yapıyordu, rakip
	// sayısıyla doğrusal büyüyen subrequest maliyeti yaratıyordu). Yan etkiler AŞAĞIDA, Promise.all
	// bittikten SONRA, tek bir toplu çağrıda yapılıyor.
	const sonuclar = await Promise.all(
		islenecekler.map(async ({ rowNumber, row }): Promise<TespitSonucu> => {
			try {
				const ham = await platformTespitiYap(env, row.isim, row.adres);
				if (!ham) return { isim: row.isim, rowNumber, basarili: true, blok: null, notMetni: null };
				const tokenlar = ham
					.split(/[,\n]/)
					.map((p) => p.trim())
					.filter(Boolean);
				const kanonik = tokenlar
					.map((t) => RAKIP_PLATFORM_LISTESI.find((p) => p.toLowerCase() === t.toLowerCase()))
					.filter((p): p is (typeof RAKIP_PLATFORM_LISTESI)[number] => Boolean(p));
				const platformlarStr = aktifPlatformlarNormalize(kanonik);
				if (!platformlarStr) return { isim: row.isim, rowNumber, basarili: true, blok: null, notMetni: null };
				const goruntu = platformlarStr.split(',').join(', ');
				return {
					isim: row.isim,
					rowNumber,
					basarili: true,
					blok: `${row.isim}: ${goruntu}`,
					notMetni: `LLM tespiti, ${new Date().toISOString().slice(0, 10)}: ${goruntu}`,
				};
			} catch (err) {
				console.error(`platformTespitiYap başarısız oldu (${row.isim})`, err);
				return { isim: row.isim, rowNumber, basarili: false, blok: null, notMetni: null };
			}
		}),
	);

	// Kota kaydı: BAŞARILI her tespit denemesi için (platform bulunsa da bulunmasa da — API çağrısı
	// zaten yapıldı/faturalandı), TEK bir toplu Sheets append. Kendi try/catch'inde izole: bu
	// başarısız olsa bile aşağıdaki blok/not verisi ZATEN bellekte, hiçbir şey kaybolmaz.
	const basariliIsimler = sonuclar.filter((s) => s.basarili).map((s) => s.isim);
	if (basariliIsimler.length) {
		try {
			await logKullanimToplu(env, 'rakipPlatformTespiti', basariliIsimler);
		} catch (err) {
			console.error('logKullanimToplu başarısız oldu (rakipPlatformTespiti)', err);
		}
	}

	// Sheets hücre notları: TEK bir toplu batchUpdate. Kendi try/catch'inde izole: bu başarısız
	// olsa bile aşağıdaki bloklar (rapor promptuna giden metin) ETKİLENMEZ.
	const notlar = sonuclar.filter((s): s is TespitSonucu & { notMetni: string } => s.notMetni !== null).map((s) => ({ rowNumber: s.rowNumber, notMetni: s.notMetni }));
	if (notlar.length) {
		try {
			await setAktifPlatformlarNotlariToplu(env, notlar);
		} catch (err) {
			console.error('setAktifPlatformlarNotlariToplu başarısız oldu', err);
		}
	}

	const bloklar = sonuclar.filter((s): s is TespitSonucu & { blok: string } => s.blok !== null).map((s) => s.blok);
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

- [ ] **Step 9: Run tests to verify they pass**

Run: `cd form-backend && npx vitest run test/rakipAnalizi.spec.ts`
Expected: PASS — TÜM dosya (mevcut ~68 test + yeni 2 test), özellikle Step 6'da güncellenen
"setAktifPlatformlarNotu fails" testi ve yeni çok-rakipli subrequest testi DAHİL.

- [ ] **Step 10: Full backend suite + typecheck ve format**

Run: `cd form-backend && npm test && npx tsc --noEmit && npx prettier --check .`
Expected: hepsi yeşil.

- [ ] **Step 11: Commit**

```bash
git add form-backend/src/lib/rakipSheets.ts form-backend/src/routes/rakipAnalizi.ts form-backend/test/rakipSheets.spec.ts form-backend/test/rakipAnalizi.spec.ts
git commit -m "perf: rakip-başına Sheets yazımlarını toplulaştır (BE-115) — logKullanim+not yazımı artık O(1)"
```

---

## Implementasyon sonrası (kod dışı, hatırlatma)

Bu plan tamamlanınca `talk-and-heal-hata-gunlugu/05-Backend-Entegrasyon/05-backend-entegrasyon.md`'deki
BE-115 kaydı **ÇÖZÜLDÜ** olarak güncellenmeli (gözlenen yeni subrequest sayılarıyla), ve
`handoff.md`'deki "açık kalan tek madde" bölümü kaldırılmalı.

`rakipYorumBaglamiGetir` (Google Places tabanlı kardeş fonksiyon, `routes/rakipAnalizi.ts:502`
civarı) da rakip başına ayrı `logKullanim` çağrısı yapıyor — bu planın kapsamı DIŞINDA (farklı bir
fonksiyon, farklı bir veri kaynağı), ama aynı deseni taşıyor. Ayrı bir gözlem olarak not edildi,
bu plana dahil edilmedi.
