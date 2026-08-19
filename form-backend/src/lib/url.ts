// 2026-08-19 — bir link şemasız ("talkandheal.co.uk/..." gibi) kaydedilip <a href> olarak
// doğrudan kullanılırsa, tarayıcı bunu MUTLAK değil geçerli sayfaya göre GÖRELİ bir yol sanıyor
// (bkz. events.ts'teki ilk bulgu: ana sayfadaki "Yerinizi Ayırtın" butonunun 404 vermesi). Şema
// zaten varsa (http/https/mailto/tel vb.) veya "//" ile başlıyorsa dokunulmuyor, yoksa https://
// baştan ekleniyor. events.ts ve blog.ts arasında paylaşılan tek kaynak.
export function normalizeUrl(raw: string): string {
	if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return raw;
	if (raw.startsWith('//')) return 'https:' + raw;
	return 'https://' + raw;
}
