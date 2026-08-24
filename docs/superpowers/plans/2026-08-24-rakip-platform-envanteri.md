# Rakip Platform Envanteri Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Çiğdem mark which of 11 social/business platforms each competitor is active on, and have that turn into an automatic "platform envanteri" statistic that feeds both AI reports (İçerik Stratejisi, Aksiyon/Hedef Analizi) — plus two manually-entered Google rating/review-count observation fields.

**Architecture:** Extends the existing `RakipAnalizi` Google Sheet tab (form-backend Cloudflare Worker) with 4 new fixed-position columns. No new API endpoints — existing `/panel/rakip-analizi/rakip` and `/panel/rakip-analizi/rakip-duzelt` handlers accept the new fields. A new module-private function (`platformDagilimOzetiGetir`) computes the cross-competitor statistic and both report system prompts get a short instruction telling Claude how to use it.

**Tech Stack:** TypeScript, Cloudflare Workers (Wrangler), Google Sheets API v4, vitest, vanilla JS/HTML frontend (no build step, no frontend test framework in this repo — frontend changes are verified by manual browser QA, matching existing project convention).

## Global Constraints

- Google puanı/yorum sayısı alanları (`googlePuaniGozlemi`, `googleYorumSayisiGozlemi`) **ASLA Google Places API'den otomatik çekilip yazılmaz** — bu, Google Maps Platform ToS §3.2.3'ün depolama kısıtına (tier'dan bağımsız, tek istisna Place ID) girer. Sadece Çiğdem'in panelde elle girdiği değer yazılır. Kaynak doğrulaması: `docs/superpowers/specs/2026-08-24-rakip-platform-envanteri-design.md`.
- `RAKIP_ANALIZI_COLUMNS`'a yeni sütun her zaman **dizinin SONUNA** eklenir (bu tabın kendi tarihsel deseni — `aramaAdres`/`aramaSorgu`/`aramaRadiusMeters` 2026-08-15'te, `placeId` 2026-08-23'te hep sona eklendi). `RakipAnalizi` sekmesi Sayfa1'in aksine label-bazlı `resolveHeaderPositions` KULLANMIYOR — `writeHeaderRow` her `ensureRakipAnaliziTab` çağrısında header'ı dizi sırasına göre YENİDEN yazıyor, bu yüzden Sayfa1 için CLAUDE.md'de tarif edilen manuel `insertDimension` prosedürü bu tab için gerekmiyor (sadece append-only, kod deploy edilince kendiliğinden düzelir).
- Her yeni backend davranışı önce başarısız bir testle (TDD), sonra minimal implementasyonla kanıtlanır.
- Her task sonunda `npx tsc --noEmit` ve `npx prettier --check .` hatasız geçmeli (CLAUDE.md kuralı — kod bu ikisi geçmeden bitmiş sayılmaz).

---

## Task 1: Config — platform listesi + 4 yeni sütun

**Files:**
- Modify: `form-backend/src/config.ts:269-308` (`RAKIP_ANALIZI_COLUMNS`, `RAKIP_ANALIZI_COLUMN_LABELS`)
- Test: `form-backend/test/rakipSheets.spec.ts`

**Interfaces:**
- Produces: `RAKIP_PLATFORM_LISTESI: readonly string[]` (exported from `config.ts`, 11 items, fixed order). `RAKIP_ANALIZI_COLUMNS` gains `'aktifPlatformlar' | 'googlePuaniGozlemi' | 'googleYorumSayisiGozlemi' | 'gozlemTarihiUtc'` — this automatically flows into `RakipAnalizRow` (`lib/rakipSheets.ts:5`, `Record<(typeof RAKIP_ANALIZI_COLUMNS)[number], string>`), so every later task can read/write `row.aktifPlatformlar` etc. with no further type changes needed.

- [ ] **Step 1: Write the failing test**

In `form-backend/test/rakipSheets.spec.ts`, add inside the existing `describe('rakipSheets', ...)` block (after the `'reads back appended rows'` test):

```ts
it('round-trips the platform envanteri fields (aktifPlatformlar, google gözlem alanları, gozlemTarihiUtc)', async () => {
	stubSheetsApi(['Sayfa1', 'RakipAnalizi']);
	const row = emptyRakipAnalizRow();
	row.isim = 'Örnek Klinik';
	row.kaynak = 'manuel';
	row.aktifPlatformlar = 'Instagram,LinkedIn';
	row.googlePuaniGozlemi = '4.7';
	row.googleYorumSayisiGozlemi = '128';
	row.gozlemTarihiUtc = '2026-08-24T10:00:00.000Z';
	await appendRakipAnalizRow(env, row);
	const rows = await getAllRakipAnalizRows(env);
	expect(rows[0].row).toMatchObject({
		aktifPlatformlar: 'Instagram,LinkedIn',
		googlePuaniGozlemi: '4.7',
		googleYorumSayisiGozlemi: '128',
		gozlemTarihiUtc: '2026-08-24T10:00:00.000Z',
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd form-backend && npx vitest run test/rakipSheets.spec.ts -t "round-trips the platform envanteri fields"`
Expected: FAIL — `rows[0].row.aktifPlatformlar` (and the other 3 new fields) is `undefined`. The 4 keys
don't exist in `RAKIP_ANALIZI_COLUMNS` yet, so `appendRakipAnalizRow`/`getAllRakipAnalizRows` never
write or read them (vitest doesn't type-check by default, so this surfaces as a `toMatchObject`
assertion failure, not a compile error — `npx tsc --noEmit` would additionally flag it separately).

- [ ] **Step 3: Add the platform list constant and the 4 columns**

In `form-backend/src/config.ts`, immediately before `export const RAKIP_ANALIZI_TAB_NAME = 'RakipAnalizi';` (line 267), add:

```ts
// Rakip Platform Envanteri (2026-08-24) — sabit sıralı 11 platform. Bu sıra hem
// aktifPlatformlar sütununun normalize edilmiş yazım sırası hem de platformDagilimOzetiGetir'in
// sayaç sırası için TEK kaynak (bkz. routes/rakipAnalizi.ts). rakip-analizi.html'deki checkbox
// listesi bu diziyle AYNI sırada tutulmalı — orada ayrı bir kopyası var, elle senkron edilir.
export const RAKIP_PLATFORM_LISTESI = [
	'Facebook',
	'Instagram',
	'LinkedIn',
	'X',
	'TikTok',
	'YouTube',
	'Bluesky',
	'Threads',
	'Google Business',
	'Pinterest',
	'Mastodon',
] as const;

```

In the same file, change the end of `RAKIP_ANALIZI_COLUMNS` (currently ending `'placeId',\n] as const;` around line 291-292) to:

```ts
	'placeId',
	// Sona eklendi (2026-08-24) — Rakip Platform Envanteri. aktifPlatformlar: virgülle ayrılmış,
	// RAKIP_PLATFORM_LISTESI sırasına normalize edilmiş tek metin sütunu (11 ayrı sütun DEĞİL —
	// Sheet okunabilirliği + yeni platform eklemenin şema migrasyonu gerektirmemesi için).
	// googlePuaniGozlemi/googleYorumSayisiGozlemi: Çiğdem'in Google Maps'te kendi gözüyle gördüğü
	// değerler — Google Places API'den OTOMATİK ÇEKİLMEZ (Google Maps Platform ToS §3.2.3, tek
	// istisna Place ID — doğrulama: docs/superpowers/specs/2026-08-24-rakip-platform-envanteri-
	// design.md). gozlemTarihiUtc: bu üçünden biri en son ne zaman güncellendi.
	'aktifPlatformlar',
	'googlePuaniGozlemi',
	'googleYorumSayisiGozlemi',
	'gozlemTarihiUtc',
] as const;
```

And extend `RAKIP_ANALIZI_COLUMN_LABELS` (currently ending `placeId: 'Google Place ID',\n};` around line 307-308) to:

```ts
	placeId: 'Google Place ID',
	aktifPlatformlar: 'Aktif Platformlar',
	googlePuaniGozlemi: 'Google Puanı (Gözlem)',
	googleYorumSayisiGozlemi: 'Google Yorum Sayısı (Gözlem)',
	gozlemTarihiUtc: 'Gözlem Tarihi (UTC)',
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd form-backend && npx vitest run test/rakipSheets.spec.ts`
Expected: PASS (all tests in the file, including the new one).

- [ ] **Step 5: Typecheck and format**

Run: `cd form-backend && npx tsc --noEmit && npx prettier --check src/config.ts test/rakipSheets.spec.ts`
Expected: no errors. If prettier fails, run `npx prettier --write src/config.ts test/rakipSheets.spec.ts` and re-check.

- [ ] **Step 6: Commit**

```bash
git add form-backend/src/config.ts form-backend/test/rakipSheets.spec.ts
git commit -m "feat: add RAKIP_PLATFORM_LISTESI and 4 platform-envanteri columns to RakipAnalizi schema"
```

---

## Task 2: Backend — kaydet/düzenle/listele

**Files:**
- Modify: `form-backend/src/routes/rakipAnalizi.ts:74-118` (`handleRakipEkle`), `:123-142` (`handleRakipListe`), `:188-240` (`handleRakipDuzelt`)
- Test: `form-backend/test/rakipAnalizi.spec.ts`

**Interfaces:**
- Consumes: `RAKIP_PLATFORM_LISTESI` (Task 1, `config.ts`), `RakipAnalizRow` fields `aktifPlatformlar`/`googlePuaniGozlemi`/`googleYorumSayisiGozlemi`/`gozlemTarihiUtc` (Task 1).
- Produces: `aktifPlatformlarNormalize(secilenler: string[]): string` (module-private in `routes/rakipAnalizi.ts`). `POST /panel/rakip-analizi/rakip` and `POST /panel/rakip-analizi/rakip-duzelt` now accept optional body fields `aktifPlatformlar?: string[]`, `googlePuaniGozlemi?: string`, `googleYorumSayisiGozlemi?: string`. `GET /panel/rakip-analizi/rakip-liste` response's `rakipler[]` objects gain `aktifPlatformlar`, `googlePuaniGozlemi`, `googleYorumSayisiGozlemi`, `gozlemTarihiUtc` string fields — Task 5 (frontend) reads these to populate the edit panel.

- [ ] **Step 1: Write the failing tests**

In `form-backend/test/rakipAnalizi.spec.ts`, inside `describe('POST /panel/rakip-analizi/rakip', ...)` (after the `'saves a manual competitor entry'` test), add:

```ts
it('normalizes aktifPlatformlar to RAKIP_PLATFORM_LISTESI order and stamps gozlemTarihiUtc', async () => {
	stubApis();
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2026-08-24T09:00:00.000Z'));
	const response = await authedRequest('/panel/rakip-analizi/rakip', {
		method: 'POST',
		// Bilerek YANLIŞ/karışık sırada gönderiliyor — backend normalize etmeli.
		body: JSON.stringify({ isim: 'Rakip Klinik', kaynak: 'manuel', aktifPlatformlar: ['TikTok', 'Instagram'] }),
	});
	const id = ((await response.json()) as { id: string }).id;

	const listResponse = await authedRequest('/panel/rakip-analizi/rakip-liste');
	const listData = (await listResponse.json()) as {
		rakipler: { id: string; aktifPlatformlar: string; gozlemTarihiUtc: string }[];
	};
	const rakip = listData.rakipler.find((r) => r.id === id)!;
	expect(rakip.aktifPlatformlar).toBe('Instagram,TikTok');
	expect(rakip.gozlemTarihiUtc).toBe('2026-08-24T09:00:00.000Z');
});

it('saves manually-entered googlePuaniGozlemi/googleYorumSayisiGozlemi without calling any Google API', async () => {
	const { fetchMock } = stubApis();
	const response = await authedRequest('/panel/rakip-analizi/rakip', {
		method: 'POST',
		body: JSON.stringify({
			isim: 'Rakip Klinik',
			kaynak: 'harita',
			placeId: 'ChIJ-fake',
			googlePuaniGozlemi: '4.7',
			googleYorumSayisiGozlemi: '128',
		}),
	});
	expect(response.status).toBe(200);
	expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('places.googleapis.com'))).toBe(false);

	const listResponse = await authedRequest('/panel/rakip-analizi/rakip-liste');
	const listData = (await listResponse.json()) as {
		rakipler: { googlePuaniGozlemi: string; googleYorumSayisiGozlemi: string }[];
	};
	expect(listData.rakipler[0]).toMatchObject({ googlePuaniGozlemi: '4.7', googleYorumSayisiGozlemi: '128' });
});
```

Inside `describe('POST /panel/rakip-analizi/rakip-duzelt', ...)` (after the `'only updates fields explicitly sent...'` test), add:

```ts
it('updates aktifPlatformlar/google gözlem alanları independently and stamps gozlemTarihiUtc only when one of them changes', async () => {
	stubApis();
	const created = await authedRequest('/panel/rakip-analizi/rakip', {
		method: 'POST',
		body: JSON.stringify({ isim: 'Sabit İsim', kaynak: 'manuel' }),
	});
	const id = ((await created.json()) as { id: string }).id;

	vi.useFakeTimers();
	vi.setSystemTime(new Date('2026-08-24T09:00:00.000Z'));
	await authedRequest('/panel/rakip-analizi/rakip-duzelt', {
		method: 'POST',
		body: JSON.stringify({ id, googlePuaniGozlemi: '4.5' }),
	});

	const listResponse1 = await authedRequest('/panel/rakip-analizi/rakip-liste');
	const listData1 = (await listResponse1.json()) as {
		rakipler: { id: string; googlePuaniGozlemi: string; aktifPlatformlar: string; gozlemTarihiUtc: string }[];
	};
	const rakip1 = listData1.rakipler.find((r) => r.id === id)!;
	expect(rakip1.googlePuaniGozlemi).toBe('4.5');
	expect(rakip1.aktifPlatformlar).toBe('');
	expect(rakip1.gozlemTarihiUtc).toBe('2026-08-24T09:00:00.000Z');

	// İsim değişiyor ama platform/google alanlarından hiçbiri gönderilmiyor — gozlemTarihiUtc
	// DOKUNULMAMALI.
	vi.setSystemTime(new Date('2026-08-24T10:00:00.000Z'));
	await authedRequest('/panel/rakip-analizi/rakip-duzelt', {
		method: 'POST',
		body: JSON.stringify({ id, isim: 'Yeni İsim' }),
	});
	const listResponse2 = await authedRequest('/panel/rakip-analizi/rakip-liste');
	const listData2 = (await listResponse2.json()) as { rakipler: { id: string; gozlemTarihiUtc: string }[] };
	expect(listData2.rakipler.find((r) => r.id === id)!.gozlemTarihiUtc).toBe('2026-08-24T09:00:00.000Z');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd form-backend && npx vitest run test/rakipAnalizi.spec.ts -t "aktifPlatformlar"`
Expected: FAIL — `rakip.aktifPlatformlar` is `undefined` (handlers don't read/write the new fields yet, `handleRakipListe` doesn't return them).

- [ ] **Step 3: Implement**

In `form-backend/src/routes/rakipAnalizi.ts`, add the import of `RAKIP_PLATFORM_LISTESI` to the existing config import (currently `import { GRAFIK_PERIYOT_GUN_SAYISI, ANTHROPIC_BILLING_URL, YAYINCI_PROFILLERI, type EtikRejimi } from '../config';` around line 28):

```ts
import { GRAFIK_PERIYOT_GUN_SAYISI, ANTHROPIC_BILLING_URL, YAYINCI_PROFILLERI, RAKIP_PLATFORM_LISTESI, type EtikRejimi } from '../config';
```

Add this helper function right after the `newId()` function (currently lines 65-67):

```ts
// Frontend'den gelen (sırasız/tekrarlı olabilir) platform seçimini RAKIP_PLATFORM_LISTESI
// sırasına normalize eder, listede olmayan değerleri sessizce atar. Aynı platform kümesi her
// zaman AYNI string'i üretir — platformDagilimOzetiGetir'in sayaç mantığı buna dayanıyor.
function aktifPlatformlarNormalize(secilenler: string[]): string {
	return RAKIP_PLATFORM_LISTESI.filter((p) => secilenler.includes(p)).join(',');
}
```

In `handleRakipEkle` (lines 74-118), extend the `body` type (currently ending `placeId?: unknown;\n\t};`) to add:

```ts
		placeId?: unknown;
		aktifPlatformlar?: unknown;
		googlePuaniGozlemi?: unknown;
		googleYorumSayisiGozlemi?: unknown;
	};
```

Then, right before `const rowNumber = await appendRakipAnalizRow(env, row);` (currently line 116), insert:

```ts
	const aktifPlatformlarSecim = Array.isArray(body.aktifPlatformlar) ? body.aktifPlatformlar.map((x) => String(x)) : [];
	if (aktifPlatformlarSecim.length) row.aktifPlatformlar = aktifPlatformlarNormalize(aktifPlatformlarSecim);
	row.googlePuaniGozlemi = String(body.googlePuaniGozlemi ?? '').trim();
	row.googleYorumSayisiGozlemi = String(body.googleYorumSayisiGozlemi ?? '').trim();
	if (row.aktifPlatformlar || row.googlePuaniGozlemi || row.googleYorumSayisiGozlemi) {
		row.gozlemTarihiUtc = new Date().toISOString();
	}

```

In `handleRakipListe` (lines 123-142), extend the `.map(({ row }) => ({...}))` object (currently ending `aramaRadiusMeters: row.aramaRadiusMeters,\n\t\t}))`) to add the 4 new fields:

```ts
			aramaRadiusMeters: row.aramaRadiusMeters,
			aktifPlatformlar: row.aktifPlatformlar,
			googlePuaniGozlemi: row.googlePuaniGozlemi,
			googleYorumSayisiGozlemi: row.googleYorumSayisiGozlemi,
			gozlemTarihiUtc: row.gozlemTarihiUtc,
		}))
```

In `handleRakipDuzelt` (lines 188-240), extend the `body` type (currently ending `link?: unknown;\n\t};`) to add:

```ts
		link?: unknown;
		aktifPlatformlar?: unknown;
		googlePuaniGozlemi?: unknown;
		googleYorumSayisiGozlemi?: unknown;
	};
```

Then, right before `await updateRakipAnalizRow(env, bulunan.rowNumber, bulunan.row, patch);` (currently line 238), insert:

```ts
	let gozlemGuncellendi = false;
	if (body.aktifPlatformlar !== undefined) {
		const secilenler = Array.isArray(body.aktifPlatformlar) ? body.aktifPlatformlar.map((x) => String(x)) : [];
		patch.aktifPlatformlar = aktifPlatformlarNormalize(secilenler);
		gozlemGuncellendi = true;
	}
	if (body.googlePuaniGozlemi !== undefined) {
		patch.googlePuaniGozlemi = String(body.googlePuaniGozlemi).trim();
		gozlemGuncellendi = true;
	}
	if (body.googleYorumSayisiGozlemi !== undefined) {
		patch.googleYorumSayisiGozlemi = String(body.googleYorumSayisiGozlemi).trim();
		gozlemGuncellendi = true;
	}
	if (gozlemGuncellendi) patch.gozlemTarihiUtc = new Date().toISOString();

```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd form-backend && npx vitest run test/rakipAnalizi.spec.ts`
Expected: PASS (full file — confirms the new tests pass and nothing existing broke).

- [ ] **Step 5: Typecheck and format**

Run: `cd form-backend && npx tsc --noEmit && npx prettier --check src/routes/rakipAnalizi.ts test/rakipAnalizi.spec.ts`
Expected: no errors (fix with `npx prettier --write` if needed, then re-check).

- [ ] **Step 6: Commit**

```bash
git add form-backend/src/routes/rakipAnalizi.ts form-backend/test/rakipAnalizi.spec.ts
git commit -m "feat: accept aktifPlatformlar + manual google gözlem alanları in rakip ekle/düzelt/liste"
```

---

## Task 3: `platformDagilimOzetiGetir` + rapor promptlarına bağlama

**Files:**
- Modify: `form-backend/src/routes/rakipAnalizi.ts` (near `rakipYorumBaglamiGetir`, ~line 439; `handleIcerikStrateji` ~line 564-588; `handleAksiyonAnaliz` ~line 730-738)
- Test: `form-backend/test/rakipAnalizi.spec.ts`

**Interfaces:**
- Consumes: `RAKIP_PLATFORM_LISTESI` (Task 1), `RakipAnalizRow` (Task 1), `getAllRakipAnalizRows` (existing, `lib/rakipSheets.ts`).
- Produces: `platformDagilimOzetiGetir(rakipler: { row: RakipAnalizRow }[]): string` (module-private) — called unconditionally (regardless of `rakipIds`) inside both `handleIcerikStrateji` and `handleAksiyonAnaliz`, its return value spliced into each handler's `userPrompt`.

- [ ] **Step 1: Write the failing tests**

In `form-backend/test/rakipAnalizi.spec.ts`, inside `describe('POST /panel/rakip-analizi/icerik-strateji', ...)` (after the `'only includes the selected competitor(s)...'` test), add:

```ts
it('includes the platform envanteri statistic in the prompt, computed over ALL competitors regardless of rakipIds', async () => {
	const { fetchMock } = stubApis();
	const r1 = await authedRequest('/panel/rakip-analizi/rakip', { method: 'POST', body: JSON.stringify({ isim: 'A Kliniği', kaynak: 'manuel' }) });
	const r1Id = ((await r1.json()) as { id: string }).id;
	await authedRequest('/panel/rakip-analizi/rakip-duzelt', {
		method: 'POST',
		body: JSON.stringify({ id: r1Id, aktifPlatformlar: ['Instagram', 'Facebook'] }),
	});
	const r2 = await authedRequest('/panel/rakip-analizi/rakip', { method: 'POST', body: JSON.stringify({ isim: 'B Kliniği', kaynak: 'manuel' }) });
	const r2Id = ((await r2.json()) as { id: string }).id;
	await authedRequest('/panel/rakip-analizi/rakip-duzelt', {
		method: 'POST',
		body: JSON.stringify({ id: r2Id, aktifPlatformlar: ['Instagram'] }),
	});

	// rakipIds bilerek gönderilmiyor (sadece 1'i seçilmiş gibi davranmıyoruz) — istatistik TÜM
	// kayıtlı rakipleri kapsamalı.
	await authedRequest('/panel/rakip-analizi/icerik-strateji', { method: 'POST', body: JSON.stringify({ istek: 'Öneri istiyorum' }) });

	const anthropicCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('api.anthropic.com'))!;
	const anthropicBody = JSON.parse((anthropicCall[1] as RequestInit).body as string);
	expect(anthropicBody.messages[0].content).toContain('Rakip platform envanteri');
	expect(anthropicBody.messages[0].content).toContain("2/2 rakip Instagram'de aktif");
	expect(anthropicBody.messages[0].content).toContain("1/2 rakip Facebook'de aktif");
});

