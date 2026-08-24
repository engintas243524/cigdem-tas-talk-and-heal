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
	it('accepts a score whose kanit is a verbatim quote from the source text', async () => {
		stubClaude('{"fiyat": {"puan": 8, "kanit": "Fiyatlar rakiplerden düşük"}, "konum": {"puan": 5, "kanit": "merkezi konumda"}}');
		const sonuc = await parametreSkorlariUret(env, 'Fiyatlar rakiplerden düşük, merkezi konumda.', ['fiyat', 'konum']);
		expect(sonuc).toEqual({ fiyat: 8, konum: 5 });
	});

	it('returns null for parameters the model reports as unknown', async () => {
		stubClaude('{"fiyat": {"puan": 8, "kanit": "Sadece fiyat bilgisi var"}, "konum": null}');
		const sonuc = await parametreSkorlariUret(env, 'Sadece fiyat bilgisi var.', ['fiyat', 'konum']);
		expect(sonuc).toEqual({ fiyat: 8, konum: null });
	});

	// KANIT ZORUNLULUĞU (2026-08-24) — asıl güvenlik garantisi burada test ediliyor. Modelin "asla
	// tahmin etme" talimatına UYMASINA güvenmiyoruz; model talimatı çiğnese/kanıt uydursa bile kod
	// bunu bağımsız olarak reddetmeli. Bu, prompt-seviyesindeki talimatın ÜSTÜNE eklenen deterministik
	// katman (bkz. lib/etikGate.ts'deki aynı desen) — garanti LLM'in dürüstlüğüne değil, string arama
	// işlemine dayanıyor.
	it('SECURITY: forces the score to null when the model fabricates a kanit that is NOT present in the source text', async () => {
		stubClaude(
			'{"webSitesi": {"puan": 5, "kanit": "Web sitesi çok profesyonel ve modern görünüyor"}, "markaGuveni": {"puan": 5, "kanit": "Sektörde çok güvenilir bir marka"}}',
		);
		// Kaynak metinde web sitesi veya marka güveniyle ilgili HİÇBİR şey yok — model bunu uydurdu.
		const sonuc = await parametreSkorlariUret(env, 'Vera Terapi Merkezi, Kadıköy. Instagramda haftada 3 paylaşım yapıyor.', [
			'webSitesi',
			'markaGuveni',
		]);
		expect(sonuc).toEqual({ webSitesi: null, markaGuveni: null });
	});

	it('SECURITY: forces the score to null when puan is given but kanit is missing entirely', async () => {
		stubClaude('{"fiyat": {"puan": 8}}');
		const sonuc = await parametreSkorlariUret(env, 'Fiyatlar rakiplerden düşük.', ['fiyat']);
		expect(sonuc).toEqual({ fiyat: null });
	});

	it('SECURITY: forces the score to null when the model reverts to the old bare-number format (no kanit object at all)', async () => {
		stubClaude('{"fiyat": 8}');
		const sonuc = await parametreSkorlariUret(env, 'Fiyatlar rakiplerden düşük.', ['fiyat']);
		expect(sonuc).toEqual({ fiyat: null });
	});

	it('SECURITY: rejects a trivially short/generic kanit even if it technically appears in the text', async () => {
		stubClaude('{"fiyat": {"puan": 8, "kanit": "ve"}}');
		const sonuc = await parametreSkorlariUret(env, 'Fiyatlar ucuz ve merkezi konumda.', ['fiyat']);
		expect(sonuc).toEqual({ fiyat: null });
	});

	it('accepts a kanit that matches after case/whitespace normalization (not overly brittle)', async () => {
		stubClaude('{"fiyat": {"puan": 7, "kanit": "FİYATLAR   rakiplerden Düşük"}}');
		const sonuc = await parametreSkorlariUret(env, 'Fiyatlar rakiplerden düşük.', ['fiyat']);
		expect(sonuc).toEqual({ fiyat: 7 });
	});

	it('handles the model wrapping JSON in prose/markdown by extracting the {...} block', async () => {
		stubClaude('İşte sonuç:\n```json\n{"fiyat": {"puan": 6, "kanit": "orta seviye fiyat"}}\n```\nUmarım yardımcı olur.');
		const sonuc = await parametreSkorlariUret(env, 'orta seviye fiyat sunuyor.', ['fiyat']);
		expect(sonuc).toEqual({ fiyat: 6 });
	});

	it('falls back to all-null when the response has no JSON at all', async () => {
		stubClaude('Üzgünüm, bu konuda yorum yapamam.');
		const sonuc = await parametreSkorlariUret(env, 'x', ['fiyat', 'konum']);
		expect(sonuc).toEqual({ fiyat: null, konum: null });
	});

	it('clamps out-of-range puan to null instead of trusting the model blindly', async () => {
		stubClaude('{"fiyat": {"puan": 15, "kanit": "çok pahalı fiyatlar"}, "konum": {"puan": "yüksek", "kanit": "merkezi konum"}}');
		const sonuc = await parametreSkorlariUret(env, 'çok pahalı fiyatlar, merkezi konum.', ['fiyat', 'konum']);
		expect(sonuc).toEqual({ fiyat: null, konum: null });
	});

	it('returns an empty object immediately when no parameters are requested (no API call)', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		const sonuc = await parametreSkorlariUret(env, 'x', []);
		expect(sonuc).toEqual({});
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
