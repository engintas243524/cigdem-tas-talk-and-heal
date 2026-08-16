import { env } from 'cloudflare:test';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ensureKullanimKaydiTab, logKullanim, getKullanimOzet, kotaDolduMu } from '../src/lib/kullanimKaydi';

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
			appended.push(body.values[0]);
			return new Response(JSON.stringify({ updates: { updatedRange: `KullanimKaydi!A${appended.length + 1}:D${appended.length + 1}` } }), {
				status: 200,
			});
		}
		if (url.includes('/values/') && method === 'PUT') return new Response('{}', { status: 200 });
		if (url.includes('/values/') && method === 'GET') return new Response(JSON.stringify({ values: appended }), { status: 200 });
		throw new Error(`Unexpected fetch in test: ${method} ${url}`);
	});
	vi.stubGlobal('fetch', fetchMock);
	return { appended };
}

describe('kullanimKaydi', () => {
	it('creates the KullanimKaydi tab when it does not exist yet', async () => {
		stubSheetsApi([]);
		await expect(ensureKullanimKaydiTab(env)).resolves.not.toThrow();
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
});
