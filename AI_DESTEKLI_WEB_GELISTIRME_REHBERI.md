# AI Destekli Web Geliştirme Rehberi — 10 Aşama

Model hiyerarşisi: **Opus** (kavramsal/stratejik işler) → **Fable 5** (kodlama) → **Sonnet** (test, dağıtım, izleme). Tüm araçlar ücretsiz ve açık kaynaktır.

Sistem Gereksinimleri: Node.js (v18+), Docker Desktop, Cursor IDE veya VS Code, Git.

---

## 1. Aşama: Keşif (Discovery)

Referans sitenin görsel dilinin (renk, font, spacing) incelenmesi ve `NOTES.md` kararlarının teyit edilmesi.

### Araç: cURL + Playwright (headless render) & Markdown

**[GÜNCELLEME]** `curl` yalnızca ham HTML döner; JS ile render edilen (SPA/React/Vue tabanlı) sitelerde gerçek DOM'u kaçırır. Bu yüzden statik çekimin yanına, Aşama 6'da zaten kurulacak olan Playwright ile headless render ekliyoruz — yeni bağımlılık yaratmadan.

**Terminal Komutu:**
```bash
mkdir akici-proje && cd akici-proje
touch NOTES.md
curl -s https://referans-site.com > referans-statik.html

# JS render edilmiş DOM ve tam sayfa görsel için:
npx playwright install chromium
npx playwright screenshot https://referans-site.com referans.png --full-page
node -e "require('playwright').chromium.launch().then(async b=>{const p=await b.newPage();await p.goto('https://referans-site.com');require('fs').writeFileSync('referans.html', await p.content());await b.close();})"
```

**Yapay Zekaya Verilecek Prompt (Model: Opus):**
> "Sen üst düzey bir Ürün Yöneticisi ve Tasarım Stratejistisin. Dizindeki `referans.html` dosyasını incele — bu dosya render-sonrası DOM'dur, statik curl çıktısı değil (`referans-statik.html` sadece karşılaştırma amaçlı ham kaynaktır). Bu sitenin kullandığı ana renk paletini (HEX kodları), tipografik hiyerarşiyi ve spacing (boşluk) mantığını analiz et. Çıkarımlarını mevcut `NOTES.md` dosyamdaki kararlarla karşılaştırıp teyit et ve `NOTES.md` dosyasını güncelleyerek projeye yön verecek nihai keşif raporunu oluştur."

---

## 2. Aşama: UX (Kullanıcı Deneyimi & Bilgi Mimarisi)

Mobil öncelikli sayfa akışını ve bilgi mimarisini (Information Architecture) planlama.

### Araç: Mermaid.js CLI

Diyagramları ve akış şemalarını doğrudan terminal üzerinden oluşturabilen açık kaynaklı bir araç.

**Terminal Komutu:**
```bash
npm install -g @mermaid-js/mermaid-cli
touch akis.mmd
```

**Yapay Zekaya Verilecek Prompt (Model: Opus):**
> "Mobil öncelikli (mobile-first) yaklaşımı baz alarak projemizin bilgi mimarisini ve sayfa akışını planla. Kullanıcının siteye girişinden iletişim formunu doldurmasına kadar geçen süreci bir akış şemasına dök. Bu şemayı `akis.mmd` dosyasına Mermaid sözdizimi (syntax) kullanarak yaz. Dosyayı kaydettikten sonra terminalden `mmdc -i akis.mmd -o akis.png` komutunu çalıştırarak diyagramı görselleştir."

---

## 3. Aşama: UI (Görsel Tasarım Sistemi Spekleri)

Opus'un tasarım kurallarını koda dönüştürülebilir "Design Tokens" (Tasarım Jetonları) haline getirmesi.

### Araç: Style Dictionary (veya Tailwind Init)

**Terminal Komutu:**
```bash
npm install -D tailwindcss
npx tailwindcss init
```

