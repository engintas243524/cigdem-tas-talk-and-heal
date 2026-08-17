import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, vi, afterEach } from 'vitest';
import worker from '../src';
import { signPanelToken } from '../src/lib/panel-auth';

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

const testEnv = {
	...env,
	PANEL_PASSWORD: 'correct-horse',
	PANEL_TOKEN_SECRET: 'panel-test-secret',
	ANTHROPIC_API_KEY: 'test-key',
	GOOGLE_PLACES_API_KEY: 'test-key',
	YOUTUBE_API_KEY: 'test-key',
} as typeof env;

function stubApis(opts: { anthropicText?: string } = {}) {
	const sheetsAppended: string[][] = [];
	const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		const method = init?.method ?? 'GET';
		if (url.includes('oauth2.googleapis.com')) {
			return new Response(JSON.stringify({ access_token: 'fake', expires_in: 3600 }), { status: 200 });
		}
		if (url.includes('?fields=sheets.properties')) {
			return new Response(
				JSON.stringify({ sheets: [{ properties: { sheetId: 1, title: 'RakipAnalizi', gridProperties: { columnCount: 20 } } }] }),
				{
					status: 200,
				},
			);
		}
		if (url.includes(':batchUpdate')) {
			const body = init?.body ? JSON.parse(init.body as string) : {};
			for (const req of body.requests ?? []) {
				if (req.deleteDimension) {
					const arrIndex = req.deleteDimension.range.startIndex - 1; // sheetsAppended[0] = sheet row 2 = dimension index 1
					if (arrIndex >= 0 && arrIndex < sheetsAppended.length) sheetsAppended.splice(arrIndex, 1);
				}
			}
			return new Response('{}', { status: 200 });
		}
		if (url.includes(':append') && method === 'POST') {
			const body = JSON.parse(init!.body as string);
			sheetsAppended.push(body.values[0]);
			return new Response(
				JSON.stringify({ updates: { updatedRange: `RakipAnalizi!A${sheetsAppended.length + 1}:I${sheetsAppended.length + 1}` } }),
				{
					status: 200,
				},
			);
		}
		if (url.includes('/values/') && method === 'PUT') {
			// rakip-duzelt (updateRakipAnalizRow) tek bir satırı YERİNDE günceller — range'deki satır
			// numarasını (ör. !A3) sheetsAppended[1]'e eşleyip o satırı gerçekten üzerine yazıyoruz,
			// aksi halde bu stub PUT'u sessizce yutar ve düzeltme hiç kalıcı olmamış gibi görünür.
			const rowMatch = decodeURIComponent(url).match(/!A(\d+)/);
			const rowNumber = rowMatch ? Number(rowMatch[1]) : null;
			const body = JSON.parse(init!.body as string) as { values: string[][] };
			if (rowNumber && rowNumber >= 2) sheetsAppended[rowNumber - 2] = body.values[0];
			return new Response('{}', { status: 200 });
		}
		if (url.includes('/values/') && method === 'GET') return new Response(JSON.stringify({ values: sheetsAppended }), { status: 200 });
		if (url.includes('places.googleapis.com')) {
			return new Response(
				JSON.stringify({
					places: [{ displayName: { text: 'Test Klinik' }, formattedAddress: 'Test Adres', location: { latitude: 1, longitude: 2 } }],
				}),
				{ status: 200 },
			);
		}
		if (url.includes('maps.googleapis.com/maps/api/geocode')) {
			return new Response(JSON.stringify({ status: 'OK', results: [{ geometry: { location: { lat: 51.5, lng: -0.1 } } }] }), {
				status: 200,
			});
		}
		if (url.includes('youtube/v3/search')) {
			return new Response(JSON.stringify({ items: [{ id: { videoId: 'yv1' } }], pageInfo: { totalResults: 100 } }), { status: 200 });
		}
		if (url.includes('youtube/v3/videos')) {
			return new Response(
				JSON.stringify({
					items: [
						{
							id: 'yv1',
							snippet: { title: 'Test Video', publishedAt: '2026-08-10T00:00:00Z' },
							statistics: { viewCount: '5000' },
							contentDetails: { duration: 'PT90S' },
						},
					],
				}),
				{ status: 200 },
			);
		}
		if (url.includes('api.anthropic.com')) {
			return new Response(JSON.stringify({ content: [{ type: 'text', text: opts.anthropicText ?? 'Üretilen rapor metni.' }] }), {
				status: 200,
			});
		}
		throw new Error(`Unexpected fetch in test: ${method} ${url}`);
	});
	vi.stubGlobal('fetch', fetchMock);
	return { sheetsAppended, fetchMock };
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
			body: JSON.stringify({ isim: 'Rakip Klinik', kaynak: 'manuel', not: "Instagram'da haftada 3 paylaşım yapıyor" }),
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
		const request = new Request('http://localhost/panel/rakip-analizi/rakip', {
			method: 'POST',
			body: JSON.stringify({ isim: 'X', kaynak: 'manuel' }),
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, testEnv, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(401);
	});
});