it('omits the platform envanteri section when no competitor has aktifPlatformlar data', async () => {
	const { fetchMock } = stubApis();
	await authedRequest('/panel/rakip-analizi/rakip', { method: 'POST', body: JSON.stringify({ isim: 'A Kliniği', kaynak: 'manuel' }) });
	await authedRequest('/panel/rakip-analizi/icerik-strateji', { method: 'POST', body: JSON.stringify({ istek: 'Öneri istiyorum' }) });
	const anthropicCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('api.anthropic.com'))!;
	const anthropicBody = JSON.parse((anthropicCall[1] as RequestInit).body as string);
	expect(anthropicBody.messages[0].content).not.toContain('Rakip platform envanteri');
});
```

Inside `describe('POST /panel/rakip-analizi/aksiyon-analiz', ...)` (after the `'omits the competitor section entirely when no rakipIds are given'` test), add:

```ts
it('includes the platform envanteri statistic even when no rakipIds are selected (always all competitors)', async () => {
	const { fetchMock } = stubApis();
	const r1 = await authedRequest('/panel/rakip-analizi/rakip', { method: 'POST', body: JSON.stringify({ isim: 'A Kliniği', kaynak: 'manuel' }) });
	const r1Id = ((await r1.json()) as { id: string }).id;
	await authedRequest('/panel/rakip-analizi/rakip-duzelt', {
		method: 'POST',
		body: JSON.stringify({ id: r1Id, aktifPlatformlar: ['TikTok'] }),
	});

	await authedRequest('/panel/rakip-analizi/aksiyon-analiz', { method: 'POST', body: JSON.stringify({ yorum: 'Değerlendirme istiyorum' }) });

	const anthropicCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('api.anthropic.com'))!;
	const anthropicBody = JSON.parse((anthropicCall[1] as RequestInit).body as string);
	expect(anthropicBody.messages[0].content).toContain("1/1 rakip TikTok'de aktif");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd form-backend && npx vitest run test/rakipAnalizi.spec.ts -t "platform envanteri"`
Expected: FAIL — prompt does not contain "Rakip platform envanteri" (function doesn't exist/isn't wired yet).

- [ ] **Step 3: Implement**

In `form-backend/src/routes/rakipAnalizi.ts`, add this function right after `rakipYorumBaglamiGetir` (ends around line 467, right before `function parametreReferansSatiri`):

```ts
// Rakip Platform Envanteri (2026-08-24) — kayıtlı rakiplerin RAKIP_PLATFORM_LISTESI'ne göre
// platform dağılımını hesaplar. rakipYorumBaglamiGetir'in aksine bu fonksiyon rakipIds'e HİÇ
// bakmaz — kullanıcı kararı: bu istatistik her zaman TÜM kayıtlı rakipler üzerinden hesaplanır,
// tek tek seçilen rakiplerle sınırlanmaz. Payda (toplam), platform bilgisi HİÇ girilmemiş
// rakipleri dışarıda bırakır — Sparrow'un "hiç doldurulmamış rakipler paydaya dahil edilmez"
// kuralıyla tutarlı (veri eksikliği "o platformda değil" anlamına gelmemeli).
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

In `handleIcerikStrateji`, right after `const rakipOzet = rakipOzetOlustur(rakipler, rakipIds, parametreler);` (currently line 565), add:

```ts
	const platformDagilimOzeti = platformDagilimOzetiGetir(rakipler);
```

Then change the `userPrompt` construction (currently lines 586-588):

```ts
	const userPrompt =
		`Toplanan rakip verisi:\n${rakipOzet}${parametreSkorlariEki}${konuTrendEki}${rakipYorumBaglami}\n\nÇiğdem'in isteği: ${istek}` +
		iceAktarPromptEki(kaynakBelgeler);
```

to:

```ts
	const userPrompt =
		`Toplanan rakip verisi:\n${rakipOzet}${parametreSkorlariEki}${konuTrendEki}${rakipYorumBaglami}${platformDagilimOzeti}\n\nÇiğdem'in isteği: ${istek}` +
		iceAktarPromptEki(kaynakBelgeler);
```

In `handleAksiyonAnaliz`, right after `const rakipYorumBaglami = rakipIds.length ? await rakipYorumBaglamiGetir(env, rakipRows, rakipIds, parametreler) : '';` (currently line 732), add:

```ts
	const platformDagilimOzeti = platformDagilimOzetiGetir(rakipRows);
```

Then change the `userPrompt` construction (currently lines 733-738):

```ts
	const userPrompt =
		`Sayısal özet: ${sayisalOzet}` +
		(rakipOzet ? `\n\nSeçilen rakip verisi:\n${rakipOzet}` : '') +
		rakipYorumBaglami +
		`\n\nÇiğdem'in yorumu: ${yorum}` +
		iceAktarPromptEki(kaynakBelgeler);
```

to:

```ts
	const userPrompt =
		`Sayısal özet: ${sayisalOzet}` +
		(rakipOzet ? `\n\nSeçilen rakip verisi:\n${rakipOzet}` : '') +
		rakipYorumBaglami +
		platformDagilimOzeti +
		`\n\nÇiğdem'in yorumu: ${yorum}` +
		iceAktarPromptEki(kaynakBelgeler);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd form-backend && npx vitest run test/rakipAnalizi.spec.ts`
Expected: PASS (full file).

- [ ] **Step 5: Typecheck and format**

Run: `cd form-backend && npx tsc --noEmit && npx prettier --check src/routes/rakipAnalizi.ts test/rakipAnalizi.spec.ts`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add form-backend/src/routes/rakipAnalizi.ts form-backend/test/rakipAnalizi.spec.ts
git commit -m "feat: compute platformDagilimOzetiGetir and feed it into both report prompts"
```

---

## Task 4: Sistem prompt talimatı

**Files:**
- Modify: `form-backend/src/routes/rakipAnalizi.ts` (near `ICERIK_STRATEJI_SYSTEM_PROMPT` ~line 362-383, `AKSIYON_ANALIZ_SYSTEM_PROMPT` ~line 665-682)
- Test: `form-backend/test/rakipAnalizi.spec.ts`

**Interfaces:**
- Consumes: nothing new (pure template-literal text).
- Produces: `PLATFORM_DAGILIM_TALIMATI_CEKIRDEK`, `PLATFORM_DAGILIM_TALIMATI_ICERIK`, `PLATFORM_DAGILIM_TALIMATI_AKSIYON` (module-private consts) — spliced into `ICERIK_STRATEJI_SYSTEM_PROMPT` / `AKSIYON_ANALIZ_SYSTEM_PROMPT`.

- [ ] **Step 1: Write the failing tests**

In `form-backend/test/rakipAnalizi.spec.ts`, inside `describe('POST /panel/rakip-analizi/icerik-strateji', ...)`, add:

```ts
it('includes the platform envanteri talimatı in the system prompt', async () => {
	const { fetchMock } = stubApis();
	await authedRequest('/panel/rakip-analizi/icerik-strateji', { method: 'POST', body: JSON.stringify({ istek: 'Öneri istiyorum' }) });
	const anthropicCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('api.anthropic.com'))!;
	const anthropicBody = JSON.parse((anthropicCall[1] as RequestInit).body as string);
	expect(anthropicBody.system).toContain('Rakip platform envanteri');
	expect(anthropicBody.system).toContain('Hangi platformda içerik önereceğine karar verirken');
});
```

Inside `describe('POST /panel/rakip-analizi/aksiyon-analiz', ...)`, add:

```ts
it('includes the platform envanteri talimatı in the system prompt', async () => {
	const { fetchMock } = stubApis();
	await authedRequest('/panel/rakip-analizi/aksiyon-analiz', { method: 'POST', body: JSON.stringify({ yorum: 'Değerlendirme istiyorum' }) });
	const anthropicCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('api.anthropic.com'))!;
	const anthropicBody = JSON.parse((anthropicCall[1] as RequestInit).body as string);
	expect(anthropicBody.system).toContain('Rakip Karşısında Konumlanma');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd form-backend && npx vitest run test/rakipAnalizi.spec.ts -t "platform envanteri talimatı"`
Expected: FAIL — `anthropicBody.system` does not contain the expected text.

- [ ] **Step 3: Implement**

In `form-backend/src/routes/rakipAnalizi.ts`, add these three constants right before `export const ICERIK_STRATEJI_SYSTEM_PROMPT = ...` (currently line 362):

```ts
// Rakip platform envanteri talimatı (2026-08-24) — platformDagilimOzetiGetir'in ürettiği
// istatistiği (userPrompt'a otomatik eklenir, parametre seçimine bakılmaksızın) YORUMLAYIP somut
// öneriye çevirmesi için ortak çekirdek. Her iki sistem promptu da kendi odağına özgü tek
// cümlelik ekle bunu kullanır.
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

In `ICERIK_STRATEJI_SYSTEM_PROMPT`'s template literal (currently ending `...asla zaman ufku veya iş hedefi bazlı olmasın.${ICERIK_GORSEL_VIDEO_DETAY_TALIMATI}${ICERIK_ETIK_UYARI_METNI}${RAPOR_YAPISI_TALIMATI}\`;`), insert the new constant right before `${RAPOR_YAPISI_TALIMATI}`:

