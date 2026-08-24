# Rakip Platform Otomatik Tespiti Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rapor üretimi anında (İçerik Stratejisi / Aksiyon Analizi), seçili rakip(ler) için Claude'un
web_search aracıyla hangi platformlarda aktif olduğunu canlı tespit et — checkbox'tan gelen
kullanıcı-onaylı `aktifPlatformlar` ana değerine hiç dokunmadan, ephemeral bir rapor girdisi olarak
kullan ve ayrıca ilgili Sheets hücresine bir "LLM tespiti" notu bırak.

**Architecture:** `rakipYorumBaglamiGetir`'in (Google Places, satır 502) AYNI ephemeral deseni —
canlı iste, kullan, Sheet ana değerine hiç yazma — ama veri kaynağı Claude'un kendi `web_search`
aracı. Yeni bir dar/tek-satır Anthropic mini-çağrısı (`platformTespitiYap`), kota-farkında kısmi
işleme (`rakipPlatformTespitiBaglamiGetir`), ve Sheets native hücre notu yazımı (`setAktifPlatformlarNotu`,
`fields: 'note'` mask'ı sayesinde ana değere asla dokunmaz).

**Tech Stack:** Cloudflare Worker (TypeScript), Anthropic Messages API (`web_search_20250305`),
Google Sheets API v4 (`batchUpdate` / `updateCells`), Vitest.

## Global Constraints

- Kaynak spec: `docs/superpowers/specs/2026-08-24-rakip-platform-envanteri-design.md` — "Rapor
  Entegrasyonu — Otomatik Platform Tespiti" bölümü. Kod bu bölümdeki tasarımla birebir uyumlu olmalı.
- Kota kategorisi `rakipPlatformTespiti`, `aylikLimit: 27` (kullanıcı onayı, 2026-08-25) — toplam
  proje Anthropic bütçesi $5/ay → $8/ay, yeni pay $3/ay.
- Her yan etkinin (Anthropic çağrısı, hücre notu yazımı) hatası KENDİ try/catch'inde izole olmalı —
  bir rakibin/bir yan etkinin başarısızlığı ne diğer rakiplerin işlenmesini ne rapor üretimini
  engellemeli.
- `RAKIP_PLATFORM_LISTESI` dışı bir platform adı asla kabul edilmez — mevcut `aktifPlatformlarNormalize`
  (routes/rakipAnalizi.ts:72) tek kaynak olarak reused edilir, filtre mantığı ikinci kez yazılmaz.
- `npx tsc --noEmit` ve `npx prettier --check .` her task sonunda (Adım "Typecheck ve format") yeşil
  olmalı — bu repo'da "kod bitti" saymanın koşulu.

---

## File Structure

- **Modify: `form-backend/src/lib/claude.ts`** — yeni `platformTespitiYap` fonksiyonu (dar, tek
  Anthropic mini-çağrısı, `generateReport`'tan bağımsız).
- **Modify: `form-backend/src/config.ts`** — yeni `rakipPlatformTespiti` kota kategorisi +
  `KULLANIM_LIMIT_ARTTIRILABILIR_KATEGORILER`'e ekleme.
- **Modify: `form-backend/src/lib/rakipSheets.ts`** — yeni `setAktifPlatformlarNotu` fonksiyonu
  (Sheets native hücre notu yazımı).
- **Modify: `form-backend/src/routes/rakipAnalizi.ts`** — yeni `rakipPlatformTespitiBaglamiGetir`
  (kota-farkında orkestrasyon) + `PLATFORM_TESPITI_TALIMATI` sistem prompt eki + her iki rapor
  handler'ına (`handleIcerikStrateji`, `handleAksiyonAnaliz`) wiring.
- **Test: `form-backend/test/claude.spec.ts`** — `platformTespitiYap` birim testleri.
- **Test: `form-backend/test/kullanimKaydi.spec.ts`** — yeni kategorinin `getKullanimOzet`'te doğru
  göründüğünü doğrulayan tek bir test.
- **Test: `form-backend/test/rakipSheets.spec.ts`** — `setAktifPlatformlarNotu` birim testleri.
- **Test: `form-backend/test/rakipAnalizi.spec.ts`** — wiring/entegrasyon testleri + İKİ mevcut
  testin (satır 713, 858) `.find()` belirsizliğini gideren düzeltmesi (bkz. Task 4, Step 0).

---

### Task 1: `platformTespitiYap` — dar Anthropic mini-çağrısı (`lib/claude.ts`)

**Files:**
- Modify: `form-backend/src/lib/claude.ts`
- Test: `form-backend/test/claude.spec.ts`

**Interfaces:**
- Consumes: `Env` (`ANTHROPIC_API_KEY`), `RAKIP_PLATFORM_LISTESI` (`../config`).
- Produces: `export async function platformTespitiYap(env: Env, rakipIsim: string, rakipAdres: string): Promise<string>`
  — ham, virgülle ayrılmış platform-adı metni (boş string = hiç platform bulunamadı). Task 4 bunu
  tüketir.

- [ ] **Step 1: Write the failing tests**

`form-backend/test/claude.spec.ts`'e, mevcut `generateReport` describe bloğunun ALTINA yeni bir
describe bloğu ekle:

```ts
import { platformTespitiYap } from '../src/lib/claude';

describe('platformTespitiYap', () => {
	it('extracts platform names from the web_search response text', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify({ content: [{ type: 'text', text: 'Instagram, Facebook' }] }), { status: 200 })),
		);
		const result = await platformTespitiYap(env, 'Test Klinik', 'Test Adres');
		expect(result).toBe('Instagram, Facebook');
	});

	it('returns an empty string when the model finds no platforms', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ content: [{ type: 'text', text: '' }] }), { status: 200 })));
		const result = await platformTespitiYap(env, 'Test Klinik', '');
		expect(result).toBe('');
	});

	it('throws a clear error when the API call fails', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => new Response('rate limited', { status: 429 })));
		await expect(platformTespitiYap(env, 'Test Klinik', '')).rejects.toThrow(/429/);
	});

	it('sends the web_search tool capped at max_uses 3 and a 512 max_tokens budget', async () => {
		const fetchMock = vi.fn(async () => new Response(JSON.stringify({ content: [{ type: 'text', text: 'Instagram' }] }), { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);
		await platformTespitiYap(env, 'Test Klinik', 'Test Adres');
		const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
		expect(body.max_tokens).toBe(512);
		expect(body.tools).toEqual([{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }]);
	});

	it('includes the exact RAKIP_PLATFORM_LISTESI and the business name/address in the request', async () => {
		const fetchMock = vi.fn(async () => new Response(JSON.stringify({ content: [{ type: 'text', text: '' }] }), { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);
		await platformTespitiYap(env, 'Test Klinik', 'Test Adres');
		const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
		expect(body.system).toContain('Instagram');
		expect(body.system).toContain('Mastodon');
		expect(body.messages[0].content).toBe('İşletme: Test Klinik (Test Adres)');
	});

	it('omits the parenthesized address when none is given', async () => {
		const fetchMock = vi.fn(async () => new Response(JSON.stringify({ content: [{ type: 'text', text: '' }] }), { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);
		await platformTespitiYap(env, 'Test Klinik', '');
		const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
		expect(body.messages[0].content).toBe('İşletme: Test Klinik');
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd form-backend && npx vitest run test/claude.spec.ts`
Expected: FAIL — `platformTespitiYap` is not exported from `../src/lib/claude`.

- [ ] **Step 3: Implement**

`form-backend/src/lib/claude.ts`'in başına import ekle:

```ts
import { RAKIP_PLATFORM_LISTESI } from '../config';
```

Dosyanın SONUNA (mevcut `generateReport`'un altına) ekle:

```ts
// Rakip Platform Tespiti (2026-08-25) — rakipYorumBaglamiGetir'in (routes/rakipAnalizi.ts) Google
// Places yerine Claude'un web_search aracını kullanan eşdeğeri. generateReport rapor-seviyesi genel
// bir sistem promptu + 8192 token'lık tam metin rapor üretmek için tasarlandı — burada TEK SATIRLIK
// yapılandırılmış bir liste isteniyor, o yüzden ayrı/küçük bir çağrı.
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
	return (data.content ?? [])
		.filter((b) => b.type === 'text' && b.text)
		.map((b) => b.text)
		.join(' ')
		.trim();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd form-backend && npx vitest run test/claude.spec.ts`
Expected: PASS (tüm `generateReport` + `platformTespitiYap` testleri).

- [ ] **Step 5: Typecheck ve format**

Run: `cd form-backend && npx tsc --noEmit && npx prettier --check src/lib/claude.ts test/claude.spec.ts`
Expected: hata yok.

- [ ] **Step 6: Commit**

```bash
git add form-backend/src/lib/claude.ts form-backend/test/claude.spec.ts
git commit -m "feat: add platformTespitiYap for live per-competitor platform detection via web_search"
```

---

### Task 2: `rakipPlatformTespiti` kota kategorisi (`config.ts`)

**Files:**
- Modify: `form-backend/src/config.ts`
- Test: `form-backend/test/kullanimKaydi.spec.ts`

**Interfaces:**
- Consumes: yok (statik config).
- Produces: `KULLANIM_KATEGORILERI.rakipPlatformTespiti` (`{ etiket: string; aylikLimit: 27 }`),
  `KullanimKategori` union'a `'rakipPlatformTespiti'` eklenir, `KULLANIM_LIMIT_ARTTIRILABILIR_KATEGORILER`
  bunu içerir. Task 4 `logKullanim(env, 'rakipPlatformTespiti', ...)` ve `getKullanimOzet(env).rakipPlatformTespiti`
  ile tüketir.

- [ ] **Step 1: Write the failing test**

`form-backend/test/kullanimKaydi.spec.ts`'in `describe('kullanimKaydi', ...)` bloğunun İÇİNE
(mevcut testlerin yanına) ekle:

```ts
it('exposes the rakipPlatformTespiti category with a 27 monthly limit that can be increased', async () => {
	stubSheetsApi(['Sayfa1', 'KullanimKaydi', 'KullanimLimitleri']);
	const ozet = await getKullanimOzet(env);
	expect(ozet.rakipPlatformTespiti).toMatchObject({
		etiket: 'Rakip Platform Tespiti (Canlı Arama)',
		aylikLimit: 27,
		arttirilabilir: true,
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd form-backend && npx vitest run test/kullanimKaydi.spec.ts -t "rakipPlatformTespiti"`
Expected: FAIL — `ozet.rakipPlatformTespiti` is `undefined` (kategori henüz yok).

- [ ] **Step 3: Implement**

`form-backend/src/config.ts`'de `KULLANIM_KATEGORILERI` objesinin `rakipYorumAnalizi` satırının
(mevcut satır 394) HEMEN ALTINA, `} as const;`'tan ÖNCE ekle:

```ts
	// Rakip Platform Tespiti (2026-08-25, kullanıcı kararı) — Anthropic web_search ile canlı
	// platform tespiti, rakip başına ~$0.11 (3 web_search çağrısı, Sonnet 5, gerçek ölçüm
	// 2026-08-24). icerikStrateji/aksiyonAnaliz'in AKSİNE rapor başına DEĞİL, RAKİP başına
	// maliyetli — çok rakipli bir raporda (ör. 10 rakip) tek başına ~$1.10'a çıkabilir. Kullanıcı
	// "ayrı bütçe payı" seçeneğini onayladı (2026-08-25): toplam proje Anthropic bütçesi $5/ay'dan
	// $8/ay'a çıkarıldı, yeni ~$3'lük pay bu kategoriye ayrıldı — icerikStrateji/aksiyonAnaliz
	// limitleri (12/13) DEĞİŞMEDİ. $3 / $0.11 ≈ 27. Detay: docs/superpowers/specs/
	// 2026-08-24-rakip-platform-envanteri-design.md, "Maliyet/Kota Kararı" bölümü.
	rakipPlatformTespiti: { etiket: 'Rakip Platform Tespiti (Canlı Arama)', aylikLimit: 27 as number | null },
```

Hemen altındaki `KULLANIM_LIMIT_ARTTIRILABILIR_KATEGORILER` satırını (mevcut satır 408) değiştir:

```ts
export const KULLANIM_LIMIT_ARTTIRILABILIR_KATEGORILER = ['icerikStrateji', 'aksiyonAnaliz', 'rakipPlatformTespiti'] as const;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd form-backend && npx vitest run test/kullanimKaydi.spec.ts`
Expected: PASS (mevcut + yeni test).

- [ ] **Step 5: Typecheck ve format**

Run: `cd form-backend && npx tsc --noEmit && npx prettier --check src/config.ts test/kullanimKaydi.spec.ts`
Expected: hata yok.

- [ ] **Step 6: Commit**

```bash
git add form-backend/src/config.ts form-backend/test/kullanimKaydi.spec.ts
git commit -m "feat: add rakipPlatformTespiti quota category (27/month, increasable)"
```

---

### Task 3: `setAktifPlatformlarNotu` — Sheets native hücre notu (`lib/rakipSheets.ts`)

**Files:**
- Modify: `form-backend/src/lib/rakipSheets.ts`
- Test: `form-backend/test/rakipSheets.spec.ts`

**Interfaces:**
- Consumes: `sheetsFetch` (`./sheets`), `RAKIP_ANALIZI_TAB_NAME`, `RAKIP_ANALIZI_COLUMNS` (zaten
  import edilmiş, `../config`).
- Produces: `export async function setAktifPlatformlarNotu(env: Env, rowNumber: number, notMetni: string): Promise<void>`.
  Task 4 bunu tüketir.

- [ ] **Step 1: Write the failing tests**

`form-backend/test/rakipSheets.spec.ts`'in `describe('rakipSheets', ...)` bloğunun İÇİNE ekle
(dosyanın başındaki importa `setAktifPlatformlarNotu` ekle):

```ts
import { ensureRakipAnaliziTab, appendRakipAnalizRow, getAllRakipAnalizRows, emptyRakipAnalizRow, setAktifPlatformlarNotu } from '../src/lib/rakipSheets';
```

```ts
it('writes a note to the aktifPlatformlar cell, touching ONLY the note field', async () => {
	const { fetchMock } = stubSheetsApi(['Sayfa1', 'RakipAnalizi']);
	await setAktifPlatformlarNotu(env, 3, 'LLM tespiti, 2026-08-25: Instagram, TikTok');

	const batchCall = fetchMock.mock.calls.find((c) => String(c[0]).includes(':batchUpdate'))!;
	const body = JSON.parse((batchCall[1] as RequestInit).body as string);
	const req = body.requests[0].updateCells;
	expect(req.fields).toBe('note');
	expect(req.rows).toEqual([{ values: [{ note: 'LLM tespiti, 2026-08-25: Instagram, TikTok' }] }]);
});

it('targets the correct row/column from RAKIP_ANALIZI_COLUMNS', async () => {
	const { fetchMock } = stubSheetsApi(['Sayfa1', 'RakipAnalizi']);
	await setAktifPlatformlarNotu(env, 5, 'not');

	const batchCall = fetchMock.mock.calls.find((c) => String(c[0]).includes(':batchUpdate'))!;
	const body = JSON.parse((batchCall[1] as RequestInit).body as string);
	const range = body.requests[0].updateCells.range;
	// rowNumber 5 -> Sheets'te satır 5 -> 0-indexli startRowIndex 4.
	expect(range.startRowIndex).toBe(4);
	expect(range.endRowIndex).toBe(5);
	expect(range.endColumnIndex).toBe(range.startColumnIndex + 1);
});

it('throws a clear error when the RakipAnalizi tab cannot be found', async () => {
	stubSheetsApi(['Sayfa1']); // RakipAnalizi tab'ı YOK
	await expect(setAktifPlatformlarNotu(env, 3, 'not')).rejects.toThrow(/bulunamadı/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd form-backend && npx vitest run test/rakipSheets.spec.ts -t "aktifPlatformlar"`
Expected: FAIL — `setAktifPlatformlarNotu` is not exported from `../src/lib/rakipSheets`.

- [ ] **Step 3: Implement**

`form-backend/src/lib/rakipSheets.ts`'in SONUNA (mevcut `deleteRakipAnalizRows`'un altına) ekle:

```ts
// Rakip Platform Tespiti (2026-08-25) — LLM'in web_search ile tespit ettiği platform listesini
// aktifPlatformlar hücresine NATIVE bir Sheets notu (CellData.note) olarak yazar. Sheets'in ayrı/
// karmaşık "comments" (Drive tabanlı, threadli) API'sinden FARKLI — basit bir metin notu, hücreye
// sağ-üstte küçük bir üçgen olarak görünür. `fields: 'note'` mask'ı SADECE bu alanı hedefler —
// checkbox'lardan gelen ASIL değer (userEnteredValue) bu API semantiği gereği HİÇ etkilenmez, ayrı
// bir koruma kodu yazmaya gerek yok (deleteRakipAnalizRows'daki sheetId-bulma deseniyle aynı).
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd form-backend && npx vitest run test/rakipSheets.spec.ts`
Expected: PASS (mevcut + yeni testler).

- [ ] **Step 5: Typecheck ve format**

Run: `cd form-backend && npx tsc --noEmit && npx prettier --check src/lib/rakipSheets.ts test/rakipSheets.spec.ts`
Expected: hata yok.

- [ ] **Step 6: Commit**

```bash
git add form-backend/src/lib/rakipSheets.ts form-backend/test/rakipSheets.spec.ts
git commit -m "feat: add setAktifPlatformlarNotu (native Sheets cell note, note-field-only writes)"
```

---

### Task 4: Orkestrasyon + wiring (`routes/rakipAnalizi.ts`)

**Files:**
- Modify: `form-backend/src/routes/rakipAnalizi.ts`
- Test: `form-backend/test/rakipAnalizi.spec.ts`

**Interfaces:**
- Consumes: `platformTespitiYap` (Task 1, `../lib/claude`), `setAktifPlatformlarNotu` (Task 3,
  `../lib/rakipSheets`), `getKullanimOzet`, `logKullanim` (zaten import edilmiş, `../lib/kullanimKaydi`),
  `aktifPlatformlarNormalize` (module-private, satır 72, AYNI dosyada).
- Produces: `rakipPlatformTespitiBaglami: string` (userPrompt'a eklenen ephemeral metin bloğu) —
  bu task'tan sonra başka hiçbir task bunu tüketmiyor, entegrasyon burada bitiyor.

- [ ] **Step 0: Mevcut İKİ testi, yeni ikinci Anthropic çağrısının belirsizliğine karşı düzelt**

Bu task'ın Step 3'ü, `rakipIds` doluyken `handleIcerikStrateji`/`handleAksiyonAnaliz`'in artık
rapor çağrısından ÖNCE bir platform-tespiti Anthropic çağrısı da yapmasına sebep olacak. Mevcut
`test/rakipAnalizi.spec.ts` içindeki `fetchMock.mock.calls.find((c) => String(c[0]).includes('api.anthropic.com'))`
kalıbı bu durumda İLK eşleşen çağrıyı (artık platform-tespiti çağrısı olabilir) döner — bu, satır
858'deki testi GERÇEKTEN kırar (rapor çağrısına özgü "Seçilen rakip verisi" metni platform-tespiti
çağrısında yok). `generateReport`'un HER ZAMAN `max_tokens: 8192`, `platformTespitiYap`'ın HER ZAMAN
`max_tokens: 512` göndermesi güvenilir bir ayrım sağlıyor — SADECE `rakipIds` gönderen bu iki testi
düzelt (satır numaraları mevcut dosyaya göre, task'lar sırayla uygulandıkça kayabilir — metinle ara):

`'only includes the selected competitor(s) in the prompt, not unselected ones'` testinde
(`rakipIds: [secilecekId]` gönderen):

```ts
// ESKİ:
const anthropicCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('api.anthropic.com'))!;
// YENİ:
const anthropicCall = fetchMock.mock.calls.find((c) => {
	if (!String(c[0]).includes('api.anthropic.com')) return false;
	const body = JSON.parse((c[1] as RequestInit).body as string);
	return body.max_tokens === 8192;
})!;
```

`'includes selected competitor data in the prompt when rakipIds is given'` testinde (aynı değişiklik,
`rakipId: [rakipId]` gönderen aksiyon-analiz testi) — AYNI ESKİ/YENİ değişikliği orada da uygula.

- [ ] **Step 1: Write the failing tests**

`test/rakipAnalizi.spec.ts`'e, `describe('POST /panel/rakip-analizi/icerik-strateji', ...)` bloğunun
İÇİNE (mevcut testlerin yanına, `'only includes the selected competitor(s)...'` testinden hemen sonra)
ekle:

```ts
it('runs live platform tespiti for selected competitors and adds it to the report prompt', async () => {
	const { fetchMock } = stubApis({ anthropicText: 'Instagram, TikTok' });
	const rakipRes = await authedRequest('/panel/rakip-analizi/rakip', {
		method: 'POST',
		body: JSON.stringify({ isim: 'Tespit Edilecek Rakip', kaynak: 'manuel', adres: 'Kadıköy' }),
	});
	const rakipId = ((await rakipRes.json()) as { id: string }).id;

	await authedRequest('/panel/rakip-analizi/icerik-strateji', {
		method: 'POST',
		body: JSON.stringify({ istek: 'Öneri istiyorum', rakipIds: [rakipId] }),
	});

	const tespitCall = fetchMock.mock.calls.find((c) => {
		if (!String(c[0]).includes('api.anthropic.com')) return false;
		return JSON.parse((c[1] as RequestInit).body as string).max_tokens === 512;
	})!;
	expect(tespitCall).toBeTruthy();
	const tespitBody = JSON.parse((tespitCall[1] as RequestInit).body as string);
	expect(tespitBody.messages[0].content).toBe('İşletme: Tespit Edilecek Rakip (Kadıköy)');

	const reportCall = fetchMock.mock.calls.find((c) => {
		if (!String(c[0]).includes('api.anthropic.com')) return false;
		return JSON.parse((c[1] as RequestInit).body as string).max_tokens === 8192;
	})!;
	const reportBody = JSON.parse((reportCall[1] as RequestInit).body as string);
	expect(reportBody.messages[0].content).toContain('canlı platform tespiti');
	expect(reportBody.messages[0].content).toContain('Tespit Edilecek Rakip: Instagram, TikTok');
});

it('does not run platform tespiti when no rakipIds are given', async () => {
	const { fetchMock } = stubApis();
	await authedRequest('/panel/rakip-analizi/icerik-strateji', { method: 'POST', body: JSON.stringify({ istek: 'Öneri istiyorum' }) });
	const tespitCalls = fetchMock.mock.calls.filter((c) => {
		if (!String(c[0]).includes('api.anthropic.com')) return false;
		return JSON.parse((c[1] as RequestInit).body as string).max_tokens === 512;
	});
	expect(tespitCalls).toHaveLength(0);
});

it('filters out any platform tespiti response text outside RAKIP_PLATFORM_LISTESI', async () => {
	// Anthropic'in HEM rapor HEM tespit çağrısı için AYNI stub metni döner — listede olmayan bir
	// kelime uydurmuş gibi simüle etmek için özel bir metin kullanılıyor.
	const { fetchMock } = stubApis({ anthropicText: 'Instagram, Snapchat, UydurmaPlatform' });
	const rakipRes = await authedRequest('/panel/rakip-analizi/rakip', {
		method: 'POST',
		body: JSON.stringify({ isim: 'Filtre Testi Rakip', kaynak: 'manuel' }),
	});
	const rakipId = ((await rakipRes.json()) as { id: string }).id;
	await authedRequest('/panel/rakip-analizi/icerik-strateji', {
		method: 'POST',
		body: JSON.stringify({ istek: 'Öneri istiyorum', rakipIds: [rakipId] }),
	});
	const reportCall = fetchMock.mock.calls.find((c) => {
		if (!String(c[0]).includes('api.anthropic.com')) return false;
		return JSON.parse((c[1] as RequestInit).body as string).max_tokens === 8192;
	})!;
	const reportBody = JSON.parse((reportCall[1] as RequestInit).body as string);
	expect(reportBody.messages[0].content).toContain('Filtre Testi Rakip: Instagram');
	expect(reportBody.messages[0].content).not.toContain('Snapchat');
	expect(reportBody.messages[0].content).not.toContain('UydurmaPlatform');
});

it('writes a Sheets cell note for each detected competitor', async () => {
	const { fetchMock } = stubApis({ anthropicText: 'Facebook' });
	const rakipRes = await authedRequest('/panel/rakip-analizi/rakip', {
		method: 'POST',
		body: JSON.stringify({ isim: 'Not Testi Rakip', kaynak: 'manuel' }),
	});
	const rakipId = ((await rakipRes.json()) as { id: string }).id;
	await authedRequest('/panel/rakip-analizi/icerik-strateji', {
		method: 'POST',
		body: JSON.stringify({ istek: 'Öneri istiyorum', rakipIds: [rakipId] }),
	});
	const noteCall = fetchMock.mock.calls.find((c) => {
		if (!String(c[0]).includes(':batchUpdate')) return false;
		const body = JSON.parse((c[1] as RequestInit).body as string);
		return body.requests?.[0]?.updateCells?.fields === 'note';
	})!;
	expect(noteCall).toBeTruthy();
	const noteBody = JSON.parse((noteCall[1] as RequestInit).body as string);
	expect(noteBody.requests[0].updateCells.rows[0].values[0].note).toContain('LLM tespiti');
	expect(noteBody.requests[0].updateCells.rows[0].values[0].note).toContain('Facebook');
});

it('processes zero competitors and adds only the skip note when the monthly quota is already full', async () => {
	const { fetchMock, tabRows } = stubApis({ anthropicText: 'Instagram' });
	const now = new Date().toISOString();
	const kullanimKaydi = (tabRows.KullanimKaydi ??= []);
	for (let i = 0; i < 27; i++) kullanimKaydi.push([`k${i}`, now, 'rakipPlatformTespiti', 'önceki tespit']);

	const rakipRes = await authedRequest('/panel/rakip-analizi/rakip', { method: 'POST', body: JSON.stringify({ isim: 'Rakip A', kaynak: 'manuel' }) });
	const rakipId = ((await rakipRes.json()) as { id: string }).id;

	const raporRes = await authedRequest('/panel/rakip-analizi/icerik-strateji', {
		method: 'POST',
		body: JSON.stringify({ istek: 'Öneri istiyorum', rakipIds: [rakipId] }),
	});
	expect(raporRes.status).toBe(200);

	const tespitCalls = fetchMock.mock.calls.filter((c) => {
		if (!String(c[0]).includes('api.anthropic.com')) return false;
		return JSON.parse((c[1] as RequestInit).body as string).max_tokens === 512;
	});
	expect(tespitCalls).toHaveLength(0);

	const reportCall = fetchMock.mock.calls.find((c) => {
		if (!String(c[0]).includes('api.anthropic.com')) return false;
		return JSON.parse((c[1] as RequestInit).body as string).max_tokens === 8192;
	})!;
	const reportBody = JSON.parse((reportCall[1] as RequestInit).body as string);
	expect(reportBody.messages[0].content).toContain('1 rakip için platform tespiti YAPILMADI');
	expect(reportBody.messages[0].content).toContain('27/27');
	expect(reportBody.messages[0].content).not.toContain('canlı platform tespiti (sadece bu analiz');
});

it('silently skips a competitor when web_search finds nothing, without an empty note in the prompt', async () => {
	const { fetchMock } = stubApis();
	const rakipRes = await authedRequest('/panel/rakip-analizi/rakip', { method: 'POST', body: JSON.stringify({ isim: 'Bulunamayan Rakip', kaynak: 'manuel' }) });
	const rakipId = ((await rakipRes.json()) as { id: string }).id;
	// stubApis'in jenerik anthropicText'i platform-tespiti çağrısında ('Üretilen rapor metni.')
	// zaten RAKIP_PLATFORM_LISTESI'nde olmadığı için normalize sonrası boş dönüyor — "hiç platform
	// bulunamadı" senaryosunu doğal olarak simüle ediyor, ekstra bir sarmalayıcı gerekmiyor.
	const raporRes = await authedRequest('/panel/rakip-analizi/icerik-strateji', {
		method: 'POST',
		body: JSON.stringify({ istek: 'Öneri istiyorum', rakipIds: [rakipId] }),
	});
	expect(raporRes.status).toBe(200);
	const reportCall = fetchMock.mock.calls.find((c) => {
		if (!String(c[0]).includes('api.anthropic.com')) return false;
		return JSON.parse((c[1] as RequestInit).body as string).max_tokens === 8192;
	})!;
	const reportBody = JSON.parse((reportCall[1] as RequestInit).body as string);
	expect(reportBody.messages[0].content).not.toContain('canlı platform tespiti');
	expect(reportBody.messages[0].content).not.toContain('Bulunamayan Rakip:');
});

it('processes only as many competitors as the remaining quota allows, and notes the skip count', async () => {
	const { fetchMock, tabRows } = stubApis({ anthropicText: 'Instagram' });
	const now = new Date().toISOString();
	const kullanimKaydi = (tabRows.KullanimKaydi ??= []);
	for (let i = 0; i < 26; i++) kullanimKaydi.push([`k${i}`, now, 'rakipPlatformTespiti', 'önceki tespit']);

	const r1 = await authedRequest('/panel/rakip-analizi/rakip', { method: 'POST', body: JSON.stringify({ isim: 'Rakip A', kaynak: 'manuel' }) });
	const r1Id = ((await r1.json()) as { id: string }).id;
	const r2 = await authedRequest('/panel/rakip-analizi/rakip', { method: 'POST', body: JSON.stringify({ isim: 'Rakip B', kaynak: 'manuel' }) });
	const r2Id = ((await r2.json()) as { id: string }).id;

	const raporRes = await authedRequest('/panel/rakip-analizi/icerik-strateji', {
		method: 'POST',
		body: JSON.stringify({ istek: 'Öneri istiyorum', rakipIds: [r1Id, r2Id] }),
	});
	expect(raporRes.status).toBe(200);

	const tespitCalls = fetchMock.mock.calls.filter((c) => {
		if (!String(c[0]).includes('api.anthropic.com')) return false;
		return JSON.parse((c[1] as RequestInit).body as string).max_tokens === 512;
	});
	expect(tespitCalls).toHaveLength(1); // kalan kota: 27 - 26 = 1

	const reportCall = fetchMock.mock.calls.find((c) => {
		if (!String(c[0]).includes('api.anthropic.com')) return false;
		return JSON.parse((c[1] as RequestInit).body as string).max_tokens === 8192;
	})!;
	const reportBody = JSON.parse((reportCall[1] as RequestInit).body as string);
	expect(reportBody.messages[0].content).toContain('1 rakip için platform tespiti YAPILMADI');
	expect(reportBody.messages[0].content).toContain('26/27');
});

it('isolates a per-competitor platformTespitiYap failure without blocking the report', async () => {
	const rakipRes = await authedRequest('/panel/rakip-analizi/rakip', {
		method: 'POST',
		body: JSON.stringify({ isim: 'Hatalı Rakip', kaynak: 'manuel' }),
	});
	// stubApis() burada YOK — özel bir fetchMock ile Anthropic çağrılarını ayırt ediyoruz.
	const rakipId = ((await rakipRes.json()) as { id: string }).id;

	let call = 0;
	const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		if (url.includes('oauth2.googleapis.com')) return new Response(JSON.stringify({ access_token: 'fake', expires_in: 3600 }), { status: 200 });
		if (url.includes('?fields=sheets.properties'))
			return new Response(
				JSON.stringify({ sheets: [{ properties: { sheetId: 1, title: 'RakipAnalizi', gridProperties: { columnCount: 20 } } }] }),
				{ status: 200 },
			);
		if (url.includes(':batchUpdate')) return new Response('{}', { status: 200 });
		if (url.includes('/values/') && (init?.method ?? 'GET') === 'GET') {
			return new Response(
				JSON.stringify({
					values: [
						[
							rakipId,
							new Date().toISOString(),
							'manuel',
							'Hatalı Rakip',
							'',
							'',
							'',
							'icerikStrateji',
							'',
							'',
							'',
							'',
							'',
							'',
							'',
							'',
						],
					],
				}),
				{ status: 200 },
			);
		}
		if (url.includes('api.anthropic.com')) {
			const body = JSON.parse(init!.body as string);
			if (body.max_tokens === 512) {
				call++;
				throw new Error('simulated network failure');
			}
			return new Response(JSON.stringify({ content: [{ type: 'text', text: 'Üretilen rapor metni.' }] }), { status: 200 });
		}
		return new Response(JSON.stringify({ values: [] }), { status: 200 });
	});
	vi.stubGlobal('fetch', fetchMock);

	const response = await authedRequest('/panel/rakip-analizi/icerik-strateji', {
		method: 'POST',
		body: JSON.stringify({ istek: 'Öneri istiyorum', rakipIds: [rakipId] }),
	});
	expect(response.status).toBe(200);
	expect(call).toBe(1);
	const data = (await response.json()) as { rapor: string };
	expect(data.rapor).toContain('Üretilen rapor metni.');
});

it('when one of two competitors fails platformTespitiYap, the other still gets processed', async () => {
	const { fetchMock } = stubApis();
	const rA = await authedRequest('/panel/rakip-analizi/rakip', { method: 'POST', body: JSON.stringify({ isim: 'Basarisiz Rakip', kaynak: 'manuel' }) });
	const rAId = ((await rA.json()) as { id: string }).id;
	const rB = await authedRequest('/panel/rakip-analizi/rakip', { method: 'POST', body: JSON.stringify({ isim: 'Basarili Rakip', kaynak: 'manuel' }) });
	const rBId = ((await rB.json()) as { id: string }).id;

	// stubApis'in genel Anthropic dalını, İŞLETME ADINA göre ayıran özel bir sarmalayıcıyla
	// değiştiriyoruz — Basarisiz Rakip'in tespit çağrısı hata fırlatır, Basarili Rakip'inki geçerli
	// bir platform adı döner (jenerik stub metni RAKIP_PLATFORM_LISTESI'nde olmadığı için o kolu
	// kullanmak yanlış-negatif üretirdi). Diğer her şey (Sheets, oauth, rapor çağrısı) stubApis'in
	// kendi mantığında kalır.
	const original = fetchMock.getMockImplementation()!;
	fetchMock.mockImplementation(async (input, init) => {
		const url = String(input);
		if (url.includes('api.anthropic.com') && init?.body) {
			const body = JSON.parse(init.body as string);
			if (body.max_tokens === 512) {
				if (String(body.messages[0].content).includes('Basarisiz Rakip')) throw new Error('simulated failure for Basarisiz Rakip');
				return new Response(JSON.stringify({ content: [{ type: 'text', text: 'Instagram' }] }), { status: 200 });
			}
		}
		return original(input, init);
	});

	const raporRes = await authedRequest('/panel/rakip-analizi/icerik-strateji', {
		method: 'POST',
		body: JSON.stringify({ istek: 'Öneri istiyorum', rakipIds: [rAId, rBId] }),
	});
	expect(raporRes.status).toBe(200);
	const reportCall = fetchMock.mock.calls.find((c) => {
		if (!String(c[0]).includes('api.anthropic.com')) return false;
		return JSON.parse((c[1] as RequestInit).body as string).max_tokens === 8192;
	})!;
	const reportBody = JSON.parse((reportCall[1] as RequestInit).body as string);
	expect(reportBody.messages[0].content).toContain('Basarili Rakip: Instagram');
	expect(reportBody.messages[0].content).not.toContain('Basarisiz Rakip:');
});

it('when setAktifPlatformlarNotu fails, the report still generates and still includes the detected platforms', async () => {
	const { fetchMock } = stubApis({ anthropicText: 'Instagram' });
	const rakipRes = await authedRequest('/panel/rakip-analizi/rakip', { method: 'POST', body: JSON.stringify({ isim: 'Not Hatasi Rakip', kaynak: 'manuel' }) });
	const rakipId = ((await rakipRes.json()) as { id: string }).id;

	const original = fetchMock.getMockImplementation()!;
	fetchMock.mockImplementation(async (input, init) => {
		const url = String(input);
		if (url.includes(':batchUpdate') && init?.body) {
			const body = JSON.parse(init.body as string);
			if (body.requests?.[0]?.updateCells?.fields === 'note') {
				return new Response('sheets error', { status: 500 });
			}
		}
		return original(input, init);
	});

	const raporRes = await authedRequest('/panel/rakip-analizi/icerik-strateji', {
		method: 'POST',
		body: JSON.stringify({ istek: 'Öneri istiyorum', rakipIds: [rakipId] }),
	});
	expect(raporRes.status).toBe(200);
	const reportCall = fetchMock.mock.calls.find((c) => {
		if (!String(c[0]).includes('api.anthropic.com')) return false;
		return JSON.parse((c[1] as RequestInit).body as string).max_tokens === 8192;
	})!;
	const reportBody = JSON.parse((reportCall[1] as RequestInit).body as string);
	expect(reportBody.messages[0].content).toContain('Not Hatasi Rakip: Instagram');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd form-backend && npx vitest run test/rakipAnalizi.spec.ts -t "platform tespiti"`
Expected: FAIL — yeni testler `rakipPlatformTespitiBaglamiGetir` henüz yok, referanslanan davranış yok.

- [ ] **Step 3: Implement**

`form-backend/src/routes/rakipAnalizi.ts`'de import satırına ekle (satır 17 civarı):

```ts
import { ensureKullanimKaydiTab, logKullanim, getKullanimOzet, kotaDolduMu } from '../lib/kullanimKaydi';
```
→ değişmiyor (zaten `getKullanimOzet`/`logKullanim` import edilmiş).

`../lib/claude` importuna ekle (satır 11):

```ts
import { generateReport, InsufficientCreditError, platformTespitiYap } from '../lib/claude';
```

`../lib/rakipSheets` importuna ekle (satır 2-10 bloğu):

```ts
import {
	appendRakipAnalizRow,
	getAllRakipAnalizRows,
	emptyRakipAnalizRow,
	ensureRakipAnaliziTab,
	deleteRakipAnalizRows,
	updateRakipAnalizRow,
	setAktifPlatformlarNotu,
	type RakipAnalizRow,
} from '../lib/rakipSheets';
```

`rakipYorumBaglamiGetir` fonksiyonunun (satır 502-530) HEMEN ALTINA, `platformDagilimOzetiGetir`'den
ÖNCE ekle:

```ts
// Rakip Platform Tespiti (2026-08-25) — rakipYorumBaglamiGetir'in AYNI ephemeral deseni, ama veri
// kaynağı Google Places DEĞİL, Claude'un web_search aracı. rakipYorumBaglamiGetir'in aksine kota
// dolunca TAMAMEN atlamak yerine KISMİ İŞLEME yapar — kalan kota kadar rakip işlenir, gerisi rapora
// açıkça not düşülerek atlanır (kullanıcı kararı: 20 rakiplik bir seçimde kota bir kısmını
// engellese bile geri kalanı işlensin).
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

`PLATFORM_DAGILIM_TALIMATI_AKSIYON` sabitinin (satır 196-198) HEMEN ALTINA ekle:

```ts
// Platform Tespiti talimatı (2026-08-25) — PLATFORM_DAGILIM_TALIMATI_* (istatistiksel, TÜM
// rakipler) ile KARIŞTIRILMAMALI. Bu ayrı, sadece seçili/tekil rakip(ler) için ham/tekil gözlem.
const PLATFORM_TESPITI_TALIMATI = `
Sana seçili rakip(ler) için "canlı platform tespiti" başlığıyla verilen veri, o rakibin hangi
platformlarda aktif olduğuna dair GÜNCEL bir web aramasının ham sonucudur (checkbox'tan gelen
kullanıcı-onaylı veriden AYRI, doğrulanmamış bir gözlem). Bunu hem tekil rakip değerlendirmende hem
(birden fazla rakip seçiliyse) rakipler arası karşılaştırmada serbestçe kullanabilirsin (ör. "rakibin
X platformunda da aktif, sen henüz değilsin" gibi somut bir gözlem/öneriye çevir). Bu veri hiç
verilmemişse (veri yoksa ya da kota nedeniyle atlandıysa), bu konudan hiç bahsetme.`;
```

`ICERIK_STRATEJI_SYSTEM_PROMPT`'un tanımında (satır 421 civarı, template literal'in SONU)
`${PLATFORM_DAGILIM_TALIMATI_ICERIK}${RAPOR_YAPISI_TALIMATI}` kısmını
`${PLATFORM_DAGILIM_TALIMATI_ICERIK}${PLATFORM_TESPITI_TALIMATI}${RAPOR_YAPISI_TALIMATI}` yap.

`AKSIYON_ANALIZ_SYSTEM_PROMPT`'un tanımında AYNI değişikliği yap —
`${PLATFORM_DAGILIM_TALIMATI_AKSIYON}${RAPOR_YAPISI_TALIMATI}` →
`${PLATFORM_DAGILIM_TALIMATI_AKSIYON}${PLATFORM_TESPITI_TALIMATI}${RAPOR_YAPISI_TALIMATI}`
(AKSIYON_ANALIZ_SYSTEM_PROMPT tanımını `grep -n "RAPOR_YAPISI_TALIMATI}\`;" src/routes/rakipAnalizi.ts`
ile bul).

`handleIcerikStrateji`'de (satır 675 civarı) değiştir:

```ts
// ESKİ:
const rakipYorumBaglami = await rakipYorumBaglamiGetir(env, rakipler, rakipIds, parametreler);
const platformDagilimOzeti = platformDagilimOzetiGetir(rakipler);

const userPrompt =
	`Toplanan rakip verisi:\n${rakipOzet}${parametreSkorlariEki}${konuTrendEki}${rakipYorumBaglami}${platformDagilimOzeti}\n\nÇiğdem'in isteği: ${istek}` +
	iceAktarPromptEki(kaynakBelgeler);
```

```ts
// YENİ:
const [rakipYorumBaglami, rakipPlatformTespitiBaglami] = await Promise.all([
	rakipYorumBaglamiGetir(env, rakipler, rakipIds, parametreler),
	rakipPlatformTespitiBaglamiGetir(env, rakipler, rakipIds),
]);
const platformDagilimOzeti = platformDagilimOzetiGetir(rakipler);

const userPrompt =
	`Toplanan rakip verisi:\n${rakipOzet}${parametreSkorlariEki}${konuTrendEki}${rakipYorumBaglami}${rakipPlatformTespitiBaglami}${platformDagilimOzeti}\n\nÇiğdem'in isteği: ${istek}` +
	iceAktarPromptEki(kaynakBelgeler);
```

`handleAksiyonAnaliz`'de (satır 824 civarı) değiştir:

```ts
// ESKİ:
const rakipYorumBaglami = rakipIds.length ? await rakipYorumBaglamiGetir(env, rakipRows, rakipIds, parametreler) : '';
const platformDagilimOzeti = platformDagilimOzetiGetir(rakipRows);
const userPrompt =
	`Sayısal özet: ${sayisalOzet}` +
	(rakipOzet ? `\n\nSeçilen rakip verisi:\n${rakipOzet}` : '') +
	rakipYorumBaglami +
	platformDagilimOzeti +
	`\n\nÇiğdem'in yorumu: ${yorum}` +
	iceAktarPromptEki(kaynakBelgeler);
```

```ts
// YENİ:
const [rakipYorumBaglami, rakipPlatformTespitiBaglami] = rakipIds.length
	? await Promise.all([rakipYorumBaglamiGetir(env, rakipRows, rakipIds, parametreler), rakipPlatformTespitiBaglamiGetir(env, rakipRows, rakipIds)])
	: ['', ''];
const platformDagilimOzeti = platformDagilimOzetiGetir(rakipRows);
const userPrompt =
	`Sayısal özet: ${sayisalOzet}` +
	(rakipOzet ? `\n\nSeçilen rakip verisi:\n${rakipOzet}` : '') +
	rakipYorumBaglami +
	rakipPlatformTespitiBaglami +
	platformDagilimOzeti +
	`\n\nÇiğdem'in yorumu: ${yorum}` +
	iceAktarPromptEki(kaynakBelgeler);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd form-backend && npx vitest run test/rakipAnalizi.spec.ts`
Expected: PASS — TÜM dosya (mevcut ~90+ test + yeni testler), özellikle Step 0'da düzeltilen 2 test
DAHİL.

- [ ] **Step 5: Full test suite + typecheck ve format**

Run: `cd form-backend && npm test && npx tsc --noEmit && npx prettier --check .`
Expected: hepsi yeşil — bu, sadece bu dosyayı değil TÜM backend test suite'ini (form-backend/
CLAUDE.md'nin "kod bitti" koşulu) doğrular.

- [ ] **Step 6: Commit**

```bash
git add form-backend/src/routes/rakipAnalizi.ts form-backend/test/rakipAnalizi.spec.ts
git commit -m "feat: wire live competitor platform tespiti into icerikStrateji/aksiyonAnaliz reports"
```

---

## Implementasyon sonrası (kod dışı, hatırlatma)

Bu plan SADECE kodu kapsıyor. Spec'in DURUM notunda anılan iki kod-dışı takip maddesi hâlâ açık,
bu planın parçası DEĞİL:

- Sparrow'a doküman notu işlenmesi (`SPARROW_RAKIPTAKIP_CFO_VERI_KAYNAGI_ARASTIRMASI.md`) — [[project_geo_sparrow_birlesme_ihtimali]]
  ile ilgili, ayrı bir oturumda ele alınmalı.
- Panelin (rakip-analizi.html) hücre notunu görsel olarak göstermesi gerekip gerekmediği kullanıcıya
  sorulmadı — Sheets'i doğrudan açan Çiğdem notu zaten görür, panel-tarafı bir gösterge YAGNI
  olabilir; implementasyon bitince kullanıcıya bu netleştirilmeli.
