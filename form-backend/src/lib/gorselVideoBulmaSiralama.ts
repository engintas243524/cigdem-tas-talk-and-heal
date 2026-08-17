import { konuIcinVideolariGetir, type YoutubeVideoOzeti } from './youtube';
import type { Env } from '../types';

// Görsel/Video Stratejisi — Parametre Seti 1 "İçerik/Trend Bulma-Sıralama" (Faz 5, 2026-08-17).
// Kaynak: GORSEL_VIDEO_STRATEJISI_KRITERLERI_ARASTIRMASI.md Bölüm 2.6 — Rakip Analizi'nin
// lib/rakipBulmaSiralama.ts'iyle AYNI mimari desen (bulma/sıralama, Set 2'den TAMAMEN AYRI), ama
// farklı formül: Skor = 10 × [0.35×ilgi_orani + 0.30×doygunluk_tersi + 0.35×format_uygunlugu].
//
// DÜRÜSTLÜK NOTU (rakipBulmaSiralama.ts'teki aynı notun karşılığı): bu, araştırma raporunun
// taslak formülünün İLK somut/kodlanmış hali. Ağırlıklar (0.35/0.30/0.35) kalibre edilmemiş,
// araştırmanın kendi taslağından birebir alındı. Üç bileşenin YouTube alanlarına eşlenmesi
// (aşağıdaki 3 fonksiyon) bu oturumda yapılan bir tasarım kararı — bilimsel olarak doğrulanmış
// bir yöntem değil, makul bir ilk yaklaşım.

export interface KonuTrendSonucu {
	konu: string;
	skor: number; // 1-10
	ilgiOrani: number; // 0-1
	doygunlukTersi: number; // 0-1
	formatUygunlugu: number; // 0-1
	guncelVideoSayisi: number;
	toplamSonucSayisi: number;
}

function gunOncesiIso(gun: number, simdi: Date): string {
	return new Date(simdi.getTime() - gun * 86400000).toISOString();
}

// "Oran, ham sayı değil" (Google Trends normalizasyonu) + "velocity-vs-baseline" (GitHub trend
// mantığı, araştırma Bölüm 2.4) — konunun ŞU ANKİ izlenme hızının, KENDİ tarihsel ortalamasına
// oranı. Tarihsel karşılaştırma yapılamıyorsa (hiç geçmiş video yok) 0.5 (belirsiz) döner — 0
// (ilgi yok) değil, çünkü veri eksikliği "ilgisiz" anlamına gelmiyor.
export function ilgiOraniHesapla(guncelVideolar: YoutubeVideoOzeti[], gecmisVideolar: YoutubeVideoOzeti[], simdi: Date): number {
	const ortalamaHiz = (videolar: YoutubeVideoOzeti[]): number | null => {
		if (!videolar.length) return null;
		const toplam = videolar.reduce((acc, v) => {
			const gun = Math.max(1, (simdi.getTime() - new Date(v.publishedAt).getTime()) / 86400000);
			return acc + v.viewCount / gun;
		}, 0);
		return toplam / videolar.length;
	};
	const guncelHiz = ortalamaHiz(guncelVideolar);
	const gecmisHiz = ortalamaHiz(gecmisVideolar);
	if (guncelHiz === null) return 0;
	if (gecmisHiz === null || gecmisHiz === 0) return 0.5;
	return Math.max(0, Math.min(1, guncelHiz / gecmisHiz / 2));
}

// VidIQ/TubeBuddy "rekabet" mantığı (araştırma Bölüm 2.2) — konuyu kaç video zaten kapsıyor.
// Log ölçekli (rakipBulmaSiralama.ts'teki yorum sayısı normalizasyonuyla aynı desen): DOYGUNLUK_UST_SINIR
// kalibre edilmemiş bir sezgisel çapa, bilimsel olarak türetilmedi.
const DOYGUNLUK_UST_SINIR = 100000;

export function doygunlukTersiHesapla(toplamSonucSayisi: number): number {
	const doygunluk = Math.min(1, Math.log10(1 + toplamSonucSayisi) / Math.log10(1 + DOYGUNLUK_UST_SINIR));
	return 1 - doygunluk;
}

