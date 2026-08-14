# Rakip Analizi & Strateji Altyapısı Implementation Plan

> **DURUM (2026-08-14): TÜM 9 GÖREV TAMAMLANDI, CANLIYA DEPLOY EDİLDİ.** Detaylı özet ve
> henüz-teyit-edilmemiş tek açık madde (kullanıcının canlıda uçtan uca fonksiyonel testi) için
> `INTEGRASYON_TODO.md`'deki "Rakip Analizi & Strateji Altyapısı — UYGULAMA TAMAMLANDI ve CANLI"
> bölümüne bak. Frontend, bu plandaki Task 7-8'de `panel.html`'e gömülü olarak tarif edilmişti;
> uygulama sonrası kullanıcı isteğiyle ayrı bir sayfaya (`rakip-analizi.html`) taşındı — bu planın
> aşağıdaki Task 7-8 metni artık o taşımadan ÖNCEKİ hali yansıtıyor, tarihi referans olarak kalsın.
> Aşağıdaki checkbox'lar plan yazıldığı andaki niyeti gösterir, güncel kod hâli için dosyaların
> kendisine bak.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Çiğdem'in istediği zaman kendi kendine tetikleyebileceği bir rakip-analiz aracı kurmak — rakip verisi toplama (manuel + konum/yarıçap harita arama), ve bu veriden iki ayrı çıktı üreten dallar: (A) küratif görsel/video içerik-stratejisi önerisi, (B) hedef/projeksiyon/realizasyon takibi.

**Mimari:** Mevcut `form-backend` Cloudflare Worker'ı genişletilir (ayrı servis kurulmaz). Yeni bir Google Sheet sekmesi ("RakipAnalizi") tüm rakip verisini müşteri/randevu verisinden (Sayfa1) tamamen izole tutar. Google Places (konum arama) ve Claude Sonnet 5 (rapor üretimi) için yeni Worker secret'ları eklenir. Frontend, mevcut `panel.html`'e yeni bir bölüm olarak eklenir, mevcut mikrofon-dikte deseni (bugüne kadar sadece `noteBox` için vardı) ortak bir yardımcıya çıkarılıp yeniden kullanılır.

**Tech Stack:** Cloudflare Workers (TypeScript), Google Sheets API v4, Google Places API (Nearby Search New), Google Maps JavaScript API, Anthropic Messages API (`claude-sonnet-5`), vitest + `@cloudflare/vitest-pool-workers`, düz HTML/JS (build adımı yok).

## Global Constraints

- Her yeni backend route `requirePanelAuth` ile korunur (mevcut panel şifresi, ayrı kullanıcı sistemi yok).
- Rakip analiz verisi Sayfa1'den (booking verisi) **tamamen ayrı bir Sheet sekmesinde** tutulur — asla aynı sekmeye yazılmaz.
- Yeni secret'lar: `ANTHROPIC_API_KEY`, `GOOGLE_PLACES_API_KEY` — `wrangler secret put` ile eklenir, asla kod içine gömülmez.
- Model: `claude-sonnet-5` (Anthropic Messages API, `https://api.anthropic.com/v1/messages`, header `anthropic-version: 2023-06-01`).
- Google Places: Nearby Search (New) — `https://places.googleapis.com/v1/places:searchNearby`.
- Her kod değişikliğinden sonra `npx tsc --noEmit` ve `npx prettier --check .` temiz olmalı (proje kuralı, CLAUDE.md).
- Sesli girişler mevcut `cleanDictation()` (Workers AI, `lib/textCleanup.ts`) ile aynı şekilde temizlenir — yeni bir temizleme yolu icat edilmez.
- Video-Edit, Sosyal Medya Otomasyonu, Linktree yapısı, "Hermes" ajanı bu planın **kapsamı dışında** — ayrı planlar.

---

## Dosya Yapısı

