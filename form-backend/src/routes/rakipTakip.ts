import { getAllRows } from '../lib/sheets';
import { getAllRakipAnalizRows, ensureRakipAnaliziTab, type RakipAnalizRow } from '../lib/rakipSheets';
import { ensureRakipTakipTab, getAllRakipTakipRows, getRakipTakipDurumu, updateRakipTakipRow } from '../lib/rakipTakipSheets';
import { ensureRakipTakipAyarTab, getRakipTakipAyar, setRakipTakipAyar } from '../lib/rakipTakipAyarSheets';
import { ensureRakipTakipGecmisTab, addRakipTakipGecmisKaydi } from '../lib/rakipTakipGecmisSheets';
import { parametreSkorlariUret } from '../lib/rakipParametreSkor';
import { generateReport, InsufficientCreditError } from '../lib/claude';
import { errorResponse, json } from '../lib/http';
import { ensureKullanimKaydiTab, logKullanim, kotaDolduMu, KotaDolduError } from '../lib/kullanimKaydi';
import { appendRaporKaydi } from '../lib/raporlarSheets';
import {
	rakipOzetOlustur,
	AKSIYON_ANALIZ_SYSTEM_PROMPT,
	ICERIK_STRATEJI_SYSTEM_PROMPT,
	ANALIZ_PARAMETRE_ACIKLAMALARI,
	RAPOR_YAPISI_TALIMATI,
	iceAktarPromptEki,
	ICE_AKTAR_MAX_ADET,
} from './rakipAnalizi';
import {
	RAKIP_TAKIP_PERIYOT_GUN_SAYISI,
	GRAFIK_PERIYOT_GUN_SAYISI,
	TALK_AND_HEAL_VARLIK_ID,
	ANTHROPIC_BILLING_URL,
	type RakipTakipPeriyotTuru,
} from '../config';
import {
	anlikParametreSkorlariGetir,
	randevuTrendiHesapla,
	rakipTakipGecmisiGetir,
	gecerliPeriyotTuru,
	gecerliGrafikPeriyotTuru,
	gecerliGrafikKaynaklari,
} from '../lib/grafikVerisi';
import type { Env, SheetRow } from '../types';

export { gecerliPeriyotTuru };

// Bir dönem içinde (appointmentStartUtc bazlı) kaç randevu aktif/iptal oldu — bu, "realizasyon"un
// sayısal kısmı. Bilerek Claude'a bırakılmıyor: rakam Claude'a hesaplattırılırsa halüsinasyon
// riski var, sayım deterministik olmalı. Gap'in NİTELİKSEL yorumu (neden sapma oldu) ayrı bir
// adımda Claude'a bırakılıyor (aşağıdaki 'kapatildi' dalı).
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

// Bir dönem KAPANDIĞINDA (aşağıdaki 'kapatildi' dalı), Talk and Heal'in kendisi + takip edilen her
// rakip için parametre bazlı bir puan anlık görüntüsü üretip RakipTakipGecmis'e kaydeder — zaman-
// içi karşılaştırma/grafik raporunun (INTEGRASYON_TODO.md 2026-08-15) veri kaynağı budur. Talk and
// Heal'in bağlamı şimdilik sadece randevu sayıları (gerceklesen) — sosyal medya/fiyat şeffaflığı
// gibi NİTELİKSEL parametreler için Çiğdem'den ayrıca serbest metin toplanmıyor, o yüzden çoğu
// parametre dürüstçe null (veri yok) dönecek; bu, halüsinasyon üretmekten daha doğru bir sonuç.
async function gecmisSnapshotlariniKaydet(
	env: Env,
	periyotTuru: RakipTakipPeriyotTuru,
	donemBaslangicUtc: string,
	donemBitisUtc: string,
	talkAndHealBaglam: string,
	rakipRows: { row: RakipAnalizRow }[],
	rakipIds: string[],
): Promise<void> {
	const parametreAnahtarlari = Object.keys(ANALIZ_PARAMETRE_ACIKLAMALARI);
	await ensureRakipTakipGecmisTab(env);

	const talkAndHealSkorlari = await parametreSkorlariUret(env, talkAndHealBaglam, parametreAnahtarlari);
	await addRakipTakipGecmisKaydi(env, {
		varlikId: TALK_AND_HEAL_VARLIK_ID,
		varlikAdi: 'Talk and Heal',
		periyotTuru,
		donemBaslangicUtc,
		donemBitisUtc,
		parametreSkorlari: talkAndHealSkorlari,
		raporMetni: talkAndHealBaglam,
	});

	const secilenRakipler = rakipIds.length ? rakipRows.filter(({ row }) => rakipIds.includes(row.id)) : rakipRows;
	for (const { row } of secilenRakipler) {
		const baglam = [row.isim, row.adres, row.not].filter(Boolean).join('\n');
		const skorlar = await parametreSkorlariUret(env, baglam, parametreAnahtarlari);
		await addRakipTakipGecmisKaydi(env, {
			varlikId: row.id,
			varlikAdi: row.isim,
			periyotTuru,
			donemBaslangicUtc,
			donemBitisUtc,
			parametreSkorlari: skorlar,
			raporMetni: baglam,
		});
	}
}

