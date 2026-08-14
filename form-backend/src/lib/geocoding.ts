import type { Env } from '../types';

const GEOCODING_API = 'https://maps.googleapis.com/maps/api/geocode/json';

export interface GeocodedLocation {
	lat: number;
	lng: number;
}

// Rakip Analizi'nin konum araması artık ham enlem/boylam yerine bir adres/semt metni alıyor
// (kullanıcı isteği — kimse kendi koordinatını bilmez) — bu, o metni Nearby Search'ün ihtiyaç
// duyduğu enlem/boylama çevirir. Aynı GOOGLE_PLACES_API_KEY kullanılıyor (aynı Cloud projesinde
// Geocoding API de enable edilmiş olmalı).
export async function geocodeAddress(env: Env, address: string): Promise<GeocodedLocation> {
	const url = `${GEOCODING_API}?address=${encodeURIComponent(address)}&key=${env.GOOGLE_PLACES_API_KEY}`;
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Geocoding API call failed: ${response.status} ${await response.text()}`);
	}
	const data = (await response.json()) as {
		status?: string;
		results?: { geometry?: { location?: { lat?: number; lng?: number } } }[];
	};
	const location = data.results?.[0]?.geometry?.location;
	if (data.status !== 'OK' || location?.lat == null || location?.lng == null) {
		throw new Error(`Adres bulunamadı: "${address}" (status: ${data.status ?? 'unknown'})`);
	}
	return { lat: location.lat, lng: location.lng };
}
