import type { Env } from '../types';

const PLACES_API = 'https://places.googleapis.com/v1/places:searchText';

export interface NearbyPlace {
	name: string;
	address: string;
	lat: number;
	lng: number;
}

// 1 derece enlem ~= 111,320 metre, sabit. 1 derece boylam ise enleme göre daralır (kutuplara
// yaklaştıkça meridyenler birbirine yaklaşır) — cos(enlem) ile düzeltiliyor. Bu, "yarıçap metre"yi
// Text Search'ün kabul ettiği dikdörtgen sınıra çevirmenin standart yöntemi.
const METERS_PER_DEGREE_LAT = 111320;

function boundingRectangle(lat: number, lng: number, radiusMeters: number) {
	const latDelta = radiusMeters / METERS_PER_DEGREE_LAT;
	const lngDelta = radiusMeters / (METERS_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180));
	return {
		low: { latitude: lat - latDelta, longitude: lng - lngDelta },
		high: { latitude: lat + latDelta, longitude: lng + lngDelta },
	};
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
	maxResultCount: number,
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
			// Bir Text Search çağrısı Google'a TEK istek olarak faturalanır, döndürülen sonuç
			// sayısından (1-20) bağımsız — bu parametre kota tüketimini azaltmaz, sadece Çiğdem'in
			// aynı arama içinde kaç sonuç görmek istediğini kontrol eder.
			maxResultCount,
			// Text Search (New)'de 'locationRestriction' sadece dikdörtgen (rectangle) kabul ediyor —
			// çember (circle) göndermek sessizce reddediliyor (400 değil, boş sonuç). Yarıçapı gerçek
			// bir dikdörtgen sınıra çeviriyoruz ki Çiğdem'in girdiği yarıçap gerçekten sınırlasın
			// ('locationBias' sadece "öncelik ver" demek, sınırı garanti etmezdi).
			locationRestriction: { rectangle: boundingRectangle(lat, lng, radiusMeters) },
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
