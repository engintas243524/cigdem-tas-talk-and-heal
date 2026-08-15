import { unzipSync } from 'fflate';

// İçe Aktar (Faz D1): docx/pptx/epub hepsi zip içinde XML/XHTML — tek unzip birincili (fflate,
// sıfır bağımlılık) + format başına küçük bir regex tabanlı metin çıkarımı yeterli. mammoth gibi
// hazır kütüphaneler jszip+bluebird+underscore+xmldom zincirini sürüklüyor ve sadece docx'i
// çözüyor; pptx/epub için ayrıca bir şey gerektiriyordu. PDF burada YOK — Claude API'ye doğrudan
// document content block olarak gönderiliyor (bkz. lib/claude.ts), hiç metin çıkarımı yapmıyoruz.

// İçe aktarılan tek bir belgeden alınacak metnin üst sınırı — rapor promptunun aşırı büyümesini
// (maliyet + Claude'un asıl işine odaklanamaması) önlemek için. Elle yazılan not alanından
// (NOTE_MAX_LENGTH=5000) kasıtlı olarak daha geniş: burası tam bir döküman içeriği taşıyor.
export const ICE_AKTAR_MAX_LENGTH = 20000;

function xmlEntityDecode(s: string): string {
	return s
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&amp;/g, '&');
}

function kirp(metin: string): string {
	const t = metin.trim();
	return t.length > ICE_AKTAR_MAX_LENGTH ? t.slice(0, ICE_AKTAR_MAX_LENGTH) + '\n[…belge kırpıldı, tamamı gösterilmiyor]' : t;
}

function metinCikarTxt(bytes: Uint8Array): string {
	return kirp(new TextDecoder().decode(bytes));
}

function metinCikarDocx(bytes: Uint8Array): string {
	const files = unzipSync(bytes);
	const doc = files['word/document.xml'];
	if (!doc) throw new Error('Geçersiz .docx dosyası (word/document.xml bulunamadı).');
	const xml = new TextDecoder().decode(doc);
	const paragraflar = xml
		.split(/<\/w:p>/)
		.map((p) => [...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => xmlEntityDecode(m[1])).join(''))
		.filter(Boolean);
	if (!paragraflar.length) throw new Error('.docx dosyasından metin okunamadı (boş ya da desteklenmeyen biçim).');
	return kirp(paragraflar.join('\n'));
}

function metinCikarPptx(bytes: Uint8Array): string {
	const files = unzipSync(bytes);
	const slaytAdlari = Object.keys(files)
		.filter((ad) => /^ppt\/slides\/slide\d+\.xml$/.test(ad))
		.sort((a, b) => Number(a.match(/slide(\d+)\.xml/)![1]) - Number(b.match(/slide(\d+)\.xml/)![1]));
	if (!slaytAdlari.length) throw new Error('Geçersiz .pptx dosyası (slayt bulunamadı).');
	const slaytMetinleri = slaytAdlari.map((ad, i) => {
		const xml = new TextDecoder().decode(files[ad]);
		const metinler = [...xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)].map((m) => xmlEntityDecode(m[1]));
		return `Slayt ${i + 1}: ${metinler.join(' ')}`;
	});
	return kirp(slaytMetinleri.join('\n'));
}

function htmlToText(html: string): string {
	return html
		.replace(/<script[\s\S]*?<\/script>/gi, '')
		.replace(/<style[\s\S]*?<\/style>/gi, '')
		.replace(/<\/(p|div|h[1-6]|li|br)>/gi, '\n')
		.replace(/<[^>]+>/g, '')
		.replace(/&nbsp;/g, ' ')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&amp;/g, '&')
		.replace(/[ \t]+/g, ' ')
		.replace(/\n{3,}/g, '\n\n');
}

