import { generateReport } from './claude';
import type { Env } from '../types';

// Zaman-içi karşılaştırma/grafik raporu için: verilen serbest metin bağlamdan (rakibin notu/içe
// aktarılan belgeleri, ya da Talk and Heal için randevu özeti/Çiğdem'in yorumu), her parametre için
// 1-10 arası bir puan üretir. Veri/ipucu yoksa TAHMİN ETTİRMİYORUZ — null döner, bu da grafikte
// "bu dönem için veri yok" olarak gösterilir (bkz. rakipTakip.ts). Sayısal bir "gerçek" ölçüm değil,
// Claude'un metinden çıkardığı göreli bir değerlendirme — rapor arayüzünde bu şekilde sunulmalı.
const SKOR_SYSTEM_PROMPT = 'Sen bir veri analistisin. Sadece istenen JSON formatında yanıt ver, hiçbir açıklama/markdown/kod bloğu ekleme.';

export async function parametreSkorlariUret(
	env: Env,
	baglamMetni: string,
	parametreAnahtarlari: string[],
): Promise<Record<string, number | null>> {
	if (!parametreAnahtarlari.length) return {};
	const userPrompt = `Aşağıdaki bilgiye dayanarak, şu parametrelerin her biri için 1 (çok zayıf) ile 10 (çok güçlü) arası bir puan ver. Bir parametre hakkında bilgide hiç veri/ipucu yoksa o parametre için null yaz — ASLA tahmin etme.

Her puan için, o puanı verdiğin YERİ kaynak metinden BİREBİR (kelimesi kelimesine) alıntılayarak "kanit" alanına yaz. Bu alıntı ayrıca kod tarafından kaynak metinde birebir aranacak — uymayan/uydurulmuş bir alıntı verirsen puanın otomatik olarak geçersiz sayılır, bu yüzden kanit alanına SADECE kaynak metinde gerçekten geçen bir parçayı yaz.

Parametreler: ${parametreAnahtarlari.join(', ')}

Bilgi:
${baglamMetni || '(bilgi yok)'}

SADECE şu JSON formatında yanıt ver, başka hiçbir şey yazma: {"parametreAdi": {"puan": 1-10, "kanit": "kaynak metinden birebir alıntı"}, "digerParametreAdi": null, ...}`;

	let yanit: string;
	try {
		yanit = await generateReport(env, SKOR_SYSTEM_PROMPT, userPrompt);
	} catch {
		return Object.fromEntries(parametreAnahtarlari.map((k) => [k, null]));
	}
	return parseSkorJson(yanit, parametreAnahtarlari, baglamMetni);
}

// Bir "kanit" değerlendirmeye alınmadan önce en az bu uzunlukta olmalı — "ve", "iyi" gibi tek
// kelimelik/aşırı jenerik alıntıların kaynak metinde tesadüfen geçip puanı sahte şekilde
// "doğrulanmış" göstermesini önler.
const MIN_KANIT_UZUNLUK = 6;

// Türkçe büyük/küçük harf + fazla boşluk farklılıklarını yok sayarak karşılaştırma yapılabilsin
// diye normalize eder — asıl doğrulama (includes) bu normalize edilmiş string'ler üzerinden çalışır.
function normalizeKarsilastirma(s: string): string {
	return s.toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();
}

// KANIT ZORUNLULUĞU (2026-08-24, kullanıcı talebi) — LLM'in "asla tahmin etme" talimatına
// UYACAĞINA güvenmek yerine (bu talimat kanıtlanmış şekilde ihlal edilebiliyor, bkz. proje
// hafızası), her non-null puanın verdiği "kanit" alıntısının KAYNAK METİNDE GERÇEKTEN geçtiğini
// kod seviyesinde bağımsız doğrular. LLM kanıt uydurursa, hiç kanıt vermezse, ya da eski
// (kanıtsız/çıplak sayı) formata dönerse puan LLM ne derse desin null'a zorlanır — garanti LLM'in
// dürüstlüğüne değil, deterministik bir string arama işlemine dayanır. Bu, lib/etikGate.ts'in
// zaten bu projede kurduğu "prompt talimatı + ÜSTÜNE eklenen deterministik kod katmanı" desenin
// aynısı.
function kanitliPuanDogrula(deger: unknown, baglamMetniNormalize: string): number | null {
	if (typeof deger !== 'object' || deger === null) return null;
	const obj = deger as Record<string, unknown>;
	const puan = obj.puan;
	const kanit = obj.kanit;
	if (typeof puan !== 'number' || !Number.isFinite(puan) || puan < 1 || puan > 10) return null;
	if (typeof kanit !== 'string' || kanit.trim().length < MIN_KANIT_UZUNLUK) return null;
	if (!baglamMetniNormalize.includes(normalizeKarsilastirma(kanit))) return null;
	return Math.round(puan);
}

function parseSkorJson(text: string, anahtarlar: string[], baglamMetni: string): Record<string, number | null> {
	const bos = Object.fromEntries(anahtarlar.map((k) => [k, null])) as Record<string, number | null>;
	const match = text.match(/\{[\s\S]*\}/);
	if (!match) return bos;
	let parsed: unknown;
	try {
		parsed = JSON.parse(match[0]);
	} catch {
		return bos;
	}
	if (typeof parsed !== 'object' || parsed === null) return bos;
	const baglamMetniNormalize = normalizeKarsilastirma(baglamMetni);
	const sonuc = { ...bos };
	for (const key of anahtarlar) {
		const deger = (parsed as Record<string, unknown>)[key];
		sonuc[key] = kanitliPuanDogrula(deger, baglamMetniNormalize);
	}
	return sonuc;
}
