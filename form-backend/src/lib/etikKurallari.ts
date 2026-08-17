import type { EtikRejimi } from '../config';

// Yayın-öncesi etik/yasal gate — Faz 2 kural verisi (2026-08-17). Bu dosya BİLGİ (data) katmanı,
// mantık lib/etikGate.ts'te. Kaynak: RAKIP_SIRALAMA_KRITERLERI_ARASTIRMASI.md /
// GORSEL_VIDEO_STRATEJISI_KRITERLERI_ARASTIRMASI.md (TR — TPD/TTB) ve
// BACP_INGILTERE_MEVZUAT_ARASTIRMASI.md (BACP/CAP Code). Bu dürüstçe bir İLK SÜRÜM: regex-tabanlı
// kalıp eşleştirme, doğal dili tam anlamıyla anlamaz — yanlış-pozitif/yanlış-negatif üretebilir. Bu
// yüzden lib/etikGate.ts SESSİZCE BLOKLAMAZ, sadece görünür bir uyarı listesi döner (bkz. plan
// `~/.claude-hesap2/plans/harmonic-tumbling-toast.md` Faz 2 tasarım kararı). Yeni mevzuat bulgusu
// geldiğinde (Faz 3, sürekli takip) buraya YENİ SATIR eklenir — kod değişmez.
export interface EtikKural {
	id: string;
	rejim: EtikRejimi;
	desen: RegExp;
	seviye: 'yasak' | 'riskli';
	gerekce: string;
	guvenliAlternatif: string;
}

export const ETIK_KURALLARI: EtikKural[] = [
	// --- TR (TPD/TTB) — RAKIP_SIRALAMA_KRITERLERI_ARASTIRMASI.md + GORSEL_VIDEO...md Bölüm 4 ---
	{
		id: 'tr-garanti-iyilesme',
		rejim: 'tpdTtb',
		desen: /garanti(li|si)?\s+\S*\s*(iyileş\w*|tedavi\w*|çözüm\w*)/i,
		seviye: 'yasak',
		gerekce: 'Sonuç garantisi veren dil — terapi sonucu kanıtlanamaz, TPD/TTB reklam etiği ihlali.',
		guvenliAlternatif: '"...sürecinde birlikte çalışıyoruz" gibi süreç odaklı bir ifadeye çevir.',
	},
	{
		id: 'tr-seansta-cozduk',
		rejim: 'tpdTtb',
		desen: /\d+\s*seans\w*\s*(ta|da)?\s*(çözdük|çözüyoruz|çözülür)/i,
		seviye: 'yasak',
		gerekce: '"X seansta çözdük" tarzı somut sonuç vaadi — araştırmanın somut yasaklı-kalıp örneği.',
		guvenliAlternatif: 'Seans sayısına dair somut vaat verme, süreç anlatısına dön.',
	},
	{
		id: 'tr-asma-fiili',
		rejim: 'tpdTtb',
		desen: /\b(aş(ıyoruz|acağız|tık|arız))\b/i,
		seviye: 'riskli',
		gerekce: '"Aşmak" fiili örtük sonuç garantisi ima edebilir (araştırmanın somut örneği).',
		guvenliAlternatif: '"...sürecinde birlikte çalışıyoruz" gibi bir ifadeye çevir.',
	},
	{
		id: 'tr-tani-koyma',
		rejim: 'tpdTtb',
		desen: /\btanı(sı)?\s+koy(uyoruz|arız|abiliriz|dum|du)?\b/i,
		seviye: 'yasak',
		gerekce: 'Genel içerikte/DM-yorum yanıtında bile tanı koyar nitelikte ifade — meslek etiği ihlali.',
		guvenliAlternatif: 'Genel bilgilendirme dili kullan, kişiye özel tanı ima etme.',
	},
	{
		id: 'tr-diger-terapist-karalama',
		rejim: 'tpdTtb',
		desen: /diğer (terapist|psikolog|danışman|uzman)\w*[^.!?]{0,40}(yetersiz|başarısız|kötü|yanlış)/i,
		seviye: 'yasak',
		gerekce: 'Diğer terapist/yaklaşımları karalayan/karşılaştıran içerik — TPD/TTB açık yasak.',
		guvenliAlternatif: 'Rakip ima etmeden kendi yaklaşımının güçlü yanına odaklan.',
	},
	{
		id: 'tr-talep-yaratici-baski',
		rejim: 'tpdTtb',
		desen: /(hemen şimdi|geç kalmadan|fırsatı kaçırma)\w*[^.!?]{0,30}(randevu|başvur)/i,
		seviye: 'riskli',
		gerekce: 'Duygusal baskı/aciliyet yaratan "talep yaratıcı" dil — araştırmanın temel yasak kuralı.',
		guvenliAlternatif: 'Aciliyet/baskı dili yerine bilgilendirici bir çağrı kullan.',
	},
	// --- BACP/İngiltere (CAP Code) — BACP_INGILTERE_MEVZUAT_ARASTIRMASI.md Bölüm 4 ---
	{
		id: 'bacp-guarantee-outcome',
		rejim: 'bacp',
		desen: /guarantee[sd]?\s+.{0,30}(cure|result|recovery|success)/i,
		seviye: 'yasak',
		gerekce: 'Kanıtlanamaz sonuç garantisi — CAP Code Rule 3.7 (substantiation).',
		guvenliAlternatif: '"We work together through..." gibi süreç odaklı bir ifadeye çevir.',
	},
	{
		id: 'bacp-100-effective',
		rejim: 'bacp',
		desen: /100%\s*(effective|success|guaranteed)/i,
		seviye: 'yasak',
		gerekce: 'Mutlak etkinlik iddiası — kanıtlanamaz (CAP Code Rule 3.7).',
		guvenliAlternatif: '"Evidence-informed approach" gibi ölçülü bir ifade kullan.',
	},
	{
		id: 'bacp-proven-cure',
		rejim: 'bacp',
		desen: /proven to (cure|eliminate|treat|fix)/i,
		seviye: 'yasak',
		gerekce: '"Proven to cure/eliminate" belgelenmiş kanıt gerektirir, pratikte imkansız (Rule 3.7).',
		guvenliAlternatif: '"May help support..." gibi temkinli dil kullan.',
	},
	{
		id: 'bacp-accredited-claim',
		rejim: 'bacp',
		desen: /BACP[\s-]?Accredited/i,
		seviye: 'riskli',
		gerekce:
			'2025 ASA emsali (Stockport Counselling Services): gerçek olmayan "accredited" iddiası yayından kaldırıldı — bu ifade geçtiğinde gerçek statü ("Registered" mi "Accredited" mi) doğrulanmalı.',
		guvenliAlternatif: 'Sadece gerçek statüyü birebir yaz (ör. "BACP Registered").',
	},
	{
		id: 'bacp-better-than-others',
		rejim: 'bacp',
		desen: /better than (other|any other) (therapist|counsellor|counselor|psychotherapist)/i,
		seviye: 'yasak',
		gerekce: 'Rakip terapistleri karşılaştıran/itibarsızlaştıran dil — CAP Code Rule 3.41 (denigrasyon).',
		guvenliAlternatif: 'Kendi yaklaşımının güçlü yanına odaklan, rakip ima etme.',
	},
];