| Dosya | Durum | Sorumluluk |
|---|---|---|
| `form-backend/src/types.ts` | Değiştir | `Env`'e `ANTHROPIC_API_KEY`, `GOOGLE_PLACES_API_KEY` ekle |
| `form-backend/src/config.ts` | Değiştir | `RAKIP_ANALIZI_TAB_NAME`, `RAKIP_ANALIZI_COLUMNS`, `RAKIP_ANALIZI_COLUMN_LABELS` ekle |
| `form-backend/src/lib/sheets.ts` | Değiştir | `columnLetter` ve `sheetsFetch`'i export et (Sayfa1-özel `SheetRow`/`SHEET_COLUMNS` bağımlılığı olmadan yeniden kullanılabilsinler) |
| `form-backend/src/lib/rakipSheets.ts` | Oluştur | "RakipAnalizi" sekmesine özel header-çözümleme + satır ekleme/okuma (Sayfa1'in mirror-tab mantığı yok, daha basit) |
| `form-backend/src/lib/claude.ts` | Oluştur | Anthropic Messages API çağrısı için ince sarmalayıcı |
| `form-backend/src/lib/places.ts` | Oluştur | Google Places Nearby Search çağrısı için ince sarmalayıcı |
| `form-backend/src/routes/rakipAnalizi.ts` | Oluştur | 4 route handler'ı: rakip ekle, rakip ara (harita), içerik-strateji üret, aksiyon-analiz üret |
| `form-backend/src/index.ts` | Değiştir | Yeni route'ları switch'e ekle |
| `form-backend/.dev.vars.example` | Değiştir | İki yeni satır ekle |
| `form-backend/test/rakipAnalizi.spec.ts` | Oluştur | Route testleri (Places/Claude/Sheets mock'lanır) |
| `panel.html` | Değiştir | Yeni "Rakip Analizi" bölümü + mikrofon-dikte yardımcı fonksiyonunun çıkarılması |

---

## Task 1: `Env` ve config şemasını genişlet

**Files:**
- Modify: `form-backend/src/types.ts`
- Modify: `form-backend/src/config.ts`
- Modify: `form-backend/.dev.vars.example`

**Interfaces:**
- Produces: `Env.ANTHROPIC_API_KEY: string`, `Env.GOOGLE_PLACES_API_KEY: string`, `RAKIP_ANALIZI_TAB_NAME: string`, `RAKIP_ANALIZI_COLUMNS: readonly string[]`, `RAKIP_ANALIZI_COLUMN_LABELS: Record<(typeof RAKIP_ANALIZI_COLUMNS)[number], string>`, `type RakipAnalizRow = Record<(typeof RAKIP_ANALIZI_COLUMNS)[number], string>`

- [ ] **Step 1: `Env` interface'ine iki secret ekle**

`form-backend/src/types.ts`'te mevcut `Env` interface'inin sonuna, `AI: Ai;` satırından önce ekle:

```typescript
	// Rakip Analizi & Strateji Altyapısı: Claude Sonnet 5 (rapor üretimi) + Google Places (konum
	// bazlı rakip arama). Her ikisi de yalnızca /panel/rakip-analizi/* route'larında kullanılır.
	ANTHROPIC_API_KEY: string;
	GOOGLE_PLACES_API_KEY: string;
```

- [ ] **Step 2: `.dev.vars.example`'a karşılık gelen iki satır ekle**

`form-backend/.dev.vars.example`'ın sonuna ekle:

```
# Rakip Analizi: Anthropic Messages API (claude-sonnet-5) + Google Places Nearby Search (New).
ANTHROPIC_API_KEY=sk-ant-dummy
GOOGLE_PLACES_API_KEY=dummy-places-key
```

- [ ] **Step 3: `config.ts`'e yeni sekme adı ve kolon şemasını ekle**

`form-backend/src/config.ts`'in sonuna ekle (dosyanın geri kalanına dokunma — `SHEET_COLUMNS`/`SHEET_COLUMN_LABELS` Sayfa1'e özel, bunlarla karıştırılmaz):

```typescript
// ── Rakip Analizi & Strateji Altyapısı ──────────────────────────────────────────────────────────
// Sayfa1'den (randevu/müşteri verisi) TAMAMEN AYRI bir sekme — kullanıcının açık isteği, asla
// karışmamalı. Kendi kolon şeması var, SHEET_COLUMNS'a hiç dokunmuyor.

export const RAKIP_ANALIZI_TAB_NAME = 'RakipAnalizi';

export const RAKIP_ANALIZI_COLUMNS = [
	'id',
	'createdAtUtc',
	'kaynak', // 'manuel' | 'harita'
	'isim',
	'link',
	'adres',
	'not', // Çiğdem'in yazı/ses girişi (manuel kaynak) veya harita seçimine eklediği not
	'dal', // 'icerikStrateji' | 'aksiyonAnaliz'
	'raporMetni', // Claude'un ürettiği çıktı
] as const;

export const RAKIP_ANALIZI_COLUMN_LABELS: Record<(typeof RAKIP_ANALIZI_COLUMNS)[number], string> = {
	id: 'ID',
	createdAtUtc: 'Oluşturulma (UTC)',
	kaynak: 'Kaynak',
	isim: 'Rakip İsmi',
	link: 'Link',
	adres: 'Adres',
	not: 'Not',
	dal: 'Dal',
	raporMetni: 'Rapor Metni',
};
```

- [ ] **Step 4: Tip kontrolü**

Run: `cd form-backend && npx tsc --noEmit`
Expected: hata yok (henüz `RakipAnalizRow` tipi tanımlanmadı — Task 2'de eklenecek, bu adımda sadece config/types derlensin).

- [ ] **Step 5: Commit**

```bash
git add form-backend/src/types.ts form-backend/src/config.ts form-backend/.dev.vars.example
git commit -m "Add Rakip Analizi env secrets and sheet column schema"
```

---

## Task 2: `lib/sheets.ts`'teki genel yardımcıları export et

**Files:**
- Modify: `form-backend/src/lib/sheets.ts`
- Test: `form-backend/test/sheets.spec.ts` (varsa mevcut testlerin bozulmadığını doğrula — yeni test eklemiyoruz, sadece `export` ekliyoruz)

**Interfaces:**
- Consumes: yok
- Produces: `export function columnLetter(index: number): string`, `export async function sheetsFetch(env: Env, path: string, init?: RequestInit): Promise<Response>` (SHEETS_API sabiti `env.GOOGLE_SHEET_ID`'ye bağlı kalmaya devam eder — RakipAnalizi de AYNI spreadsheet'in bir sekmesi, ayrı bir Sheet ID değil)

- [ ] **Step 1: İki private fonksiyonun başına `export` ekle**

`form-backend/src/lib/sheets.ts`'te:

```typescript
// ÖNCE:
function columnLetter(index: number): string {
// SONRA:
export function columnLetter(index: number): string {
```

```typescript
// ÖNCE:
async function sheetsFetch(env: Env, path: string, init: RequestInit = {}): Promise<Response> {
// SONRA:
export async function sheetsFetch(env: Env, path: string, init: RequestInit = {}): Promise<Response> {
```

Başka hiçbir şey değişmiyor — davranış aynı, sadece görünürlük.

- [ ] **Step 2: Mevcut testlerin hâlâ geçtiğini doğrula**

Run: `cd form-backend && npm test`
Expected: PASS (tüm mevcut testler, davranış değişmedi)

- [ ] **Step 3: Commit**

```bash
git add form-backend/src/lib/sheets.ts
git commit -m "Export columnLetter and sheetsFetch for reuse by a second sheet tab"
```

---

## Task 3: `lib/rakipSheets.ts` — RakipAnalizi sekmesi için okuma/yazma

**Files:**
- Create: `form-backend/src/lib/rakipSheets.ts`
- Test: `form-backend/test/rakipSheets.spec.ts`

**Interfaces:**
- Consumes: `columnLetter`, `sheetsFetch` (Task 2), `RAKIP_ANALIZI_TAB_NAME`, `RAKIP_ANALIZI_COLUMNS`, `RAKIP_ANALIZI_COLUMN_LABELS` (Task 1), `Env` (`types.ts`)
- Produces: `type RakipAnalizRow = Record<(typeof RAKIP_ANALIZI_COLUMNS)[number], string>`, `function emptyRakipAnalizRow(): RakipAnalizRow`, `async function ensureRakipAnaliziTab(env: Env): Promise<void>`, `async function appendRakipAnalizRow(env: Env, row: RakipAnalizRow): Promise<number>`, `async function getAllRakipAnalizRows(env: Env): Promise<{ rowNumber: number; row: RakipAnalizRow }[]>`

Sayfa1'in mirror-tab mantığı (BE-18/BE-19 tarihli karmaşık çakışma-korumalı append) burada gerekmiyor — RakipAnalizi tek kullanıcılı (sadece Çiğdem), eşzamanlı yazma çakışması riski Sayfa1'deki gibi değil (Stripe webhook'u yok). Basit bir header-çözümle + tek satır append yeterli.

- [ ] **Step 1: Dosyayı oluştur**

`form-backend/src/lib/rakipSheets.ts`:

```typescript
import { RAKIP_ANALIZI_TAB_NAME, RAKIP_ANALIZI_COLUMNS, RAKIP_ANALIZI_COLUMN_LABELS } from '../config';
import { columnLetter, sheetsFetch } from './sheets';
import type { Env } from '../types';

export type RakipAnalizRow = Record<(typeof RAKIP_ANALIZI_COLUMNS)[number], string>;

export function emptyRakipAnalizRow(): RakipAnalizRow {
	const row = {} as RakipAnalizRow;
	for (const key of RAKIP_ANALIZI_COLUMNS) row[key] = '';
	return row;
}

// RakipAnalizi tab'ı yoksa oluştur, varsa gridi kolon sayısına göre genişlet — Sayfa1'deki
// ensureSheetTab ile aynı mantık, ama sadece bu tek sekme için (mirror-tab çoğullaması yok).
export async function ensureRakipAnaliziTab(env: Env): Promise<void> {
	const response = await sheetsFetch(env, '?fields=sheets.properties(sheetId,title,gridProperties.columnCount)');
	const data = (await response.json()) as {
		sheets?: { properties?: { sheetId?: number; title?: string; gridProperties?: { columnCount?: number } } }[];
	};
	const existing = (data.sheets ?? []).find((s) => s.properties?.title === RAKIP_ANALIZI_TAB_NAME);

	if (!existing) {
		await sheetsFetch(env, ':batchUpdate', {
			method: 'POST',
			body: JSON.stringify({
				requests: [
					{
						addSheet: {
							properties: { title: RAKIP_ANALIZI_TAB_NAME, gridProperties: { columnCount: RAKIP_ANALIZI_COLUMNS.length } },
						},
					},
				],
			}),
		});
		await writeHeaderRow(env);
		return;
	}

	const columnCount = existing.properties?.gridProperties?.columnCount ?? 0;
	if (columnCount < RAKIP_ANALIZI_COLUMNS.length && existing.properties?.sheetId !== undefined) {
		await sheetsFetch(env, ':batchUpdate', {
			method: 'POST',
			body: JSON.stringify({
				requests: [
					{
						updateSheetProperties: {
							properties: {
								sheetId: existing.properties.sheetId,
								gridProperties: { columnCount: RAKIP_ANALIZI_COLUMNS.length },
							},
							fields: 'gridProperties.columnCount',
						},
					},
				],
			}),
		});
	}
	await writeHeaderRow(env);
}

async function writeHeaderRow(env: Env): Promise<void> {
	const range = `${RAKIP_ANALIZI_TAB_NAME}!A1:${columnLetter(RAKIP_ANALIZI_COLUMNS.length - 1)}1`;
	const values = [RAKIP_ANALIZI_COLUMNS.map((key) => RAKIP_ANALIZI_COLUMN_LABELS[key])];
	await sheetsFetch(env, `/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
		method: 'PUT',
		body: JSON.stringify({ values }),
	});
}

