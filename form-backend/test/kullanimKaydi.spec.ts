import { env } from 'cloudflare:test';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ensureKullanimKaydiTab, logKullanim, logKullanimToplu, getKullanimOzet, kotaDolduMu } from '../src/lib/kullanimKaydi';

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

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
				JSON.stringify({
					sheets: existingTabs.map((t) => ({ properties: { sheetId: 1, title: t, gridProperties: { columnCount: 20 } } })),
				}),
				{ status: 200 },
			);
		}
		if (url.includes(':batchUpdate')) return new Response('{}', { status: 200 });
		if (url.includes(':append') && method === 'POST') {
			const body = JSON.parse(init!.body as string);
			appended.push(...body.values);
			return new Response(JSON.stringify({ updates: { updatedRange: `KullanimKaydi!A${appended.length + 1}:D${appended.length + 1}` } }), {
				status: 200,
			});
		}
		if (url.includes('/values/') && method === 'PUT') return new Response('{}', { status: 200 });
		if (url.includes('/values/') && method === 'GET') return new Response(JSON.stringify({ values: appended }), { status: 200 });
		throw new Error(`Unexpected fetch in test: ${method} ${url}`);
	});
	vi.stubGlobal('fetch', fetchMock);
	return { appended, fetchMock };
}

describe('kullanimKaydi', () => {
	it('creates the KullanimKaydi tab when it does not exist yet', async () => {
		stubSheetsApi([]);
		await expect(ensureKullanimKaydiTab(env)).resolves.not.toThrow();
	});

	it('pins the whole row (CLIP + fixed row height) so a long detay never grows the tab', async () => {
		const { fetchMock } = stubSheetsApi(['Sayfa1', 'KullanimKaydi']);
		await ensureKullanimKaydiTab(env);
		const dimensionCall = fetchMock.mock.calls.find((c) => {
			if (!String(c[0]).includes(':batchUpdate')) return false;
			const body = JSON.parse((c[1] as RequestInit).body as string) as { requests?: { updateDimensionProperties?: unknown }[] };
			return body.requests?.some((r) => r.updateDimensionProperties);
		});
		expect(dimensionCall).toBeDefined();
	});

	it('counts logged events per category for the current month, ignoring other categories', async () => {
		stubSheetsApi(['Sayfa1', 'RakipAnalizi', 'KullanimKaydi']);
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-08-15T12:00:00.000Z'));
		await logKullanim(env, 'adresBulma', 'kadıköy');
		await logKullanim(env, 'adresBulma', 'beşiktaş');
		await logKullanim(env, 'rakipArama', "'avukat' (500m)");

		const ozet = await getKullanimOzet(env);
		expect(ozet.adresBulma.kullanilan).toBe(2);
		expect(ozet.adresBulma.etiket).toBe('Adres Bulma');
		expect(ozet.adresBulma.aylikLimit).toBe(10000);
		expect(ozet.rakipArama.kullanilan).toBe(1);
		expect(ozet.icerikStrateji.kullanilan).toBe(0);
		expect(ozet.icerikStrateji.aylikLimit).toBe(12);
	});

	it('excludes events logged in a previous month', async () => {
		stubSheetsApi(['Sayfa1', 'RakipAnalizi', 'KullanimKaydi']);
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-07-30T23:00:00.000Z'));
		await logKullanim(env, 'adresBulma', 'temmuzda arandı');
		vi.setSystemTime(new Date('2026-08-01T00:00:00.000Z'));
		await logKullanim(env, 'adresBulma', 'ağustosta arandı');

		const ozet = await getKullanimOzet(env);
		expect(ozet.adresBulma.kullanilan).toBe(1);
	});

	it('reports quota as full once the monthly limit is reached, but never for null-limit categories', async () => {
		stubSheetsApi(['Sayfa1', 'RakipAnalizi', 'KullanimKaydi']);
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-08-15T12:00:00.000Z'));
		expect(await kotaDolduMu(env, 'rakipArama')).toBe(false);
		for (let i = 0; i < 5000; i++) await logKullanim(env, 'rakipArama', 'x');
		expect(await kotaDolduMu(env, 'rakipArama')).toBe(true);
		expect(await kotaDolduMu(env, 'icerikStrateji')).toBe(false);
	});

	it('exposes the rakipPlatformTespiti category with a 27 monthly limit that can be increased', async () => {
		stubSheetsApi(['Sayfa1', 'KullanimKaydi', 'KullanimLimitleri']);
		const ozet = await getKullanimOzet(env);
		expect(ozet.rakipPlatformTespiti).toMatchObject({
			etiket: 'Rakip Platform Tespiti (Canlı Arama)',
			aylikLimit: 27,
			arttirilabilir: true,
		});
	});

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
});
