import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, vi, afterEach } from 'vitest';
import worker from '../src';
import { signPanelToken } from '../src/lib/panel-auth';
import { runRakipTakipSweep } from '../src/scheduled';

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

const testEnv = {
	...env,
	PANEL_PASSWORD: 'correct-horse',
	PANEL_TOKEN_SECRET: 'panel-test-secret',
	ANTHROPIC_API_KEY: 'test-key',
} as typeof env;

// Rakip Takip birden fazla sekmeyi (RakipTakip, RakipAnalizi, Sayfa1, KullanimKaydi) aynı anda
// kullandığı için stub, satır numarasını TEK global sayaçla değil sekme adına göre ayrı ayrı
// tutuyor (bkz. rakipTakipSheets.spec.ts'deki daha basit tek-sekmelik versiyon).
function stubApis(existingTabs: string[] = []) {
	const tabRows = new Map<string, Map<number, string[]>>();
	function rowsFor(tab: string) {
		if (!tabRows.has(tab)) tabRows.set(tab, new Map());
		return tabRows.get(tab)!;
	}
	function tabFromUrl(url: string): string {
		const m = decodeURIComponent(url).match(/\/values\/([^!]+)!/);
		return m ? m[1] : '';
	}
	const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		const method = init?.method ?? 'GET';
		if (url.includes('oauth2.googleapis.com')) {
			return new Response(JSON.stringify({ access_token: 'fake', expires_in: 3600 }), { status: 200 });
		}
		if (url.includes('?fields=sheets.properties')) {
			return new Response(
				JSON.stringify({
					sheets: existingTabs.map((t) => ({ properties: { sheetId: 1, title: t, gridProperties: { columnCount: 20 } } })),
				}),
				{ status: 200 },
			);
		}
		if (url.includes(':batchUpdate')) return new Response('{}', { status: 200 });
		if (url.includes(':append') && method === 'POST') {
			const rows = rowsFor(tabFromUrl(url));
			const body = JSON.parse(init!.body as string) as { values: string[][] };
			let nextRow = Math.max(1, ...rows.keys()) + 1;
			for (const rowValues of body.values) {
				rows.set(nextRow, rowValues);
				nextRow++;
			}
			return new Response(JSON.stringify({ updates: { updatedRange: `X!A${nextRow - 1}` } }), { status: 200 });
		}
		if (method === 'PUT' && url.includes('/values/')) {
			const rows = rowsFor(tabFromUrl(url));
			const body = JSON.parse(init!.body as string) as { values: string[][] };
			const rowMatch = decodeURIComponent(url).match(/!A(\d+)/);
			const rowNumber = rowMatch ? Number(rowMatch[1]) : 1;
			rows.set(rowNumber, body.values[0]);
			return new Response('{}', { status: 200 });
		}
		if (method === 'GET' && url.includes('/values/')) {
			const rows = rowsFor(tabFromUrl(url));
			const rowMatch = decodeURIComponent(url).match(/!A(\d+)/);
			const startRow = rowMatch ? Number(rowMatch[1]) : 2;
			const maxRow = Math.max(startRow - 1, ...rows.keys());
			const values: string[][] = [];
			for (let r = startRow; r <= maxRow; r++) values.push(rows.get(r) ?? []);
			return new Response(JSON.stringify({ values }), { status: 200 });
		}
		if (url.includes('api.anthropic.com')) {
			return new Response(JSON.stringify({ content: [{ type: 'text', text: 'Üretilen rapor metni.' }] }), { status: 200 });
		}
		throw new Error(`Unexpected fetch in test: ${method} ${url}`);
	});
	vi.stubGlobal('fetch', fetchMock);
	return { tabRows, fetchMock };
}

