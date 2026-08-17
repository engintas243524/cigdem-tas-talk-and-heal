import { env } from 'cloudflare:test';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { searchCompetitors } from '../src/lib/places';

afterEach(() => vi.unstubAllGlobals());

describe('searchCompetitors', () => {
	it('maps Places Text Search results to NearbyPlace[]', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							places: [
								{
									displayName: { text: 'Örnek Terapi Merkezi' },
									formattedAddress: '10 Example St, London',
									location: { latitude: 51.5, longitude: -0.1 },
								},
							],
						}),
						{ status: 200 },
					),
			),
		);
		const results = await searchCompetitors(env, 'psikolog', 51.5, -0.1, 2000, 20);
		expect(results.places).toEqual([{ name: 'Örnek Terapi Merkezi', address: '10 Example St, London', lat: 51.5, lng: -0.1 }]);
		expect(results.sayfaSayisi).toBe(1);
	});

	it('returns an empty array when no places are found', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })),
		);
		const results = await searchCompetitors(env, 'psikolog', 51.5, -0.1, 2000, 20);
		expect(results.places).toEqual([]);
	});

	it('throws when the API call fails', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('bad request', { status: 400 })),
		);
		await expect(searchCompetitors(env, 'psikolog', 51.5, -0.1, 2000, 20)).rejects.toThrow(/400/);
	});

	it('sends a rectangle locationRestriction, not a circle (Text Search rejects circle silently)', async () => {
		const fetchMock = vi.fn(async () => new Response(JSON.stringify({ places: [] }), { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);
		await searchCompetitors(env, 'avukat', 41.0, 29.0, 1000, 20);
		const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
		expect(body.locationRestriction.rectangle).toBeDefined();
		expect(body.locationRestriction.circle).toBeUndefined();
		expect(body.locationBias).toBeUndefined();
	});

	it('forwards the caller-chosen result count instead of always requesting 20', async () => {
		const fetchMock = vi.fn(async () => new Response(JSON.stringify({ places: [] }), { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);
		await searchCompetitors(env, 'avukat', 41.0, 29.0, 1000, 5);
		const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
		expect(body.maxResultCount).toBe(5);
	});

	it('paginates via nextPageToken when more than 20 results are requested, up to the 60 cap', async () => {
		const page = (n: number, token?: string) =>
			new Response(
				JSON.stringify({
					places: Array.from({ length: n }, (_, i) => ({
						displayName: { text: `Yer ${i}` },
						formattedAddress: 'adres',
						location: { latitude: 1, longitude: 2 },
					})),
					...(token ? { nextPageToken: token } : {}),
				}),
				{ status: 200 },
			);
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(page(20, 'tok1'))
			.mockResolvedValueOnce(page(20, 'tok2'))
			.mockResolvedValueOnce(page(20));
		vi.stubGlobal('fetch', fetchMock);
		const results = await searchCompetitors(env, 'avukat', 41.0, 29.0, 1000, 60);
		expect(results.places).toHaveLength(60);
		expect(results.sayfaSayisi).toBe(3);
		const secondCallBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
		expect(secondCallBody.pageToken).toBe('tok1');
		expect(secondCallBody.textQuery).toBe('avukat');
	});

	it('stops requesting further pages once the caller-requested count is reached', async () => {
		const page = (n: number, token?: string) =>
			new Response(
				JSON.stringify({
					places: Array.from({ length: n }, (_, i) => ({
						displayName: { text: `Yer ${i}` },
						formattedAddress: 'a',
						location: { latitude: 1, longitude: 2 },
					})),
					...(token ? { nextPageToken: token } : {}),
				}),
				{ status: 200 },
			);
		const fetchMock = vi.fn().mockResolvedValueOnce(page(20, 'tok1')).mockResolvedValueOnce(page(5));
		vi.stubGlobal('fetch', fetchMock);
		const results = await searchCompetitors(env, 'avukat', 41.0, 29.0, 1000, 25);
		expect(results.places).toHaveLength(25);
		expect(results.sayfaSayisi).toBe(2);
	});
});