```ts
asla zaman ufku veya iş hedefi bazlı olmasın.${ICERIK_GORSEL_VIDEO_DETAY_TALIMATI}${ICERIK_ETIK_UYARI_METNI}${PLATFORM_DAGILIM_TALIMATI_ICERIK}${RAPOR_YAPISI_TALIMATI}`;
```

In `AKSIYON_ANALIZ_SYSTEM_PROMPT`'s template literal (currently ending `...asla\nİçerik fikri/format bazlı olmasın.${RAPOR_YAPISI_TALIMATI}\`;`), insert the new constant right before `${RAPOR_YAPISI_TALIMATI}`:

```ts
içerik fikri/format bazlı olmasın.${PLATFORM_DAGILIM_TALIMATI_AKSIYON}${RAPOR_YAPISI_TALIMATI}`;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd form-backend && npx vitest run test/rakipAnalizi.spec.ts`
Expected: PASS (full file — 844+ lines of pre-existing tests plus all tests added in Tasks 2-4 must be green).

- [ ] **Step 5: Typecheck and format**

Run: `cd form-backend && npx tsc --noEmit && npx prettier --check src/routes/rakipAnalizi.ts test/rakipAnalizi.spec.ts`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add form-backend/src/routes/rakipAnalizi.ts form-backend/test/rakipAnalizi.spec.ts
git commit -m "feat: add platform envanteri instruction to both report system prompts"
```