export interface RakipTakipAdimSonucu {
	asama: 'yeniDonem' | 'kapatildi' | 'ilerletildi';
	mesaj: string;
	aksiyonRaporu: string;
	icerikRaporu: string;
}

// Döngünün TEK adımı — hem HTTP endpoint'i (handleRakipTakipUret, manuel/deneme tetikleme) hem
// de cron sweep'i (scheduled.ts runRakipTakipSweep, otomatik tetikleme) AYNI bu fonksiyonu
// çağırıyor. İki tetikleyici arasında iş mantığı FARKLI OLMAMALI — fark sadece "ne zaman
// çağrılır" (biri tıklamayla, biri dönem sınırı geçtiğinde). rakipIds boşsa rakipOzetOlustur tüm
// kayıtlı rakipleri kullanır (bkz. o fonksiyonun kendi mantığı) — Faz 3 (otomatik 5+5
// sınıflandırma) henüz yok, o yüzden otomatik modda şimdilik "tüm kayıtlı rakipler" varsayılıyor.
export async function rakipTakipAdimUygula(
	env: Env,
	periyotTuru: RakipTakipPeriyotTuru,
	rakipIds: string[],
): Promise<RakipTakipAdimSonucu> {
	await ensureRakipTakipTab(env);
	await ensureRakipAnaliziTab(env);
	await ensureKullanimKaydiTab(env);
	// Bu döngünün her adımı en az bir Aksiyon/Hedef Analizi çağrısı yapar (aşağıdaki 3 dal) — kota
	// dolmuşsa Claude'a hiç gitmeden en baştan durur (manuel tetikleme 402 döner, cron sweep
	// kendi try/catch'inde yakalayıp bu periyodu sessizce atlar, bkz. scheduled.ts).
	if (await kotaDolduMu(env, 'aksiyonAnaliz')) throw new KotaDolduError('aksiyonAnaliz');
	const durum = await getRakipTakipDurumu(env, periyotTuru);
	if (!durum) throw new Error(`RakipTakip satırı bulunamadı: ${periyotTuru}`);
	const { rowNumber, row } = durum;

	const [bookingRows, rakipRows] = await Promise.all([getAllRows(env), getAllRakipAnalizRows(env)]);
	const rakipOzet = rakipOzetOlustur(rakipRows, rakipIds, []);

	let asama: RakipTakipAdimSonucu['asama'];
	let mesaj: string;
	let aksiyonRaporu = '';

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
		try {
			await gecmisSnapshotlariniKaydet(env, periyotTuru, row.donemBaslangicUtc, new Date().toISOString(), gerceklesen, rakipRows, rakipIds);
		} catch (err) {
			// Snapshot kaydı başarısız olsa bile döngünün asıl adımı (dönem kapatma) zaten
			// tamamlandı — bir sonraki tetiklemede snapshot'sız kalınır ama döngü kilitlenmez.
			console.error(`RakipTakip geçmiş snapshot kaydı başarısız (${periyotTuru})`, err);
		}
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

	// Görsel/Video Stratejisi (küratif) — aynı rakip setiyle, RakipTakip satırına yazılmıyor
	// (kaydetmiyoruz, bkz. INTEGRASYON_TODO.md "Sheet büyümesi" kararı), sadece sonuçla dönüyor.
	// Başarısız olsa bile Aksiyon/Hedef tarafındaki asıl döngü adımını geçersiz kılmaz. Kendi
	// kotasını da (icerikStrateji) diğer üretim yollarıyla aynı şekilde tüketir/loglar — önceden
	// bu çağrı hiç loglanmıyordu, kota sayacı gerçek harcamayı eksik gösteriyordu (2026-08-16 fix).
	let icerikRaporu = '';
	if (await kotaDolduMu(env, 'icerikStrateji')) {
		icerikRaporu = '(Bu ayki Görsel/Video Stratejisi kotası dolu, içerik raporu üretilemedi.)';
	} else {
		try {
			const icerikPrompt = `Periyot türü: ${periyotTuru}\n\nToplanan rakip verisi:\n${rakipOzet}\n\nBu periyot için küratif içerik/güncel trend önerisi üret.`;
			icerikRaporu = await generateReport(env, ICERIK_STRATEJI_SYSTEM_PROMPT, icerikPrompt);
			await logKullanim(env, 'icerikStrateji', `RakipTakip ${periyotTuru}: ${asama}`);
		} catch (err) {
			icerikRaporu =
				err instanceof InsufficientCreditError
					? '(Anthropic bakiyesi yetersiz, içerik raporu üretilemedi.)'
					: '(İçerik raporu şu an üretilemedi.)';
		}
	}

	await logKullanim(env, 'aksiyonAnaliz', `RakipTakip ${periyotTuru}: ${asama}`);

	// Raporlar arşivi (2026-08-16, kullanıcı isteği) — bkz. lib/raporlarSheets.ts ve config.ts'deki
	// RAPORLAR_TAB_NAME yorumu. RakipTakip satırındaki projeksiyon/hedef/fark hücreleri her yeni
	// dönemde YERİNDE güncelleniyor (append değil) — arşiv olmasa aksiyonRaporu'nun geçmiş halleri
	// kaybolurdu. Ana akışı bozmasın diye try/catch içinde, gecmisSnapshotlariniKaydet ile aynı desen.
	try {
		await appendRaporKaydi(env, 'rakipTakipAksiyon', `${periyotTuru}: ${asama}`, aksiyonRaporu);
		await appendRaporKaydi(env, 'rakipTakipIcerik', `${periyotTuru}: ${asama}`, icerikRaporu);
	} catch (err) {
		console.error(`RakipTakip rapor arşiv kaydı başarısız (${periyotTuru})`, err);
	}

	return { asama, mesaj, aksiyonRaporu, icerikRaporu };
}