// JMIR Mental Health (2024-2025) bulgusu (araştırma Bölüm 2.7): 60-90sn kişisel-anlatı kısa-video
// bu sektörde damgalamayı azaltmada etkili — kısa-form (Shorts eşiğiyle uyumlu, 180sn) videoların
// ortalama izlenmesi uzun-formu geçiyorsa bu, Talk & Heal'in üretebileceği bir formatın konu için
// gerçekten işe yaradığının sinyali.
const KISA_FORM_UST_SINIR_SANIYE = 180;

export function formatUygunluguHesapla(guncelVideolar: YoutubeVideoOzeti[]): number {
	const kisa = guncelVideolar.filter((v) => v.durationSaniye > 0 && v.durationSaniye <= KISA_FORM_UST_SINIR_SANIYE);
	const uzun = guncelVideolar.filter((v) => v.durationSaniye > KISA_FORM_UST_SINIR_SANIYE);
	if (!kisa.length && !uzun.length) return 0.5;
	if (!uzun.length) return 0.75; // sadece kısa-form var — JMIR bulgusu lehine hafif ağırlık
	if (!kisa.length) return 0.35; // sadece uzun-form var
	const ortalama = (liste: YoutubeVideoOzeti[]) => liste.reduce((a, v) => a + v.viewCount, 0) / liste.length;
	const kisaOrt = ortalama(kisa);
	const uzunOrt = ortalama(uzun);
	const toplam = kisaOrt + uzunOrt;
	return toplam > 0 ? Math.max(0, Math.min(1, kisaOrt / toplam)) : 0.5;
}

export function konuSkoruHesapla(
	konu: string,
	guncelVideolar: YoutubeVideoOzeti[],
	gecmisVideolar: YoutubeVideoOzeti[],
	toplamSonucSayisi: number,
	simdi: Date = new Date(),
): KonuTrendSonucu {
	const ilgiOrani = ilgiOraniHesapla(guncelVideolar, gecmisVideolar, simdi);
	const doygunlukTersi = doygunlukTersiHesapla(toplamSonucSayisi);
	const formatUygunlugu = formatUygunluguHesapla(guncelVideolar);
	const skor = 10 * (0.35 * ilgiOrani + 0.3 * doygunlukTersi + 0.35 * formatUygunlugu);
	return {
		konu,
		skor: Math.round(skor * 10) / 10,
		ilgiOrani,
		doygunlukTersi,
		formatUygunlugu,
		guncelVideoSayisi: guncelVideolar.length,
		toplamSonucSayisi,
	};
}

const GUNCEL_PENCERE_GUN = 30;
// Geçmiş pencere: 180-210 gün önce (~6-7 ay), güncel pencereyle aynı genişlikte (30 gün) — adil
// bir "hız" karşılaştırması için iki pencerenin süresi eşit olmalı.
const GECMIS_PENCERE_BASLANGIC_GUN = 210;
const GECMIS_PENCERE_BITIS_GUN = 180;

// Tek bir konu için gerçek YouTube verisiyle Set 1 skorunu hesaplar — 2 search.list (~200 ünite)
// + videos.list (~ihmal edilebilir) çağrısı yapar.
export async function konuTrendSkoruGetir(env: Env, konu: string, simdi: Date = new Date()): Promise<KonuTrendSonucu> {
	const [guncel, gecmis] = await Promise.all([
		konuIcinVideolariGetir(env, konu, gunOncesiIso(GUNCEL_PENCERE_GUN, simdi)),
		konuIcinVideolariGetir(env, konu, gunOncesiIso(GECMIS_PENCERE_BASLANGIC_GUN, simdi), gunOncesiIso(GECMIS_PENCERE_BITIS_GUN, simdi)),
	]);
	return konuSkoruHesapla(konu, guncel.videolar, gecmis.videolar, guncel.toplamSonucSayisi, simdi);
}

// Aday konu listesini gerçek skorlarına göre büyükten küçüğe sıralar.
export async function konuHavuzunuSirala(env: Env, konular: string[], simdi: Date = new Date()): Promise<KonuTrendSonucu[]> {
	const sonuclar = await Promise.all(konular.map((konu) => konuTrendSkoruGetir(env, konu, simdi)));
	return sonuclar.sort((a, b) => b.skor - a.skor);
}
