# Handoff — 2026-08-27

## Şu an tam olarak nerede kaldık

Bu oturumda Talk & Heal'in **11 sosyal medya platformunu Postiz'e (Sparrow'un paylaşılan Netcup
kurulumu, `app.sparro.io`) bağlama** işine başlandı. Tam hesap/durum tablosu artık
`TALK_AND_HEAL_HESAPLAR.md`'de tutuluyor (Sparrow'daki `SPARROW_HESAPLAR.md` deseninde) —
yeni bir platform eklendiğinde oraya satır eklenmeli, şifreler orada asla düz metin durmaz.

### Önkoşul işler (bu oturumda çözüldü)

1. **Claude in Chrome bağlantısı** kuruldu — uzantı `engintass19@gmail.com` hesabında zaten
   giriş yapılmış olmalı (aynı hesap Claude Code CLI'nın kullandığı hesapla eşleşmeli, aksi halde
   pairing başarısız oluyor — bu oturumda önce hesap uyuşmazlığı yüzünden takıldı, düzeltildi).
2. **Postiz backend süreci migration sonrası bozuktu** — PM2 `backend` app'i "online" görünüyordu
   ama port 3000'i hiç bind etmemişti (nginx "connection refused"/"no live upstreams" veriyordu),
   Google/email login bu yüzden hiç çalışmıyordu. `docker exec postiz pm2 restart backend` ile
   düzeltildi. Aynı sorun tekrar çıkarsa aynı komut işe yarar.
3. **Postiz'in Mastodon entegrasyonu hiç yapılandırılmamıştı** — `/opt/postiz/docker-compose.yaml`'da
   `MASTODON_CLIENT_ID`/`MASTODON_CLIENT_SECRET` boştu. mastodon.social'da "Talk & Heal (Postiz)"
   adında bir OAuth uygulaması oluşturulup env'e yazıldı, `docker compose up -d postiz` ile
   container yeniden oluşturuldu. Detay: `TALK_AND_HEAL_HESAPLAR.md`.
4. **Meta Developer App için gerçek bir Privacy Policy URL gerekiyordu** — `talkandheal.co.uk`
   hâlâ eski WordPress sunucusunda (`hosting-devir-gorusmesi-goker.md`), bu depodaki statik
   siteye HENÜZ geçilmedi. `gizlilik-politikasi.html` yazıldı, GitHub'a push edildi (commit
   `18c625f`). Cloudflare Pages'e hızlı deploy denendi ama yeni `*.pages.dev` alt alan adı
   uzun süre (10+ dk) erişilemez kaldı (DEPLOY-08, `08-deploy.md`) — GitHub Pages'e (repoda
   zaten etkinmiş) geçilerek bypass edildi. **Canlı URL:**
   `https://engintas243524.github.io/cigdem-tas-talk-and-heal/gizlilik-politikasi.html`

### Platform durumu (11 platform: Facebook, Instagram, LinkedIn, X, TikTok, YouTube, Bluesky,
Threads, Google Business, Pinterest, Mastodon)

- **Mastodon — TAMAMLANDI.** Hesap (`@talkandheal@mastodon.social`) açıldı, Postiz'e bağlandı,
  Postiz'de yeni oluşturulan **"Talk & Heal" customer grubuna** atandı (Sparro'nun kendi
  kanallarından ayrı, sol panelde ayrı başlık altında görünüyor).
- **Bluesky — TAMAMLANDI.** Hesap (`talkandheal.bsky.social`) açıldı, "Postiz" adında bir App
  Password oluşturuldu, Postiz'e bağlandı, "Talk & Heal" grubuna atandı. **Dikkat:** Postiz'in
  "Add Channel → Bluesky" formu tarayıcı autofill ile Sparro'nun kendi bilgilerini
  (`engintass19@gmail.com`) önceden dolduruyor — her seferinde manuel temizleyip doğru hesabı
  girmek gerekiyor.