---

## Task 5: Panel UI — 11 checkbox + 2 manuel gözlem alanı

**Files:**
- Modify: `rakip-analizi.html:1812-1865` (`rakipEkleDuzenleAlanlarPaneliOlustur`), `:1919-1963` (submit handler)

**Interfaces:**
- Consumes: `POST /panel/rakip-analizi/rakip-duzelt` body shape (`aktifPlatformlar?: string[]`, `googlePuaniGozlemi?: string`, `googleYorumSayisiGozlemi?: string` — Task 2), `GET /panel/rakip-analizi/rakip-liste` response fields `aktifPlatformlar`/`googlePuaniGozlemi`/`googleYorumSayisiGozlemi`/`gozlemTarihiUtc` (Task 2).
- No automated test — this repo has no frontend test framework (per `CLAUDE.md`, frontend changes are verified via `python3 -m http.server 5173` + manual browser QA). Step 3 below is a manual verification checklist instead of an automated test run.

- [ ] **Step 1: Add the platform list constant**

In `rakip-analizi.html`, immediately before the `function rakipEkleDuzenleAlanlarPaneliOlustur(r) {` line (currently line 1812), add:

```js
  // Backend'deki RAKIP_PLATFORM_LISTESI (form-backend/src/config.ts) ile AYNI sırada tutulmalı —
  // sıra sadece checkbox'ların GÖRÜNÜM sırası için, normalize sıralama backend'de
  // (aktifPlatformlarNormalize) garanti ediliyor.
  var RAKIP_PLATFORM_LISTESI = ['Facebook', 'Instagram', 'LinkedIn', 'X', 'TikTok', 'YouTube', 'Bluesky', 'Threads', 'Google Business', 'Pinterest', 'Mastodon'];

```

