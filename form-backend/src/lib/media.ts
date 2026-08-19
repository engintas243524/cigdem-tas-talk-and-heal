import type { Env } from '../types';

// Blog/Etkinlik medya deposu (Madde 5/6, 2026-08-19, kullanıcı onayı: Cloudflare R2, bkz.
// INTEGRASYON_TODO.md maliyet/performans karşılaştırması). Şimdilik SADECE görsel — video hâlâ
// YouTube linki (events.ts/blog.ts'teki videoUrl) üzerinden, R2'ye video koymuyoruz: bir telefon
// videosu birkaç yüz MB tutabilir, ücretsiz 10GB'ı hızla tüketir ve YouTube zaten ücretsiz/
// amaca uygun bir CDN+oynatıcı sağlıyor — gerçek bir dezavantaj değil.
const IZIN_VERILEN_MIME: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/gif': 'gif',
};

const MAKS_BOYUT_BYTES = 8 * 1024 * 1024; // 8MB — tipik bir telefon fotoğrafı için cömert, sınırsız değil

export class MedyaYuklemeHatasi extends Error {}

function base64ToBytes(base64: string): Uint8Array {
	const binStr = atob(base64);
	const bytes = new Uint8Array(binStr.length);
	for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
	return bytes;
}

// Frontend'in her yerde (panel.html, rakip-analizi.html, events-box.js, blog-box.js) zaten
// hardcode ettiği AYNI Worker origin'i — yeni bir env var/config katmanı eklemek yerine mevcut
// konvansiyona uyuyoruz.
const API_ORIGIN = 'https://form-backend.engintass19-358.workers.dev';

export function medyaUrlOlustur(key: string): string {
	return `${API_ORIGIN}/media/${key}`;
}

export async function medyaYukle(env: Env, base64: string, mimeType: string): Promise<{ key: string; url: string }> {
	const uzanti = IZIN_VERILEN_MIME[mimeType];
	if (!uzanti) throw new MedyaYuklemeHatasi(`Desteklenmeyen görsel türü: ${mimeType}. Sadece JPEG/PNG/WEBP/GIF.`);
	const bytes = base64ToBytes(base64);
	if (bytes.byteLength > MAKS_BOYUT_BYTES) throw new MedyaYuklemeHatasi('Görsel çok büyük (azami 8MB).');
	// Rastgele UUID anahtar — içerik hiç değişmeyeceği için GET /media/:key sonsuz cache'lenebilir
	// (immutable), dosya adı çakışması/üzerine yazma riski de yok.
	const key = `${crypto.randomUUID()}.${uzanti}`;
	await env.MEDIA_BUCKET.put(key, bytes, { httpMetadata: { contentType: mimeType } });
	return { key, url: medyaUrlOlustur(key) };
}
