import type { Env } from '../types';

const PLACES_API = 'https://places.googleapis.com/v1/places:searchText';
const PLACE_DETAILS_API = 'https://places.googleapis.com/v1/places';

export interface NearbyPlace {
	placeId: string;
	name: string;
	address: string;
	lat: number;
	lng: number;
	rating: number | null;
	userRatingCount: number | null;
	businessStatus: string | null; // 'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY' | null (Google döndürmezse)
	websiteUri: string | null;
}

// 1 derece enlem ~= 111,320 metre, sabit. 1 derece boylam ise enleme göre daralır (kutuplara
// yaklaştıkça meridyenler birbirine yaklaşır) — cos(enlem) ile düzeltiliyor. Bu, "yarıçap metre"yi
// Text Search'ün kabul ettiği dikdörtgen sınıra çevirmenin standart yöntemi.
const METERS_PER_DEGREE_LAT = 111320;

function offsetKonum(lat: number, lng: number, metersKuzey: number, metersDogu: number) {
	const latDelta = metersKuzey / METERS_PER_DEGREE_LAT;
	const lngDelta = metersDogu / (METERS_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180));
	return { lat: lat + latDelta, lng: lng + lngDelta };
}

function boundingRectangle(lat: number, lng: number, radiusMeters: number) {
	const latDelta = radiusMeters / METERS_PER_DEGREE_LAT;
	const lngDelta = radiusMeters / (METERS_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180));
	return {
		low: { latitude: lat - latDelta, longitude: lng - lngDelta },
		high: { latitude: lat + latDelta, longitude: lng + lngDelta },
	};
}

// Google'ın Text Search (New) tek SAYFA sınırı 20 — ama resmi dokümantasyona göre 'nextPageToken'
// ile sayfalayarak toplamda 60'a kadar sonuç almak mümkün (her sayfa ayrı faturalanan ayrı bir
// istek). `sayfaSayisi` çağırana kaç gerçek Google isteği yapıldığını bildirir (kullanım/kota
// loglaması bunun üzerinden, sonuç sayısından değil — Google sayfa başına faturalandırıyor).
const TEK_SAYFA_SONUC_LIMIT = 20;
const TOPLAM_SONUC_UST_SINIR = 60;

// "Optimal arama yarıçapı" (2026-08-17, kullanıcı isteği + RAKIP_SIRALAMA_KRITERLERI_ARASTIRMASI.md
// Bölüm 8-9) — geniş bir yarıçapta yüzlerce aday olabilir ama Google TEK istekte en fazla 60 döner;
// bu, bilgi-erişiminde bilinen "precision/recall dilution" sorununu yaratır (havuz büyüdükçe
// alaka payı düşer). 3000m, yoğun bir şehir içi hizmet çekim alanı için makul bir sezgisel
// varsayılan (local-SEO sektör kaynaklarındaki "yerel rekabet" yarıçaplarıyla tutarlı) — bilimsel
// olarak TÜRETİLMİŞ bir optimum DEĞİL, kalibre edilmemiş bir başlangıç değeri (rapor Bölüm 9.1'deki
// dürüstlük notuyla aynı çekince geçerli). Bu değerin üzerindeki aramalar GRID (alt-bölge) taramaya
// düşer: OPTIMAL_RADIUS_METERS boyutunda hücrelere bölünüp her hücre ayrı ayrı taranır.
export const OPTIMAL_RADIUS_METERS = 3000;

// Grid boyutu (NxN hücre) üst sınırı — Cloudflare Worker'ın tek-istek subrequest tavanını (bkz.
// hata günlüğü BE-77) aşmamak için var. Her hücre en kötü ihtimalle TOPLAM_SONUC_UST_SINIR/
// TEK_SAYFA_SONUC_LIMIT = 3 Google isteği yapabilir; MAX_GRID_DIMENSION=3 → en fazla 9 hücre × 3
// sayfa = 27 Google isteği + ~6 sabit ek yük (kota kontrolü/geocode/log) = ~33, 50 sınırının
// altında güvenli bir pay bırakır.
const MAX_GRID_DIMENSION = 3;

