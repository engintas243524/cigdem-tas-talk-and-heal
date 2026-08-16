import { parametreSkorlariUret } from './rakipParametreSkor';
import { ensureRakipTakipGecmisTab, getRakipTakipGecmisi, type RakipTakipGecmisRow } from './rakipTakipGecmisSheets';
import {
	TALK_AND_HEAL_VARLIK_ID,
	GRAFIK_PERIYOT_TURLERI,
	RAKIP_TAKIP_PERIYOT_TURLERI,
	type RakipTakipPeriyotTuru,
	type GrafikPeriyotTuru,
} from '../config';
import type { RakipAnalizRow } from './rakipSheets';
import type { SheetRow, Env } from '../types';

// RakipTakip'in kendi state machine periyotTuru'su (6 değer) VE Grafik Verisi'nin genişletilmiş
// periyotTuru'su (10 değer, bkz. config.ts) için doğrulayıcılar — burada, tek yerde tutuluyor ki
// routes/rakipTakip.ts, routes/rakipAnalizi.ts ve scheduled.ts arasında dairesel import'a gerek
// kalmasın (routes/rakipTakip.ts zaten routes/rakipAnalizi.ts'den import ediyor, tersi olamaz).
export function gecerliPeriyotTuru(x: string): x is RakipTakipPeriyotTuru {
	return (RAKIP_TAKIP_PERIYOT_TURLERI as readonly string[]).includes(x);
}

export function gecerliGrafikPeriyotTuru(x: string): x is GrafikPeriyotTuru {
	return (GRAFIK_PERIYOT_TURLERI as readonly string[]).includes(x);
}

const GECERLI_GRAFIK_KAYNAKLARI = ['parametre20', 'randevuTrendi', 'rakipTakipGecmisi'] as const;
export type GrafikKaynagi = (typeof GECERLI_GRAFIK_KAYNAKLARI)[number];

// grafikKaynaklari body alanını doğrular/filtreler — geçersiz/boş/gönderilmemişse varsayilan döner
// (çağıran taraf geriye dönük davranışı korumak için ne isterse onu geçer, bkz. routes/rakipTakip.ts
// ve routes/rakipAnalizi.ts'deki kullanımlar).
export function gecerliGrafikKaynaklari(x: unknown, varsayilan: GrafikKaynagi[]): GrafikKaynagi[] {
	if (!Array.isArray(x) || !x.length) return varsayilan;
	const filtrelenmis = x
		.map((v) => String(v))
		.filter((v): v is GrafikKaynagi => (GECERLI_GRAFIK_KAYNAKLARI as readonly string[]).includes(v));
	return filtrelenmis.length ? filtrelenmis : varsayilan;
}

// "Grafik Verisi" özelliği (2026-08-16, kullanıcı isteği) — Aksiyon/Hedef Analizi ve Karşılaştırma
// raporlarının ortak kullandığı iki hesaplama. Karşılaştırma'nın zaten var olan RakipTakipGecmis
// tabanlı geçmiş grafiği (parametreSonuclari, routes/rakipTakip.ts) burada YOK — o zaten kendi
// tabanına sahip, saklanmış geçmiş veriyi okuyor; buradakiler tam tersine SORGU ANINDA (kalıcı
// hiçbir şey okumadan/yazmadan) hesaplanan iki YENİ kaynak.

export interface AnlikParametreSkoru {
	varlikAdi: string;
	skorlar: Record<string, number | null>;
}