**Yapay Zekaya Verilecek Prompt (Model: Opus):**
> "Keşif aşamasında `NOTES.md` içine yazdığın renk, tipografi ve fluid spacing (clamp fonksiyonları) speklerini al. Bunları tam teşekküllü bir UI tasarım sistemi olarak `tailwind.config.js` dosyasının `theme` objesine entegre et. CSS Grid yapıları için özel sütun (column) ayarlarını da bu dosyaya ekle."

---

## 4. Aşama: Frontend (Kodun Sıfırdan Yazılması)

### Araç: Vite.js

**Terminal Komutu:**
```bash
npm create vite@latest . -- --template vanilla
npm install
npm run dev
```

**Yapay Zekaya Verilecek Prompt (Model: Fable 5):**
> "Sen uzman bir Frontend Geliştiricisin. `tailwind.config.js` içindeki tasarım sistemimizi kullanarak `index.html` ve `style.css` dosyalarını sıfırdan yaz. Koda kesinlikle mobil ekranları (max-width: 480px) düşünerek başla (Mobile-First). Ardından tablet ve masaüstü breakpoint'lerini (md, lg, xl) ekleyerek tasarımı Fluid (akıcı) hale getir. Sabit px kullanmak yasaktır, her şey `rem`, `%` ve `clamp()` ile çalışmalıdır."

---

## 5. Aşama: Backend/Entegrasyon (İletişim Formu Endpoint'i)

### Araç: Cloudflare Wrangler CLI

**Terminal Komutu:**
```bash
npm install -g wrangler
wrangler init form-backend -y
cd form-backend
```

**Yapay Zekaya Verilecek Prompt (Model: Fable 5 — Onaylı Adım):**
> "Frontend'de oluşturduğumuz iletişim formundan gelecek POST isteklerini karşılayacak bir sunucusuz (serverless) fonksiyon yazmalısın. `form-backend/src/index.js` dosyasına, Cloudflare Workers kullanarak form verilerini JSON olarak alacak, CORS ayarlarını yapacak ve veriyi Telegram API veya ücretsiz bir E-posta servisine (Nodemailer ile) iletecek basit bir endpoint kodu yaz. Bu işlem için benden onay (Y/N) iste."

---

## 6. Aşama: Test/QA (Yerel + Responsive + Erişilebilirlik Testi)

**[GÜNCELLEME]** Lighthouse'un erişilebilirlik (a11y) skoru yüzeysel kalıyor. **axe-core** (MIT lisanslı, tamamen ücretsiz/açık kaynak, Deque Systems) WCAG kurallarını çok daha derinlemesine tarar ve Playwright'a doğrudan entegre olur.

### Araç: Playwright & Lighthouse CLI & axe-core

**Terminal Komutu:**
```bash
npm init playwright@latest
npm install -g @lhci/cli
npm install -D @axe-core/playwright
npx lhci collect --url=http://localhost:5173
```

**Yapay Zekaya Verilecek Prompt (Model: Sonnet):**
> "Sen acımasız bir Kalite Güvence (QA) mühendisisin. Sitemiz `localhost:5173` üzerinde çalışıyor. Playwright kullanarak bir test betiği (`qa.spec.js`) yaz. Sitenin iPhone 14, iPad Mini ve 1080p ekranlarda render testlerini yap, butonların tıklanabilirliğini kontrol et. Ayrıca `@axe-core/playwright` ile her sayfa için WCAG 2.1 AA taraması ekle ve ihlalleri (violations) severity'ye göre raporla. Son olarak Lighthouse raporunu analiz edip performans, erişilebilirlik ve SEO puanlarını bana raporla."

---

## 7. Aşama: Debug (Hataların Giderilmesi)

### Araç: Cursor IDE Debugger / Node.js

**Terminal Komutu:**
```bash
npm run lint
```

**Yapay Zekaya Verilecek Prompt (Model: Fable 5):**
> "Bir önceki adımda QA Sonnet tarafından iletilen hata raporlarını (Lighthouse, axe-core ve Playwright loglarını) incele. Mobilde taşan (overflow) konteynerları, kontrast eksikliklerini, axe-core'un raporladığı erişilebilirlik ihlallerini ve form endpoint'indeki CORS hatalarını tek tek onar. Düzeltmeleri yaptıktan sonra testlerin yeşile döndüğünden emin olmak için Playwright'ı tekrar çalıştır."

