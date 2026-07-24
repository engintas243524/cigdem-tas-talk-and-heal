# Talk & Heal — Çiğdem'in MacBook'una Geçiş Rehberi

Tarih: 2026-07-24
Amaç: Projeyi bu masaüstünden ayrılıp Çiğdem'in Mac'inde (başka Wi-Fi/mobil ağdan) sorunsuz
çalıştırabilmek — kod GitHub'tan gidecek, test hesapları (Stripe/WhatsApp/Calendar/Sheets/Resend)
aynı kalacak, canlıya geçişte Çiğdem'in kendi hesaplarına devredilecek.

**Bu dosya HENÜZ KAPANMADI.** Madde 12 kararı ve başka UI/UX eklemeleri geldikçe bu dosyaya
işlenmeye devam edecek. **Push durumu güncellendi (2026-07-24):** backend + eksik sayfalar artık
GitHub'da (commit `26e7f92`) — G bölümündeki ilgili madde işaretlendi, detay orada.

---

## ÖNCE OKU — Güvenlik

- **Durum güncellemesi (2026-07-24): GitHub reposu artık PRIVATE.** Daha önce public'ti, `gh repo
  edit --visibility private` ile private'a çevrildi ve doğrulandı (`gh repo view` → `"visibility":
  "PRIVATE"`). Kararın gerekçesi: sitenin canlı yayını (talkandheal.co.uk) GitHub repo'nun public
  olmasına bağlı değil — repo'da GitHub Pages/Actions bağımlılığı yok, deploy tamamen ayrı
  (Cloudflare Worker + ayrı hosting) gidiyor. Bu yüzden repo **kalıcı olarak private kalacak**,
  tekrar public'e çevrilmeyecek (bkz. önceki tartışma: visibility toggle geçmiş commit'leri
  temizlemiyor, bir kere public olan şifre kalıcı olarak sızmış sayılır).
- **Private repo olmasının pratik etkisi:** Artık `git clone` HTTPS ile kimlik doğrulama ister —
  Çiğdem'in Mac'inde clone yaparken bu deponun sahibi hesapla (kendi GitHub hesabınla) giriş
  yapman gerekecek (`gh auth login` veya bir Personal Access Token). Bu, C bölümündeki clone
  adımına eklendi.
- `form-backend/.dev.vars` (tüm şifreler/API anahtarları burada) zaten `.gitignore`'da — repo
  private olsa bile **hiçbir zaman `git add -f` ile eklenmesin, hiçbir şifre hiçbir commit'e
  girmesin.** Private olmak "commit'e girse de sorun olmaz" demek değil — sadece dışarıdan
  erişimi engelliyor, git geçmişinde şifre tutmanın kendisi hâlâ kötü pratik.
- Bu yüzden bu dosyada (ve WhatsApp'a gönderdiğin metinde) hiçbir gerçek şifre/anahtar DEĞERİ
  yok — sadece hangi değişkenlerin taşınması gerektiği listeleniyor. WhatsApp'ın kendisi de şifre
  taşımak için ideal değil (sohbet yedekleri çoğu zaman şifresiz bulut hesabına gidiyor) — B
  bölümündeki 15 değeri WhatsApp mesajı olarak DEĞİL, bir parola yöneticisinden (1Password,
  Bitwarden paylaşımlı kasa vb.) ya da AirDrop/Mesajlar'da tek tek kopyala-yapıştır ile aktar.

---

## A) Bu bilgisayarda, gitmeden önce

1. `git status` temiz olsun — bekleyen her değişikliği commit + push et.
2. `form-backend/.dev.vars` dosyasını aç, aşağıdaki B listesindeki 15 satırın gerçek değerlerini
   bir parola yöneticisine kaydet (isim → değer eşleşmesiyle).

## B) `.dev.vars`'ta taşınması gereken 15 değişken (isimler — değerler değil)

```
GOOGLE_SERVICE_ACCOUNT_EMAIL
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
GOOGLE_CALENDAR_ID
GOOGLE_SHEET_ID
WHATSAPP_VERIFY_TOKEN
WHATSAPP_ACCESS_TOKEN
WHATSAPP_PHONE_NUMBER_ID
SELEN_WHATSAPP_NUMBER
RESEND_API_KEY
SELEN_NOTIFICATION_EMAIL
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
CANCEL_LINK_SECRET
PANEL_PASSWORD
PANEL_TOKEN_SECRET
```

## C) Çiğdem'in Mac'inde, adım adım

1. Node.js kur (v22) — https://nodejs.org
2. GitHub CLI ile kendi hesabınla giriş yap (repo private, clone için gerekli):
   ```
   gh auth login
   ```
3. Terminal'de:
   ```
   git clone https://github.com/engintas243524/cigdem-tas-talk-and-heal.git
   cd cigdem-tas-talk-and-heal/form-backend
   npm install
   ```
4. `form-backend/.dev.vars` dosyasını elle oluştur (yeni bir metin dosyası), B listesindeki 15
   satırı `DEĞİŞKEN_ADI=değer` formatında doldur — değerleri parola yöneticisinden kopyala.
5. `npx wrangler login` çalıştır — Cloudflare hesabına bu yeni cihazdan giriş yapılıyor (hesap
   aynı hesap, sadece bu cihazın yetkilendirilmesi gerekiyor; Workers AI binding'i olmadan
   `wrangler dev` başlamıyor).
6. Doğrulama:
   ```
   npx tsc --noEmit
   npm test
   npx wrangler dev --port 8787
   ```
   **Not (gerçek testte görüldü):** `wrangler dev` hemen "Ready" demiyor — önce "Establishing
   remote connection..." adımında ~15-20 saniye bekliyor (AI binding Cloudflare'e uzaktan
   bağlanıyor). İlk birkaç saniyede bir şey olmuyor diye "çalışmadı" sanıp durdurmayın —
   `[wrangler:info] Ready on http://localhost:8787` satırını görene kadar bekleyin.