- [ ] **Step 2: Extend the edit-fields panel with 3 new entries and a checkbox-group render branch**

In `rakip-analizi.html`, change the `alanlar` array inside `rakipEkleDuzenleAlanlarPaneliOlustur` (currently lines 1827-1832):

```js
    var alanlar = [
      { key: 'adres', label: 'Adres', tip: 'text', deger: r.adres || '' },
      { key: 'kaynak', label: 'Kaynak', tip: 'select', deger: r.kaynak },
      { key: 'nasilBulundu', label: 'Nasıl Bulundu', tip: 'text', deger: g.nasilBulundu === '—' ? '' : g.nasilBulundu },
      { key: 'tarih', label: 'Tarih', tip: 'datetime-local', deger: isoToDatetimeLocalDeger(r.createdAtUtc) },
    ];
```

to:

```js
    var alanlar = [
      { key: 'adres', label: 'Adres', tip: 'text', deger: r.adres || '' },
      { key: 'kaynak', label: 'Kaynak', tip: 'select', deger: r.kaynak },
      { key: 'nasilBulundu', label: 'Nasıl Bulundu', tip: 'text', deger: g.nasilBulundu === '—' ? '' : g.nasilBulundu },
      { key: 'tarih', label: 'Tarih', tip: 'datetime-local', deger: isoToDatetimeLocalDeger(r.createdAtUtc) },
      { key: 'aktifPlatformlar', label: 'Aktif Platformlar', tip: 'platformCheckboxes', deger: r.aktifPlatformlar || '' },
      { key: 'googlePuaniGozlemi', label: 'Google Puanı (kendi gözlemin)', tip: 'text', deger: r.googlePuaniGozlemi || '' },
      { key: 'googleYorumSayisiGozlemi', label: 'Google Yorum Sayısı (kendi gözlemin)', tip: 'text', deger: r.googleYorumSayisiGozlemi || '' },
    ];
```