// Tek satır ekler, 1-indexed satır numarasını döner (header row 1). Sayfa1'in aksine header her
// zaman RAKIP_ANALIZI_COLUMNS sırasında yazıldığı için (yukarıdaki writeHeaderRow), pozisyon
// çözümlemesine gerek yok — doğrudan sıraya göre append.
export async function appendRakipAnalizRow(env: Env, row: RakipAnalizRow): Promise<number> {
	const values = [RAKIP_ANALIZI_COLUMNS.map((key) => String(row[key] ?? ''))];
	const range = `${RAKIP_ANALIZI_TAB_NAME}!A:${columnLetter(RAKIP_ANALIZI_COLUMNS.length - 1)}`;
	const response = await sheetsFetch(env, `/values/${encodeURIComponent(range)}:append?valueInputOption=RAW`, {
		method: 'POST',
		body: JSON.stringify({ values }),
	});
	const data = (await response.json()) as { updates?: { updatedRange?: string } };
	const match = data.updates?.updatedRange?.match(/![A-Z]+(\d+)/);
	if (!match) throw new Error(`Could not parse row number from RakipAnalizi append response: ${JSON.stringify(data)}`);
	return Number(match[1]);
}

export async function getAllRakipAnalizRows(env: Env): Promise<{ rowNumber: number; row: RakipAnalizRow }[]> {
	const range = `${RAKIP_ANALIZI_TAB_NAME}!A2:${columnLetter(RAKIP_ANALIZI_COLUMNS.length - 1)}`;
	const response = await sheetsFetch(env, `/values/${encodeURIComponent(range)}`);
	const data = (await response.json()) as { values?: string[][] };
	return (data.values ?? []).map((values, i) => {
		const row = {} as RakipAnalizRow;
		RAKIP_ANALIZI_COLUMNS.forEach((key, colIndex) => (row[key] = String(values[colIndex] ?? '')));
		return { rowNumber: i + 2, row };
	});
}
```

- [ ] **Step 2: Test dosyasını yaz**

`form-backend/test/rakipSheets.spec.ts`:

```typescript
import { env } from 'cloudflare:test';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ensureRakipAnaliziTab, appendRakipAnalizRow, getAllRakipAnalizRows, emptyRakipAnalizRow } from '../src/lib/rakipSheets';

afterEach(() => vi.unstubAllGlobals());

function stubSheetsApi(existingTabs: string[] = []) {
	const appended: string[][] = [];
	const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		const method = init?.method ?? 'GET';
		if (url.includes('oauth2.googleapis.com')) {
			return new Response(JSON.stringify({ access_token: 'fake', expires_in: 3600 }), { status: 200 });
		}
		if (url.includes('?fields=sheets.properties')) {
			return new Response(
				JSON.stringify({ sheets: existingTabs.map((t) => ({ properties: { sheetId: 1, title: t, gridProperties: { columnCount: 20 } } })) }),
				{ status: 200 },
			);
		}
		if (url.includes(':batchUpdate')) {
			return new Response('{}', { status: 200 });
		}
		if (url.includes(':append') && method === 'POST') {
			const body = JSON.parse(init!.body as string);
			appended.push(body.values[0]);
			return new Response(JSON.stringify({ updates: { updatedRange: `RakipAnalizi!A${appended.length + 1}:I${appended.length + 1}` } }), {
				status: 200,
			});
		}
		if (url.includes('/values/') && method === 'PUT') {
			return new Response('{}', { status: 200 });
		}
		if (url.includes('/values/') && method === 'GET') {
			return new Response(JSON.stringify({ values: appended }), { status: 200 });
		}
		throw new Error(`Unexpected fetch in test: ${method} ${url}`);
	});
	vi.stubGlobal('fetch', fetchMock);
	return { appended };
}

describe('rakipSheets', () => {
	it('creates the RakipAnalizi tab when it does not exist yet', async () => {
		stubSheetsApi([]);
		await expect(ensureRakipAnaliziTab(env)).resolves.not.toThrow();
	});

	it('appends a row and returns its row number', async () => {
		stubSheetsApi(['Sayfa1', 'RakipAnalizi']);
		const row = emptyRakipAnalizRow();
		row.isim = 'Örnek Klinik';
		row.kaynak = 'manuel';
		const rowNumber = await appendRakipAnalizRow(env, row);
		expect(rowNumber).toBe(2);
	});

	it('reads back appended rows', async () => {
		const { appended } = stubSheetsApi(['Sayfa1', 'RakipAnalizi']);
		const row = emptyRakipAnalizRow();
		row.isim = 'Örnek Klinik';
		appended.push(Object.values(row));
		const rows = await getAllRakipAnalizRows(env);
		expect(rows).toHaveLength(1);
		expect(rows[0].row.isim).toBe('Örnek Klinik');
	});
});
```

- [ ] **Step 3: Testi çalıştır ve geçtiğini doğrula**

Run: `cd form-backend && npx vitest run test/rakipSheets.spec.ts`
Expected: PASS (3/3)

- [ ] **Step 4: Commit**

```bash
git add form-backend/src/lib/rakipSheets.ts form-backend/test/rakipSheets.spec.ts
git commit -m "Add RakipAnalizi sheet tab read/write helpers"
```

---

## Task 4: `lib/claude.ts` — Claude Sonnet 5 çağrısı

**Files:**
- Create: `form-backend/src/lib/claude.ts`
- Test: `form-backend/test/claude.spec.ts`

**Interfaces:**
- Consumes: `Env.ANTHROPIC_API_KEY`
- Produces: `async function generateReport(env: Env, systemPrompt: string, userPrompt: string): Promise<string>`

- [ ] **Step 1: Dosyayı oluştur**

`form-backend/src/lib/claude.ts`:

```typescript
import type { Env } from '../types';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-5';

// İnce sarmalayıcı — Rakip Analizi'nin iki dalı (içerik-strateji, aksiyon-analiz) da aynı
// şekilde bir sistem talimatı + kullanıcı isteği verip düz metin rapor alıyor, ekstra
// (tool use, streaming vb.) bir şey gerekmiyor.
export async function generateReport(env: Env, systemPrompt: string, userPrompt: string): Promise<string> {
	const response = await fetch(ANTHROPIC_API, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'x-api-key': env.ANTHROPIC_API_KEY,
			'anthropic-version': '2023-06-01',
		},
		body: JSON.stringify({
			model: MODEL,
			max_tokens: 4096,
			system: systemPrompt,
			messages: [{ role: 'user', content: userPrompt }],
		}),
	});
	if (!response.ok) {
		throw new Error(`Claude API call failed: ${response.status} ${await response.text()}`);
	}
	const data = (await response.json()) as { content?: { type: string; text?: string }[]; stop_reason?: string };
	if (data.stop_reason === 'refusal') {
		throw new Error('Claude bu isteği güvenlik nedeniyle reddetti.');
	}
	const textBlock = data.content?.find((b) => b.type === 'text');
	if (!textBlock?.text) throw new Error(`Claude API'den metin yanıtı alınamadı: ${JSON.stringify(data)}`);
	return textBlock.text;
}
```

- [ ] **Step 2: Test dosyasını yaz**

`form-backend/test/claude.spec.ts`:

```typescript
import { env } from 'cloudflare:test';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateReport } from '../src/lib/claude';

afterEach(() => vi.unstubAllGlobals());

describe('generateReport', () => {
	it('returns the text block from a successful response', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify({ content: [{ type: 'text', text: 'Rapor içeriği burada.' }] }), { status: 200 })),
		);
		const result = await generateReport(env, 'sistem talimatı', 'kullanıcı isteği');
		expect(result).toBe('Rapor içeriği burada.');
	});

	it('throws a clear error when Claude refuses', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify({ content: [], stop_reason: 'refusal' }), { status: 200 })),
		);
		await expect(generateReport(env, 'sistem', 'istek')).rejects.toThrow(/reddetti/);
	});

	it('throws when the API call fails', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => new Response('rate limited', { status: 429 })));
		await expect(generateReport(env, 'sistem', 'istek')).rejects.toThrow(/429/);
	});
});
```

- [ ] **Step 3: Testi çalıştır**

Run: `cd form-backend && npx vitest run test/claude.spec.ts`
Expected: PASS (3/3)

- [ ] **Step 4: Commit**

```bash
git add form-backend/src/lib/claude.ts form-backend/test/claude.spec.ts
git commit -m "Add Claude Sonnet 5 report-generation wrapper"
```

---

## Task 5: `lib/places.ts` — Google Places konum+yarıçap arama

**Files:**
- Create: `form-backend/src/lib/places.ts`
- Test: `form-backend/test/places.spec.ts`

**Interfaces:**
- Consumes: `Env.GOOGLE_PLACES_API_KEY`
- Produces: `interface NearbyPlace { name: string; address: string; lat: number; lng: number; }`, `async function searchNearbyCompetitors(env: Env, lat: number, lng: number, radiusMeters: number): Promise<NearbyPlace[]>`

- [ ] **Step 1: Dosyayı oluştur**

`form-backend/src/lib/places.ts`:

```typescript
import type { Env } from '../types';