// GET /panel/rakip-analizi/rakip-takip — 6 periyot türünün (haftalık..12 aylık) o anki durumu +
// otomatik takip anahtarının açık/kapalı olduğu bilgisi.
export async function handleRakipTakipDurum(request: Request, env: Env): Promise<Response> {
	await ensureRakipTakipTab(env);
	await ensureRakipTakipAyarTab(env);
	const [satirlar, ayar] = await Promise.all([getAllRakipTakipRows(env), getRakipTakipAyar(env)]);
	return json({ periyotlar: satirlar.map(({ row }) => row), ayar: { otomatikAcik: ayar.otomatikAcik === 'true' } }, request);
}

// POST /panel/rakip-analizi/rakip-takip/uret { periyotTuru, rakipIds? } — manuel/deneme tetikleme.
// Otomatik anahtar kapalıyken de HER ZAMAN çalışır — bu buton "deneme amaçlı" tek seferlik bir
// adımdır, sürekli çalışan otomatik döngüden bağımsızdır (bkz. handleRakipTakipAyar).
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

	try {
		const sonuc = await rakipTakipAdimUygula(env, periyotTuru, rakipIds);
		const guncelDurum = await getRakipTakipDurumu(env, periyotTuru);
		return json({ ...sonuc, durum: guncelDurum?.row }, request);
	} catch (err) {
		if (err instanceof InsufficientCreditError) {
			return json(
				{ error: 'Anthropic bakiyeniz bitti. Devam etmek için kredi yüklemeniz gerekiyor.', limitUrl: ANTHROPIC_BILLING_URL },
				request,
				{ status: 402 },
			);
		}
		if (err instanceof KotaDolduError) {
			return json(
				{ error: 'Bu ayki Aksiyon/Hedef Analizi kotası doldu. Ay başında sıfırlanır.', limitUrl: ANTHROPIC_BILLING_URL },
				request,
				{ status: 402 },
			);
		}
		return errorResponse(request, 502, 'Rapor şu an üretilemedi, lütfen tekrar dene.', err);
	}
}

// POST /panel/rakip-analizi/rakip-takip/ayar { acik: boolean } — otomatik (cron-tetiklemeli)
// takibi açar/kapatır. Kullanıcı kararı (2026-08-15): "sürekli analiz sağlayıcı tarafında ciddi
// fatura yaratabilir" — bu yüzden varsayılan KAPALI, sadece açıkken scheduled.ts'teki
// runRakipTakipSweep bir şey yapar (bkz. o fonksiyonun en baştaki ucuz kontrolü).
export async function handleRakipTakipAyar(request: Request, env: Env): Promise<Response> {
	let body: { acik?: unknown };
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return errorResponse(request, 400, 'Geçersiz istek.');
	}
	await ensureRakipTakipAyarTab(env);
	await setRakipTakipAyar(env, body.acik === true);
	const ayar = await getRakipTakipAyar(env);
	return json({ ayar: { otomatikAcik: ayar.otomatikAcik === 'true' } }, request);
}