export interface GridBilgisi {
	uygulandi: boolean;
	boyut: number; // NxN hücre (uygulandi=false ise 1)
	kapsananYaricapMetre: number; // gerçekte taranan yarıçap (istenenden küçük olabilir, bkz. sinirlandirildiMi)
	istenenYaricapMetre: number;
	sinirlandirildiMi: boolean; // true ise MAX_GRID_DIMENSION nedeniyle istenen yarıçapın TAMAMI taranamadı
}

interface RawApiPlace {
	id?: string;
	displayName?: { text?: string };
	formattedAddress?: string;
	location?: { latitude?: number; longitude?: number };
	rating?: number;
	userRatingCount?: number;
	businessStatus?: string;
	websiteUri?: string;
}

// Tek bir dikdörtgen alanı, sayfalama ile (60'a kadar) tarar. Grid modunda her hücre için, tekli
// modda tüm alan için bu fonksiyon çağrılır — ortak çekirdek burada.
async function dikdortgenAra(
	env: Env,
	textQuery: string,
	rectangle: ReturnType<typeof boundingRectangle>,
	hedefSonuc: number,
): Promise<{ places: NearbyPlace[]; sayfaSayisi: number }> {
	const places: NearbyPlace[] = [];
	let pageToken: string | undefined;
	let sayfaSayisi = 0;

	do {
		const response = await fetch(PLACES_API, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'x-goog-api-key': env.GOOGLE_PLACES_API_KEY,
				// nextPageToken üst-seviye bir alan — field mask'e eklenmezse Google onu response'a hiç
				// koymuyor ve sayfalama sessizce çalışmaz. rating/userRatingCount/businessStatus/websiteUri
				// (2026-08-17, Set 1 sıralama formülünün veri temeli — bkz. lib/rakipBulmaSiralama.ts) aynı
				// çağrının içinde ek alan istemenin ek maliyeti yok.
				'x-goog-fieldmask':
					'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.businessStatus,places.websiteUri,nextPageToken',
			},
			body: JSON.stringify(
				pageToken
					? // Google dokümantasyonu: sayfa 2+ isteklerinde textQuery/locationRestriction gibi diğer
						// alanlar İLK istekle AYNI kalmalı — bu yüzden hepsini tekrar gönderiyoruz, sadece
						// pageToken ekliyoruz.
						{
							textQuery,
							maxResultCount: TEK_SAYFA_SONUC_LIMIT,
							locationRestriction: { rectangle },
							pageToken,
						}
					: {
							textQuery,
							// Bir Text Search çağrısı Google'a TEK istek olarak faturalanır, döndürülen sonuç
							// sayısından (1-20) bağımsız — bu parametre kota tüketimini azaltmaz, sadece
							// aynı sayfada kaç sonuç görmek istediğimizi kontrol eder.
							maxResultCount: Math.min(hedefSonuc, TEK_SAYFA_SONUC_LIMIT),
							// Text Search (New)'de 'locationRestriction' sadece dikdörtgen (rectangle) kabul
							// ediyor — çember (circle) göndermek sessizce reddediliyor (400 değil, boş
							// sonuç). Yarıçapı gerçek bir dikdörtgen sınıra çeviriyoruz ki girilen yarıçap
							// gerçekten sınırlasın ('locationBias' sadece "öncelik ver" demek, sınırı garanti
							// etmezdi).
							locationRestriction: { rectangle },
						},
			),
		});
		if (!response.ok) {
			throw new Error(`Google Places API call failed: ${response.status} ${await response.text()}`);
		}
		sayfaSayisi++;
		const data = (await response.json()) as { places?: RawApiPlace[]; nextPageToken?: string };
		places.push(
			...(data.places ?? []).map((p) => ({
				placeId: p.id ?? '',
				name: p.displayName?.text ?? '',
				address: p.formattedAddress ?? '',
				lat: p.location?.latitude ?? 0,
				lng: p.location?.longitude ?? 0,
				rating: p.rating ?? null,
				userRatingCount: p.userRatingCount ?? null,
				businessStatus: p.businessStatus ?? null,
				websiteUri: p.websiteUri ?? null,
			})),
		);
		pageToken = places.length < hedefSonuc ? data.nextPageToken : undefined;
	} while (pageToken);

	return { places, sayfaSayisi };
}