const PLACES_API = 'https://places.googleapis.com/v1/places:searchNearby';
// Terapi/danışmanlık/wellness pratiği ile örtüşen Google Places tipleri — geniş tutuluyor,
// Çiğdem sonuçları kendi gözüyle eleyecek.
const INCLUDED_TYPES = ['psychotherapist', 'counselor', 'wellness_center', 'doctor'];

export interface NearbyPlace {
	name: string;
	address: string;
	lat: number;
	lng: number;
}

export async function searchNearbyCompetitors(env: Env, lat: number, lng: number, radiusMeters: number): Promise<NearbyPlace[]> {
	const response = await fetch(PLACES_API, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'x-goog-api-key': env.GOOGLE_PLACES_API_KEY,
			'x-goog-fieldmask': 'places.displayName,places.formattedAddress,places.location',
		},
		body: JSON.stringify({
			includedTypes: INCLUDED_TYPES,
			maxResultCount: 20,
			locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius: radiusMeters } },
		}),
	});
	if (!response.ok) {
		throw new Error(`Google Places API call failed: ${response.status} ${await response.text()}`);
	}
	const data = (await response.json()) as {
		places?: { displayName?: { text?: string }; formattedAddress?: string; location?: { latitude?: number; longitude?: number } }[];
	};
	return (data.places ?? []).map((p) => ({
		name: p.displayName?.text ?? '',
		address: p.formattedAddress ?? '',
		lat: p.location?.latitude ?? 0,
		lng: p.location?.longitude ?? 0,
	}));
}
```

- [ ] **Step 2: Test dosyasını yaz**

`form-backend/test/places.spec.ts`:

```typescript
import { env } from 'cloudflare:test';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { searchNearbyCompetitors } from '../src/lib/places';

afterEach(() => vi.unstubAllGlobals());

describe('searchNearbyCompetitors', () => {
	it('maps Places API results to NearbyPlace[]', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				new Response(
					JSON.stringify({
						places: [
							{ displayName: { text: 'Örnek Terapi Merkezi' }, formattedAddress: '10 Example St, London', location: { latitude: 51.5, longitude: -0.1 } },
						],
					}),
					{ status: 200 },
				),
			),
		);
		const results = await searchNearbyCompetitors(env, 51.5, -0.1, 2000);
		expect(results).toEqual([{ name: 'Örnek Terapi Merkezi', address: '10 Example St, London', lat: 51.5, lng: -0.1 }]);
	});

	it('returns an empty array when no places are found', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })));
		const results = await searchNearbyCompetitors(env, 51.5, -0.1, 2000);
		expect(results).toEqual([]);
	});

	it('throws when the API call fails', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => new Response('bad request', { status: 400 })));
		await expect(searchNearbyCompetitors(env, 51.5, -0.1, 2000)).rejects.toThrow(/400/);
	});
});
```

- [ ] **Step 3: Testi çalıştır**

Run: `cd form-backend && npx vitest run test/places.spec.ts`
Expected: PASS (3/3)

- [ ] **Step 4: Commit**

```bash
git add form-backend/src/lib/places.ts form-backend/test/places.spec.ts
git commit -m "Add Google Places nearby-competitor search wrapper"
```

---

## Task 6: `routes/rakipAnalizi.ts` — route handler'ları

**Files:**
- Create: `form-backend/src/routes/rakipAnalizi.ts`
- Test: `form-backend/test/rakipAnalizi.spec.ts`

**Interfaces:**
- Consumes: `appendRakipAnalizRow`, `getAllRakipAnalizRows`, `emptyRakipAnalizRow`, `ensureRakipAnaliziTab` (Task 3), `generateReport` (Task 4), `searchNearbyCompetitors` (Task 5), `cleanDictation` (mevcut `lib/textCleanup.ts`), `errorResponse`/`json` (mevcut `lib/http.ts`)
- Produces: `handleRakipEkle`, `handleRakipAra`, `handleIcerikStrateji`, `handleAksiyonAnaliz` — dördü de `(request: Request, env: Env) => Promise<Response>`

- [ ] **Step 1: Dosyayı oluştur**

`form-backend/src/routes/rakipAnalizi.ts`:

```typescript
import { getAllRows } from '../lib/sheets';
import { appendRakipAnalizRow, getAllRakipAnalizRows, emptyRakipAnalizRow, ensureRakipAnaliziTab } from '../lib/rakipSheets';
import { generateReport } from '../lib/claude';
import { searchNearbyCompetitors } from '../lib/places';
import { cleanDictation } from '../lib/textCleanup';
import { errorResponse, json } from '../lib/http';
import type { Env } from '../types';

const NOTE_MAX_LENGTH = 5000;

function newId(): string {
	return crypto.randomUUID();
}

// POST /panel/rakip-analizi/rakip { isim, link?, adres?, not, kaynak: 'manuel' | 'harita' } —
// Çiğdem'in rastgele karşılaştığı bir rakip (manuel) veya harita aramasından seçtiği bir sonuç
// (harita), üzerine eklediği yazı/ses notuyla birlikte RakipAnalizi sekmesine kaydedilir.
export async function handleRakipEkle(request: Request, env: Env): Promise<Response> {
	let body: { isim?: unknown; link?: unknown; adres?: unknown; not?: unknown; kaynak?: unknown };
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return errorResponse(request, 400, 'Geçersiz istek.');
	}
	const isim = String(body.isim ?? '').trim();
	const kaynak = String(body.kaynak ?? '');
	if (!isim) return errorResponse(request, 400, 'Rakip ismi gerekli.');
	if (kaynak !== 'manuel' && kaynak !== 'harita') return errorResponse(request, 400, 'Geçersiz kaynak.');

	const rawNot = String(body.not ?? '').slice(0, NOTE_MAX_LENGTH);
	const not = rawNot ? await cleanDictation(env, rawNot) : '';

	await ensureRakipAnaliziTab(env);
	const row = emptyRakipAnalizRow();
	row.id = newId();
	row.createdAtUtc = new Date().toISOString();
	row.kaynak = kaynak;
	row.isim = isim;
	row.link = String(body.link ?? '').trim();
	row.adres = String(body.adres ?? '').trim();
	row.not = not;
	const rowNumber = await appendRakipAnalizRow(env, row);
	return json({ id: row.id, rowNumber }, request);
}

// GET /panel/rakip-analizi/rakip-ara?lat=&lng=&radiusMeters= — konum+yarıçap bazlı harita
// araması. API key sızmasın diye backend proxy'liyor, sonuçlar doğrudan frontend'in haritaya
// pin basması için kullanılır (kaydetme ayrı bir handleRakipEkle çağrısı — Çiğdem hangi
// sonuçları seçtiğine karar verdikten sonra).
export async function handleRakipAra(request: Request, env: Env): Promise<Response> {
	const url = new URL(request.url);
	const lat = Number(url.searchParams.get('lat'));
	const lng = Number(url.searchParams.get('lng'));
	const radiusMeters = Number(url.searchParams.get('radiusMeters'));
	if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(radiusMeters) || radiusMeters <= 0) {
		return errorResponse(request, 400, 'Geçersiz konum/yarıçap.');
	}
	try {
		const places = await searchNearbyCompetitors(env, lat, lng, radiusMeters);
		return json({ places }, request);
	} catch (err) {
		return errorResponse(request, 502, 'Harita şu an yüklenemedi, manuel giriş yapabilirsin.', err);
	}
}

