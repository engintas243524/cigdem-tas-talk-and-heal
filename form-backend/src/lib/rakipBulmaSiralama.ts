import type { NearbyPlace } from './places';

// Parametre Seti 1 — "Rakip Bulma/Sıralama" formülü (2026-08-17, kullanıcı isteği,
// bkz. RAKIP_SIRALAMA_KRITERLERI_ARASTIRMASI.md Bölüm 9). Bir aday havuzunu (Google Places arama
// sonuçları) 1-10 arası puanlayıp EN GÜÇLÜ/EN ALAKALI adayları öne çıkarır — Set 2'den ("Rakip
// Analiz", bkz. o raporun Bölüm 10) TAMAMEN AYRI ve BAĞIMSIZ bir formül, karıştırılmamalı.
//
// DÜRÜSTLÜK NOTU (rapor Bölüm 9.1'den): sektörde bile (otelcilik "competitive set" metodolojisi
// dahil) resmi/evrensel bir puanlama formülü yok — bu, KALİBRE EDİLMESİ gereken bir başlangıç
// taslağı, "kesin bilim" değil. Raporun önerdiği 5 bileşenli formülün SADELEŞTİRİLMİŞ 4 bileşenli
// bir versiyonu uygulandı — "tip eşleşme özgüllüğü" bileşeni düşürüldü çünkü elimizde bunu güvenilir
// ölçecek bir taksonomi/eşleştirme yok (Google'ın 'types' alanı ile serbest metin 'sorgu' arasında
// anlamlı bir eşleştirme kurmak ayrı bir araştırma gerektirir); bunun yerine Google'ın kendi
// "relevance" ön-filtrelemesine (arama sonuçlarının zaten kategoriyle alakalı gelmesi) güveniliyor.
// Kalibrasyon önerisi (rapor 9.3): Çiğdem'in elle eklediği (kaynak='manuel') mevcut rakiplerin bu
// formülden yüksek skor alıp almadığı kontrol edilerek ağırlıklar zamanla ayarlanabilir.
//
// Bu fonksiyon SADECE "Konum ile Rakip Ara" (tek bir adres+yarıçap araması) bağlamında kullanılıyor
// — bu yüzden hep YEREL (mesafe tabanlı) kolu uygulanıyor. Faz 3 (otomatik 5 yerel + 5 genel
// sınıflandırma, henüz yapılmadı) inşa edildiğinde, "genel" adaylar için mesafe yerine erişim
// sinyali (web sitesi + çoklu şube) kullanan ayrı bir kol eklenmesi gerekecek — bkz. rapor 9.3.

const AGIRLIK_PUAN = 0.35;
const AGIRLIK_YORUM_HACMI = 0.25;
const AGIRLIK_MESAFE = 0.25;
const AGIRLIK_PROFIL = 0.15;

// Google puanı için "mükemmel" referans yorum hacmi — bunun üstü ekstra puan getirmiyor (azalan
// getiri, log-ölçek zaten bunu kısmen yansıtıyor ama bir tavan koymak normalize'ı basitleştiriyor).
const REFERANS_YORUM_HACMI = 500;

function clamp01(x: number): number {
	if (Number.isNaN(x)) return 0;
	return Math.max(0, Math.min(1, x));
}

export interface RakipBulmaSkoru {
	place: NearbyPlace;
	skor: number; // 1-10
}

// mesafeMetre: arama merkezinden bu adaya olan mesafe. yaricapMetre: kullanıcının GİRDİĞİ (grid
// modunda bile İSTENEN, kapsanan değil) orijinal yarıçap — normalize referansı olarak bu kullanılır
// ki grid hücre sınırları normalize'ı bozmasın.
export function rakipBulmaSkoruHesapla(place: NearbyPlace, merkezLat: number, merkezLng: number, yaricapMetre: number): number {
	const puanNormalize = place.rating !== null ? clamp01((place.rating - 1) / 4) : 0.4; // puan yoksa hafif cezalı nötr değer
	const yorumNormalize =
		place.userRatingCount !== null && place.userRatingCount > 0
			? clamp01(Math.log(place.userRatingCount + 1) / Math.log(REFERANS_YORUM_HACMI + 1))
			: 0;
	const mesafeMetre = haversineMetre(merkezLat, merkezLng, place.lat, place.lng);
	const mesafeNormalize = clamp01(1 - mesafeMetre / Math.max(yaricapMetre, 1));
	const profilNormalize = place.websiteUri ? 1 : 0;

	const toplam =
		AGIRLIK_PUAN * puanNormalize +
		AGIRLIK_YORUM_HACMI * yorumNormalize +
		AGIRLIK_MESAFE * mesafeNormalize +
		AGIRLIK_PROFIL * profilNormalize;
	return Math.round(10 * clamp01(toplam) * 10) / 10; // 1 ondalık basamağa yuvarla
}

function haversineMetre(lat1: number, lng1: number, lat2: number, lng2: number): number {
	const R = 6371000;
	const toRad = (d: number) => (d * Math.PI) / 180;
	const dLat = toRad(lat2 - lat1);
	const dLng = toRad(lng2 - lng1);
	const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
	return 2 * R * Math.asin(Math.sqrt(a));
}

// Aşama 1 — Dahil Etme filtresi (rapor Bölüm 9.2): skorlamadan ÖNCE kalıcı kapanmış işletmeleri
// havuzdan tamamen çıkarır — bunlar hiçbir zaman "rakip" olarak gösterilmemeli.
export function kalicikapaliDegil(place: NearbyPlace): boolean {
	return place.businessStatus !== 'CLOSED_PERMANENTLY';
}

// Havuzu skorlayıp GÜÇLÜDEN ZAYIFA sıralar ve istenen sayıya kırpar. Grid aramadan gelen (60'ın
// üzerinde olabilen) birleşik/tekilleştirilmiş havuzu, kullanıcının istediği sonuç sayısına bu
// fonksiyon indirir — "hangi 60/40/20's'in gösterileceği" artık Google'ın kapalı "relevance"ine
// değil, bizim açık/dokümante formülümüze bağlı.
export function rakipHavuzunuSiralaVeKirp(
	places: NearbyPlace[],
	merkezLat: number,
	merkezLng: number,
	yaricapMetre: number,
	maxSonuc: number,
): NearbyPlace[] {
	return places
		.filter(kalicikapaliDegil)
		.map((place) => ({ place, skor: rakipBulmaSkoruHesapla(place, merkezLat, merkezLng, yaricapMetre) }))
		.sort((a, b) => b.skor - a.skor)
		.slice(0, maxSonuc)
		.map((x) => x.place);
}