- **Instagram — YARIDA.** Hesap açıldı (`talkandheal.uk` — düz `talkandheal` alınmıştı, alakasız
  küçük bir hesap @Mir-za'ya ait), İşletme (Business) hesabına çevrildi (kategori:
  Sağlık/Güzellik). **Henüz Postiz'e bağlanmadı** — bunun için Meta Developer App (Instagram
  Standalone / "Business Login for Instagram") kurulması gerekiyor, artık gizlilik politikası
  URL'i hazır olduğu için bu adıma geçilebilir.
- **Facebook, LinkedIn, X, TikTok, YouTube, Threads, Google Business, Pinterest — HİÇ
  BAŞLANMADI.**

### Yeni oturumda İLK yapılacak

1. **Meta Developer App oluştur** (developers.facebook.com, "Talk & Heal" adında, Sparro'nun
   kendi App'lerinden AYRI — müşteri karışmasın). Privacy Policy URL hazır (yukarıda). Bu tek
   App, Instagram + Facebook + (sonra) Threads için kullanılabilir — Sparro'nun kendi deneyiminde
   olduğu gibi ("Instagram Standalone" yolu, `business_management` izni EKLEME —
   Sparro'da bu, gereksiz "İşletmeler" onay adımına ve scope hatasına yol açmıştı).
2. Instagram Tester rolü eklenip `talkandheal.uk` hesabından kabul edilmeli (App henüz
   Development modundaysa).
3. Instagram bağlandıktan sonra Facebook Page kurulumuna geçilebilir (bir kişisel Facebook
   hesabı üzerinden "Sayfa" oluşturmak gerekiyor — Çiğdem'in ya da kullanılacak hesabın kişisel
   Facebook'u var mı henüz netleşmedi, sorulmalı).
4. Sıradaki kolay platformlar (düşük geliştirici-konsolu yükü): TikTok artık mümkün olabilir
   (Talk & Heal'in artık gerçek bir Privacy Policy URL'i var — Sparro'nun TikTok'u tam da bu
   yüzden bloke olmuştu).

## Detaylı gerekçe

Hesap/kimlik takibi: `TALK_AND_HEAL_HESAPLAR.md`. Cloudflare Pages/GitHub Pages olayının tam
teşhis zinciri: `talk-and-heal-hata-gunlugu/08-Deploy/08-deploy.md` (DEPLOY-08).

## Eski açık maddeler (değişmedi, bu oturumda dokunulmadı)

- NOTES.md: `tascigdem1977@gmail.com` üzerinden gerçek Anthropic + Google Places API key'leri
  henüz alınmadı.
- `aksiyonAnaliz` kotası 13/13 dolu, kullanıcı "Limiti Yükselt" ile açmayı düşünüyor.
- Planın kendi "Implementasyon sonrası" notundaki iki kod-dışı madde hâlâ açık: Sparrow'a
  doküman notu işlenmesi, panelin (rakip-analizi.html) Sheets hücre notunu görsel olarak
  göstermesi gerekip gerekmediği (kullanıcıya henüz sorulmadı).
- Bilinen, bilerek kapsam dışı bırakılan ayrı bir risk: `googlePuani` parametresi seçiliyken
  `rakipYorumBaglamiGetir` (Google Places tabanlı) rakip başına 2 ayrı unbatched subrequest
  ekliyor — 10 rakip + googlePuani ile istek ~70'e çıkabiliyor. Free planda hâlâ bir risk, ayrı
  bir takip bileti olarak ele alınmalı.
- `talkandheal.co.uk`'in WordPress'ten bu depodaki statik siteye geçişi hâlâ yapılmadı
  (`hosting-devir-gorusmesi-goker.md`) — domain yönetimi kimde net değil, Çiğdem'in netleştirmesi
  gerekiyor. Bu, sosyal medya entegrasyonunu engellemiyor (GitHub Pages ile bypass edildi) ama
  ayrı, çözülmesi gereken bir altyapı maddesi olarak kalmaya devam ediyor.
- Talk & Heal randevu/ödeme/WhatsApp gibi hassas veri işlediği için tam kapsamlı bir gizlilik
  politikası (UK ICO/GDPR uyumlu, hukuki incelemeli) hâlâ yazılmadı — bugün eklenen
  `gizlilik-politikasi.html` sadece sosyal medya entegrasyonu için asgari bir bildirim.