const KARSILASTIRMA_SYSTEM_PROMPT = `Sen Talk and Heal'in (Çiğdem Taş'ın terapi pratiği) iş stratejistisin.
Sana Talk and Heal ile bir/birkaç rakibin zaman içindeki parametre puanları (1-10, null=veri yok)
veriliyor. Bu veriyi yorumla: hangi parametrelerde Talk and Heal ilerliyor/geriliyor, hangilerinde
rakip önde, veri yoksa bunu açıkça belirt (uydurma). Türkçe yaz. Sade, gündelik bir dil kullan —
jargon ve süslü terimlerden kaçın; hiç bu alanda uzman olmayan bir okuyucunun anlayacağı kısa
cümlelerle yaz.${RAPOR_YAPISI_TALIMATI}`;

// POST /panel/rakip-analizi/rakip-takip/karsilastirma { periyotTuru, mod: '1e1'|'ortalama',
// rakipIds, parametreler?, grafikKaynaklari? } — "Grafik Verisi" özelliği (2026-08-16, kullanıcı
// isteği): grafikKaynaklari çoklu seçim — ['parametre20','randevuTrendi','rakipTakipGecmisi']
// alt kümesi, boş/gönderilmezse eskisi gibi SADECE rakipTakipGecmisi (geriye dönük davranışı
// korumak için varsayılan). Üçü de lib/grafikVerisi.ts'deki paylaşılan fonksiyonlarla hesaplanır —
// aynı fonksiyonlar handleAksiyonAnaliz tarafından da kullanılıyor (DRY). Yorum/narratif SADECE
// rakipTakipGecmisi seçiliyse VE veri varsa üretilir (KARSILASTIRMA_SYSTEM_PROMPT özellikle bu
// tarihsel karşılaştırmayı yorumluyor) — diğer iki kaynak sadece grafik olarak eklenir, ayrıca
// yorumlanmaz (gereksiz Claude çağrısından kaçınmak için).
export async function handleRakipTakipKarsilastirma(request: Request, env: Env): Promise<Response> {
	let body: {
		periyotTuru?: unknown;
		mod?: unknown;
		rakipIds?: unknown;
		parametreler?: unknown;
		kaynakBelgeler?: unknown;
		kaynakPdfler?: unknown;
		grafikKaynaklari?: unknown;
	};
	try {
		body = (await request.json()) as typeof body;
	} catch {
		return errorResponse(request, 400, 'Geçersiz istek.');
	}
	const periyotTuru = String(body.periyotTuru ?? '');
	if (!gecerliGrafikPeriyotTuru(periyotTuru)) return errorResponse(request, 400, 'Geçersiz periyot türü.');
	const mod = body.mod === 'ortalama' ? 'ortalama' : '1e1';
	const rakipIds = Array.isArray(body.rakipIds) ? body.rakipIds.map((x) => String(x)) : [];
	const kaynakBelgeler = Array.isArray(body.kaynakBelgeler) ? body.kaynakBelgeler.map((x) => String(x)).slice(0, ICE_AKTAR_MAX_ADET) : [];
	const kaynakPdfler = Array.isArray(body.kaynakPdfler) ? body.kaynakPdfler.map((x) => String(x)).slice(0, ICE_AKTAR_MAX_ADET) : [];
	const grafikKaynaklari = gecerliGrafikKaynaklari(body.grafikKaynaklari, ['rakipTakipGecmisi']);
	if (!rakipIds.length) return errorResponse(request, 400, 'En az bir rakip seçilmeli.');
	if (mod === '1e1' && rakipIds.length !== 1)
		return errorResponse(request, 400, 'Birebir karşılaştırma için tam olarak bir rakip seçilmeli.');
	const parametreAnahtarlari =
		Array.isArray(body.parametreler) && body.parametreler.length
			? body.parametreler.map((x) => String(x)).filter((k) => k in ANALIZ_PARAMETRE_ACIKLAMALARI)
			: Object.keys(ANALIZ_PARAMETRE_ACIKLAMALARI);

	await ensureRakipAnaliziTab(env);
	const rakipRows = await getAllRakipAnalizRows(env);
	const secilenRakipRows = rakipRows.filter(({ row }) => rakipIds.includes(row.id));
	if (!secilenRakipRows.length) return errorResponse(request, 404, 'Seçilen rakip(ler) bulunamadı.');

	const grafikVerileri: {
		parametre20?: Awaited<ReturnType<typeof anlikParametreSkorlariGetir>>;
		randevuTrendi?: ReturnType<typeof randevuTrendiHesapla>;
		rakipTakipGecmisi?: NonNullable<Awaited<ReturnType<typeof rakipTakipGecmisiGetir>>>;
	} = {};

	if (grafikKaynaklari.includes('rakipTakipGecmisi')) {
		if (!gecerliPeriyotTuru(periyotTuru)) {
			return errorResponse(
				request,
				400,
				'RakipTakip parametre geçmişi için haftalık..12 aylık bir periyot seçilmeli (yıllık periyotlar sadece randevu trendinde geçerli).',
			);
		}
		const sonuc = await rakipTakipGecmisiGetir(
			env,
			periyotTuru,
			mod,
			secilenRakipRows,
			parametreAnahtarlari,
			ANALIZ_PARAMETRE_ACIKLAMALARI,
		);
		if (sonuc) grafikVerileri.rakipTakipGecmisi = sonuc;
	}

	let bookingRows: { row: SheetRow }[] | null = null;
	if (grafikKaynaklari.includes('parametre20') || grafikKaynaklari.includes('randevuTrendi')) {
		bookingRows = await getAllRows(env);
	}
	if (grafikKaynaklari.includes('parametre20')) {
		const aktif = bookingRows!.filter(({ row }) => !row.cancelledAt).length;
		const iptal = bookingRows!.filter(({ row }) => row.cancelledAt).length;
		const talkAndHealBaglam = `Toplam randevu: ${bookingRows!.length}, aktif: ${aktif}, iptal: ${iptal}`;
		grafikVerileri.parametre20 = await anlikParametreSkorlariGetir(env, talkAndHealBaglam, secilenRakipRows, parametreAnahtarlari);
	}
	if (grafikKaynaklari.includes('randevuTrendi')) {
		grafikVerileri.randevuTrendi = randevuTrendiHesapla(bookingRows!, GRAFIK_PERIYOT_GUN_SAYISI[periyotTuru]);
	}

	if (!grafikVerileri.parametre20 && !grafikVerileri.randevuTrendi && !grafikVerileri.rakipTakipGecmisi) {
		return errorResponse(
			request,
			404,
			'Bu periyot türü için henüz hiç geçmiş veri yok — önce en az bir dönem "Bu periyodun raporunu üret" ile kapatılmalı.',
		);
	}

	let narratif = '';
	if (grafikVerileri.rakipTakipGecmisi) {
		const { rakipEtiketi, parametreSonuclari } = grafikVerileri.rakipTakipGecmisi;
		try {
			const ozetSatirlari = parametreSonuclari.map(
				(p) => `${p.aciklama}: Talk and Heal=${JSON.stringify(p.talkAndHeal)}, ${rakipEtiketi}=${JSON.stringify(p.rakip)}`,
			);
			const userPrompt =
				`Talk and Heal ile ${rakipEtiketi} arasındaki zaman içi karşılaştırma verisi (her değer 1-10 arası bir puan, null=veri yok):\n${ozetSatirlari.join('\n')}` +
				iceAktarPromptEki(kaynakBelgeler);
			narratif = await generateReport(env, KARSILASTIRMA_SYSTEM_PROMPT, userPrompt, kaynakPdfler);
		} catch (err) {
			if (err instanceof InsufficientCreditError) {
				return json(
					{ error: 'Anthropic bakiyeniz bitti. Devam etmek için kredi yüklemeniz gerekiyor.', limitUrl: ANTHROPIC_BILLING_URL },
					request,
					{ status: 402 },
				);
			}
			return errorResponse(request, 502, 'Yorum şu an üretilemedi, lütfen tekrar dene.', err);
		}
	}

	await ensureKullanimKaydiTab(env);
	await logKullanim(env, 'aksiyonAnaliz', `RakipTakip karşılaştırma ${periyotTuru} (${mod}): ${grafikKaynaklari.join('+')}`);

	// Raporlar arşivi — bkz. rakipTakipAdimUygula'daki aynı not. narratif boşsa (sadece grafik
	// istendiyse, yorum üretilmediyse) arşive kaydedecek anlamlı bir metin yok, atlanır.
	if (narratif) {
		try {
			await appendRaporKaydi(env, 'karsilastirma', `${periyotTuru} (${mod}): ${grafikKaynaklari.join('+')}`, narratif);
		} catch (err) {
			console.error(`Karşılaştırma raporu arşiv kaydı başarısız (${periyotTuru})`, err);
		}
	}

	return json({ periyotTuru, mod, grafikVerileri, narratif }, request);
}
