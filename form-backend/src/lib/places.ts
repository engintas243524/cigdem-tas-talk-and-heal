import type { Env } from '../types';

const PLACES_API = 'https://places.googleapis.com/v1/places:searchText';

export interface NearbyPlace {
	name: string;
	address: string;
	lat: number;
	lng: number;
}

// Text Search (New) yerine bilinçli tercih edildi: Nearby Search'ün includedTypes'ı Google'ın
// sabit tip listesine bağlı (ör. 'psychotherapist', 'counselor') — bu tipler Türkiye'deki
// işletmelerde zayıf/eksik kapsanıyor ve Çiğdem'e ne arandığını göstermiyor. Text Search, Çiğdem'in
// kendi yazdığı serbest arama terimini (ör. "psikolog", "terapi merkezi", "avukat") kullanır —
// hem daha güvenilir sonuç verir hem de "ne aranıyor" tamamen Çiğdem'in kontrolünde olur.
export async function searchCompetitors(
	env: Env,
	textQuery: string,
	lat: number,
	lng: number,
	radiusMeters: number,
): Promise<NearbyPlace[]> {
	const response = await fetch(PLACES_API, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'x-goog-api-key': env.GOOGLE_PLACES_API_KEY,
			'x-goog-fieldmask': 'places.displayName,places.formattedAddress,places.location',
		},
		body: JSON.stringify({
			textQuery,
			maxResultCount: 20,
			locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius: radiusMeters } },
		}),
	});
	if (!response.ok) {
		throw new Error(`Google Places API call failed: ${response.status} ${await response.text()}`);
	}
	const data = (await response.json()) as {
		places?: { displayName?: { text?: string }; formattedAddress?: string; location?: { latitude?: number; longitude?: number } }[];
	};
	return (data.places ?? []).map((p) => ({
		name: p.displayName?.text ?? '',
		address: p.formattedAddress ?? '',
		lat: p.location?.latitude ?? 0,
		lng: p.location?.longitude ?? 0,
	}));
}