// Talk and Heal + seçili rakip(ler) için AN'INDAKİ (geçmiş değil) 1-10 parametre skorunu üretir —
// RakipTakip'te dönem kapanışında kullanılan AYNI mekanizma (parametreSkorlariUret), ama burada
// hiçbir yere kaydedilmiyor, sadece bu tek rapor/grafik isteği için hesaplanıp dönülüyor. Her rakip
// başına 1 EK Claude çağrısı yapar (+ talkAndHealBaglam doluysa Talk and Heal için 1 tane daha) —
// çağıran route bu maliyeti kullanıcıya/yorumda açıkça belirtmeli. talkAndHealBaglam boş/undefined
// bırakılırsa Talk and Heal hiç skorlanmaz — icerikStrateji (Görsel/Video Stratejisi) kasıtlı olarak
// rakip-rakip/Talk-and-Heal karşılaştırması YAPMIYOR (bkz. ICERIK_STRATEJI_SYSTEM_PROMPT), o yüzden
// oradan çağrılırken sadece rakip skorları istenir, gereksiz bir Claude çağrısından kaçınılır.
export async function anlikParametreSkorlariGetir(
	env: Env,
	talkAndHealBaglam: string | null,
	rakipRows: { row: RakipAnalizRow }[],
	parametreAnahtarlari: string[],
): Promise<AnlikParametreSkoru[]> {
	const rakipSkorlari = await Promise.all(
		rakipRows.map(async ({ row }) => {
			const baglam = [row.isim, row.adres, row.not].filter(Boolean).join('\n');
			return { varlikAdi: row.isim, skorlar: await parametreSkorlariUret(env, baglam, parametreAnahtarlari) };
		}),
	);
	if (!talkAndHealBaglam) return rakipSkorlari;
	const talkAndHealSkorlari = await parametreSkorlariUret(env, talkAndHealBaglam, parametreAnahtarlari);
	return [{ varlikAdi: 'Talk and Heal', skorlar: talkAndHealSkorlari }, ...rakipSkorlari];
}

export interface RandevuTrendiNoktasi {
	tarih: string;
	aktif: number;
	iptal: number;
}

// Booking Sheet'inden aktif/iptal randevu sayısını periyotGunSayisi büyüklüğünde dilimlere ayırıp
// döner — en eski randevudan bugüne. maxBucket'ı aşan (ör. "haftalık" + yıllarca veri) durumlarda
// sadece en YENİ maxBucket dilimi döner, grafiğin onlarca yıllık boş dilimlerle şişmesini önler.
export function randevuTrendiHesapla(bookingRows: { row: SheetRow }[], periyotGunSayisi: number, maxBucket = 24): RandevuTrendiNoktasi[] {
	const gecerliTarihler = bookingRows.map(({ row }) => new Date(row.appointmentStartUtc).getTime()).filter((t) => Number.isFinite(t));
	if (!gecerliTarihler.length) return [];

	const periyotMs = periyotGunSayisi * 86400000;
	const enEskiBaslangic = Math.min(...gecerliTarihler);
	const simdi = Date.now();
	const toplamDilimSayisi = Math.max(1, Math.ceil((simdi - enEskiBaslangic) / periyotMs));
	const dilimSayisi = Math.min(toplamDilimSayisi, maxBucket);
	// maxBucket'a sığdırmak için başlangıcı ileri kaydır (en eski dilimleri atla, en yeniler kalsın).
	const baslangic = simdi - dilimSayisi * periyotMs;

	const dilimler: RandevuTrendiNoktasi[] = Array.from({ length: dilimSayisi }, (_, i) => ({
		tarih: new Date(baslangic + i * periyotMs).toISOString(),
		aktif: 0,
		iptal: 0,
	}));

	for (const { row } of bookingRows) {
		const t = new Date(row.appointmentStartUtc).getTime();
		if (!Number.isFinite(t) || t < baslangic) continue;
		const index = Math.min(dilimSayisi - 1, Math.floor((t - baslangic) / periyotMs));
		if (row.cancelledAt) dilimler[index].iptal++;
		else dilimler[index].aktif++;
	}

	return dilimler;
}

export interface RakipTakipGecmisSonucu {
	parametre: string;
	aciklama: string;
	talkAndHeal: { tarih: string; deger: number | null }[];
	rakip: { tarih: string; deger: number | null }[];
}

function skorAl(gecmis: RakipTakipGecmisRow, parametre: string): number | null {
	try {
		const parsed = JSON.parse(gecmis.parametreSkorlariJson) as Record<string, unknown>;
		const deger = parsed[parametre];
		return typeof deger === 'number' ? deger : null;
	} catch {
		return null;
	}
}