---

## 8. Aşama: Deploy (Dağıtım)

### Araç: Cloudflare Pages CLI (veya Vercel/Netlify)

**Terminal Komutu:**
```bash
npm run build
wrangler pages deploy dist/ --project-name akici-web
```

**Yapay Zekaya Verilecek Prompt (Model: Sonnet & Kritik konularda Opus'a danışarak):**
> "(Sonnet'e): Üretim (build) dosyalarımızı hazırladık. `wrangler pages deploy` komutunu kullanarak sitemizi Cloudflare Pages'e dağıt. Dağıtım sırasında oluşabilecek derleme hatalarını (build errors) bana bildir. (Opus'a Not: Eğer çevre değişkenlerinde (ENV vars) veya domain yönlendirmelerinde kritik bir güvenlik kararı alınması gerekirse, süreci durdur ve bana stratejik tavsiye ver.)"

---

## 9. Aşama: Yayın-sonrası Doğrulama (Post-Deploy)

**[GÜNCELLEME]** Checkly çıkarıldı: CLI'ı Apache 2.0 ile açık kaynak olsa da platform hesap gerektiren bir SaaS'tır ve ücretsiz (Hobby) planı ayda 1.000 browser check / 10.000 API check ile sınırlıdır — "tamamen açık kaynak + sınırsız ücretsiz" kriterine uymuyor. Yerine, zaten kurulu olan Playwright'ı canlı domaine karşı tekrar çalıştırıyoruz: yeni bağımlılık yok, hesap yok, kota yok, %100 ücretsiz.

### Araç: Playwright (canlı domain üzerinde tekrar çalıştırma)

**Terminal Komutu:**
```bash
BASE_URL=https://senin-domainin.com npx playwright test qa.spec.js
```

**Yapay Zekaya Verilecek Prompt (Model: Sonnet):**
> "Sitemiz canlı domainde yayına girdi. `qa.spec.js` test betiğini `BASE_URL` ortam değişkeni ile canlı domaine karşı tekrar çalıştır. İletişim formuna sahte (dummy) veri göndererek 200 OK yanıtı dönüp dönmediğini, görsellerin canlı CDN üzerinden kırılmadan yüklenip yüklenmediğini test et."

> **Not:** Public bir status page gerekirse, tamamen açık kaynak ve self-hosted olan [OpenStatus](https://github.com/openstatusHQ/openstatus) opsiyonel olarak eklenebilir.

---

## 10. Aşama: İzleme/Bakım (Monitoring)

### Araç: Uptime Kuma

**Terminal Komutu:**
```bash
docker run -d --restart=always -p 3001:3001 -v uptime-kuma:/app/data louislam/uptime-kuma:1
```

**Yapay Zekaya Verilecek Prompt (Model: Sonnet):**
> "Sitemizin ve form API'mizin erişilebilirliğini izlemek için Docker üzerinde Uptime Kuma'yı ayağa kaldırdım. Bana Uptime Kuma'nın REST API'sini (veya arayüzünü) kullanarak; sitemin URL'sini ve Cloudflare Workers form endpoint'imi her 5 dakikada bir kontrol edecek, eğer yanıt süresi (latency) 1 saniyeyi geçerse veya 404 dönerse Discord/Telegram üzerinden webhook ile bildirim atacak bir konfigürasyon yapısı hazırla."

---

## Değişiklik Özeti

| Aşama | Değişiklik | Gerekçe |
|---|---|---|
| 1 — Keşif | Playwright headless render eklendi | curl JS-render edilen siteleri kaçırır |
| 6 — Test/QA | axe-core eklendi | Lighthouse a11y yüzeysel, axe-core WCAG'ı derinlemesine tarar |
| 9 — Post-Deploy | Checkly çıkarıldı → Playwright tekrar kullanımı | Checkly hesap/kota gerektiren SaaS, tam ücretsiz/açık kaynak değil |