// Görsel/video stratejisi için sistem talimatı — rakip içeriği KOPYALANMAZ, sadece stratejiden
// (format/sıklık/platform) ilham alınır; küratif yaklaşımın kod-seviyesindeki karşılığı bu.
const ICERIK_STRATEJI_SYSTEM_PROMPT = `Sen Talk and Heal'in (Çiğdem Taş'ın terapi pratiği) sosyal medya içerik stratejisti olarak çalışıyorsun.
Sana verilen rakip verisini analiz ederek, o rakiplerin içeriklerini ASLA kopyalamadan, sadece
stratejilerinden (hangi platformda, ne sıklıkla, hangi format/konu daha çok etkileşim alıyor)
ilham alarak Talk and Heal için ORİJİNAL, telifsiz-stok veya AI-üretilmiş içerik önerileri sun.
Türkçe yaz, somut ve uygulanabilir öneriler ver.`;

// POST /panel/rakip-analizi/icerik-strateji { istek } — toplanan tüm rakip verisi + Çiğdem'in
// serbest metin/ses isteği Claude'a gönderilir, küratif öneri raporu üretilir ve kaydedilir.
export async function handleIcerikStrateji(request: Request, env: Env): Promise<Response> {
	let body: { istek?: unknown };
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return errorResponse(request, 400, 'Geçersiz istek.');
	}
	const rawIstek = String(body.istek ?? '').slice(0, NOTE_MAX_LENGTH);
	if (!rawIstek) return errorResponse(request, 400, 'İstek metni gerekli.');
	const istek = await cleanDictation(env, rawIstek);

	await ensureRakipAnaliziTab(env);
	const rakipler = await getAllRakipAnalizRows(env);
	const rakipOzet = rakipler
		.map(({ row }) => `- ${row.isim}${row.adres ? ` (${row.adres})` : ''}${row.not ? `: ${row.not}` : ''}`)
		.join('\n');
	const userPrompt = `Toplanan rakip verisi:\n${rakipOzet || '(henüz rakip verisi yok)'}\n\nÇiğdem'in isteği: ${istek}`;

	let rapor: string;
	try {
		rapor = await generateReport(env, ICERIK_STRATEJI_SYSTEM_PROMPT, userPrompt);
	} catch (err) {
		return errorResponse(request, 502, 'Rapor şu an üretilemedi, lütfen tekrar dene.', err);
	}

	const row = emptyRakipAnalizRow();
	row.id = newId();
	row.createdAtUtc = new Date().toISOString();
	row.kaynak = 'rapor';
	row.dal = 'icerikStrateji';
	row.not = istek;
	row.raporMetni = rapor;
	await appendRakipAnalizRow(env, row);
	return json({ id: row.id, rapor }, request);
}

const AKSIYON_ANALIZ_SYSTEM_PROMPT = `Sen Talk and Heal'in (Çiğdem Taş'ın terapi pratiği) iş stratejisti olarak çalışıyorsun.
Sana verilen randevu/gelir verisi ve Çiğdem'in gözlem/yorumuna dayanarak haftalık/aylık/
3-6-9-12 aylık somut hedefler, bir yol haritası ve atılması gereken adımları öner. Eğer
önceki bir dönemin hedefi verilmişse, "neredeydik / ne yaptık / neredeyiz" üçlemesiyle
realizasyonu değerlendir; sapma varsa nedenini analiz edip bir sonraki dönem için
düzeltilmiş hedef/yol haritası öner. Türkçe yaz, somut ve ölçülebilir ol.`;

// POST /panel/rakip-analizi/aksiyon-analiz { yorum } — booking Sheet'inden (Sayfa1) otomatik
// sayısal özet + Çiğdem'in yazı/ses yorumu birlikte Claude'a gönderilir.
export async function handleAksiyonAnaliz(request: Request, env: Env): Promise<Response> {
	let body: { yorum?: unknown };
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return errorResponse(request, 400, 'Geçersiz istek.');
	}
	const rawYorum = String(body.yorum ?? '').slice(0, NOTE_MAX_LENGTH);
	if (!rawYorum) return errorResponse(request, 400, 'Yorum metni gerekli.');
	const yorum = await cleanDictation(env, rawYorum);

	const bookingRows = await getAllRows(env);
	const aktifRandevu = bookingRows.filter(({ row }) => !row.cancelledAt).length;
	const iptalRandevu = bookingRows.filter(({ row }) => row.cancelledAt).length;
	const sayisalOzet = `Toplam randevu: ${bookingRows.length}, aktif: ${aktifRandevu}, iptal: ${iptalRandevu}`;
	const userPrompt = `Sayısal özet: ${sayisalOzet}\n\nÇiğdem'in yorumu: ${yorum}`;

	let rapor: string;
	try {
		rapor = await generateReport(env, AKSIYON_ANALIZ_SYSTEM_PROMPT, userPrompt);
	} catch (err) {
		return errorResponse(request, 502, 'Analiz şu an üretilemedi, lütfen tekrar dene.', err);
	}

	await ensureRakipAnaliziTab(env);
	const row = emptyRakipAnalizRow();
	row.id = newId();
	row.createdAtUtc = new Date().toISOString();
	row.kaynak = 'rapor';
	row.dal = 'aksiyonAnaliz';
	row.not = yorum;
	row.raporMetni = rapor;
	await appendRakipAnalizRow(env, row);
	return json({ id: row.id, rapor }, request);
}
```

- [ ] **Step 2: Test dosyasını yaz**

`form-backend/test/rakipAnalizi.spec.ts`:

```typescript
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, vi, afterEach } from 'vitest';
import worker from '../src';
import { signPanelToken } from '../src/lib/panel-auth';

afterEach(() => vi.unstubAllGlobals());

const testEnv = { ...env, PANEL_PASSWORD: 'correct-horse', PANEL_TOKEN_SECRET: 'panel-test-secret', ANTHROPIC_API_KEY: 'test-key', GOOGLE_PLACES_API_KEY: 'test-key' } as typeof env;

function stubApis() {
	const sheetsAppended: string[][] = [];
	const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		const method = init?.method ?? 'GET';
		if (url.includes('oauth2.googleapis.com')) {
			return new Response(JSON.stringify({ access_token: 'fake', expires_in: 3600 }), { status: 200 });
		}
		if (url.includes('?fields=sheets.properties')) {
			return new Response(JSON.stringify({ sheets: [{ properties: { sheetId: 1, title: 'RakipAnalizi', gridProperties: { columnCount: 20 } } }] }), {
				status: 200,
			});
		}
		if (url.includes(':batchUpdate')) return new Response('{}', { status: 200 });
		if (url.includes(':append') && method === 'POST') {
			const body = JSON.parse(init!.body as string);
			sheetsAppended.push(body.values[0]);
			return new Response(JSON.stringify({ updates: { updatedRange: `RakipAnalizi!A${sheetsAppended.length + 1}:I${sheetsAppended.length + 1}` } }), {
				status: 200,
			});
		}
		if (url.includes('/values/') && method === 'PUT') return new Response('{}', { status: 200 });
		if (url.includes('/values/') && method === 'GET') return new Response(JSON.stringify({ values: sheetsAppended }), { status: 200 });
		if (url.includes('places.googleapis.com')) {
			return new Response(
				JSON.stringify({ places: [{ displayName: { text: 'Test Klinik' }, formattedAddress: 'Test Adres', location: { latitude: 1, longitude: 2 } }] }),
				{ status: 200 },
			);
		}
		if (url.includes('api.anthropic.com')) {
			return new Response(JSON.stringify({ content: [{ type: 'text', text: 'Üretilen rapor metni.' }] }), { status: 200 });
		}
		throw new Error(`Unexpected fetch in test: ${method} ${url}`);
	});
	vi.stubGlobal('fetch', fetchMock);
	return { sheetsAppended };
}