function tekilPlaceListesi(places: NearbyPlace[]): NearbyPlace[] {
	const gorulen = new Set<string>();
	const sonuc: NearbyPlace[] = [];
	for (const p of places) {
		// placeId Google'ın kalıcı benzersiz kimliği — grid hücreleri çakıştığında (komşu hücre
		// sınırındaki bir işletme iki hücrede de dönebilir) bunun üzerinden tekilleştiriyoruz.
		// placeId boşsa (olağan dışı) isim+adres ile geri düş.
		const anahtar = p.placeId || `${p.name}|${p.address}`;
		if (gorulen.has(anahtar)) continue;
		gorulen.add(anahtar);
		sonuc.push(p);
	}
	return sonuc;
}

// Text Search (New) yerine bilinçli tercih edildi: Nearby Search'ün includedTypes'ı Google'ın
// sabit tip listesine bağlı (ör. 'psychotherapist', 'counselor') — bu tipler Türkiye'deki
// işletmelerde zayıf/eksik kapsanıyor ve Çiğdem'e ne arandığını göstermiyor. Text Search, Çiğdem'in
// kendi yazdığı serbest arama terimini (ör. "psikolog", "terapi merkezi", "avukat") kullanır —
// hem daha güvenilir sonuç verir hem de "ne aranıyor" tamamen Çiğdem'in kontrolünde olur.
//
// Grid arama (2026-08-17, kullanıcı isteği): girilen yarıçap OPTIMAL_RADIUS_METERS'ı aşarsa, tek
// büyük aramanın Google'ın 60-sonuç tavanında rastgele/alakalı-ama-eksik bir kesit döndürmesi
// yerine, alan OPTIMAL_RADIUS_METERS boyutunda NxN hücreye bölünüp HER hücre kendi 60'a kadar
// sonucunu döner — bu, aynı toplam alan için Google'a giden "gerçek aday sayısını" büyütür (recall
// artar). Bu TEK BAŞINA "ortalama veri" sorununu çözmez (bkz. rapor Bölüm 8) — çözüm, sonrasında
// candidate havuzunu rakipBulmaSiralama.ts'teki Set 1 formülüyle yeniden sıralayıp istenen sayıya
// kırpmaktan geçiyor (bkz. routes/rakipAnalizi.ts#handleRakipAra).
export async function searchCompetitorsInArea(
	env: Env,
	textQuery: string,
	lat: number,
	lng: number,
	radiusMeters: number,
	maxResultCount: number,
): Promise<{ places: NearbyPlace[]; sayfaSayisi: number; grid: GridBilgisi }> {
	const hedefSonucTekHucre = Math.min(maxResultCount, TOPLAM_SONUC_UST_SINIR);

	if (radiusMeters <= OPTIMAL_RADIUS_METERS) {
		const rect = boundingRectangle(lat, lng, radiusMeters);
		const { places, sayfaSayisi } = await dikdortgenAra(env, textQuery, rect, hedefSonucTekHucre);
		return {
			places: tekilPlaceListesi(places),
			sayfaSayisi,
			grid: { uygulandi: false, boyut: 1, kapsananYaricapMetre: radiusMeters, istenenYaricapMetre: radiusMeters, sinirlandirildiMi: false },
		};
	}

	const gerekenBoyut = Math.ceil(radiusMeters / OPTIMAL_RADIUS_METERS);
	const boyut = Math.min(gerekenBoyut, MAX_GRID_DIMENSION);
	const sinirlandirildiMi = boyut < gerekenBoyut;
	const kapsananYaricapMetre = sinirlandirildiMi ? boyut * OPTIMAL_RADIUS_METERS : radiusMeters;
	const hucreYaricapMetre = kapsananYaricapMetre / boyut;

	const tumPlaces: NearbyPlace[] = [];
	let toplamSayfaSayisi = 0;
	for (let i = 0; i < boyut; i++) {
		for (let j = 0; j < boyut; j++) {
			const kuzeyOfset = (2 * i + 1 - boyut) * hucreYaricapMetre;
			const doguOfset = (2 * j + 1 - boyut) * hucreYaricapMetre;
			const hucreMerkezi = offsetKonum(lat, lng, kuzeyOfset, doguOfset);
			const rect = boundingRectangle(hucreMerkezi.lat, hucreMerkezi.lng, hucreYaricapMetre);
			// Her hücre kendi başına OPTIMAL_RADIUS_METERS boyutunda (ya da küçüğü) — tek-hücre yolunun
			// aynı 60'a kadar sayfalama mantığını kullanır.
			const { places, sayfaSayisi } = await dikdortgenAra(env, textQuery, rect, Math.min(maxResultCount, TOPLAM_SONUC_UST_SINIR));
			tumPlaces.push(...places);
			toplamSayfaSayisi += sayfaSayisi;
		}
	}

	return {
		places: tekilPlaceListesi(tumPlaces),
		sayfaSayisi: toplamSayfaSayisi,
		grid: { uygulandi: true, boyut, kapsananYaricapMetre, istenenYaricapMetre: radiusMeters, sinirlandirildiMi },
	};
}