describe('GET /panel/rakip-analizi/rakip-ara', () => {
	it('geocodes the address and returns nearby places', async () => {
		stubApis();
		const response = await authedRequest(
			'/panel/rakip-analizi/rakip-ara?adres=' +
				encodeURIComponent('Notting Hill, London') +
				'&sorgu=' +
				encodeURIComponent('psikolog') +
				'&radiusMeters=2000',
		);
		expect(response.status).toBe(200);
		const data = (await response.json()) as { places: { name: string }[] };
		expect(data.places).toMatchObject([{ name: 'Test Klinik', address: 'Test Adres', lat: 1, lng: 2 }]);
	});

	it('rejects a missing address', async () => {
		stubApis();
		const response = await authedRequest('/panel/rakip-analizi/rakip-ara?adres=&sorgu=psikolog&radiusMeters=2000');
		expect(response.status).toBe(400);
	});

	it('rejects a missing search query', async () => {
		stubApis();
		const response = await authedRequest('/panel/rakip-analizi/rakip-ara?adres=London&sorgu=&radiusMeters=2000');
		expect(response.status).toBe(400);
	});

	it('rejects an invalid radius', async () => {
		stubApis();
		const response = await authedRequest('/panel/rakip-analizi/rakip-ara?adres=London&sorgu=psikolog&radiusMeters=0');
		expect(response.status).toBe(400);
	});
});

describe('GET /panel/rakip-analizi/rakip-liste', () => {
	it('lists manual and map-sourced competitors, newest first, excluding report rows', async () => {
		stubApis();
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-08-15T10:00:00.000Z'));
		await authedRequest('/panel/rakip-analizi/rakip', {
			method: 'POST',
			body: JSON.stringify({ isim: 'İlk Eklenen', kaynak: 'manuel', not: 'Eski not' }),
		});
		vi.setSystemTime(new Date('2026-08-15T10:05:00.000Z'));
		await authedRequest('/panel/rakip-analizi/rakip', {
			method: 'POST',
			body: JSON.stringify({
				isim: 'İkinci Eklenen',
				adres: 'Kadıköy',
				kaynak: 'harita',
				aramaAdres: 'kadıköy bahariye caddesi',
				aramaSorgu: 'avukat',
				aramaRadiusMeters: '500',
			}),
		});
		await authedRequest('/panel/rakip-analizi/icerik-strateji', {
			method: 'POST',
			body: JSON.stringify({ istek: 'Öneri istiyorum' }),
		});

		const response = await authedRequest('/panel/rakip-analizi/rakip-liste');
		expect(response.status).toBe(200);
		const data = (await response.json()) as {
			rakipler: { isim: string; kaynak: string; adres: string; aramaAdres: string; aramaSorgu: string; aramaRadiusMeters: string }[];
		};
		expect(data.rakipler).toHaveLength(2);
		expect(data.rakipler.map((r) => r.isim)).toEqual(['İkinci Eklenen', 'İlk Eklenen']);
		expect(data.rakipler.every((r) => r.kaynak === 'manuel' || r.kaynak === 'harita')).toBe(true);
		const haritaSonuc = data.rakipler.find((r) => r.isim === 'İkinci Eklenen')!;
		expect(haritaSonuc.aramaSorgu).toBe('avukat');
		expect(haritaSonuc.aramaAdres).toBe('kadıköy bahariye caddesi');
		expect(haritaSonuc.aramaRadiusMeters).toBe('500');
		const manuelSonuc = data.rakipler.find((r) => r.isim === 'İlk Eklenen')!;
		expect(manuelSonuc.aramaSorgu).toBe('');
	});

	it('rejects requests without a valid panel token', async () => {
		stubApis();
		const request = new Request('http://localhost/panel/rakip-analizi/rakip-liste');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, testEnv, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(401);
	});
});

