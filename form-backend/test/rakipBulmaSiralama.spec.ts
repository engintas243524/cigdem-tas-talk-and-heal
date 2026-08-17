import { describe, it, expect } from 'vitest';
import { rakipBulmaSkoruHesapla, kalicikapaliDegil, rakipHavuzunuSiralaVeKirp } from '../src/lib/rakipBulmaSiralama';
import type { NearbyPlace } from '../src/lib/places';

const MERKEZ = { lat: 41.0, lng: 29.0 };

function place(overrides: Partial<NearbyPlace> = {}): NearbyPlace {
	return {
		placeId: 'p1',
		name: 'Test İşletme',
		address: 'adres',
		lat: MERKEZ.lat,
		lng: MERKEZ.lng,
		rating: null,
		userRatingCount: null,
		businessStatus: null,
		websiteUri: null,
		...overrides,
	};
}

describe('rakipBulmaSkoruHesapla', () => {
	it('gives the highest score to a place at the center with a top rating, many reviews, and a website', () => {
		const skor = rakipBulmaSkoruHesapla(
			place({ rating: 5, userRatingCount: 500, websiteUri: 'https://x.com' }),
			MERKEZ.lat,
			MERKEZ.lng,
			2000,
		);
		expect(skor).toBeGreaterThan(9);
		expect(skor).toBeLessThanOrEqual(10);
	});

	it('gives a low score to a place with no rating, no reviews, no website, at the edge of the radius', () => {
		// yarıçap sınırında (mesafe ≈ yarıçap) bir konum
		const kenarLat = MERKEZ.lat + 2000 / 111320;
		const skor = rakipBulmaSkoruHesapla(place({ lat: kenarLat, lng: MERKEZ.lng }), MERKEZ.lat, MERKEZ.lng, 2000);
		expect(skor).toBeLessThan(2);
	});

	it('scores strictly higher for a closer place, all else equal', () => {
		const yakin = rakipBulmaSkoruHesapla(place({ rating: 4, userRatingCount: 50 }), MERKEZ.lat, MERKEZ.lng, 2000);
		const uzakLat = MERKEZ.lat + 1800 / 111320;
		const uzak = rakipBulmaSkoruHesapla(place({ rating: 4, userRatingCount: 50, lat: uzakLat }), MERKEZ.lat, MERKEZ.lng, 2000);
		expect(yakin).toBeGreaterThan(uzak);
	});

	it('never returns a score outside [0, 10]', () => {
		const skor = rakipBulmaSkoruHesapla(place({ rating: 1, userRatingCount: 0 }), MERKEZ.lat, MERKEZ.lng, 2000);
		expect(skor).toBeGreaterThanOrEqual(0);
		expect(skor).toBeLessThanOrEqual(10);
	});
});

describe('kalicikapaliDegil', () => {
	it('filters out CLOSED_PERMANENTLY places', () => {
		expect(kalicikapaliDegil(place({ businessStatus: 'CLOSED_PERMANENTLY' }))).toBe(false);
		expect(kalicikapaliDegil(place({ businessStatus: 'OPERATIONAL' }))).toBe(true);
		expect(kalicikapaliDegil(place({ businessStatus: null }))).toBe(true);
	});
});

describe('rakipHavuzunuSiralaVeKirp', () => {
	it('drops permanently-closed places, sorts by score descending, and trims to maxSonuc', () => {
		const havuz: NearbyPlace[] = [
			place({ placeId: 'zayif', rating: 2, userRatingCount: 1 }),
			place({ placeId: 'kapali', rating: 5, userRatingCount: 500, businessStatus: 'CLOSED_PERMANENTLY' }),
			place({ placeId: 'guclu', rating: 5, userRatingCount: 500, websiteUri: 'https://x.com' }),
		];
		const sonuc = rakipHavuzunuSiralaVeKirp(havuz, MERKEZ.lat, MERKEZ.lng, 2000, 1);
		expect(sonuc).toHaveLength(1);
		expect(sonuc[0].placeId).toBe('guclu');
	});
});
