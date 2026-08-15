import { env } from 'cloudflare:test';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { parametreSkorlariUret } from '../src/lib/rakipParametreSkor';

afterEach(() => vi.unstubAllGlobals());

function stubClaude(responseText: string) {
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => new Response(JSON.stringify({ content: [{ type: 'text', text: responseText }] }), { status: 200 })),
	);
}

describe('parametreSkorlariUret', () => {
	it('parses a clean JSON response into a score record', async () => {
		stubClaude('{"fiyat": 8, "konum": 5}');
		const sonuc = await parametreSkorlariUret(env, 'Fiyatlar rakiplerden düşük, merkezi konumda.', ['fiyat', 'konum']);
		expect(sonuc).toEqual({ fiyat: 8, konum: 5 });
	});

	it('returns null for parameters the model reports as unknown', async () => {
		stubClaude('{"fiyat": 8, "konum": null}');
		const sonuc = await parametreSkorlariUret(env, 'Sadece fiyat bilgisi var.', ['fiyat', 'konum']);
		expect(sonuc).toEqual({ fiyat: 8, konum: null });
	});

	it('handles the model wrapping JSON in prose/markdown by extracting the {...} block', async () => {
		stubClaude('İşte sonuç:\n```json\n{"fiyat": 6}\n```\nUmarım yardımcı olur.');
		const sonuc = await parametreSkorlariUret(env, 'x', ['fiyat']);
		expect(sonuc).toEqual({ fiyat: 6 });
	});

	it('falls back to all-null when the response has no JSON at all', async () => {
		stubClaude('Üzgünüm, bu konuda yorum yapamam.');
		const sonuc = await parametreSkorlariUret(env, 'x', ['fiyat', 'konum']);
		expect(sonuc).toEqual({ fiyat: null, konum: null });
	});

	it('clamps out-of-range or non-numeric values to null instead of trusting the model blindly', async () => {
		stubClaude('{"fiyat": 15, "konum": "yüksek", "hedefKitle": 0}');
		const sonuc = await parametreSkorlariUret(env, 'x', ['fiyat', 'konum', 'hedefKitle']);
		expect(sonuc).toEqual({ fiyat: null, konum: null, hedefKitle: null });
	});

	it('returns an empty object immediately when no parameters are requested (no API call)', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		const sonuc = await parametreSkorlariUret(env, 'x', []);
		expect(sonuc).toEqual({});
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