export interface PlaceReview {
	text: string;
	rating: number | null;
	publishTime: string | null;
}

interface RawApiReview {
	text?: { text?: string };
	rating?: number;
	publishTime?: string;
}

// Yorum METNİ, rating/userRatingCount'un aksine (searchCompetitorsInArea'da toplu çekilip
// rakipBulmaSiralama.ts'nin sıralama formülüne giriyor) HİÇ TOPLU çekilmiyor ve HİÇ SAKLANMIYOR —
// Google Maps Platform ToS'u (cloud.google.com/maps-platform/terms/maps-service-terms §3.2.3)
// puan/yorum/foto gibi "Atmosphere" alanlarının kalıcı depolanmasını yasaklıyor (aynı kısıt
// Sparrow'un RakipTakip modülü için de doğrulanmıştı, bkz. proje hafızası
// `project_rakiptakip_ajani` + `SPARROW_RAKIPTAKIP_CFO_VERI_KAYNAGI_ARASTIRMASI.md` §1.2). Bu
// fonksiyon SADECE routes/rakipAnalizi.ts'in rapor üretimi anında, tek bir seçili rakip için,
// canlı çağrılmalı — dönen metin doğrudan o anki Claude promptuna eklenip atılır, ASLA bir Sheet
// satırına/sütununa yazılmaz. Google en fazla 5 yorum döner (kendi API sınırı, bizim seçimimiz
// değil) — hangi 5'i döndüreceği Google'ın "en alakalı" sıralamasına bağlı.
export async function getPlaceReviews(env: Env, placeId: string): Promise<PlaceReview[]> {
	const response = await fetch(`${PLACE_DETAILS_API}/${encodeURIComponent(placeId)}`, {
		headers: {
			'x-goog-api-key': env.GOOGLE_PLACES_API_KEY,
			'x-goog-fieldmask': 'reviews',
		},
	});
	if (!response.ok) {
		throw new Error(`Google Place Details call failed: ${response.status} ${await response.text()}`);
	}
	const data = (await response.json()) as { reviews?: RawApiReview[] };
	return (data.reviews ?? []).map((r) => ({
		text: r.text?.text ?? '',
		rating: r.rating ?? null,
		publishTime: r.publishTime ?? null,
	}));
}
