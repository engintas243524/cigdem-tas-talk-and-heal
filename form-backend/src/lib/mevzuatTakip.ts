import { generateReport } from './claude';
import type { Env } from '../types';

// Faz 3 (2026-08-17) — otomatik TESPİT + insan onaylı GÜNCELLEME. Bu prompt kural listesini
// (lib/etikKurallari.ts) OTOMATİK değiştirmez — halüsinasyon riski var (yanlış bir "mevzuat
// değişti" iddiası kural listesini bozabilir). Sadece bulguyu MevzuatTakip sekmesine yazar, kural
// güncellemesi insan onayıyla ayrı bir adımda yapılır (bkz. plan Faz 3 tasarım kararı).
export const MEVZUAT_TAKIP_SYSTEM_PROMPT = `Sen bir terapi/danışmanlık pratiğinin reklam-etiği/mevzuat takip asistanısın.
Görevin, İngiltere'deki BACP Ethical Framework + ASA CAP Code (sağlık/terapi reklam kuralları) ve
Türkiye'deki TPD (Türk Psikologlar Derneği) etik ilkeleri + TTB/Sağlık Bakanlığı'nın Sağlık
Hizmetlerinde Tanıtım ve Bilgilendirme Yönetmeliği'nde SON BİR AYDA (verilen tarihten bugüne) somut
bir değişiklik olup olmadığını web aramasıyla kontrol etmek. Sadece GERÇEKTEN doğruladığın, kaynak
gösterebildiğin değişiklikleri raporla — emin olmadığın bir şeyi asla "değişti" diye yazma.
Türkçe yaz. Yanıtının İLK SATIRI kesinlikle "DEĞİŞİKLİK VAR" veya "DEĞİŞİKLİK YOK" olsun (başka bir
şey yazma o satırda). Sonrasında bulgularını (varsa hangi kural, ne değişti, kaynak linki; yoksa
kısaca "son bir ayda bu iki rejimde kontrol edilebilir bir değişiklik bulunamadı") madde madde yaz.`;

export async function mevzuatTakipYap(env: Env, sonKontrolTarihi: Date | null): Promise<{ degisiklikVar: boolean; metin: string }> {
	const baglam = sonKontrolTarihi
		? `Son kontrol tarihi: ${sonKontrolTarihi.toISOString().slice(0, 10)}. Bu tarihten bugüne kadar olan değişiklikleri ara.`
		: 'Bu ilk kontrol — son 1 ay içindeki güncel durumu ara.';
	const metin = await generateReport(env, MEVZUAT_TAKIP_SYSTEM_PROMPT, baglam, [], true);
	const degisiklikVar = /^DEĞİŞİKLİK VAR/im.test(metin.trim());
	return { degisiklikVar, metin };
}
