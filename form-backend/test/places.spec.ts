import { env } from 'cloudflare:test';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { searchNearbyCompetitors } from '../src/lib/places';

afterEach(() => vi.unstubAllGlobals());

describe('searchNearbyCompetitors', () => {
	it('maps Places API results to NearbyPlace[]', async () => {
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
		const results = await searchNearbyCompetitors(env, 51.5, -0.1, 2000);
		expect(results).toEqual([{ name: 'Örnek Terapi Merkezi', address: '10 Example St, London', lat: 51.5, lng: -0.1 }]);
	});

	it('returns an empty array when no places are found', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })),
		);
		const results = await searchNearbyCompetitors(env, 51.5, -0.1, 2000);
		expect(results).toEqual([]);
	});

	it('throws when the API call fails', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('bad request', { status: 400 })),
		);
		await expect(searchNearbyCompetitors(env, 51.5, -0.1, 2000)).rejects.toThrow(/400/);
	});
});
