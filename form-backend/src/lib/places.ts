import type { Env } from '../types';

const PLACES_API = 'https://places.googleapis.com/v1/places:searchNearby';
// Terapi/danışmanlık/wellness pratiği ile örtüşen Google Places tipleri — geniş tutuluyor,
// Çiğdem sonuçları kendi gözüyle eleyecek.
const INCLUDED_TYPES = ['psychotherapist', 'counselor', 'wellness_center', 'doctor'];

export interface NearbyPlace {
	name: string;
	address: string;
	lat: number;
	lng: number;
}

export async function searchNearbyCompetitors(env: Env, lat: number, lng: number, radiusMeters: number): Promise<NearbyPlace[]> {
	const response = await fetch(PLACES_API, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'x-goog-api-key': env.GOOGLE_PLACES_API_KEY,
			'x-goog-fieldmask': 'places.displayName,places.formattedAddress,places.location',
		},
		body: JSON.stringify({
			includedTypes: INCLUDED_TYPES,
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