describe('POST /panel/rakip-analizi/rakip-sil', () => {
	it('deletes only the selected competitor, leaving the rest intact', async () => {
		stubApis();
		const first = await authedRequest('/panel/rakip-analizi/rakip', {
			method: 'POST',
			body: JSON.stringify({ isim: 'Silinecek', kaynak: 'manuel' }),
		});
		const firstId = ((await first.json()) as { id: string }).id;
		await authedRequest('/panel/rakip-analizi/rakip', {
			method: 'POST',
			body: JSON.stringify({ isim: 'Kalacak', kaynak: 'manuel' }),
		});

		const delResponse = await authedRequest('/panel/rakip-analizi/rakip-sil', {
			method: 'POST',
			body: JSON.stringify({ ids: [firstId] }),
		});
		expect(delResponse.status).toBe(200);
		const delData = (await delResponse.json()) as { deleted: number };
		expect(delData.deleted).toBe(1);

		const listResponse = await authedRequest('/panel/rakip-analizi/rakip-liste');
		const listData = (await listResponse.json()) as { rakipler: { isim: string }[] };
		expect(listData.rakipler.map((r) => r.isim)).toEqual(['Kalacak']);
	});

	it('deletes two competitors in one call without deleting the wrong rows', async () => {
		stubApis();
		const ids: string[] = [];
		for (const isim of ['A', 'B', 'C']) {
			const r = await authedRequest('/panel/rakip-analizi/rakip', {
				method: 'POST',
				body: JSON.stringify({ isim: isim, kaynak: 'manuel' }),
			});
			ids.push(((await r.json()) as { id: string }).id);
		}
		const delResponse = await authedRequest('/panel/rakip-analizi/rakip-sil', {
			method: 'POST',
			body: JSON.stringify({ ids: [ids[0], ids[2]] }), // A ve C, B ortada kalmalı
		});
		const delData = (await delResponse.json()) as { deleted: number };
		expect(delData.deleted).toBe(2);

		const listResponse = await authedRequest('/panel/rakip-analizi/rakip-liste');
		const listData = (await listResponse.json()) as { rakipler: { isim: string }[] };
		expect(listData.rakipler.map((r) => r.isim)).toEqual(['B']);
	});

	it('rejects an empty id list', async () => {
		stubApis();
		const response = await authedRequest('/panel/rakip-analizi/rakip-sil', { method: 'POST', body: JSON.stringify({ ids: [] }) });
		expect(response.status).toBe(400);
	});

	it('rejects requests without a valid panel token', async () => {
		stubApis();
		const request = new Request('http://localhost/panel/rakip-analizi/rakip-sil', { method: 'POST', body: JSON.stringify({ ids: ['x'] }) });
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, testEnv, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(401);
	});
});