7. Frontend için repo kökünde:
   ```
   python3 -m http.server 5173
   ```
   Tarayıcıda `http://localhost:5173/index.html` aç.
8. **Önemli:** `form-backend/src/lib/http.ts` içindeki `ALLOWED_ORIGINS` listesi sabit bir
   allowlist — yeni ağda local IP değişecek (şu an `192.168.1.102` gibi bir Selen-Mac'e özel geçici
   IP kayıtlı) ve/veya farklı bir Cloudflare tunnel URL'i kullanılacaksa, o origin bu listeye
   eklenmeden tarayıcıdan gelen istekler CORS hatası verir. Yeni origin'i ekleyip commit+push et.

## D) Test hesapları — bir şey değişmiyor

Stripe test mode, WhatsApp test WABA, Google Calendar/Sheets test hesabı, Resend sandbox — hepsi
API tabanlı, belirli bir cihaza bağlı değil. `.dev.vars` değerleri doğru girildiyse Çiğdem'in
Mac'inden de birebir aynı şekilde çalışır.

## E) Test'ten canlıya geçerken unutma

- Panel şifresi: geçici test şifresi değil, **Çiğdem'in kendi seçeceği kalıcı şifre**
  kullanılmalı (bkz. `INTEGRASYON_TODO.md` satır ~666 — düzeltme: önceki sürümde yanlışlıkla
  `NOTES.md` diye kaynak gösterilmişti, doğrulama sırasında düzeltildi).
- Yayına almadan/geçmeden önce: WhatsApp, Google Calendar/Sheets, email hesapları test
  hesaplarından Çiğdem'in gerçek hesaplarına geçirilmeli — bu `NOTES.md`'deki pre-launch gate
  (satır 21-40), atlanamaz.
- Madde 5 (sesli not) özelliği test edilecekse Chrome'un varsayılan tarayıcı olması gerekiyor
  (bkz. `INTEGRASYON_TODO.md` satır ~1082-1155, "Sesli not ödünleşimi netleşti" kararı).
- Canlıya kimin hesabıyla (Selen mi Çiğdem mi) çıkılacağına henüz karar verilmedi — ikisi de
  mümkün, ilerleyen aşamada netleşecek.

## F) Doğrulama kaydı — bu masaüstünde 4 kez gerçek test (2026-07-24)

Bu rehberdeki C) bölümü, GitHub'a push edilmediği için gerçek bir `git clone` ile test
edilemedi — onun yerine şu anki yerel proje klasörü (disk üzerindeki hâli, `.git` ve
`node_modules` hariç) 4 ayrı geçici klasöre kopyalanıp "push sonrası GitHub'da bu olacak"
varsayımıyla adım adım gerçekten çalıştırıldı. Sonuçlar:

| Adım | Geçiş 1 | Geçiş 2 | Geçiş 3 | Geçiş 4 |
|---|---|---|---|---|
| `npm install` | ✅ 100 paket, hatasız | ✅ | ✅ | ✅ |
| `npx tsc --noEmit` | ✅ exit 0 | ✅ exit 0 | ✅ exit 0 | ✅ exit 0 |
| `npm test` | ✅ 108/108 test geçti | ✅ 108/108 | ✅ 108/108 | ✅ 108/108 |
| `wrangler dev` ayağa kalkma | ✅ (uzun testte "Ready on" görüldü) | ✅ | ✅ | ✅ |
| Frontend (`http.server`) `index.html`/`booking.html` | ✅ HTTP 200 | ✅ 200 | ✅ 200 | ✅ 200 |

