import { env } from 'cloudflare:test';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { searchCompetitorsInArea, OPTIMAL_RADIUS_METERS } from '../src/lib/places';

afterEach(() => vi.unstubAllGlobals());

function rawPlace(overrides: Partial<{ id: string; name: string; address: string; lat: number; lng: number }> = {}) {
	return {
		id: overrides.id ?? Math.random().toString(36).slice(2),
		displayName: { text: overrides.name ?? 'Örnek Terapi Merkezi' },
		formattedAddress: overrides.address ?? '10 Example St, London',
		location: { latitude: overrides.lat ?? 51.5, longitude: overrides.lng ?? -0.1 },
	};
}

function page(places: ReturnType<typeof rawPlace>[], nextPageToken?: string) {
	return new Response(JSON.stringify({ places, ...(nextPageToken ? { nextPageToken } : {}) }), { status: 200 });
}

describe('searchCompetitorsInArea — tek alan (yarıçap <= OPTIMAL_RADIUS_METERS)', () => {
	it('maps Places Text Search results to NearbyPlace[]', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => page([rawPlace({ id: 'p1' })])),
		);
		const results = await searchCompetitorsInArea(env, 'psikolog', 51.5, -0.1, 2000, 20);
		expect(results.places).toEqual([
			{
				placeId: 'p1',
				name: 'Örnek Terapi Merkezi',
				address: '10 Example St, London',
				lat: 51.5,
				lng: -0.1,
				rating: null,
				userRatingCount: null,
				businessStatus: null,
				websiteUri: null,
			},
		]);
		expect(results.sayfaSayisi).toBe(1);
		expect(results.grid).toEqual({
			uygulandi: false,
			boyut: 1,
			kapsananYaricapMetre: 2000,
			istenenYaricapMetre: 2000,
			sinirlandirildiMi: false,
		});
	});

	it('returns an empty array when no places are found', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })),
		);
		const results = await searchCompetitorsInArea(env, 'psikolog', 51.5, -0.1, 2000, 20);
		expect(results.places).toEqual([]);
	});

	it('throws when the API call fails', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('bad request', { status: 400 })),
		);
		await expect(searchCompetitorsInArea(env, 'psikolog', 51.5, -0.1, 2000, 20)).rejects.toThrow(/400/);
	});

	it('sends a rectangle locationRestriction, not a circle (Text Search rejects circle silently)', async () => {
		const fetchMock = vi.fn(async () => page([]));
		vi.stubGlobal('fetch', fetchMock);
		await searchCompetitorsInArea(env, 'avukat', 41.0, 29.0, 1000, 20);
		const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
		expect(body.locationRestriction.rectangle).toBeDefined();
		expect(body.locationRestriction.circle).toBeUndefined();
		expect(body.locationBias).toBeUndefined();
	});

	it('forwards the caller-chosen result count instead of always requesting 20', async () => {
		const fetchMock = vi.fn(async () => page([]));
		vi.stubGlobal('fetch', fetchMock);
		await searchCompetitorsInArea(env, 'avukat', 41.0, 29.0, 1000, 5);
		const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
		expect(body.maxResultCount).toBe(5);
	});

	it('parses rating/userRatingCount/businessStatus/websiteUri when present', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							places: [
								{
									...rawPlace({ id: 'p2' }),
									rating: 4.5,
									userRatingCount: 120,
									businessStatus: 'OPERATIONAL',
									websiteUri: 'https://example.com',
								},
							],
						}),
						{ status: 200 },
					),
			),
		);
		const results = await searchCompetitorsInArea(env, 'psikolog', 51.5, -0.1, 2000, 20);
		expect(results.places[0]).toMatchObject({
			rating: 4.5,
			userRatingCount: 120,
			businessStatus: 'OPERATIONAL',
			websiteUri: 'https://example.com',
		});
	});

	it('paginates via nextPageToken when more than 20 results are requested, up to the 60 cap', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				page(
					Array.from({ length: 20 }, (_, i) => rawPlace({ id: `a${i}` })),
					'tok1',
				),
			)
			.mockResolvedValueOnce(
				page(
					Array.from({ length: 20 }, (_, i) => rawPlace({ id: `b${i}` })),
					'tok2',
				),
			)
			.mockResolvedValueOnce(page(Array.from({ length: 20 }, (_, i) => rawPlace({ id: `c${i}` }))));
		vi.stubGlobal('fetch', fetchMock);
		const results = await searchCompetitorsInArea(env, 'avukat', 41.0, 29.0, 1000, 60);
		expect(results.places).toHaveLength(60);
		expect(results.sayfaSayisi).toBe(3);
		const secondCallBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
		expect(secondCallBody.pageToken).toBe('tok1');
		expect(secondCallBody.textQuery).toBe('avukat');
	});

	it('deduplicates by placeId when the same place appears twice', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => page([rawPlace({ id: 'dup' }), rawPlace({ id: 'dup' }), rawPlace({ id: 'unique' })])),
		);
		const results = await searchCompetitorsInArea(env, 'avukat', 41.0, 29.0, 1000, 20);
		expect(results.places).toHaveLength(2);
	});
});

describe('searchCompetitorsInArea — grid (yarıçap > OPTIMAL_RADIUS_METERS)', () => {
	it('splits into a grid and merges results from every cell', async () => {
		const fetchMock = vi.fn(async () => page([rawPlace({ id: Math.random().toString() })]));
		vi.stubGlobal('fetch', fetchMock);
		const radius = OPTIMAL_RADIUS_METERS * 2; // 2x2 = 4 hücre gerektirir
		const results = await searchCompetitorsInArea(env, 'market', 41.0, 29.0, radius, 60);
		expect(results.grid).toEqual({
			uygulandi: true,
			boyut: 2,
			kapsananYaricapMetre: radius,
			istenenYaricapMetre: radius,
			sinirlandirildiMi: false,
		});
		expect(fetchMock).toHaveBeenCalledTimes(4); // 2x2 hücre, her biri 1 sayfa (1 sonuç < 60)
		expect(results.places).toHaveLength(4);
	});

	it('caps the grid at MAX_GRID_DIMENSION and reports sinirlandirildiMi when the requested radius is much larger', async () => {
		const fetchMock = vi.fn(async () => page([]));
		vi.stubGlobal('fetch', fetchMock);
		const radius = OPTIMAL_RADIUS_METERS * 10; // çok geniş — 3x3'e sınırlanmalı
		const results = await searchCompetitorsInArea(env, 'market', 41.0, 29.0, radius, 60);
		expect(results.grid.boyut).toBe(3);
		expect(results.grid.sinirlandirildiMi).toBe(true);
		expect(results.grid.kapsananYaricapMetre).toBe(3 * OPTIMAL_RADIUS_METERS);
		expect(results.grid.istenenYaricapMetre).toBe(radius);
		expect(fetchMock).toHaveBeenCalledTimes(9); // 3x3
	});

	it('deduplicates places that appear in more than one grid cell (boundary overlap)', async () => {
		const fetchMock = vi.fn(async () => page([rawPlace({ id: 'siniraki-isletme' })]));
		vi.stubGlobal('fetch', fetchMock);
		const radius = OPTIMAL_RADIUS_METERS * 2;
		const results = await searchCompetitorsInArea(env, 'market', 41.0, 29.0, radius, 60);
		expect(results.places).toHaveLength(1);
	});
});