describe('POST /panel/rakip-analizi/rakip-duzelt', () => {
	// Rakip Ekle'nin seçmeli-alan (checkbox) düzenleme akışı için (2026-08-16, üçüncü geri
	// bildirim): sadece işaretlenen alanlar gönderilir, gerisi DOKUNULMADAN kalmalı.
	it('only updates fields explicitly sent, preserving everything else (partial update)', async () => {
		stubApis();
		const created = await authedRequest('/panel/rakip-analizi/rakip', {
			method: 'POST',
			body: JSON.stringify({ isim: 'Sabit İsim', adres: 'Sabit Adres', not: 'Sabit not', kaynak: 'manuel' }),
		});
		const id = ((await created.json()) as { id: string }).id;

		// Sadece not gönderiliyor — isim/adres/kaynak hiç gönderilmiyor.
		const response = await authedRequest('/panel/rakip-analizi/rakip-duzelt', {
			method: 'POST',
			body: JSON.stringify({ id, not: 'Sadece not değişti' }),
		});
		expect(response.status).toBe(200);

		const listResponse = await authedRequest('/panel/rakip-analizi/rakip-liste');
		const listData = (await listResponse.json()) as {
			rakipler: { isim: string; adres: string; kaynak: string; not: string }[];
		};
		expect(listData.rakipler[0]).toMatchObject({
			isim: 'Sabit İsim',
			adres: 'Sabit Adres',
			kaynak: 'manuel',
			not: 'Sadece not değişti',
		});
	});

	it('rejects explicitly clearing isim to empty, even in a partial update', async () => {
		stubApis();
		const created = await authedRequest('/panel/rakip-analizi/rakip', {
			method: 'POST',
			body: JSON.stringify({ isim: 'X', kaynak: 'manuel' }),
		});
		const id = ((await created.json()) as { id: string }).id;
		const response = await authedRequest('/panel/rakip-analizi/rakip-duzelt', { method: 'POST', body: JSON.stringify({ id, isim: '' }) });
		expect(response.status).toBe(400);
	});

	it('updates isim/adres/kaynak/not in place, without changing its id or adding a row', async () => {
		stubApis();
		const created = await authedRequest('/panel/rakip-analizi/rakip', {
			method: 'POST',
			body: JSON.stringify({ isim: 'Eski İsim', adres: 'Eski Adres', not: 'Eski not', kaynak: 'manuel' }),
		});
		const id = ((await created.json()) as { id: string }).id;

		const response = await authedRequest('/panel/rakip-analizi/rakip-duzelt', {
			method: 'POST',
			body: JSON.stringify({ id, isim: 'Yeni İsim', adres: 'Yeni Adres', kaynak: 'manuel', not: 'Yeni not' }),
		});
		expect(response.status).toBe(200);

		const listResponse = await authedRequest('/panel/rakip-analizi/rakip-liste');
		const listData = (await listResponse.json()) as { rakipler: { id: string; isim: string; adres: string; not: string }[] };
		expect(listData.rakipler).toHaveLength(1);
		expect(listData.rakipler[0]).toMatchObject({ id, isim: 'Yeni İsim', adres: 'Yeni Adres', not: 'Yeni not' });
	});

	// Kullanıcı geri bildirimi (2026-08-16, ikinci tur): "listedeki HER rakibin ... tüm başlıklara
	// ait düzenleme yapılabilsin" — ilk sürümdeki "sadece manuel" kısıtı burada kasıtlı kaldırıldı.
	it('allows editing a harita-sourced row too (no longer manuel-only)', async () => {
		stubApis();
		const created = await authedRequest('/panel/rakip-analizi/rakip', {
			method: 'POST',
			body: JSON.stringify({ isim: 'Haritadan Bulunan', kaynak: 'harita', adres: 'X' }),
		});
		const id = ((await created.json()) as { id: string }).id;

		const response = await authedRequest('/panel/rakip-analizi/rakip-duzelt', {
			method: 'POST',
			body: JSON.stringify({ id, isim: 'Düzeltildi', kaynak: 'harita', adres: 'X' }),
		});
		expect(response.status).toBe(200);
		const listResponse = await authedRequest('/panel/rakip-analizi/rakip-liste');
		const listData = (await listResponse.json()) as { rakipler: { isim: string }[] };
		expect(listData.rakipler[0].isim).toBe('Düzeltildi');
	});

	it('allows switching kaynak between manuel/harita', async () => {
		stubApis();
		const created = await authedRequest('/panel/rakip-analizi/rakip', {
			method: 'POST',
			body: JSON.stringify({ isim: 'X', kaynak: 'manuel' }),
		});
		const id = ((await created.json()) as { id: string }).id;
		const response = await authedRequest('/panel/rakip-analizi/rakip-duzelt', {
			method: 'POST',
			body: JSON.stringify({ id, isim: 'X', kaynak: 'harita' }),
		});
		expect(response.status).toBe(200);
		const listResponse = await authedRequest('/panel/rakip-analizi/rakip-liste');
		const listData = (await listResponse.json()) as { rakipler: { kaynak: string }[] };
		expect(listData.rakipler[0].kaynak).toBe('harita');
	});

	it('rejects an invalid kaynak', async () => {
		stubApis();
		const created = await authedRequest('/panel/rakip-analizi/rakip', {
			method: 'POST',
			body: JSON.stringify({ isim: 'X', kaynak: 'manuel' }),
		});
		const id = ((await created.json()) as { id: string }).id;
		const response = await authedRequest('/panel/rakip-analizi/rakip-duzelt', {
			method: 'POST',
			body: JSON.stringify({ id, isim: 'X', kaynak: 'bilinmeyen' }),
		});
		expect(response.status).toBe(400);
	});

	// nasilBulundu tek bir Sheet sütunu değil — düzenlenince ham metin aramaSorgu'ya yazılıp
	// aramaAdres/aramaRadiusMeters temizleniyor (bkz. handler yorumu).
	it('writes an edited nasilBulundu into aramaSorgu and clears aramaAdres/aramaRadiusMeters', async () => {
		stubApis();
		const created = await authedRequest('/panel/rakip-analizi/rakip', {
			method: 'POST',
			body: JSON.stringify({
				isim: 'X',
				kaynak: 'harita',
				aramaAdres: 'kadıköy',
				aramaSorgu: 'psikolog',
				aramaRadiusMeters: '2000',
			}),
		});
		const id = ((await created.json()) as { id: string }).id;
		const response = await authedRequest('/panel/rakip-analizi/rakip-duzelt', {
			method: 'POST',
			body: JSON.stringify({ id, isim: 'X', kaynak: 'harita', nasilBulundu: 'bir tanıdıktan duyuldu' }),
		});
		expect(response.status).toBe(200);
		const listResponse = await authedRequest('/panel/rakip-analizi/rakip-liste');
		const listData = (await listResponse.json()) as { rakipler: { aramaSorgu: string; aramaAdres: string; aramaRadiusMeters: string }[] };
		expect(listData.rakipler[0].aramaSorgu).toBe('bir tanıdıktan duyuldu');
		expect(listData.rakipler[0].aramaAdres).toBe('');
		expect(listData.rakipler[0].aramaRadiusMeters).toBe('');
	});

	it('updates the creation date (tarih) when a valid date is given, rejects an invalid one', async () => {
		stubApis();
		const created = await authedRequest('/panel/rakip-analizi/rakip', {
			method: 'POST',
			body: JSON.stringify({ isim: 'X', kaynak: 'manuel' }),
		});
		const id = ((await created.json()) as { id: string }).id;

		const kotu = await authedRequest('/panel/rakip-analizi/rakip-duzelt', {
			method: 'POST',
			body: JSON.stringify({ id, isim: 'X', kaynak: 'manuel', tarih: 'gecersiz-tarih' }),
		});
		expect(kotu.status).toBe(400);

		const iyi = await authedRequest('/panel/rakip-analizi/rakip-duzelt', {
			method: 'POST',
			body: JSON.stringify({ id, isim: 'X', kaynak: 'manuel', tarih: '2026-01-01T00:00:00.000Z' }),
		});
		expect(iyi.status).toBe(200);
		const listResponse = await authedRequest('/panel/rakip-analizi/rakip-liste');
		const listData = (await listResponse.json()) as { rakipler: { createdAtUtc: string }[] };
		expect(listData.rakipler[0].createdAtUtc).toBe('2026-01-01T00:00:00.000Z');
	});

	// link opsiyonel — Kayıtlı Rakipler tablosunun inline-edit formunda link alanı yok, o path
	// link göndermez ve mevcut değeri SİLMEMELİ (Rakip Ekle'nin ara-ve-düzenle akışı gönderiyor).
	it('only updates link when the field is explicitly sent, never clears it implicitly', async () => {
		stubApis();
		const created = await authedRequest('/panel/rakip-analizi/rakip', {
			method: 'POST',
			body: JSON.stringify({ isim: 'X', kaynak: 'manuel', link: 'https://eski-link.example' }),
		});
		const id = ((await created.json()) as { id: string }).id;

		await authedRequest('/panel/rakip-analizi/rakip-duzelt', {
			method: 'POST',
			body: JSON.stringify({ id, isim: 'X güncellendi', kaynak: 'manuel' }), // link YOK
		});
		let listResponse = await authedRequest('/panel/rakip-analizi/rakip-liste');
		let listData = (await listResponse.json()) as { rakipler: { link: string }[] };
		expect(listData.rakipler[0].link).toBe('https://eski-link.example');

		await authedRequest('/panel/rakip-analizi/rakip-duzelt', {
			method: 'POST',
			body: JSON.stringify({ id, isim: 'X güncellendi', kaynak: 'manuel', link: 'https://yeni-link.example' }),
		});
		listResponse = await authedRequest('/panel/rakip-analizi/rakip-liste');
		listData = (await listResponse.json()) as { rakipler: { link: string }[] };
		expect(listData.rakipler[0].link).toBe('https://yeni-link.example');
	});

	it('rejects an unknown id', async () => {
		stubApis();
		const response = await authedRequest('/panel/rakip-analizi/rakip-duzelt', {
			method: 'POST',
			body: JSON.stringify({ id: 'olmayan-id', isim: 'X', kaynak: 'manuel' }),
		});
		expect(response.status).toBe(404);
	});

	it('rejects an empty isim', async () => {
		stubApis();
		const created = await authedRequest('/panel/rakip-analizi/rakip', {
			method: 'POST',
			body: JSON.stringify({ isim: 'X', kaynak: 'manuel' }),
		});
		const id = ((await created.json()) as { id: string }).id;
		const response = await authedRequest('/panel/rakip-analizi/rakip-duzelt', {
			method: 'POST',
			body: JSON.stringify({ id, isim: '', kaynak: 'manuel' }),
		});
		expect(response.status).toBe(400);
	});

	it('requires panel auth', async () => {
		stubApis();
		const request = new Request('http://localhost/panel/rakip-analizi/rakip-duzelt', {
			method: 'POST',
			body: JSON.stringify({ id: 'x', isim: 'Y', kaynak: 'manuel' }),
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, testEnv, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(401);
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

	it('returns an empty etikBayraklari for a clean report', async () => {
		stubApis();
		const response = await authedRequest('/panel/rakip-analizi/icerik-strateji', {
			method: 'POST',
			body: JSON.stringify({ istek: 'Bu ay için Instagram içerik önerisi istiyorum' }),
		});
		const data = (await response.json()) as { etikBayraklari: unknown[] };
		expect(data.etikBayraklari).toEqual([]);
	});

	it('flags a report containing a banned pattern via the deterministic ethics gate', async () => {
		stubApis({ anthropicText: 'Garantili iyileşme sunuyoruz, hemen randevu al!' });
		const response = await authedRequest('/panel/rakip-analizi/icerik-strateji', {
			method: 'POST',
			body: JSON.stringify({ istek: 'Öneri istiyorum' }),
		});
		const data = (await response.json()) as { etikBayraklari: { kuralId: string }[] };
		expect(data.etikBayraklari.map((b) => b.kuralId)).toContain('tr-garanti-iyilesme');
	});

	it('konular verilmezse hiçbir YouTube çağrısı yapmaz, konuTrendleri boş döner', async () => {
		const { fetchMock } = stubApis();
		const response = await authedRequest('/panel/rakip-analizi/icerik-strateji', {
			method: 'POST',
			body: JSON.stringify({ istek: 'Öneri istiyorum' }),
		});
		const data = (await response.json()) as { konuTrendleri: unknown[] };
		expect(data.konuTrendleri).toEqual([]);
		expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('youtube'))).toBe(false);
	});

	it('konular verilirse YouTube ile skorlar ve prompta ekler', async () => {
		const { fetchMock } = stubApis();
		const response = await authedRequest('/panel/rakip-analizi/icerik-strateji', {
			method: 'POST',
			body: JSON.stringify({ istek: 'Öneri istiyorum', konular: ['kaygı yönetimi', 'ilişki iletişimi'] }),
		});
		const data = (await response.json()) as { konuTrendleri: { konu: string; skor: number }[] };
		expect(data.konuTrendleri).toHaveLength(2);
		expect(data.konuTrendleri.map((k) => k.konu).sort()).toEqual(['ilişki iletişimi', 'kaygı yönetimi']);
		const anthropicCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('api.anthropic.com'))!;
		const anthropicBody = JSON.parse((anthropicCall[1] as RequestInit).body as string);
		expect(anthropicBody.messages[0].content).toContain('kaygı yönetimi');
	});

	it('only includes the selected competitor(s) in the prompt, not unselected ones', async () => {
		const { fetchMock } = stubApis();
		const secilecek = await authedRequest('/panel/rakip-analizi/rakip', {
			method: 'POST',
			body: JSON.stringify({ isim: 'Seçilen Rakip', kaynak: 'manuel' }),
		});
		const secilecekId = ((await secilecek.json()) as { id: string }).id;
		await authedRequest('/panel/rakip-analizi/rakip', {
			method: 'POST',
			body: JSON.stringify({ isim: 'Seçilmeyen Rakip', kaynak: 'manuel' }),
		});

		await authedRequest('/panel/rakip-analizi/icerik-strateji', {
			method: 'POST',
			body: JSON.stringify({ istek: 'Öneri istiyorum', rakipIds: [secilecekId] }),
		});

		const anthropicCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('api.anthropic.com'))!;
		const anthropicBody = JSON.parse((anthropicCall[1] as RequestInit).body as string);
		expect(anthropicBody.messages[0].content).toContain('Seçilen Rakip');
		expect(anthropicBody.messages[0].content).not.toContain('Seçilmeyen Rakip');
	});

	it('includes İçe Aktar (kaynakBelgeler) text in the prompt', async () => {
		const { fetchMock } = stubApis();
		await authedRequest('/panel/rakip-analizi/icerik-strateji', {
			method: 'POST',
			body: JSON.stringify({ istek: 'Öneri istiyorum', kaynakBelgeler: ['İçe aktarılan belge içeriği burada.'] }),
		});
		const anthropicCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('api.anthropic.com'))!;
		const anthropicBody = JSON.parse((anthropicCall[1] as RequestInit).body as string);
		expect(anthropicBody.messages[0].content).toContain('İçe aktarılan belge içeriği burada.');
	});

	it('sends İçe Aktar PDFs (kaynakPdfler) as document content blocks, not inline text', async () => {
		const { fetchMock } = stubApis();
		await authedRequest('/panel/rakip-analizi/icerik-strateji', {
			method: 'POST',
			body: JSON.stringify({ istek: 'Öneri istiyorum', kaynakPdfler: ['ZmFrZS1wZGYtYnl0ZXM='] }),
		});
		const anthropicCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('api.anthropic.com'))!;
		const anthropicBody = JSON.parse((anthropicCall[1] as RequestInit).body as string);
		expect(Array.isArray(anthropicBody.messages[0].content)).toBe(true);
		const docBlock = anthropicBody.messages[0].content.find((b: { type: string }) => b.type === 'document');
		expect(docBlock.source).toEqual({ type: 'base64', media_type: 'application/pdf', data: 'ZmFrZS1wZGYtYnl0ZXM=' });
	});

	it("rejects with 402 once this month's icerikStrateji quota (12) is full, without calling Claude", async () => {
		const { sheetsAppended, fetchMock } = stubApis();
		const now = new Date().toISOString();
		for (let i = 0; i < 12; i++) sheetsAppended.push([`k${i}`, now, 'icerikStrateji', 'önceki rapor']);

		const response = await authedRequest('/panel/rakip-analizi/icerik-strateji', {
			method: 'POST',
			body: JSON.stringify({ istek: 'Öneri istiyorum' }),
		});
		expect(response.status).toBe(402);
		const data = (await response.json()) as { error: string };
		expect(data.error).toContain('Görsel/Video Stratejisi kotası doldu');
		expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('api.anthropic.com'))).toBe(false);
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

	it('flags a report containing a BACP-regime banned pattern via the deterministic ethics gate', async () => {
		stubApis({ anthropicText: 'We guarantee a full recovery in 6 sessions.' });
		const response = await authedRequest('/panel/rakip-analizi/aksiyon-analiz', {
			method: 'POST',
			body: JSON.stringify({ yorum: 'Bu ay randevular azaldı' }),
		});
		const data = (await response.json()) as { etikBayraklari: { kuralId: string; rejim: string }[] };
		expect(data.etikBayraklari.map((b) => b.kuralId)).toContain('bacp-guarantee-outcome');
	});

	it('includes selected competitor data in the prompt when rakipIds is given', async () => {
		const { fetchMock } = stubApis();
		const rakipRes = await authedRequest('/panel/rakip-analizi/rakip', {
			method: 'POST',
			body: JSON.stringify({ isim: 'Kıyaslanacak Rakip', kaynak: 'manuel' }),
		});
		const rakipId = ((await rakipRes.json()) as { id: string }).id;

		await authedRequest('/panel/rakip-analizi/aksiyon-analiz', {
			method: 'POST',
			body: JSON.stringify({ yorum: 'Bu ay randevular azaldı', rakipIds: [rakipId] }),
		});

		const anthropicCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('api.anthropic.com'))!;
		const anthropicBody = JSON.parse((anthropicCall[1] as RequestInit).body as string);
		expect(anthropicBody.messages[0].content).toContain('Kıyaslanacak Rakip');
		expect(anthropicBody.messages[0].content).toContain('Seçilen rakip verisi');
	});

	it('omits the competitor section entirely when no rakipIds are given', async () => {
		const { fetchMock } = stubApis();
		await authedRequest('/panel/rakip-analizi/aksiyon-analiz', { method: 'POST', body: JSON.stringify({ yorum: 'Yorum' }) });
		const anthropicCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('api.anthropic.com'))!;
		const anthropicBody = JSON.parse((anthropicCall[1] as RequestInit).body as string);
		expect(anthropicBody.messages[0].content).not.toContain('Seçilen rakip verisi');
	});

	it("rejects with 402 once this month's aksiyonAnaliz quota (13) is full, without calling Claude", async () => {
		const { sheetsAppended, fetchMock } = stubApis();
		const now = new Date().toISOString();
		for (let i = 0; i < 13; i++) sheetsAppended.push([`k${i}`, now, 'aksiyonAnaliz', 'önceki rapor']);

		const response = await authedRequest('/panel/rakip-analizi/aksiyon-analiz', {
			method: 'POST',
			body: JSON.stringify({ yorum: 'Bu ay randevular azaldı' }),
		});
		expect(response.status).toBe(402);
		const data = (await response.json()) as { error: string };
		expect(data.error).toContain('Aksiyon/Hedef Analizi kotası doldu');
		expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('api.anthropic.com'))).toBe(false);
	});
});

