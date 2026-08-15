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

Parametreler: ${parametreAnahtarlari.join(', ')}

Bilgi:
${baglamMetni || '(bilgi yok)'}

SADECE şu JSON formatında yanıt ver, başka hiçbir şey yazma: {"parametreAdi": puanVeyaNull, ...}`;

	let yanit: string;
	try {
		yanit = await generateReport(env, SKOR_SYSTEM_PROMPT, userPrompt);
	} catch {
		return Object.fromEntries(parametreAnahtarlari.map((k) => [k, null]));
	}
	return parseSkorJson(yanit, parametreAnahtarlari);
}

function parseSkorJson(text: string, anahtarlar: string[]): Record<string, number | null> {
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
	const sonuc = { ...bos };
	for (const key of anahtarlar) {
		const deger = (parsed as Record<string, unknown>)[key];
		sonuc[key] = typeof deger === 'number' && Number.isFinite(deger) && deger >= 1 && deger <= 10 ? Math.round(deger) : null;
	}
	return sonuc;
}
