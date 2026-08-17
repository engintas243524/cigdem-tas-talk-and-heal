import { describe, it, expect } from 'vitest';
import { etikDenetimYap } from '../src/lib/etikGate';

describe('etikDenetimYap', () => {
	it('boş metinde veya rejim verilmediğinde boş döner', () => {
		expect(etikDenetimYap('', ['tpdTtb'])).toEqual([]);
		expect(etikDenetimYap('garantili tedavi ediyoruz', [])).toEqual([]);
	});

	it('temiz (kural ihlali olmayan) metinde boş döner', () => {
		const metin = 'Kaygı bozukluğu sürecinde birlikte çalışıyoruz, her seansta farklı teknikler deneriz.';
		expect(etikDenetimYap(metin, ['tpdTtb', 'bacp'])).toEqual([]);
	});

	describe('TR (tpdTtb) kuralları', () => {
		it('"garantili iyileşme" kalıbını yakalar', () => {
			const bayraklar = etikDenetimYap('Garantili iyileşme sunuyoruz.', ['tpdTtb']);
			expect(bayraklar.map((b) => b.kuralId)).toContain('tr-garanti-iyilesme');
			expect(bayraklar[0].seviye).toBe('yasak');
		});

		it('"X seansta çözdük" kalıbını yakalar', () => {
			const bayraklar = etikDenetimYap('6 seansta çözdük bu sorunu.', ['tpdTtb']);
			expect(bayraklar.map((b) => b.kuralId)).toContain('tr-seansta-cozduk');
		});

		it('"aşıyoruz" fiilini riskli olarak yakalar', () => {
			const bayraklar = etikDenetimYap('Kaygı bozukluğunu birlikte aşıyoruz.', ['tpdTtb']);
			expect(bayraklar.map((b) => b.kuralId)).toContain('tr-asma-fiili');
			expect(bayraklar.find((b) => b.kuralId === 'tr-asma-fiili')?.seviye).toBe('riskli');
		});

		it('tanı koyar nitelikte ifadeyi yakalar', () => {
			const bayraklar = etikDenetimYap('Yorumunuza göre kaygı bozukluğu tanısı koyuyoruz.', ['tpdTtb']);
			expect(bayraklar.map((b) => b.kuralId)).toContain('tr-tani-koyma');
		});

		it('diğer terapistleri karalayan ifadeyi yakalar', () => {
			const bayraklar = etikDenetimYap('Diğer terapistler yetersiz kalıyor, biz farklıyız.', ['tpdTtb']);
			expect(bayraklar.map((b) => b.kuralId)).toContain('tr-diger-terapist-karalama');
		});

		it('talep yaratıcı aciliyet dilini yakalar', () => {
			const bayraklar = etikDenetimYap('Hemen şimdi randevu al, fırsatı kaçırma!', ['tpdTtb']);
			expect(bayraklar.map((b) => b.kuralId)).toContain('tr-talep-yaratici-baski');
		});

		it('bacp rejimi seçilmeyince TR kuralları çalışmaz', () => {
			expect(etikDenetimYap('Garantili iyileşme sunuyoruz.', ['bacp'])).toEqual([]);
		});
	});

	describe('BACP/İngiltere kuralları', () => {
		it('sonuç garantisi veren ifadeyi yakalar', () => {
			const bayraklar = etikDenetimYap('We guarantee a full recovery.', ['bacp']);
			expect(bayraklar.map((b) => b.kuralId)).toContain('bacp-guarantee-outcome');
		});

		it('"100% effective" ifadesini yakalar', () => {
			const bayraklar = etikDenetimYap('Our therapy is 100% effective.', ['bacp']);
			expect(bayraklar.map((b) => b.kuralId)).toContain('bacp-100-effective');
		});

		it('"proven to cure" ifadesini yakalar', () => {
			const bayraklar = etikDenetimYap('This method is proven to cure anxiety.', ['bacp']);
			expect(bayraklar.map((b) => b.kuralId)).toContain('bacp-proven-cure');
		});

		it('"BACP Accredited" iddiasını riskli olarak yakalar (statü doğrulanmalı)', () => {
			const bayraklar = etikDenetimYap('I am a BACP Accredited therapist.', ['bacp']);
			const bayrak = bayraklar.find((b) => b.kuralId === 'bacp-accredited-claim');
			expect(bayrak).toBeDefined();
			expect(bayrak?.seviye).toBe('riskli');
		});

		it('rakip terapistleri kötüleyen karşılaştırmayı yakalar', () => {
			const bayraklar = etikDenetimYap('We are better than other therapists in London.', ['bacp']);
			expect(bayraklar.map((b) => b.kuralId)).toContain('bacp-better-than-others');
		});

		it('tpdTtb rejimi seçilmeyince BACP kuralları çalışmaz', () => {
			expect(etikDenetimYap('We guarantee a full recovery.', ['tpdTtb'])).toEqual([]);
		});
	});

	it('her iki rejim de seçiliyse her iki listeden de eşleşme bulabilir', () => {
		const metin = 'Garantili iyileşme sunuyoruz. We guarantee a full recovery.';
		const bayraklar = etikDenetimYap(metin, ['tpdTtb', 'bacp']);
		const kuralIdler = bayraklar.map((b) => b.kuralId);
		expect(kuralIdler).toContain('tr-garanti-iyilesme');
		expect(kuralIdler).toContain('bacp-guarantee-outcome');
	});
});