async function authedRequest(path: string, init: RequestInit = {}) {
	const token = await signPanelToken(testEnv);
	const request = new Request(`http://localhost${path}`, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
	const ctx = createExecutionContext();
	const response = await worker.fetch(request, testEnv, ctx);
	await waitOnExecutionContext(ctx);
	return response;
}

describe('POST /panel/rakip-analizi/rakip', () => {
	it('saves a manual competitor entry', async () => {
		stubApis();
		const response = await authedRequest('/panel/rakip-analizi/rakip', {
			method: 'POST',
			body: JSON.stringify({ isim: 'Rakip Klinik', kaynak: 'manuel', not: 'Instagram\'da haftada 3 paylaşım yapıyor' }),
		});
		expect(response.status).toBe(200);
		const data = (await response.json()) as { id: string };
		expect(data.id).toBeTruthy();
	});

	it('rejects a request with no name', async () => {
		stubApis();
		const response = await authedRequest('/panel/rakip-analizi/rakip', { method: 'POST', body: JSON.stringify({ kaynak: 'manuel' }) });
		expect(response.status).toBe(400);
	});

	it('rejects requests without a valid panel token', async () => {
		stubApis();
		const request = new Request('http://localhost/panel/rakip-analizi/rakip', { method: 'POST', body: JSON.stringify({ isim: 'X', kaynak: 'manuel' }) });
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, testEnv, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(401);
	});
});

describe('GET /panel/rakip-analizi/rakip-ara', () => {
	it('returns nearby places for a valid location+radius', async () => {
		stubApis();
		const response = await authedRequest('/panel/rakip-analizi/rakip-ara?lat=51.5&lng=-0.1&radiusMeters=2000');
		expect(response.status).toBe(200);
		const data = (await response.json()) as { places: { name: string }[] };
		expect(data.places).toEqual([{ name: 'Test Klinik', address: 'Test Adres', lat: 1, lng: 2 }]);
	});

	it('rejects an invalid radius', async () => {
		stubApis();
		const response = await authedRequest('/panel/rakip-analizi/rakip-ara?lat=51.5&lng=-0.1&radiusMeters=0');
		expect(response.status).toBe(400);
	});
});

describe('POST /panel/rakip-analizi/icerik-strateji', () => {
	it('generates and saves a content strategy report', async () => {
		stubApis();
		const response = await authedRequest('/panel/rakip-analizi/icerik-strateji', {
			method: 'POST',
			body: JSON.stringify({ istek: 'Bu ay için Instagram içerik önerisi istiyorum' }),
		});
		expect(response.status).toBe(200);
		const data = (await response.json()) as { rapor: string };
		expect(data.rapor).toBe('Üretilen rapor metni.');
	});
});

describe('POST /panel/rakip-analizi/aksiyon-analiz', () => {
	it('generates and saves a goal/realization report', async () => {
		stubApis();
		const response = await authedRequest('/panel/rakip-analizi/aksiyon-analiz', {
			method: 'POST',
			body: JSON.stringify({ yorum: 'Bu ay randevular biraz azaldı' }),
		});
		expect(response.status).toBe(200);
		const data = (await response.json()) as { rapor: string };
		expect(data.rapor).toBe('Üretilen rapor metni.');
	});
});
```

- [ ] **Step 3: `index.ts`'e route'ları ekle**

`form-backend/src/index.ts`'te importlara ekle:

```typescript
import {
	handleRakipEkle,
	handleRakipAra,
	handleIcerikStrateji,
	handleAksiyonAnaliz,
} from './routes/rakipAnalizi';
```

`switch (key) {` bloğunda, mevcut `case 'POST /panel/cancel':` satırından sonra ekle:

```typescript
			case 'POST /panel/rakip-analizi/rakip':
				return (await requirePanelAuth(request, env)) ?? handleRakipEkle(request, env);
			case 'GET /panel/rakip-analizi/rakip-ara':
				return (await requirePanelAuth(request, env)) ?? handleRakipAra(request, env);
			case 'POST /panel/rakip-analizi/icerik-strateji':
				return (await requirePanelAuth(request, env)) ?? handleIcerikStrateji(request, env);
			case 'POST /panel/rakip-analizi/aksiyon-analiz':
				return (await requirePanelAuth(request, env)) ?? handleAksiyonAnaliz(request, env);
```

- [ ] **Step 4: Testleri çalıştır**

Run: `cd form-backend && npx vitest run test/rakipAnalizi.spec.ts`
Expected: PASS (7/7)

- [ ] **Step 5: Tip kontrolü ve format kontrolü**

Run: `cd form-backend && npx tsc --noEmit && npx prettier --check .`
Expected: hata yok

- [ ] **Step 6: Tüm test paketini çalıştır (regresyon kontrolü)**

Run: `cd form-backend && npm test`
Expected: PASS (mevcut tüm testler + yeni eklenenler)

- [ ] **Step 7: Commit**

```bash
git add form-backend/src/routes/rakipAnalizi.ts form-backend/test/rakipAnalizi.spec.ts form-backend/src/index.ts
git commit -m "Add Rakip Analizi backend routes (competitor entry, map search, two report branches)"
```

---

## Task 7: `panel.html` — mikrofon-dikte closure'ını yeniden kullanılabilir hale getir

Bu adım, Task 8'de ikinci bir mikrofon girişi eklemeden ÖNCE yapılıyor — aksi halde ~140 satırlık karmaşık `SpeechRecognition` mantığı ikinci kez kopyalanır (bkz. `beginSession`/`startVolumeMonitor` closure'ı, panel.html satır 560-704). Davranış DEĞİŞMİYOR, sadece `noteBox`'a özel closure genel bir fonksiyona çıkarılıyor.

**Files:**
- Modify: `panel.html`

**Interfaces:**
- Produces: `function attachVoiceInput(config)` — `config: { textareaEl, micBtnEl, micHintEl, micLangToggleEl, localStorageKey }`

- [ ] **Step 1: Mevcut closure'ı parametreli bir fonksiyona çevir**

`panel.html`'de satır 560-704 arasındaki tüm bloğu (yorum satırı `// --- Voice note (native Web Speech API — Chrome) ---`'dan `})();` öncesindeki kapanışa kadar — yani mevcut IIFE'nin İÇİNDEKİ mikrofon mantığı) şu fonksiyonla DEĞİŞTİR:

```javascript
  // --- Voice input (native Web Speech API — Chrome) — reusable across any textarea+mic pair ---
  function attachVoiceInput(config) {
    var textareaEl = config.textareaEl, micBtnEl = config.micBtnEl, micHintEl = config.micHintEl;
    var micLangToggleEl = config.micLangToggleEl, localStorageKey = config.localStorageKey;

    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    var micLang = localStorage.getItem(localStorageKey) || 'tr';
    if (micLangToggleEl) {
      var setMicLang = function (lang) {
        micLang = lang;
        localStorage.setItem(localStorageKey, lang);
        Array.prototype.forEach.call(micLangToggleEl.querySelectorAll('button'), function (b) {
          b.classList.toggle('active', b.getAttribute('data-lang') === lang);
        });
      };
      micLangToggleEl.addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-lang]');
        if (btn) setMicLang(btn.getAttribute('data-lang'));
      });
      setMicLang(micLang);
    }
    if (!SR) {
      micBtnEl.classList.add('hidden');
      micHintEl.textContent = 'Sesli giriş için Google Chrome kullanın.';
      return;
    }

    var LISTENING_TEXT = 'Dinleniyor... konuşun (durdurmak için mikrofona tekrar dokunun).';
    var TOO_QUIET_TEXT = 'Sesini net duyamıyoruz — lütfen biraz daha yüksek sesle konuş.';
    var QUIET_RMS = 0.02, QUIET_HOLD_MS = 1200;

    function startVolumeMonitor(onLow, onOk) {
      return navigator.mediaDevices.getUserMedia({
        audio: { autoGainControl: false, noiseSuppression: false, echoCancellation: false }
      }).then(function (stream) {
        var ctx = new (window.AudioContext || window.webkitAudioContext)();
        var source = ctx.createMediaStreamSource(stream);
        var analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        var data = new Uint8Array(analyser.fftSize);
        var quietSince = null, raf;
        (function tick() {
          analyser.getByteTimeDomainData(data);
          var sum = 0;
          for (var i = 0; i < data.length; i++) { var v = (data[i] - 128) / 128; sum += v * v; }
          var rms = Math.sqrt(sum / data.length);
          if (rms < QUIET_RMS) {
            if (quietSince == null) quietSince = Date.now();
            else if (Date.now() - quietSince > QUIET_HOLD_MS) onLow();
          } else {
            quietSince = null;
            onOk();
          }
          raf = requestAnimationFrame(tick);
        })();
        return { stop: function () {
          cancelAnimationFrame(raf);
          stream.getTracks().forEach(function (t) { t.stop(); });
          ctx.close();
        }};
      });
    }

    var recognizing = false, stoppedByUser = false;
    var volMonitor = null, isQuiet = false;
    var activeRecog = null;
    var currentSession = 0;

    function onVolLow() { if (!isQuiet) { isQuiet = true; micHintEl.textContent = TOO_QUIET_TEXT; } }
    function onVolOk() { if (isQuiet) { isQuiet = false; micHintEl.textContent = LISTENING_TEXT; } }

    function beginSession(before, after, lang) {
      currentSession++;
      var mySession = currentSession;
      var committed = '';
      var r = new SR();
      r.lang = lang;
      r.interimResults = true;
      r.continuous = false;
      activeRecog = r;

      r.onstart = function () {
        if (mySession !== currentSession) return;
        recognizing = true;
        micBtnEl.classList.add('recording');
        micHintEl.textContent = LISTENING_TEXT;
      };
      r.onresult = function (e) {
        if (mySession !== currentSession) return;
        var interim = '';
        for (var i = e.resultIndex; i < e.results.length; i++) {
          var t = e.results[i][0].transcript;
          if (e.results[i].isFinal) committed += t; else interim += t;
        }
        textareaEl.value = before + committed + interim + after;
      };
      r.onerror = function (e) {
        if (mySession !== currentSession) return;
        var fatal = { 'not-allowed': 1, 'audio-capture': 1, 'service-not-allowed': 1 };
        if (fatal[e.error]) { stoppedByUser = true; micHintEl.textContent = 'Mikrofon hatası. İzin verildiğinden emin olun.'; }
      };
      r.onend = function () {
        if (mySession !== currentSession) return;
        recognizing = false;
        micBtnEl.classList.remove('recording');
        if (stoppedByUser) {
          micHintEl.textContent = '';
          if (volMonitor) { volMonitor.stop(); volMonitor = null; }
          isQuiet = false;
          return;
        }
        beginSession(textareaEl.value, '', lang);
      };

      try { r.start(); } catch (e) { /* fresh instance — should never already be started */ }
    }

    micBtnEl.addEventListener('click', function () {
      if (recognizing) { stoppedByUser = true; if (activeRecog) activeRecog.stop(); return; }
      stoppedByUser = false;
      var pos = textareaEl.selectionStart != null ? textareaEl.selectionStart : textareaEl.value.length;
      beginSession(textareaEl.value.slice(0, pos), textareaEl.value.slice(pos), micLang === 'en' ? 'en-GB' : 'tr-TR');
      if (!volMonitor) { startVolumeMonitor(onVolLow, onVolOk).then(function (m) { volMonitor = m; }).catch(function () {}); }
    });
  }

  attachVoiceInput({
    textareaEl: noteBox,
    micBtnEl: el('micBtn'),
    micHintEl: el('micHint'),
    micLangToggleEl: el('micLangToggle'),
    localStorageKey: 'panelMicLang',
  });
```

- [ ] **Step 2: Manuel doğrulama**

Yerel önizleme başlat (`python3 -m http.server 5173`, ayrı terminalde `cd form-backend && npx wrangler dev --port 8787`), panel.html'i aç, mevcut "Not" kutusundaki mikrofon butonunun AYNI şekilde çalıştığını doğrula (dinleme, TR/EN toggle, sessizlik uyarısı). Davranış değişmemeli — bu saf bir refactor.

- [ ] **Step 3: Commit**

```bash
git add panel.html
git commit -m "Extract voice-input logic into a reusable attachVoiceInput() for a second input field"
```

---

## Task 8: `panel.html` — "Rakip Analizi" bölümü

**Files:**
- Modify: `panel.html`

**Interfaces:**
- Consumes: `attachVoiceInput` (Task 7), backend route'ları (Task 6): `POST /panel/rakip-analizi/rakip`, `GET /panel/rakip-analizi/rakip-ara`, `POST /panel/rakip-analizi/icerik-strateji`, `POST /panel/rakip-analizi/aksiyon-analiz`

- [ ] **Step 1: Header'a nav linki ekle**

`panel.html`'de mevcut header/nav yapısına (diğer sayfalarda `<a href="...">` deseniyle aynı) bir "Rakip Analizi" linki/butonu ekleyerek ana bölüme (`<div class="wrap">` içine, mevcut `<section>`'ların yanına) aşağıdaki yeni `<section>`'ı ekle:

```html
  <section id="rakipAnaliziSection" class="hidden">
    <h2>Rakip Analizi</h2>
    <div class="actions">
      <button class="btn-secondary" id="dalIcerikBtn" type="button">Görsel/Video Stratejisi</button>
      <button class="btn-secondary" id="dalAksiyonBtn" type="button">Aksiyon/Hedef Analizi</button>
    </div>

    <div class="field" id="rakipEkleField">
      <h3>Rakip Ekle</h3>
      <input type="text" id="rakipIsim" placeholder="Rakip ismi">
      <input type="text" id="rakipLink" placeholder="Link (opsiyonel)">
      <div class="row">
        <textarea id="rakipNot" class="grow" placeholder="Gözlem/not — yazın ya da mikrofonla dikte edin..."></textarea>
        <div class="mic-lang-toggle" id="rakipMicLangToggle">
          <button type="button" data-lang="tr" class="active">TR</button>
          <button type="button" data-lang="en">EN</button>
        </div>
        <button class="icon-btn mic-btn" id="rakipMicBtn" type="button" title="Sesli not (Chrome)" aria-label="Sesli not">
          <span class="mic-icon" aria-hidden="true">🎤</span>
          <span class="mic-wave" aria-hidden="true"><span></span><span></span><span></span><span></span></span>
        </button>
      </div>
      <p class="muted" id="rakipMicHint"></p>
      <button class="btn-primary" id="rakipEkleBtn" type="button">Rakip Ekle</button>
      <div class="status" id="rakipEkleStatus"></div>
    </div>

    <div class="field">
      <h3>Konum ile Rakip Ara</h3>
      <input type="number" id="rakipLat" placeholder="Enlem (lat)" step="any">
      <input type="number" id="rakipLng" placeholder="Boylam (lng)" step="any">
      <input type="number" id="rakipRadius" placeholder="Yarıçap (metre)" value="2000">
      <button class="btn-secondary" id="rakipAraBtn" type="button">Ara</button>
      <div id="rakipHarita" style="height:320px;width:100%;margin-top:0.5rem;"></div>
      <ul id="rakipSonuclar"></ul>
    </div>

    <div class="field" id="dalIstekField">
      <h3 id="dalBaslik">İstek</h3>
      <div class="row">
        <textarea id="dalIstek" class="grow" placeholder="İsteğinizi yazın ya da mikrofonla dikte edin..."></textarea>
        <div class="mic-lang-toggle" id="dalMicLangToggle">
          <button type="button" data-lang="tr" class="active">TR</button>
          <button type="button" data-lang="en">EN</button>
        </div>
        <button class="icon-btn mic-btn" id="dalMicBtn" type="button" title="Sesli istek (Chrome)" aria-label="Sesli istek">
          <span class="mic-icon" aria-hidden="true">🎤</span>
          <span class="mic-wave" aria-hidden="true"><span></span><span></span><span></span><span></span></span>
        </button>
      </div>
      <p class="muted" id="dalMicHint"></p>
      <button class="btn-primary" id="dalGonderBtn" type="button">Rapor Üret</button>
      <div class="status" id="dalStatus"></div>
      <div id="dalRapor" class="muted" style="white-space:pre-wrap;"></div>
    </div>
  </section>
```

- [ ] **Step 2: JS mantığını ekle — ana `<script>` IIFE'sinin sonuna, Task 7'nin `attachVoiceInput` çağrısından sonra**

```javascript
  // --- Rakip Analizi ---
  attachVoiceInput({
    textareaEl: el('rakipNot'),
    micBtnEl: el('rakipMicBtn'),
    micHintEl: el('rakipMicHint'),
    micLangToggleEl: el('rakipMicLangToggle'),
    localStorageKey: 'panelMicLang',
  });
  attachVoiceInput({
    textareaEl: el('dalIstek'),
    micBtnEl: el('dalMicBtn'),
    micHintEl: el('dalMicHint'),
    micLangToggleEl: el('dalMicLangToggle'),
    localStorageKey: 'panelMicLang',
  });

  el('rakipEkleBtn').addEventListener('click', function () {
    var isim = el('rakipIsim').value.trim();
    if (!isim) { setStatus(el('rakipEkleStatus'), 'Rakip ismi gerekli.', 'err'); return; }
    setStatus(el('rakipEkleStatus'), 'Kaydediliyor...', '');
    authFetch('/panel/rakip-analizi/rakip', {
      method: 'POST',
      body: JSON.stringify({ isim: isim, link: el('rakipLink').value.trim(), not: el('rakipNot').value, kaynak: 'manuel' }),
    }).then(function (r) { return r.json(); }).then(function () {
      setStatus(el('rakipEkleStatus'), 'Eklendi.', 'ok');
      el('rakipIsim').value = ''; el('rakipLink').value = ''; el('rakipNot').value = '';
    }).catch(function (e) { if (e.message !== 'unauthorized') setStatus(el('rakipEkleStatus'), 'Eklenemedi.', 'err'); });
  });

  el('rakipAraBtn').addEventListener('click', function () {
    var lat = el('rakipLat').value, lng = el('rakipLng').value, radius = el('rakipRadius').value;
    if (!lat || !lng || !radius) { return; }
    var qs = '?lat=' + encodeURIComponent(lat) + '&lng=' + encodeURIComponent(lng) + '&radiusMeters=' + encodeURIComponent(radius);
    authFetch('/panel/rakip-analizi/rakip-ara' + qs).then(function (r) { return r.json(); }).then(function (data) {
      var list = el('rakipSonuclar');
      list.innerHTML = '';
      (data.places || []).forEach(function (p) {
        var li = document.createElement('li');
        li.textContent = p.name + ' — ' + p.address;
        var addBtn = document.createElement('button');
        addBtn.type = 'button'; addBtn.className = 'btn-secondary'; addBtn.textContent = 'Ekle';
        addBtn.addEventListener('click', function () {
          authFetch('/panel/rakip-analizi/rakip', {
            method: 'POST',
            body: JSON.stringify({ isim: p.name, adres: p.address, kaynak: 'harita' }),
          }).then(function () { addBtn.disabled = true; addBtn.textContent = 'Eklendi'; });
        });
        li.appendChild(addBtn);
        list.appendChild(li);
      });
      // Not: Google Maps JS API'nin harita render kısmı (google.maps.Map + Marker) ayrı bir
      // <script src="https://maps.googleapis.com/maps/api/js?key=..."> yüklemesi gerektiriyor —
      // bu adımın kapsamı dışında, ayrı bir küçük takip görevi olarak bırakıldı (liste görünümü
      // haritasız da tam işlevsel).
    }).catch(function (e) { if (e.message !== 'unauthorized') setStatus(el('rakipEkleStatus'), 'Harita şu an yüklenemedi, manuel giriş yapabilirsin.', 'err'); });
  });

  var currentDal = 'icerikStrateji';
  function setDal(dal) {
    currentDal = dal;
    el('dalBaslik').textContent = dal === 'icerikStrateji' ? 'Görsel/Video Stratejisi İsteği' : 'Aksiyon/Hedef Analizi İsteği';
  }
  el('dalIcerikBtn').addEventListener('click', function () { setDal('icerikStrateji'); });
  el('dalAksiyonBtn').addEventListener('click', function () { setDal('aksiyonAnaliz'); });
  setDal('icerikStrateji');

  el('dalGonderBtn').addEventListener('click', function () {
    var istek = el('dalIstek').value.trim();
    if (!istek) { setStatus(el('dalStatus'), 'İstek metni gerekli.', 'err'); return; }
    setStatus(el('dalStatus'), 'Rapor üretiliyor...', '');
    var path = currentDal === 'icerikStrateji' ? '/panel/rakip-analizi/icerik-strateji' : '/panel/rakip-analizi/aksiyon-analiz';
    var payload = currentDal === 'icerikStrateji' ? { istek: istek } : { yorum: istek };
    authFetch(path, { method: 'POST', body: JSON.stringify(payload) }).then(function (r) { return r.json(); }).then(function (data) {
      setStatus(el('dalStatus'), '', '');
      el('dalRapor').textContent = data.rapor;
    }).catch(function (e) { if (e.message !== 'unauthorized') setStatus(el('dalStatus'), 'Rapor şu an üretilemedi, lütfen tekrar dene.', 'err'); });
  });
```

- [ ] **Step 2: Manuel doğrulama**

Yerel önizlemede (Task 7'deki gibi iki sunucu açık): "Rakip Ekle" ile manuel bir rakip kaydet, Sheet'te "RakipAnalizi" sekmesinin oluştuğunu ve satırın doğru yazıldığını Google Sheets'ten kontrol et. Konum+yarıçap ile arama yap (gerçek `GOOGLE_PLACES_API_KEY` `.dev.vars`'a eklenmiş olmalı), sonuç listesinden birini "Ekle" ile kaydet. Her iki dal butonuyla da bir istek gönder, Claude'dan gerçek bir rapor döndüğünü doğrula.

- [ ] **Step 3: Commit**

```bash
git add panel.html
git commit -m "Add Rakip Analizi section to panel.html (manual entry, map search, two report branches)"
```

---

## Task 9: Production secret'larını ekle ve deploy et

**Files:** yok (sadece komut çalıştırma + deploy)

- [ ] **Step 1: Gerçek API key'leri al**

Kullanıcıdan (Selen/Çiğdem) şunları iste: gerçek bir Anthropic API key (`ANTHROPIC_API_KEY`) ve Google Cloud'da Places API (New) etkinleştirilmiş bir proje için API key (`GOOGLE_PLACES_API_KEY`, Maps JavaScript API de aynı projede etkinleştirilmeli — spec'te not edildiği gibi, harita render'ı için Task 8'in "Not" kısmında bırakılan takip görevinde kullanılacak).

