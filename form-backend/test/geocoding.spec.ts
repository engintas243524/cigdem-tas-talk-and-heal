import { env } from 'cloudflare:test';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { geocodeAddress } from '../src/lib/geocoding';

afterEach(() => vi.unstubAllGlobals());

describe('geocodeAddress', () => {
	it('returns lat/lng for a resolvable address', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(JSON.stringify({ status: 'OK', results: [{ geometry: { location: { lat: 51.5, lng: -0.12 } } }] }), { status: 200 }),
			),
		);
		const result = await geocodeAddress(env, 'London Bridge, London');
		expect(result).toEqual({ lat: 51.5, lng: -0.12 });
	});

	it('throws when the address cannot be resolved', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify({ status: 'ZERO_RESULTS', results: [] }), { status: 200 })),
		);
		await expect(geocodeAddress(env, 'asdkfjhaslkdfj')).rejects.toThrow(/bulunamadı/);
	});

	it('throws when the API call fails', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('bad request', { status: 400 })),
		);
		await expect(geocodeAddress(env, 'London')).rejects.toThrow(/400/);
	});
});