async function authedRequest(path: string, init: RequestInit = {}) {
	const token = await signPanelToken(testEnv);
	const request = new Request(`http://localhost${path}`, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
	const ctx = createExecutionContext();
	const response = await worker.fetch(request, testEnv, ctx);
	await waitOnExecutionContext(ctx);
	return response;
}

describe('GET /panel/rakip-analizi/rakip-takip', () => {
	it('returns all 6 fixed periyot rows, seeding the tab on first call', async () => {
		stubApis([]);
		const response = await authedRequest('/panel/rakip-analizi/rakip-takip');
		expect(response.status).toBe(200);
		const data = (await response.json()) as { periyotlar: { periyotTuru: string }[] };
		expect(data.periyotlar).toHaveLength(6);
	});

	it('requires panel auth', async () => {
		stubApis([]);
		const request = new Request('http://localhost/panel/rakip-analizi/rakip-takip');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, testEnv, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(401);
	});
});

describe('POST /panel/rakip-analizi/rakip-takip/uret', () => {
	it('rejects an invalid periyotTuru', async () => {
		stubApis([]);
		const response = await authedRequest('/panel/rakip-analizi/rakip-takip/uret', {
			method: 'POST',
			body: JSON.stringify({ periyotTuru: 'gunluk' }),
		});
		expect(response.status).toBe(400);
	});

	it('starts a brand-new period on the first call (yeniDonem)', async () => {
		stubApis([]);
		const response = await authedRequest('/panel/rakip-analizi/rakip-takip/uret', {
			method: 'POST',
			body: JSON.stringify({ periyotTuru: 'haftalik' }),
		});
		expect(response.status).toBe(200);
		const data = (await response.json()) as {
			asama: string;
			durum: { projeksiyon: string; hedef: string; realizasyon: string };
		};
		expect(data.asama).toBe('yeniDonem');
		expect(data.durum.projeksiyon).toBe('Üretilen rapor metni.');
		expect(data.durum.realizasyon).toBe('');
	});

	it('walks through all three loop states without ever growing the RakipTakip tab beyond 6 rows', async () => {
		const { tabRows } = stubApis([]);
		const call = () =>
			authedRequest('/panel/rakip-analizi/rakip-takip/uret', { method: 'POST', body: JSON.stringify({ periyotTuru: 'aylik' }) });

		const first = (await (await call()).json()) as { asama: string };
		expect(first.asama).toBe('yeniDonem');
		const second = (await (await call()).json()) as { asama: string };
		expect(second.asama).toBe('kapatildi');
		const third = (await (await call()).json()) as { asama: string };
		expect(third.asama).toBe('ilerletildi');

		// header (1) + 6 sabit periyot satırı = 7 — döngü kaç kez ilerlerse ilerlesin büyümemeli.
		expect(tabRows.get('RakipTakip')?.size).toBe(7);
	});

	it('requires panel auth', async () => {
		stubApis([]);
		const request = new Request('http://localhost/panel/rakip-analizi/rakip-takip/uret', {
			method: 'POST',
			body: JSON.stringify({ periyotTuru: 'haftalik' }),
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, testEnv, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(401);
	});
});

describe('POST /panel/rakip-analizi/rakip-takip/ayar', () => {
	it('turns the automatic switch on and reflects it back', async () => {
		stubApis([]);
		const response = await authedRequest('/panel/rakip-analizi/rakip-takip/ayar', { method: 'POST', body: JSON.stringify({ acik: true }) });
		expect(response.status).toBe(200);
		const data = (await response.json()) as { ayar: { otomatikAcik: boolean } };
		expect(data.ayar.otomatikAcik).toBe(true);
	});

	it('turns it back off', async () => {
		stubApis([]);
		await authedRequest('/panel/rakip-analizi/rakip-takip/ayar', { method: 'POST', body: JSON.stringify({ acik: true }) });
		const response = await authedRequest('/panel/rakip-analizi/rakip-takip/ayar', {
			method: 'POST',
			body: JSON.stringify({ acik: false }),
		});
		const data = (await response.json()) as { ayar: { otomatikAcik: boolean } };
		expect(data.ayar.otomatikAcik).toBe(false);
	});

	it('defaults to off, and GET /rakip-takip reflects that default', async () => {
		stubApis([]);
		const response = await authedRequest('/panel/rakip-analizi/rakip-takip');
		const data = (await response.json()) as { ayar: { otomatikAcik: boolean } };
		expect(data.ayar.otomatikAcik).toBe(false);
	});
});

describe('RakipTakipGecmis snapshot recording (kapatildi step)', () => {
	it('records a RakipTakipGecmis snapshot for Talk and Heal and each tracked competitor when a period closes', async () => {
		const { tabRows } = stubApis([]);
		const rakipRes = await authedRequest('/panel/rakip-analizi/rakip', {
			method: 'POST',
			body: JSON.stringify({ isim: 'Takip Edilen Rakip', kaynak: 'manuel', not: 'Fiyatlar düşük.' }),
		});
		const rakipId = ((await rakipRes.json()) as { id: string }).id;

		const call = () =>
			authedRequest('/panel/rakip-analizi/rakip-takip/uret', {
				method: 'POST',
				body: JSON.stringify({ periyotTuru: 'haftalik', rakipIds: [rakipId] }),
			});
		await call(); // yeniDonem
		const kapatildi = (await (await call()).json()) as { asama: string };
		expect(kapatildi.asama).toBe('kapatildi');

		const gecmisRows = tabRows.get('RakipTakipGecmis');
		expect(gecmisRows).toBeDefined();
		// header + Talk and Heal snapshot'ı + 1 rakip snapshot'ı = 3
		expect(gecmisRows?.size).toBe(3);
	});
});

describe('runRakipTakipSweep (cron)', () => {
	it('makes zero Sheets/Claude calls beyond the switch check when the switch is off (cost safety)', async () => {
		const { fetchMock } = stubApis([]);
		await runRakipTakipSweep(env);
		// Sadece ayar okuması (oauth + ?fields=sheets.properties + values GET) yapılmalı — hiç
		// RakipTakip/Claude çağrısı olmamalı.
		expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('api.anthropic.com'))).toBe(false);
	});

	it('advances a due period automatically once the switch is on', async () => {
		const { fetchMock } = stubApis([]);
		await authedRequest('/panel/rakip-analizi/rakip-takip/ayar', { method: 'POST', body: JSON.stringify({ acik: true }) });

		await runRakipTakipSweep(env); // 1. tick: her periyot türü için "yeniDonem" başlatır
		const anthropicCallsAfterFirst = fetchMock.mock.calls.filter((c) => String(c[0]).includes('api.anthropic.com')).length;
		expect(anthropicCallsAfterFirst).toBeGreaterThan(0);
	});

	it('does not touch an already-open period whose end date has not arrived yet', async () => {
		const { fetchMock } = stubApis([]);
		await authedRequest('/panel/rakip-analizi/rakip-takip/ayar', { method: 'POST', body: JSON.stringify({ acik: true }) });
		await runRakipTakipSweep(env); // starts all 6 periods (donemBitisUtc is in the future for all)
		fetchMock.mockClear();

		await runRakipTakipSweep(env); // 2. tick, hemen sonra — hiçbir dönemin süresi dolmamış olmalı
		expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('api.anthropic.com'))).toBe(false);
	});
});

