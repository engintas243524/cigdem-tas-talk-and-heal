import type { EtikRejimi } from '../config';
import { ETIK_KURALLARI } from './etikKurallari';

// Yayın-öncesi etik/yasal gate — Faz 2 (2026-08-17). LLM'in prompt talimatını "hatırlamasına"
// güvenmek yerine üretilen rapor metnini deterministik olarak ETIK_KURALLARI'na karşı kontrol eder.
// Kasıtlı tasarım: sessizce BLOKLAMAZ — regex tabanlı eşleştirme yanlış-pozitif üretebilir (ör.
// "aşıyoruz" her bağlamda ihlal değildir), bu yüzden görünür bir uyarı listesi döner, kararı insana
// (Çiğdem/kullanıcı) bırakır. Bkz. lib/etikKurallari.ts (kural verisi), rakipAnalizi.ts (bağlama).
export interface EtikBayrak {
	kuralId: string;
	rejim: EtikRejimi;
	seviye: 'yasak' | 'riskli';
	gerekce: string;
	guvenliAlternatif: string;
	eslesenMetin: string;
}

export function etikDenetimYap(metin: string, rejimler: EtikRejimi[]): EtikBayrak[] {
	if (!metin || !rejimler.length) return [];
	const bayraklar: EtikBayrak[] = [];
	for (const kural of ETIK_KURALLARI) {
		if (!rejimler.includes(kural.rejim)) continue;
		const eslesme = metin.match(kural.desen);
		if (eslesme) {
			bayraklar.push({
				kuralId: kural.id,
				rejim: kural.rejim,
				seviye: kural.seviye,
				gerekce: kural.gerekce,
				guvenliAlternatif: kural.guvenliAlternatif,
				eslesenMetin: eslesme[0],
			});
		}
	}
	return bayraklar;
}