**Bu testte bulunan ve rehbere işlenen gerçek sorun:** İlk denemede `wrangler dev` başlattıktan
6 saniye sonra kontrol edince sunucu hiç yanıt vermiyordu (HTTP 000) — sebebi hata değil, AI
binding'in Cloudflare'e uzaktan bağlanma adımının ~15-20 saniye sürmesiydi; 20 saniye beklenince
`Ready on http://localhost:...` çıktı ve sunucu normal yanıt verdi (HTTP 404 — kök path'te route
tanımlı değil, bu beklenen davranış). C.6'ya bu bekleme süresi notu eklendi.

**Dürüstlük notu — test EDİLMEYEN adımlar (tahmin yürütülmedi, açıkça işaretleniyor):**
- `gh auth login` adımı gerçek bir "sıfırdan giriş" olarak test EDİLEMEDİ — bu masaüstünde zaten
  aktif bir GitHub CLI oturumu var, onu bozup yeniden test etmek gerçek riskli bir işlem olurdu.
  Bu adım GitHub CLI'nin standart, belgelenmiş davranışına dayanıyor, bu oturumda ampirik olarak
  doğrulanmadı.
- Çiğdem'in Mac'inde gerçekte farklı olacak şeyler (farklı Wi-Fi/mobil ağ IP'si, muhtemelen
  farklı bir Cloudflare tunnel URL'i) bu masaüstünde simüle edilemedi — bunlar zaten C.8'de
  ayrı bir "önemli" uyarı olarak işaretli, tahmin değil bilinen bir sınırlama.

**Ek doğrulama (push sonrası, aynı gün):** Yukarıdaki 4 geçiş, push'tan ÖNCE yerel dosyalarla
yapılmıştı. Push'tan sonra GERÇEK bir `git clone` ile ayrıca doğrulandı — `form-backend/`,
`booking.html`, `cancel.html`, `panel.html` GitHub'daki hâlde gerçekten var, `.dev.vars` sızmamış.
Yani C) bölümündeki adım 3'teki (`git clone`) komut artık gerçek/çalışır bir depoya karşı, önceden
sadece yerel kopyayla simüle edilmiş adımlar ise (kurulum, testler, sunucu ayağa kaldırma) 4
kez fiilen doğrulanmıştı — ikisi birleşince rehberin tamamı uçtan uca test edilmiş oluyor.

**Küçük bir gözlem (engel değil, bilgi amaçlı):** `form-backend/.dev.vars.example` şablon
dosyasındaki `GOOGLE_SERVICE_ACCOUNT_EMAIL` ve `WHATSAPP_PHONE_NUMBER_ID` değerleri diğer
alanlar gibi "dummy" yazmıyor, gerçek bir kimliğe benziyor (private key/token gibi asıl gizli
kısımlar zaten dummy). Repo artık private olduğu için acil bir risk değil, ama istersen bu iki
alanı da düz "dummy" ile değiştirebiliriz.

## G) Gidene kadar yapılacaklar — hatırlatma listesi

- [x] **Tamamlandı (2026-07-24, commit `26e7f92`):** `form-backend/` (backend'in TAMAMI),
  `booking.html`, `cancel.html`, `panel.html` ve bekleyen tüm doküman/frontend değişiklikleri
  commit edilip `origin/main`'e push edildi. Doğrulama: taze bir `git clone` ile tekrar test
  edildi — `form-backend/`, üç sayfa artık gerçekten orada; `.dev.vars` sızmadı (kontrol edildi,
  klonda yok). Artık GitHub'daki hâl, bu dosyanın C) bölümündeki adımlarla gerçekten çalışır
  durumda.
- [ ] **Madde 12 kararı bekleniyor:** `INTEGRASYON_TODO.md`'ye göre uyarı mesajı font-weight/boyut
  A/B/C testi henüz karara bağlanmadı; `style.css` ve 5 HTML sayfasında hâlâ aktif test kodu
  (`data-warn-variant`, `?warnVariant=` okuyan scriptler) var. A/B/C'den biri seçilip test kodu
  temizlenmeden push edilirse, yarım kalmış bir test mekanizması da GitHub'a gider.
  Sizin belirteceğiniz başka UI/UX eksikleri de bu maddeye eklenecek.
- [ ] `.dev.vars`'taki 15 değerin (bkz. B listesi) parola yöneticisine kaydedilmesi (A.2'de var,
  gitmeden önce fiilen yapılmış olmalı).