Then change the `alanlar.forEach(function (alan) { ... })` loop (currently lines 1833-1862) to add a `platformCheckboxes` branch before the existing `select`/default branch. Replace the whole loop body with:

```js
    alanlar.forEach(function (alan) {
      var satir = document.createElement('div');
      satir.className = 'rakip-duzenle-alan-satiri';
      var label = document.createElement('label');
      var checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(' ' + alan.label));
      satir.appendChild(label);

      if (alan.tip === 'platformCheckboxes') {
        var mevcutPlatformlar = alan.deger ? alan.deger.split(',').map(function (p) { return p.trim(); }) : [];
        var grup = document.createElement('div');
        grup.className = 'rakip-platform-checkbox-grup';
        var platformKutulari = RAKIP_PLATFORM_LISTESI.map(function (platform) {
          var pLabel = document.createElement('label');
          var pCheckbox = document.createElement('input');
          pCheckbox.type = 'checkbox';
          pCheckbox.value = platform;
          pCheckbox.checked = mevcutPlatformlar.indexOf(platform) !== -1;
          pCheckbox.disabled = true;
          pLabel.appendChild(pCheckbox);
          pLabel.appendChild(document.createTextNode(' ' + platform));
          grup.appendChild(pLabel);
          return pCheckbox;
        });
        checkbox.addEventListener('change', function () {
          platformKutulari.forEach(function (pCheckbox) { pCheckbox.disabled = !checkbox.checked; });
        });
        satir.appendChild(grup);
        list.appendChild(satir);
        rakipEkleDuzenleAlanKontrolleri[alan.key] = {
          checkbox: checkbox,
          getValue: function () {
            return platformKutulari.filter(function (p) { return p.checked; }).map(function (p) { return p.value; });
          },
        };
        return;
      }

      var input;
      if (alan.tip === 'select') {
        input = document.createElement('select');
        ['manuel', 'harita'].forEach(function (k) {
          var opt = document.createElement('option');
          opt.value = k; opt.textContent = k === 'harita' ? 'Haritadan' : 'Manuel';
          if (k === alan.deger) opt.selected = true;
          input.appendChild(opt);
        });
      } else {
        input = document.createElement('input');
        input.type = alan.tip;
        input.value = alan.deger;
      }
      input.disabled = true;
      checkbox.addEventListener('change', function () { input.disabled = !checkbox.checked; });
      satir.appendChild(input);
      list.appendChild(satir);
      rakipEkleDuzenleAlanKontrolleri[alan.key] = { checkbox: checkbox, input: input };
    });
```