// Birden fazla rakibin AYNI dönem (donemBaslangicUtc) için skorlarının ortalamasını alır — farklı
// rakipler farklı tarihlerde eklenmiş olabilir, o yüzden tarihe göre GRUPLAMA yapılıyor, dizi
// index'i eşleştirmesi kullanılmıyor. Veri olmayan (null) skorlar ortalamaya katılmıyor; bir tarihte
// hiç veri yoksa o tarih hiç dönmüyor (grafikte boşluk — "veri yok" ile "sıfır" karışmasın).
function ortalamaSerisiHesapla(
	rakiplerGecmisleri: { gecmis: RakipTakipGecmisRow[] }[],
	parametre: string,
): { tarih: string; deger: number | null }[] {
	const tarihMap = new Map<string, number[]>();
	for (const { gecmis } of rakiplerGecmisleri) {
		for (const g of gecmis) {
			const skor = skorAl(g, parametre);
			if (skor === null) continue;
			const liste = tarihMap.get(g.donemBaslangicUtc) ?? [];
			liste.push(skor);
			tarihMap.set(g.donemBaslangicUtc, liste);
		}
	}
	return [...tarihMap.entries()]
		.sort((a, b) => a[0].localeCompare(b[0]))
		.map(([tarih, skorlar]) => ({ tarih, deger: Math.round((10 * skorlar.reduce((a, b) => a + b, 0)) / skorlar.length) / 10 }));
}

// RakipTakipGecmis'teki (dönem kapanışlarında biriken, son 12 periyotluk) geçmişi okuyup Talk and
// Heal ile seçilen rakib(ler)i grafik-hazır seriler halinde karşılaştırır. Hem Karşılaştırma
// raporunun hem Aksiyon/Hedef Analizi'nin "Grafik Verisi" bloğunun ORTAK kaynağı (2026-08-16,
// kullanıcı isteği) — önceden sadece Karşılaştırma'da vardı, mantık buraya taşındı. mod='1e1' tam
// olarak bir rakip ister (çağıran taraf doğrulamalı); mod='ortalama' birden fazla rakibin AYNI dönem
// için ortalamasını alır (bkz. ortalamaSerisiHesapla). Hiç veri yoksa null döner — çağıran taraf
// buna göre "henüz veri yok" mesajı gösterir.
export async function rakipTakipGecmisiGetir(
	env: Env,
	periyotTuru: RakipTakipPeriyotTuru,
	mod: '1e1' | 'ortalama',
	secilenRakipRows: { row: RakipAnalizRow }[],
	parametreAnahtarlari: string[],
	parametreAciklamalari: Record<string, string>,
): Promise<{ rakipEtiketi: string; parametreSonuclari: RakipTakipGecmisSonucu[] } | null> {
	await ensureRakipTakipGecmisTab(env);

	const talkAndHealGecmis = await getRakipTakipGecmisi(env, TALK_AND_HEAL_VARLIK_ID, periyotTuru);
	const rakiplerGecmisleri = await Promise.all(
		secilenRakipRows.map(async ({ row }) => ({ isim: row.isim, gecmis: await getRakipTakipGecmisi(env, row.id, periyotTuru) })),
	);

	if (!talkAndHealGecmis.length && !rakiplerGecmisleri.some((r) => r.gecmis.length)) return null;

	const rakipEtiketi = mod === '1e1' ? (secilenRakipRows[0]?.row.isim ?? 'Rakip') : `${secilenRakipRows.length} rakip ortalaması`;

	const parametreSonuclari: RakipTakipGecmisSonucu[] = parametreAnahtarlari.map((parametre) => {
		const talkAndHealSerisi = talkAndHealGecmis.map((g) => ({ tarih: g.donemBaslangicUtc, deger: skorAl(g, parametre) }));
		const rakipSerisi =
			mod === '1e1'
				? (rakiplerGecmisleri[0]?.gecmis ?? []).map((g) => ({ tarih: g.donemBaslangicUtc, deger: skorAl(g, parametre) }))
				: ortalamaSerisiHesapla(rakiplerGecmisleri, parametre);
		return { parametre, aciklama: parametreAciklamalari[parametre], talkAndHeal: talkAndHealSerisi, rakip: rakipSerisi };
	});

	return { rakipEtiketi, parametreSonuclari };
}