function metinCikarEpub(bytes: Uint8Array): string {
	const files = unzipSync(bytes);
	const containerXml = files['META-INF/container.xml'];
	if (!containerXml) throw new Error('Geçersiz .epub dosyası (container.xml bulunamadı).');
	const opfPathMatch = new TextDecoder().decode(containerXml).match(/full-path="([^"]+)"/);
	if (!opfPathMatch) throw new Error('Geçersiz .epub dosyası (OPF yolu bulunamadı).');
	const opfPath = opfPathMatch[1];
	const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
	const opfBytes = files[opfPath];
	if (!opfBytes) throw new Error('Geçersiz .epub dosyası (OPF dosyası bulunamadı).');
	const opfText = new TextDecoder().decode(opfBytes);

	const manifest: Record<string, string> = {};
	for (const m of opfText.matchAll(/<item\b[^>]*\/?>/g)) {
		const idMatch = m[0].match(/\bid="([^"]+)"/);
		const hrefMatch = m[0].match(/\bhref="([^"]+)"/);
		if (idMatch && hrefMatch) manifest[idMatch[1]] = hrefMatch[1];
	}
	const spineIds = [...opfText.matchAll(/<itemref\b[^>]*\/?>/g)]
		.map((m) => m[0].match(/\bidref="([^"]+)"/)?.[1])
		.filter((x): x is string => !!x);

	const bolumler = spineIds
		.map((id) => {
			const href = manifest[id];
			const fileBytes = href ? files[opfDir + href] : undefined;
			return fileBytes ? htmlToText(new TextDecoder().decode(fileBytes)) : '';
		})
		.filter(Boolean);
	if (!bolumler.length) throw new Error('.epub dosyasından bölüm okunamadı (boş ya da desteklenmeyen biçim).');
	return kirp(bolumler.join('\n\n'));
}

const CIKARICILAR: Record<string, (bytes: Uint8Array) => string> = {
	txt: metinCikarTxt,
	md: metinCikarTxt,
	csv: metinCikarTxt,
	docx: metinCikarDocx,
	pptx: metinCikarPptx,
	epub: metinCikarEpub,
};

// pdf burada yok — çağıran taraf (routes/rakipAnalizi.ts) pdf'i bu fonksiyona hiç göndermiyor,
// doğrudan Claude'a document content block olarak iletiyor.
export function belgedenMetinCikar(uzanti: string, bytes: Uint8Array): string {
	const cikarici = CIKARICILAR[uzanti];
	if (!cikarici) throw new Error(`Desteklenmeyen dosya türü: .${uzanti}`);
	return cikarici(bytes);
}

// Web linki içe aktarma (Faz D1) — sadece statik/sunucu-render metin sayfaları. YouTube (ve
// genel olarak video transkripti gerektiren linkler) kasıtlı olarak reddediliyor: YouTube bir JS
// SPA'sı olduğu için ham HTML'i kazımak transkript değil boş/anlamsız metin döner — transkript
// çıkarımı ayrı, araştırma gerektiren bir sonraki faz (bkz. INTEGRASYON_TODO.md 2026-08-15).
export async function metinCikarWebLink(url: string): Promise<string> {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		throw new Error('Geçersiz link.');
	}
	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('Sadece http(s) linkleri desteklenir.');
	if (parsed.hostname === 'youtube.com' || parsed.hostname.endsWith('.youtube.com') || parsed.hostname === 'youtu.be') {
		throw new Error('YouTube linkleri henüz desteklenmiyor (transkript çıkarımı ayrı bir aşamada eklenecek).');
	}
	const response = await fetch(parsed.toString(), { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TalkAndHealBot/1.0)' } });
	if (!response.ok) throw new Error(`Link alınamadı (HTTP ${response.status}).`);
	const contentType = response.headers.get('content-type') || '';
	if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
		throw new Error('Bu link türü desteklenmiyor (sadece web sayfası).');
	}
	const html = await response.text();
	const metin = kirp(htmlToText(html));
	if (!metin) throw new Error('Sayfadan okunabilir metin bulunamadı.');
	return metin;
}
