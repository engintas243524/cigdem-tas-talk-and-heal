import { env } from 'cloudflare:test';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { runMevzuatTakipSweep } from '../src/scheduled';

afterEach(() => vi.unstubAllGlobals());

const testEnv = { ...env, ANTHROPIC_API_KEY: 'test-key' } as typeof env;

function stubApis(existingRows: string[][] = [], anthropicText = 'DEĞİŞİKLİK YOK\nBir şey bulunamadı.') {
	const rows = new Map<number, string[]>();
	existingRows.forEach((r, i) => rows.set(i + 2, r));
	const anthropicCalls: string[] = [];
	const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		const method = init?.method ?? 'GET';
		if (url.includes('oauth2.googleapis.com'))
			return new Response(JSON.stringify({ access_token: 'fake', expires_in: 3600 }), { status: 200 });
		if (url.includes('?fields=sheets.properties')) {
			return new Response(
				JSON.stringify({ sheets: [{ properties: { sheetId: 1, title: 'MevzuatTakip', gridProperties: { columnCount: 4 } } }] }),
				{ status: 200 },
			);
		}
		if (url.includes(':batchUpdate')) return new Response('{}', { status: 200 });
		if (url.includes(':append') && method === 'POST') {
			const body = JSON.parse(init!.body as string) as { values: string[][] };
			const nextRow = Math.max(1, ...rows.keys()) + 1;
			rows.set(nextRow, body.values[0]);
			return new Response('{}', { status: 200 });
		}
		if (method === 'PUT' && url.includes('/values/')) return new Response('{}', { status: 200 });
		if (method === 'GET' && url.includes('/values/')) {
			const maxRow = Math.max(1, ...rows.keys());
			const values: string[][] = [];
			for (let r = 2; r <= maxRow; r++) values.push(rows.get(r) ?? []);
			return new Response(JSON.stringify({ values }), { status: 200 });
		}
		if (url.includes('api.anthropic.com')) {
			anthropicCalls.push(JSON.parse(init!.body as string).system);
			return new Response(JSON.stringify({ content: [{ type: 'text', text: anthropicText }] }), { status: 200 });
		}
		throw new Error(`Unexpected fetch in test: ${method} ${url}`);
	});
	vi.stubGlobal('fetch', fetchMock);
	return { rows, anthropicCalls };
}

describe('runMevzuatTakipSweep', () => {
	it("ilk çalıştırmada (hiç kayıt yokken) Anthropic'e sorar ve bir kayıt ekler", async () => {
		const { rows, anthropicCalls } = stubApis([]);
		await runMevzuatTakipSweep(testEnv, new Date('2026-08-17T12:00:00.000Z'));
		expect(anthropicCalls).toHaveLength(1);
		expect(rows.size).toBe(1);
		const eklenen = rows.get(2)!;
		expect(eklenen[2]).toBe('hayır'); // degisiklikVarMi
	});

	it('son kayıt 30 günden yeniyse tekrar sormaz', async () => {
		const yakinTarih = '2026-08-01T00:00:00.000Z'; // 16 gün önce
		const { anthropicCalls, rows } = stubApis([['id-1', yakinTarih, 'hayır', 'eski özet']]);
		await runMevzuatTakipSweep(testEnv, new Date('2026-08-17T12:00:00.000Z'));
		expect(anthropicCalls).toHaveLength(0);
		expect(rows.size).toBe(1); // yeni satır eklenmedi
	});

	it('son kayıt 30 günden eskiyse tekrar sorar ve yeni kayıt ekler', async () => {
		const eskiTarih = '2026-06-01T00:00:00.000Z'; // >30 gün önce
		const { anthropicCalls, rows } = stubApis([['id-1', eskiTarih, 'hayır', 'eski özet']]);
		await runMevzuatTakipSweep(testEnv, new Date('2026-08-17T12:00:00.000Z'));
		expect(anthropicCalls).toHaveLength(1);
		expect(rows.size).toBe(2);
	});

	it('yanıt "DEĞİŞİKLİK VAR" ile başlarsa degisiklikVarMi=evet olarak kaydeder', async () => {
		const { rows } = stubApis([], 'DEĞİŞİKLİK VAR\nBACP kuralları güncellendi, bkz. şu link.');
		await runMevzuatTakipSweep(testEnv, new Date('2026-08-17T12:00:00.000Z'));
		const eklenen = rows.get(2)!;
		expect(eklenen[2]).toBe('evet');
	});

	it('Anthropic çağrısı web-arama aracını açık kullanır', async () => {
		stubApis([]);
		await runMevzuatTakipSweep(testEnv, new Date('2026-08-17T12:00:00.000Z'));
		const anthropicCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.find((c) =>
			String(c[0]).includes('api.anthropic.com'),
		)!;
		const body = JSON.parse(anthropicCall[1].body as string);
		expect(body.tools?.[0]?.type).toBe('web_search_20250305');
	});
});
