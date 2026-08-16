// Limit Yükseltme (2026-08-16) — Çiğdem'in Anthropic'e yüklediği tutarı (istediği para biriminde)
// USD karşılığına çevirir, RAPOR_MALIYETI_USD'ye bölüp kaç ek rapor hakkı kazandığını hesaplamak
// için kullanılır (bkz. routes/kullanimLimit.ts). Frankfurter.app: anahtar gerektirmeyen, Avrupa
// Merkez Bankası referans kurlarını kullanan ücretsiz bir kur API'si — Google/Anthropic'in kendi
// bir kur servisi yok, üçüncü taraf gerekiyor. Sonuç KESİN değil, yaklaşık (Anthropic'in gerçek
// tahsilatı kart ağının o anki kuruna göre değişebilir) — çağıran kod bunu kullanıcıya belirtir.
export async function usdKarsiligi(tutar: number, paraBirimi: string): Promise<number> {
	const kod = paraBirimi.trim().toUpperCase();
	if (kod === 'USD') return tutar;

	const url = `https://api.frankfurter.app/latest?amount=${encodeURIComponent(tutar)}&from=${encodeURIComponent(kod)}&to=USD`;
	const response = await fetch(url);
	if (!response.ok) throw new Error(`Kur bilgisi alınamadı (${kod} → USD): ${response.status}`);
	const data = (await response.json()) as { rates?: Record<string, number> };
	const usd = data.rates?.USD;
	if (typeof usd !== 'number' || !Number.isFinite(usd)) throw new Error(`Kur bilgisi alınamadı (${kod} → USD): geçersiz yanıt`);
	return usd;
}