describe('POST /panel/rakip-analizi/ice-aktar', () => {
	it('extracts text from a plain .txt file (base64)', async () => {
		stubApis();
		const veri = Buffer.from('Merhaba dünya, bu bir test dosyasıdır.', 'utf8').toString('base64');
		const response = await authedRequest('/panel/rakip-analizi/ice-aktar', {
			method: 'POST',
			body: JSON.stringify({ tur: 'dosya', dosyaAdi: 'test.txt', uzanti: 'txt', veri }),
		});
		expect(response.status).toBe(200);
		const data = (await response.json()) as { metin: string };
		expect(data.metin).toBe('Merhaba dünya, bu bir test dosyasıdır.');
	});

	it('extracts text from a minimal real .docx (zip of word/document.xml)', async () => {
		stubApis();
		const { zipSync, strToU8 } = await import('fflate');
		const documentXml =
			'<?xml version="1.0"?><w:document xmlns:w="ns"><w:body>' +
			'<w:p><w:r><w:t>Birinci paragraf.</w:t></w:r></w:p>' +
			'<w:p><w:r><w:t>İkinci paragraf.</w:t></w:r></w:p>' +
			'</w:body></w:document>';
		const zipped = zipSync({ 'word/document.xml': strToU8(documentXml) });
		const veri = Buffer.from(zipped).toString('base64');
		const response = await authedRequest('/panel/rakip-analizi/ice-aktar', {
			method: 'POST',
			body: JSON.stringify({ tur: 'dosya', dosyaAdi: 'test.docx', uzanti: 'docx', veri }),
		});
		expect(response.status).toBe(200);
		const data = (await response.json()) as { metin: string };
		expect(data.metin).toBe('Birinci paragraf.\nİkinci paragraf.');
	});

	it('rejects an unsupported file extension', async () => {
		stubApis();
		const response = await authedRequest('/panel/rakip-analizi/ice-aktar', {
			method: 'POST',
			body: JSON.stringify({ tur: 'dosya', dosyaAdi: 'test.exe', uzanti: 'exe', veri: btoa('x') }),
		});
		expect(response.status).toBe(400);
		const data = (await response.json()) as { error: string };
		expect(data.error).toContain('Desteklenmeyen');
	});

	it('rejects a file upload with no veri', async () => {
		stubApis();
		const response = await authedRequest('/panel/rakip-analizi/ice-aktar', {
			method: 'POST',
			body: JSON.stringify({ tur: 'dosya', dosyaAdi: 'test.txt', uzanti: 'txt' }),
		});
		expect(response.status).toBe(400);
	});

	it('scrapes text from a web link', async () => {
		const { fetchMock } = stubApis();
		fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url === 'https://example.com/makale') {
				return new Response('<html><body><p>Makale içeriği burada.</p></body></html>', {
					status: 200,
					headers: { 'content-type': 'text/html' },
				});
			}
			throw new Error(`Unexpected fetch in test: ${url}`);
		});
		const response = await authedRequest('/panel/rakip-analizi/ice-aktar', {
			method: 'POST',
			body: JSON.stringify({ tur: 'link', url: 'https://example.com/makale' }),
		});
		expect(response.status).toBe(200);
		const data = (await response.json()) as { metin: string };
		expect(data.metin).toContain('Makale içeriği burada.');
	});

	it('rejects YouTube links (transcript extraction not supported yet)', async () => {
		stubApis();
		const response = await authedRequest('/panel/rakip-analizi/ice-aktar', {
			method: 'POST',
			body: JSON.stringify({ tur: 'link', url: 'https://www.youtube.com/watch?v=abc123' }),
		});
		expect(response.status).toBe(400);
		const data = (await response.json()) as { error: string };
		expect(data.error).toContain('YouTube');
	});

	it('requires panel auth', async () => {
		stubApis();
		const request = new Request('http://localhost/panel/rakip-analizi/ice-aktar', {
			method: 'POST',
			body: JSON.stringify({ tur: 'dosya', dosyaAdi: 'test.txt', uzanti: 'txt', veri: btoa('x') }),
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, testEnv, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(401);
	});
});