- [ ] **Step 2: Secret'ları production'a ekle**

Run:
```bash
cd form-backend
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put GOOGLE_PLACES_API_KEY
```

- [ ] **Step 3: Deploy et**

Run: `cd form-backend && npx wrangler deploy`
Expected: deploy başarılı, yeni route'lar canlıda erişilebilir.

- [ ] **Step 4: Canlıda uçtan uca doğrula**

`panel.html`'i canlı linkten aç (https://engintas243524.github.io/cigdem-tas-talk-and-heal/panel.html), panel şifresiyle giriş yap, Rakip Analizi bölümünü aynı adımlarla (Task 8, Step 2) canlıda test et.

- [ ] **Step 5: Commit (varsa)**

Bu adımda kod değişikliği yok — sadece secret/deploy. Commit gerekmiyor.

---

## Plan Sonrası Notlar

- Google Maps JS API ile gerçek harita render'ı (pin gösterimi) Task 8'de bilinçli olarak kapsam dışı bırakıldı — liste görünümü tam işlevsel, harita görsel bir iyileştirme olarak ayrı, küçük bir takip görevi.
- Video-Edit modülü ileride bu spec'in ürettiği `raporMetni` alanına (RakipAnalizi sekmesi, `dal=icerikStrateji` satırları) API üzerinden erişecek — ek bir endpoint gerekirse (şu an `getAllRakipAnalizRows` zaten backend içinde var, sadece dışa açık bir GET route eksik) o, Video-Edit'in kendi planında eklenir.
