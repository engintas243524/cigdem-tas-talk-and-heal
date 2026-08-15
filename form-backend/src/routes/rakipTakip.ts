import { getAllRows } from '../lib/sheets';
import { getAllRakipAnalizRows, ensureRakipAnaliziTab } from '../lib/rakipSheets';
import { ensureRakipTakipTab, getAllRakipTakipRows, getRakipTakipDurumu, updateRakipTakipRow } from '../lib/rakipTakipSheets';
import { generateReport, InsufficientCreditError } from '../lib/claude';
import { errorResponse, json } from '../lib/http';
import { ensureKullanimKaydiTab, logKullanim } from '../lib/kullanimKaydi';
import { rakipOzetOlustur, AKSIYON_ANALIZ_SYSTEM_PROMPT, ICERIK_STRATEJI_SYSTEM_PROMPT } from './rakipAnalizi';
import { RAKIP_TAKIP_PERIYOT_TURLERI, RAKIP_TAKIP_PERIYOT_GUN_SAYISI, type RakipTakipPeriyotTuru } from '../config';
import type { Env, SheetRow } from '../types';

const ANTHROPIC_BILLING_URL = 'https://console.anthropic.com/settings/billing';

function gecerliPeriyotTuru(x: string): x is RakipTakipPeriyotTuru {
	return (RAKIP_TAKIP_PERIYOT_TURLERI as readonly string[]).includes(x);
}

// Bir dönem içinde (appointmentStartUtc bazlı) kaç randevu aktif/iptal oldu — bu, "realizasyon"un
// sayısal kısmı. Bilerek Claude'a bırakılmıyor: rakam Claude'a hesaplattırılırsa halüsinasyon
// riski var, sayım deterministik olmalı. Gap'in NİTELİKSEL yorumu (neden sapma oldu) ayrı bir
// adımda Claude'a bırakılıyor (bkz. handleRakipTakipUret'in 'kapatildi' dalı).
function donemRealizasyonuHesapla(bookingRows: { row: SheetRow }[], baslangicUtc: string, bitisUtc: string): string {
	const basla = new Date(baslangicUtc).getTime();
	const bitis = new Date(bitisUtc).getTime();
	const donemIcindekiler = bookingRows.filter(({ row }) => {
		const t = new Date(row.appointmentStartUtc).getTime();
		return Number.isFinite(t) && t >= basla && t <= bitis;
	});
	const aktif = donemIcindekiler.filter(({ row }) => !row.cancelledAt).length;
	const iptal = donemIcindekiler.filter(({ row }) => row.cancelledAt).length;
	return `Toplam randevu: ${donemIcindekiler.length}, aktif: ${aktif}, iptal: ${iptal} (dönem: ${baslangicUtc} – ${bitisUtc})`;
}

// GET /panel/rakip-analizi/rakip-takip — 6 periyot türünün (haftalık..12 aylık) o anki durumu.
export async function handleRakipTakipDurum(request: Request, env: Env): Promise<Response> {
	await ensureRakipTakipTab(env);
	const satirlar = await getAllRakipTakipRows(env);
	return json({ periyotlar: satirlar.map(({ row }) => row) }, request);
}