- [ ] **Step 3: Handle the checkbox-group value in the submit handler**

In `rakip-analizi.html`, change the `Object.keys(rakipEkleDuzenleAlanKontrolleri).forEach(...)` block inside the `rakipEkleBtn` click handler (currently lines 1932-1937):

```js
      Object.keys(rakipEkleDuzenleAlanKontrolleri).forEach(function (key) {
        var ctrl = rakipEkleDuzenleAlanKontrolleri[key];
        if (!ctrl.checkbox.checked) return;
        if (key === 'tarih') { if (ctrl.input.value) payload.tarih = new Date(ctrl.input.value).toISOString(); }
        else { payload[key] = ctrl.input.value.trim(); }
      });
```

to:

```js
      Object.keys(rakipEkleDuzenleAlanKontrolleri).forEach(function (key) {
        var ctrl = rakipEkleDuzenleAlanKontrolleri[key];
        if (!ctrl.checkbox.checked) return;
        if (key === 'tarih') { if (ctrl.input.value) payload.tarih = new Date(ctrl.input.value).toISOString(); }
        else if (ctrl.getValue) { payload[key] = ctrl.getValue(); }
        else { payload[key] = ctrl.input.value.trim(); }
      });
```

- [ ] **Step 4: Manual verification (no automated frontend test in this repo)**

Run: `cd /Users/selencelik/Desktop/PROJELER/cigdem-tas-talk-and-heal && python3 -m http.server 5173`, then in a browser:

1. Open `http://localhost:5173/rakip-analizi.html`, log into the panel, add a competitor via "Rakip Ekle".
2. Search for it in "Var olan rakibi ara" to enter edit mode, expand "Ek alanları düzenle".
3. Confirm 3 new rows appear: "Aktif Platformlar" (11 sub-checkboxes, all unchecked/disabled until its own checkbox is ticked), "Google Puanı (kendi gözlemin)", "Google Yorum Sayısı (kendi gözlemin)".
4. Tick "Aktif Platformlar", check Instagram + TikTok, tick "Google Puanı" and type `4.6`, click "Düzenlemeyi Kaydet".
5. Re-open the same competitor's edit panel — confirm Instagram and TikTok show as checked, others unchecked, and the Google Puanı field shows `4.6`.
6. Confirm no request to `places.googleapis.com` fires during this whole flow (DevTools Network tab) — the two Google fields must never trigger an API call.

- [ ] **Step 5: Commit**

```bash
git add rakip-analizi.html
git commit -m "feat: add platform checkboxes and manual google gözlem fields to the rakip edit panel"
```