describe('POST /panel/rakip-analizi/rakip-takip/karsilastirma', () => {
	// Skorlama çağrılarını (system promptu "veri analistisin" içeren) sıraya göre ayırt eden bir
	// stub — Talk and Heal her zaman İLK skorlanıyor (bkz. gecmisSnapshotlariniKaydet), sonra
	// rakipler eklendikleri sırayla. Diğer tüm Claude çağrıları (aksiyon/içerik/yorum) sabit metin.
	function stubApisWithScores(skorListesi: Record<string, number>[]) {
		const { fetchMock, tabRows } = stubApis([]);
		const orijinalUygulama = fetchMock.getMockImplementation()!;
		let skorCagriSayaci = 0;
		fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			if (url.includes('api.anthropic.com')) {
				const body = init?.body ? (JSON.parse(init.body as string) as { system?: string }) : {};
				if (typeof body.system === 'string' && body.system.includes('veri analistisin')) {
					const skorlar = skorListesi[skorCagriSayaci] ?? skorListesi[skorListesi.length - 1] ?? {};
					skorCagriSayaci++;
					return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(skorlar) }] }), { status: 200 });
				}
				return new Response(JSON.stringify({ content: [{ type: 'text', text: 'Üretilen rapor metni.' }] }), { status: 200 });
			}
			// oauth/sheets.properties/batchUpdate/append/values — orijinal stubApis mantığına devret.
			return orijinalUygulama(input, init);
		});
		return { fetchMock, tabRows };
	}

	it('rejects an invalid periyotTuru', async () => {
		stubApis([]);
		const response = await authedRequest('/panel/rakip-analizi/rakip-takip/karsilastirma', {
			method: 'POST',
			body: JSON.stringify({ periyotTuru: 'gunluk', rakipIds: ['x'] }),
		});
		expect(response.status).toBe(400);
	});

	it('rejects an empty rakipIds list', async () => {
		stubApis([]);
		const response = await authedRequest('/panel/rakip-analizi/rakip-takip/karsilastirma', {
			method: 'POST',
			body: JSON.stringify({ periyotTuru: 'haftalik', rakipIds: [] }),
		});
		expect(response.status).toBe(400);
	});

	it('rejects 1e1 mode with more than one rakipId', async () => {
		stubApis([]);
		const response = await authedRequest('/panel/rakip-analizi/rakip-takip/karsilastirma', {
			method: 'POST',
			body: JSON.stringify({ periyotTuru: 'haftalik', mod: '1e1', rakipIds: ['a', 'b'] }),
		});
		expect(response.status).toBe(400);
	});

	it('returns 404 when no history exists yet for the period type', async () => {
		stubApis([]);
		const rakipRes = await authedRequest('/panel/rakip-analizi/rakip', {
			method: 'POST',
			body: JSON.stringify({ isim: 'X', kaynak: 'manuel' }),
		});
		const rakipId = ((await rakipRes.json()) as { id: string }).id;
		const response = await authedRequest('/panel/rakip-analizi/rakip-takip/karsilastirma', {
			method: 'POST',
			body: JSON.stringify({ periyotTuru: 'haftalik', rakipIds: [rakipId] }),
		});
		expect(response.status).toBe(404);
	});

	it('1e1 mode returns matching talkAndHeal/rakip series with real scores', async () => {
		const { fetchMock } = stubApisWithScores([{ fiyat: 9 }, { fiyat: 3 }]); // 1. çağrı=Talk and Heal, 2.=rakip
		const rakipRes = await authedRequest('/panel/rakip-analizi/rakip', {
			method: 'POST',
			body: JSON.stringify({ isim: 'Rakip A', kaynak: 'manuel', not: 'Ucuz fiyatlar.' }),
		});
		const rakipId = ((await rakipRes.json()) as { id: string }).id;
		await authedRequest('/panel/rakip-analizi/rakip-takip/uret', {
			method: 'POST',
			body: JSON.stringify({ periyotTuru: 'haftalik', rakipIds: [rakipId] }),
		}); // yeniDonem
		await authedRequest('/panel/rakip-analizi/rakip-takip/uret', {
			method: 'POST',
			body: JSON.stringify({ periyotTuru: 'haftalik', rakipIds: [rakipId] }),
		}); // kapatildi — snapshot kaydedilir

		const response = await authedRequest('/panel/rakip-analizi/rakip-takip/karsilastirma', {
			method: 'POST',
			body: JSON.stringify({ periyotTuru: 'haftalik', mod: '1e1', rakipIds: [rakipId], parametreler: ['fiyat'] }),
		});
		expect(response.status).toBe(200);
		const data = (await response.json()) as {
			rakipEtiketi: string;
			parametreSonuclari: { parametre: string; talkAndHeal: { deger: number | null }[]; rakip: { deger: number | null }[] }[];
		};
		expect(data.rakipEtiketi).toBe('Rakip A');
		expect(data.parametreSonuclari).toHaveLength(1);
		expect(data.parametreSonuclari[0].talkAndHeal[0].deger).toBe(9);
		expect(data.parametreSonuclari[0].rakip[0].deger).toBe(3);
		expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('api.anthropic.com'))).toBe(true);
	});

	it('ortalama mode averages two competitors scored on the same closed period', async () => {
		// Sıra: 1) Talk and Heal, 2) Rakip B, 3) Rakip C (gecmisSnapshotlariniKaydet'in rakipRows sırası)
		stubApisWithScores([{ fiyat: 5 }, { fiyat: 4 }, { fiyat: 8 }]);
		const rakipB = (
			(await (
				await authedRequest('/panel/rakip-analizi/rakip', { method: 'POST', body: JSON.stringify({ isim: 'Rakip B', kaynak: 'manuel' }) })
			).json()) as { id: string }
		).id;
		const rakipC = (
			(await (
				await authedRequest('/panel/rakip-analizi/rakip', { method: 'POST', body: JSON.stringify({ isim: 'Rakip C', kaynak: 'manuel' }) })
			).json()) as { id: string }
		).id;

		await authedRequest('/panel/rakip-analizi/rakip-takip/uret', {
			method: 'POST',
			body: JSON.stringify({ periyotTuru: 'aylik', rakipIds: [rakipB, rakipC] }),
		}); // yeniDonem
		await authedRequest('/panel/rakip-analizi/rakip-takip/uret', {
			method: 'POST',
			body: JSON.stringify({ periyotTuru: 'aylik', rakipIds: [rakipB, rakipC] }),
		}); // kapatildi — 3 snapshot birlikte kaydedilir (aynı donemBaslangicUtc)

		const response = await authedRequest('/panel/rakip-analizi/rakip-takip/karsilastirma', {
			method: 'POST',
			body: JSON.stringify({ periyotTuru: 'aylik', mod: 'ortalama', rakipIds: [rakipB, rakipC], parametreler: ['fiyat'] }),
		});
		expect(response.status).toBe(200);
		const data = (await response.json()) as {
			rakipEtiketi: string;
			parametreSonuclari: { rakip: { deger: number | null }[] }[];
		};
		expect(data.rakipEtiketi).toBe('2 rakip ortalaması');
		expect(data.parametreSonuclari[0].rakip).toHaveLength(1); // aynı dönem → tek tarih
		expect(data.parametreSonuclari[0].rakip[0].deger).toBe(6); // (4+8)/2
	});

	it('requires panel auth', async () => {
		stubApis([]);
		const request = new Request('http://localhost/panel/rakip-analizi/rakip-takip/karsilastirma', {
			method: 'POST',
			body: JSON.stringify({ periyotTuru: 'haftalik', rakipIds: ['x'] }),
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, testEnv, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(401);
	});
});