// POST /panel/rakip-analizi/rakip-takip/uret { periyotTuru, rakipIds? } — Faz 2: manuel tetiklenen
// projeksiyon>hedef>realizasyon>fark>yeni-projeksiyon döngüsünün TEK adımı. Her tıklama, o periyot
// türünün mevcut satırının doluluğuna göre 3 durumdan birini uygular:
//   1. Satır boşsa (hiç başlamamış)      → yeni dönem: ilk projeksiyon+hedef üretilir.
//   2. Projeksiyon var, realizasyon yok  → dönem kapatılır: randevu verisinden realizasyon
//      sayılır (deterministik), Claude ile hedef-realizasyon farkı/nedeni analiz edilir.
//   3. Realizasyon da doluysa (kapanmış) → yeni döneme ilerlenir: önceki farkı NOT-TODO girdisi
//      olarak kullanan yeni bir projeksiyon+hedef üretilir, realizasyon/fark sıfırlanır.
// Satır HER ZAMAN updateRakipTakipRow ile yerinde güncellenir — asla yeni satır eklenmez.
export async function handleRakipTakipUret(request: Request, env: Env): Promise<Response> {
	let body: { periyotTuru?: unknown; rakipIds?: unknown };
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return errorResponse(request, 400, 'Geçersiz istek.');
	}
	const periyotTuru = String(body.periyotTuru ?? '');
	if (!gecerliPeriyotTuru(periyotTuru)) return errorResponse(request, 400, 'Geçersiz periyot türü.');
	const rakipIds = Array.isArray(body.rakipIds) ? body.rakipIds.map((x) => String(x)) : [];

	await ensureRakipTakipTab(env);
	await ensureRakipAnaliziTab(env);
	const durum = await getRakipTakipDurumu(env, periyotTuru);
	if (!durum) return errorResponse(request, 500, 'Periyot satırı bulunamadı.');
	const { rowNumber, row } = durum;

	const [bookingRows, rakipRows] = await Promise.all([getAllRows(env), getAllRakipAnalizRows(env)]);
	const rakipOzet = rakipOzetOlustur(rakipRows, rakipIds, []);

	let asama: 'yeniDonem' | 'kapatildi' | 'ilerletildi';
	let mesaj: string;
	let aksiyonRaporu = '';

	try {
		if (!row.projeksiyon) {
			const simdi = new Date();
			const bitis = new Date(simdi.getTime() + RAKIP_TAKIP_PERIYOT_GUN_SAYISI[periyotTuru] * 86400000);
			const userPrompt = `Periyot türü: ${periyotTuru}\n\nRakip verisi:\n${rakipOzet}\n\nBu periyot için ilk kez projeksiyon ve hedef oluştur. TODO ve NOT-TODO maddelerini ayrı ayrı, periyot boyunca yayılmış şekilde belirt.`;
			aksiyonRaporu = await generateReport(env, AKSIYON_ANALIZ_SYSTEM_PROMPT, userPrompt);
			await updateRakipTakipRow(env, rowNumber, row, {
				donemBaslangicUtc: simdi.toISOString(),
				donemBitisUtc: bitis.toISOString(),
				projeksiyon: aksiyonRaporu,
				hedef: aksiyonRaporu,
				guncellenmeUtc: simdi.toISOString(),
			});
			asama = 'yeniDonem';
			mesaj = 'Yeni dönem projeksiyonu ve hedefi üretildi.';
		} else if (!row.realizasyon) {
			const gerceklesen = donemRealizasyonuHesapla(bookingRows, row.donemBaslangicUtc, new Date().toISOString());
			const userPrompt = `Bu dönemin hedefi/projeksiyonu:\n${row.hedef}\n\nGerçekleşen (sayısal veri): ${gerceklesen}\n\nRakip verisi:\n${rakipOzet}\n\nRealizasyonu değerlendir; hedef-realizasyon farkını ve nedenini (eksik/yanlış/zamanlama) somut analiz et.`;
			const farkMetni = await generateReport(env, AKSIYON_ANALIZ_SYSTEM_PROMPT, userPrompt);
			await updateRakipTakipRow(env, rowNumber, row, {
				realizasyon: gerceklesen,
				fark: farkMetni,
				guncellenmeUtc: new Date().toISOString(),
			});
			asama = 'kapatildi';
			aksiyonRaporu = farkMetni;
			mesaj = 'Bu dönem kapatıldı, hedef-realizasyon farkı analiz edildi.';
		} else {
			const simdi = new Date();
			const bitis = new Date(simdi.getTime() + RAKIP_TAKIP_PERIYOT_GUN_SAYISI[periyotTuru] * 86400000);
			const userPrompt = `Periyot türü: ${periyotTuru}\n\nÖnceki dönemin hedef-realizasyon farkı ve nedeni (bunu NOT-TODO girdisi olarak kullan):\n${row.fark}\n\nRakip verisi:\n${rakipOzet}\n\nYeni dönem için düzeltilmiş projeksiyon ve hedef üret. TODO ve NOT-TODO maddelerini ayrı ayrı belirt.`;
			aksiyonRaporu = await generateReport(env, AKSIYON_ANALIZ_SYSTEM_PROMPT, userPrompt);
			await updateRakipTakipRow(env, rowNumber, row, {
				donemBaslangicUtc: simdi.toISOString(),
				donemBitisUtc: bitis.toISOString(),
				projeksiyon: aksiyonRaporu,
				hedef: aksiyonRaporu,
				realizasyon: '',
				fark: '',
				guncellenmeUtc: simdi.toISOString(),
			});
			asama = 'ilerletildi';
			mesaj = 'Yeni döneme ilerlendi, önceki farkı girdi olarak kullanan yeni projeksiyon üretildi.';
		}
	} catch (err) {
		if (err instanceof InsufficientCreditError) {
			return json(
				{ error: 'Anthropic bakiyeniz bitti. Devam etmek için kredi yüklemeniz gerekiyor.', limitUrl: ANTHROPIC_BILLING_URL },
				request,
				{ status: 402 },
			);
		}
		return errorResponse(request, 502, 'Rapor şu an üretilemedi, lütfen tekrar dene.', err);
	}

	// Görsel/Video Stratejisi (küratif) — aynı rakip setiyle, RakipTakip satırına yazılmıyor
	// (kaydetmiyoruz, bkz. INTEGRASYON_TODO.md "Sheet büyümesi" kararı), sadece yanıtla dönüyor.
	// Başarısız olsa bile Aksiyon/Hedef tarafındaki asıl döngü adımını geçersiz kılmaz.
	let icerikRaporu = '';
	try {
		const icerikPrompt = `Periyot türü: ${periyotTuru}\n\nToplanan rakip verisi:\n${rakipOzet}\n\nBu periyot için küratif içerik/güncel trend önerisi üret.`;
		icerikRaporu = await generateReport(env, ICERIK_STRATEJI_SYSTEM_PROMPT, icerikPrompt);
	} catch (err) {
		icerikRaporu =
			err instanceof InsufficientCreditError
				? '(Anthropic bakiyesi yetersiz, içerik raporu üretilemedi.)'
				: '(İçerik raporu şu an üretilemedi.)';
	}

	await ensureKullanimKaydiTab(env);
	await logKullanim(env, 'aksiyonAnaliz', `RakipTakip ${periyotTuru}: ${asama}`);

	const guncelDurum = await getRakipTakipDurumu(env, periyotTuru);
	return json({ asama, mesaj, aksiyonRaporu, icerikRaporu, durum: guncelDurum?.row }, request);
}
