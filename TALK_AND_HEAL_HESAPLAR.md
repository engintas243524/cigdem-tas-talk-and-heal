# Talk & Heal — Sosyal Medya Platform Hesapları Özeti

Sparrow'daki `SPARROW_HESAPLAR.md` deseninin aynısı. Tüm platformlarda kullanıcı adı/e-posta
tutarlılığı için referans. **Şifreler burada YOK** (kullanıcının kendi şifre yöneticisinde).
Detaylı kurulum/durum kaydı için `talk-and-heal-hata-gunlugu/` ve `handoff.md`.

## Genel kalıp

Tüm platformlarda kullanıcı adı/handle **`talkandheal`**, e-posta **`tascigdem1977@gmail.com`**
olarak tutarlı tutuluyor (2026-08-26'da karar verildi). Postiz'de bu 11 kanal, Sparrow'un
paylaşılan Netcup Postiz kurulumunda (`app.sparro.io`) ayrı bir **"customer" (müşteri grubu)**
olarak gruplanacak — Sparro'nun kendi kanallarıyla karışmayacak.

## Marka Kiti (HER platformda tekrar sorulmadan kullanılacak — 2026-08-27)

Yeni bir platform kurulurken bu bölümdeki bilgiler DOĞRUDAN kullanılır, kullanıcıya tekrar
sorulmaz. `talkandheal` dolu çıkarsa (birçok platformda çıkıyor) fallback: `talkandheal.uk`.

- **Kullanıcı adı/handle:** `talkandheal` → dolu ise `talkandheal.uk`
- **E-posta:** `tascigdem1977@gmail.com`
- **Doğum tarihi (Çiğdem, doğrulama isteyen platformlarda):** 1 Nisan 1977
- **Görünen ad:** `Talk & Heal` (marka) veya `Çiğdem Taş` (platform kişisel profil istiyorsa,
  ör. YouTube ilk kanal adı) — platforma göre ikisinden biri, ama handle her zaman `talkandheal`
- **Logo/profil fotoğrafı (kare avatar gerektiren platformlar için):**
  `assets/logo-heart-only.png` (sadece kalp ikonu, kare crop'a uygun)
  `assets/logo.png` (yatay wordmark, kare olmayan/geniş logo alanları için)
- **Bio/açıklama metni (resmi, index.html meta description'dan, kısaltılabilir):**
  "Çiğdem Taş is a BACP-registered psychotherapist with 20+ years of practice, offering
  individual, couples and organisational work in English and Turkish."
- **Website linki (bio'da kullanılacak):** `https://talkandheal.co.uk` (gerçek/resmi domain,
  hâlâ eski WordPress'te ama bio'da bu yazılır) — Meta App vb. teknik URL'ler için Privacy
  Policy sayfası ayrı: `https://engintas243524.github.io/cigdem-tas-talk-and-heal/gizlilik-politikasi.html`
- **Telefon/iletişim (bazı platformlarda istenebilir):** `+447595455398`, yedek e-posta
  `help@talkandheal.co.uk`

Hedef 11 platform (Talk & Heal'in kendi rakip-platform envanteri listesiyle aynı sıra,
`form-backend/src/config.ts`'deki `RAKIP_PLATFORM_LISTESI`): Facebook, Instagram, LinkedIn, X,
TikTok, YouTube, Bluesky, Threads, Google Business, Pinterest, Mastodon.

| Platform | Kullanıcı adı / Hesap adı | E-posta | Durum | Not |
|---|---|---|---|---|
| Mastodon (mastodon.social) | talkandheal | tascigdem1977@gmail.com | Hesap aktif, e-posta onaylandı (hCaptcha kullanıcı tarafından çözüldü) | Kayıt+onay 2026-08-26'da tamamlandı |
| Mastodon Uygulaması (Geliştirme → Yeni uygulama) | Talk & Heal (Postiz) | — | Oluşturuldu 2026-08-26 | App ID (İstemci anahtarı): `OnmhgZVgQfzeDWN-0tVAlcmTKbVfOQ4wXlcCS30801o`. Client secret düz metin burada YOK — Netcup sunucusundaki `/opt/postiz/docker-compose.yaml`'da `MASTODON_CLIENT_SECRET` olarak duruyor. Kapsamlar: profile, write:media, write:statuses. Redirect URI: `https://app.sparro.io/integrations/social/mastodon` |
| Postiz paneli (app.sparro.io) | — | engintass19@gmail.com (admin girişi) | Giriş yapıldı | Backend restart sonrası (2026-08-26, PM2 backend process port 3000'i bind etmiyordu) düzeltildi |
| Postiz "Talk & Heal" customer grubu | Talk & Heal | — | Oluşturuldu 2026-08-26 | Mastodon + Bluesky kanalları bu gruba atandı, Sparro'nun kendi kanallarından ayrı görünüyor (sol panelde ayrı başlık) |
| Bluesky | talkandheal.bsky.social | tascigdem1977@gmail.com | Hesap aktif, Postiz'e bağlandı, "Talk & Heal" grubuna atandı | Kayıt 2026-08-26'da tamamlandı (hCaptcha kullanıcı tarafından çözüldü). Postiz bağlantısı için "Postiz" adında bir App Password oluşturuldu (Bluesky Ayarlar → Uygulama Şifreleri) — düz metin şifre burada YOK, sadece Postiz içinde saklı. DİKKAT: "Add Channel → Bluesky" formu tarayıcı autofill ile Sparro'nun kendi bilgilerini (engintass19@gmail.com) önceden dolduruyor, her seferinde manuel temizleyip doğru hesabı girmek gerekiyor |

| Instagram | talkandheal.uk | tascigdem1977@gmail.com | Hesap aktif, İşletme (Business) hesabına çevrildi (kategori: Sağlık/Güzellik) | Kayıt 2026-08-26. `talkandheal` kullanıcı adı DOLU (alakasız küçük bir hesap, @Mir-za, 15 takipçi) — `.uk` uzantısıyla devam edildi, Talk & Heal'in Londra/BACP kimliğiyle tutarlı. İletişim bilgileri (telefon/adres) bilinçli olarak atlandı — Çiğdem'in gerçek verisi, sonra kendisi ekleyebilir. Henüz Postiz'e bağlanmadı — bunun için Meta Developer App (Instagram Standalone) kurulması gerekiyor |

| TikTok (eski/gizemli) | talkandheal | bilinmiyor | **`talkandheal` (noktasız) kullanıcı adı zaten dolu** — bu proje/oturumların HİÇBİRİ açmadı, 2026-08-27'de keşfedildi (profil fotoğrafı GERÇEK Talk & Heal materyali içeriyor ama kim açtığı/giriş bilgisi bilinmiyor, muhtemelen Çiğdem kendisi açmış, teyit edilmedi). Bu hesaba dokunulmadı, kullanılmayacak. |
| TikTok | talkandheal.uk | tascigdem1977@gmail.com | **YENİ hesap açıldı (2026-08-27)** — Instagram'daki (`talkandheal.uk`) desenle tutarlı, `talkandheal` dolu olduğu için `.uk` uzantısıyla devam edildi. Kayıt kullanıcı tarafından yapıldı (QR kod ile mobil uygulama üzerinden — Sparrow'un TikTok kaydında bu adım yoktu, TikTok bu akışı zaman zaman zorunlu kılıyor). Doğum tarihi: 1 Nisan 1977 (Çiğdem'in gerçek doğum tarihi, hesap doğrulama/giriş için gerekebilir). Hesap boş (0 takipçi, "Henüz tanıtım yok"), profil fotoğrafı/bio henüz eklenmedi. **Postiz'e BAĞLANDI ve "Talk & Heal" grubuna atandı (2026-08-27) — TAMAMLANDI.** Kurulum detayı: Sparro TikTok App'i "Sandbox" modunda olduğu için ilk OAuth denemesi `error=access_denied&error_type=non_sandbox_target` ile reddedildi — TikTok Developer Portal'da (`developers.tiktok.com`, giriş `engintass19@gmail.com`, şifre kullanıcının kendi şifre yöneticisinde) Sparro App → Sandbox → Sandbox settings → Target Users'a `talkandheal.uk` "Add account" ile eklenip "Apply changes" ile kaydedildi (bu adım, bu tarayıcı sekmesinde `talkandheal.uk` ile TikTok'a (tiktok.com, developer portaldan AYRI bir oturum) giriş yapılmış olmasını gerektiriyordu). Sonra Postiz "Add Channel → Tiktok" tekrar denendi, OAuth onay ekranı geldi, kullanıcı onayladı, kanal eklendi — ama varsayılan olarak Sparro'nun genel kanalları arasına düştü, "⋮ → Move / add to group → Talk & Heal" ile doğru gruba taşındı. **Hesap kasıtlı olarak Public bırakıldı (kullanıcı kararı, 2026-08-27)** — Gizli'ye çevirme denendi ama TikTok arayüzü toggle'ı kabul etmedi ("Bir şeyler ters gitti" hatası), kullanıcı ısrar etmek yerine Public kalmasını tercih etti. Sonuç: Sparro App review onaylanana kadar gerçek bir paylaşım denenirse `unaudited_client_can_only_post_to_private_accounts` hatası ALINABİLİR — ilk gerçek paylaşımda bu hata çıkarsa hatırlanmalı, o zaman Gizli'ye çevirme tekrar denenir. | TikTok for Developers (App) | **AYRI BİR APP GEREKMİYOR** — Postiz'in TikTok entegrasyonu tek/global `TIKTOK_CLIENT_ID`/`SECRET` kullanıyor (`tiktok.provider.ts`, `process.env`), Sparrow'un `sparro.io` için zaten kurduğu **"Sparro" App'i** hem Sparro hem Talk & Heal için ortak kullanılabiliyor (Instagram/Facebook'ta olduğu gibi — Postiz mimarisi platform başına tek paylaşılan OAuth app, çoklu-müşteri değil). 2026-08-27'de "Add Channel → Tiktok" denenip doğrulandı: OAuth login URL'i `client_key=sbawooflwcvl7j402e` (Sparro App) + `redirect_uri=app.sparro.io/integrations/social/tiktok` içeriyordu. **Kısıt:** Sparro App'i henüz "In review" (bkz. Sparrow/handoff.md, 2026-08-25'te başvuruldu) — onaylanana kadar bu app üzerinden bağlanan HERHANGİ bir hesap (talkandheal dahil) sadece Private/Gizli hesaptan paylaşım yapabiliyor (`unaudited_client_can_only_post_to_private_accounts`). Onay gelince hem sparro.io hem talkandheal aynı anda Public'e dönebilecek (onay app-seviyesinde). **Sıradaki adım:** talkandheal hesabını Gizli yap, Postiz'de "Add Channel → Tiktok" ile giriş/yetkilendirme yapılması gerekiyor (kimlik bilgisi girme Claude'un yapamayacağı bir adım — kullanıcı/Çiğdem yapmalı). |

| YouTube | talkandheal (@talkandheal-uk) | tascigdem1977@gmail.com | **TAMAMLANDI (2026-08-27).** Kanal sıfırdan oluşturuldu (`talkandheal` dolu çıktı, `.uk` de nokta formatı reddedildi, `talkandheal-uk` — tire ile — kabul edildi). Google Cloud OAuth app Sparrow'la paylaşılıyor (proje `sparro-506116`, "Testing" modda) — `tascigdem1977@gmail.com` Audience → Test users'a eklendi (aynı TikTok Sandbox Target User deseni). Postiz'e bağlandı, "Talk & Heal" grubuna taşındı. |

| X (Twitter) | talkandhealuk (görünen ad: "Talk and Heal") | tascigdem1977@gmail.com | **TAMAMLANDI (2026-08-27).** Hesap sıfırdan açıldı — "Google ile devam et" ile Google hesabından oluşturuldu (`talkandheal` alakasız/eski bir hesaba aitti — @talkANDheal, "jecer" adında, 2022'den kalma). Ad alanında "Talk & Heal" (& karakteri) reddedildi ("Girdiğin isim doğrulanırken hata oluştu"), "Talk and Heal" (kelimeyle) kabul edildi. Doğum tarihi Google'dan otomatik geldi (1 Nisan) ama yıl yanlıştı (2026), profil fotoğrafı Marka Kiti'ndeki `assets/logo-heart-only.png` yüklendi, passkey ve bildirimler atlandı (Sparrow deseniyle tutarlı). Postiz OAuth: Sparrow'un paylaşılan X App'i (`...sparro_ai`) ile yetkilendirildi, "Talk & Heal" grubuna taşındı. |

| Google Business Profile | Talk & Heal / Psikolog | tascigdem1977@gmail.com | **Profil OLUŞTURULDU (2026-08-27), Postiz'e BAĞLANAMADI — doğrulama bekliyor.** İşletme adı "Talk & Heal", kategori "Psikolog", hizmet bölgesi Londra/Birleşik Krallık (fiziksel ziyaret edilebilir ofis yok — "Online Private" hizmet), website `https://talkandheal.co.uk`. Telefon geçici olarak kullanıcının kendi Türkiye numarası (+90 537 322 02 24) — Çiğdem'in gerçek numarasıyla (+44 7595 455398) sonra değiştirilecek. Doğrulama adresi (posta kodu doğrulaması için, herkese açık gösterilmiyor): Flat 5, 164 Lordship Road, London, N16 5HB (Çiğdem'in gerçek adresi). **Doğrulama yöntemi olarak sunulan "İşletme Videosu" (fiziksel ofis videosu) ertelendi** ("Daha Sonra Doğrula") — online hizmet için uygun değil, Sparrow'un GMB profilinde de aynı şekilde ertelenmişti. İşletme açıklaması (750/750'ye yakın, SEO odaklı) `talkandheal.co.uk` (canlı WordPress) + bu depodaki güncel `hakkimda.html`/`services.html`/`approach.html`'den toplanan gerçek verilerle yazıldı: 27 yıllık kariyer (NHS, üniversiteler, mülteci örgütleri, Harley Street), EMDR + CBT + ACT + Existential-Phenomenological + Psychodynamic + Somatic yaklaşımlar, BACP Registered, İngilizce+Türkçe, travma/anksiyete/depresyon/ilişki odaklı — BACP/CAP reklam etiği gereği sonuç garantisi veren ifadelerden kaçınıldı. **Postiz bağlantı denemesi:** "Add Channel → Google My Business" → `redirect_uri_mismatch` hatası (Sparrow'un paylaşılan Google Cloud OAuth Client'ında `/gmb` redirect URI hiç tanımlı değildi, sadece `/youtube` vardı) — Google Cloud Console → Sparro OAuth Client'a `https://app.sparro.io/integrations/social/gmb` eklenip düzeltildi (Sparrow'un YouTube bağlantısını bozmaz, sadece yeni URI eklendi). Düzeltme sonrası hata değişti: **"We couldn't find any business locations connected to your account. Please ensure your business is verified on Google My Business."** — Sparrow'un handoff.md'sindeki bilinen kısıt: GMB API erişimi doğrulanmış profil şartı koşuyor, doğrulama TAMAMLANMADAN Postiz bağlanamıyor. **Sıradaki adım:** posta doğrulama koduyla (Flat 5, 164 Lordship Road adresine gönderilecek fiziksel mektup, birkaç gün-hafta sürebilir) ya da başka bir doğrulama yöntemiyle profil doğrulanınca "Add Channel → Google My Business" tekrar denenmeli. |

## ⚠️ KRİTİK — Çiğdem'in ZATEN VAR OLAN gerçek hesapları keşfedildi (2026-08-27)

`talkandheal.co.uk` sitesinin sosyal ikonları takip edilerek keşfedildi — bu proje/oturumların
hiçbiri bunları açmadı, muhtemelen yıllar önce Çiğdem'in kendisi ya da eski bir ajans açmış.
Yeni açılan hesaplarla (yukarıdaki tablo) ÇAKIŞMA riski var:

| Platform | Gerçek/mevcut hesap | Durum | Şifre durumu (2026-09-01) | Çakışma riski |
|---|---|---|---|---|
| Facebook | `facebook.com/TalkandHealUK` ("Talk and Heal") | 78 takipçi, gerçek gönderiler (2022), `talkandheal.co.uk` bağlantılı, `help@talkandheal.co.uk` iletişim | **Çiğdem'de, alınabilir** | Bugünkü Meta Developer App süreci (soğuma süresi bekliyor) bu sayfayı Postiz'e bağlamak için gerekebilir — ama YENİ bir Facebook sayfası AÇILMAMALI |
| Instagram | `instagram.com/talkandhealuk` (NOKTASIZ) | Çiğdem'in gerçek fotoğrafı, 12 gönderi, 60 takipçi, "Psikoterapist/BACP/EMDR" bio | **Çiğdem'de, alınabilir** | Plandaki `talkandheal.uk` (NOKTALI) hesabı bundan farklı ve muhtemelen GEREKSİZ — henüz oluşturulmadıysa oluşturulmamalı |
| YouTube | "cigdem tas" (@cigdemtas8612) | 6 abone, **4 gerçek video** (6 yıl önce: Cinsellik ve Tabu, Kumar Bağımlılığı, Aşk Nedir) | **Bulunamadı — Çiğdem'de yok** | **Bugün YANLIŞ kanala bağlandık** — yeni boş `talkandheal` (@talkandheal-uk) kanalı Postiz'e bağlandı, gerçek/değerli kanal değil. Şifre bulununca Postiz bağlantısı GERÇEK kanala taşınmalı |
| LinkedIn | `linkedin.com/in/cigdem-tas-79210778` (kişisel profil) | Var, içerik/bağlantı sayısı kontrol edilmedi | **Çiğdem'de, alınabilir** | LinkedIn Şirket Sayfası kurmak için bu kişisel profilden erişim gerekiyor (Sparrow'daki "yetersiz bağlantı" hatası riski) |

**Şifrelerin kendisi bu dosyaya YAZILMAZ** (dosya başındaki kural) — Selen'in kendi şifre
yöneticisinde (Bitwarden) saklanmalı, buraya sadece "durum" düşülür.

**Güncel durum (2026-09-01):** Facebook/Instagram/LinkedIn (kişisel) için şifreler Çiğdem'de
mevcut ve temin edilebilir durumda — bir sonraki adımda bu üç gerçek hesap kullanılacak: (1)
Instagram/Facebook için planlanan yeni hesap açma işi iptal, gerçek hesaplara geçilecek, (2)
LinkedIn şirket sayfası bu kişisel profilden kurulacak. **YouTube tek istisna** — şifre
bulunamadı, gerçek kanala (@cigdemtas8612) geçiş bu yüzden hâlâ blokede; Postiz bağlantısı
şimdilik yeni/boş kanalda kalıyor.

**LinkedIn e-posta tutarlılığı denemesi TERK EDİLDİ (2026-09-01):** Gerçek hesabın
(`cigdem-tas-79210778`, `tascigdem@hotmail.com`, 434 bağlantı — **dokunulmadı, sağlam**) e-postasını
marka kiti e-postasıyla (`tascigdem1977@gmail.com`) tutarlı hale getirme denemesi sırasında o
e-postanın zaten ayrı, boş/0-bağlantılı bir "gölge" LinkedIn hesabına bağlı olduğu ortaya çıktı.
O gölge hesaptan e-postayı kurtarmaya çalışırken (geçici e-posta ekle → birincil yap → eskisini
kaldır) LinkedIn art arda yapılan değişiklikleri şüpheli bulup hesabı kilitledi, devlet kimliği
istiyor. **Karar: kurtarılmayacak** — hesabın 0 bağlantısı var, değeri yok, gerçek bir kimliği
(Çiğdem'in ya da başkasının) bu şüpheli-aktivite soruşturmasına sokmaya değmez. `tascigdem1977@gmail.com`
o çöp hesapta kilitli kalıyor, gerçek hesap hâlâ `tascigdem@hotmail.com` ile çalışıyor — bir daha
bu tutarlılık denemesi tekrarlanmasın.

**LinkedIn Postiz bağlantısı da AYRICA blokeli:** Postiz'de "Add Channel → LinkedIn" denendiğinde
OAuth URL'sinde `client_id` boş çıktı — Netcup sunucusunda LinkedIn için hiç Developer App/API
anahtarı tanımlanmamış. Sparrow'un kendi handoff.md'sinde de aynı bloker var (bu iki projeyi
birlikte etkileyen paylaşılan bir eksiklik) — LinkedIn'de sıfırdan Developer App açmak (şirket
sayfası ön koşulu + LinkedIn'in onay süreci) ayrı, büyük bir iş; bu oturumda ele alınmadı.

| Pinterest Developer App | Talk & Heal Social | tascigdem1977@gmail.com | **Kısmen kuruldu (2026-08-27) — Postiz'e henüz BAĞLANAMADI.** İşletme hesabı `tascigdem1977` zaten mevcuttu (önceki oturumdan). Bu oturumda: (1) `developers.pinterest.com` geliştirici hesabı doğrulandı (e-posta onay linki `tascigdem1977@gmail.com` gelen kutusunda — bu gmail hesabına bu Chrome profilinde `mail.google.com/mail/u/2/` yolundan erişilebiliyor, not: u/0=`engintass19@gmail.com`, u/1=`engintas425342@gmail.com`, u/2=`tascigdem1977@gmail.com`); (2) yeni app oluşturuldu — **Uygulama adı:** "Talk & Heal Social", **Uygulama kimliği (client_id): `1605453`**, Şirket adı "Talk & Heal", web sitesi `http://talkandheal.co.uk`, uygulama simgesi olarak Marka Kiti'ndeki `assets/logo-heart-only.png` (200x200'e `sips` ile büyütülmüş hali — orijinal 90x94px Pinterest'in min. 100x100px şartını karşılamıyordu) yüklendi. **Gizlilik politikası URL'i:** `https://engintas243524.github.io/cigdem-tas-talk-and-heal/gizlilik-politikasi.html?company=talk-heal` — **DİKKAT, tekrar karşılaşılırsa hatırlanmalı:** Pinterest bu alana çıplak URL girilince "Size ait olduğunuzu anlayabilmemiz için lütfen gizlilik politikanızın URL'sine şirket adınızı ekleyin!" uyarısıyla submit'i bloke ediyordu (URL zaten "talk-and-heal" içeriyor olsa da yetmiyor) — sona `?company=talk-heal` query param eklenince uyarı kayboldu ve form geçti; gerçek sayfa içeriğini etkilemiyor, salt bu validasyonu geçmek için. Geliştiricinin amacı: "Kişisel API erişimi (tek, kişisel kullanım)", Kullanım durumu: "Pin oluşturma ve zamanlama", Hedef kitle: "İşletmeler", Pin/Pano verilerini okur: "Evet, benim". reCAPTCHA kullanıcı tarafından çözüldü. **ŞU AN TIKANDIĞI YER:** app "Trial erişimi bekliyor" durumunda — bu onaylanana kadar Uygulama gizli anahtarı (client_secret) görüntülenemiyor ("trial erişimi bekliyor durumunda kullanılamaz"), Yeniden yönlendirme URI'leri alanı ve API kapsamları da aynı şekilde kilitli/devre dışı. Bu bir Pinterest-taraflı otomatik/manuel inceleme süreci gibi görünüyor (TikTok Sandbox review'una benzer) — bizim tarafımızda ek bir aksiyon/buton yok, sadece bekleniyor. **Sıradaki adım (onay gelince):** (1) `developers.pinterest.com/apps/1605453/` → Yapılandır sekmesinden client_secret'ı al, (2) Yeniden yönlendirme URI'leri'ne Postiz'in Pinterest redirect URI'sini ekle (diğer platformlardaki desene göre muhtemelen `https://app.sparro.io/integrations/social/pinterest` olacak, eklemeden önce Postiz kaynak kodunda `pinterest.provider.ts` benzeri bir dosyada doğrula), (3) Netcup sunucusuna SSH ile bağlanıp (`ssh -i ~/.ssh/sparrow_netcup_server root@159.195.20.186`) `/opt/postiz/docker-compose.yaml`'a `PINTEREST_CLIENT_ID=1605453` ve `PINTEREST_CLIENT_SECRET=<alınan secret>` yazılıp konteyner restart edilecek, (4) Postiz'de "Add Channel → Pinterest" ile `tascigdem1977` hesabı bağlanıp "Talk & Heal" grubuna taşınacak. |

| Telegram | @talkandheal_bot (bot) / "Talk & Heal" kanalı (`t.me/+hSc-HQFALwIxMjI0`, private) | tascigdem1977@gmail.com ile ilgisi yok — bot BotFather üzerinden **kullanıcının (Selen'in) kendi kişisel/aktif Telegram hesabıyla** (+90 537 322 02 24, çok kullanılan dolu bir hesap — ayakkabı işletmesi kişileri/gruplarını içeriyor) oluşturuldu | **Kurulum kısmen tamamlandı, Postiz bağlantısı TIKANDI (2026-08-27).** BotFather'da `/newbot` ile "Talk & Heal" botu oluşturuldu, kullanıcı adı `talkandheal_bot`. Token Netcup `/opt/postiz/docker-compose.yaml`'a `TELEGRAM_TOKEN` olarak eklendi (satır PINTEREST_CLIENT_SECRET'tan hemen sonra), `docker compose up -d --force-recreate postiz` ile konteyner yeniden başlatıldı (diğer servisler etkilenmedi). Telegram'da "Talk & Heal" adında private bir kanal oluşturuldu, bot bu kanala **Yönetici (Administrator)** olarak eklendi (yetki: sadece "Mesajları Yönet" açık, diğerleri kapalı). Postiz'de "Add Channel → Telegram" denendi: her tıklamada `/connect <4-haneli-kod>` üretiliyor (kod component mount'ta `useRef(makeId(4))` ile bir kere üretiliyor, frontend arka planda `/api/integrations/telegram/updates?word=<kod>` endpoint'ini 2 saniyede bir otomatik polluyor — elle bir "kontrol et" tuşuna basmaya gerek yok). **Sorun:** doğru kod (`/connect q1OM`) kanala tam eşleşecek şekilde gönderildi (birkaç yanlış harf/büyük-küçük harf denemesinden sonra doğrulandı), ama network isteklerinde 10+ ardışık pollda hep boş yanıt geldi (hiçbirinde `&id=` parametresi eklenmedi — bu, Postiz backend'inin `telegramBot.getUpdates()` çağrısının Telegram'dan hiç update almadığı anlamına geliyor, kanal mesajı gönderilmiş olmasına rağmen). Kök neden netleşmedi — Telegram'ın update kuyruğuyla ilgili bir gecikme/senkronizasyon sorunu olabilir. **Sıradaki adım:** bir sonraki oturumda "Add Channel → Telegram" tekrar denenmeli (yeni bir kod üretilecek, kanala gönderilecek) — muhtemelen kuyruk kendini toparlamıştır. Sorun devam ederse Netcup'ta `docker logs postiz` ile backend log'larına bakılıp gerçek hata mesajı görülmeli. |

## Kalan platformlar (henüz başlanmadı)

Facebook, LinkedIn, Threads — hepsi gerçek hesap keşfi nedeniyle Çiğdem'in erişimini
bekliyor (yukarıya bakın). Pinterest kısmen kuruldu, Trial erişim onayı bekleniyor. Telegram
kısmen kuruldu, Postiz bağlantısı tıkandı (yukarıya bakın).
Mastodon + Bluesky + TikTok + YouTube + X TAMAMLANDI (2026-08-26/27) — yukarıya bakın. Google Business profili oluşturuldu ama doğrulama bekliyor (yukarıya bakın). Instagram hesabı açıldı, devamı sürüyor (Meta soğuma süresi bekleniyor, en erken 2026-08-29).

## Gizlilik politikası sayfası (2026-08-26)

`gizlilik-politikasi.html` eklendi, commit `18c625f`, `main`'e push edildi — Meta Developer App
kaydı (Instagram/Facebook/Threads için) gerçek bir Privacy Policy URL şart koşuyor, site bu
sayfaya sahip değildi. **Not:** bu kapsamlı bir KVKK/GDPR metni değil — sadece sosyal medya
entegrasyonu için asgari bildirim, sayfanın kendi footer'ında bu açıkça belirtiliyor. Talk & Heal
randevu/ödeme/WhatsApp gibi hassas veri işlediği için tam kapsamlı bir gizlilik politikası (UK
ICO/GDPR uyumlu) ayrıca hukuki inceleme ile hazırlanmalı — bu, projenin genel açık maddeleri
listesine eklenmeli.

**Canlı URL (Meta App'te kullanılacak):** `https://engintas243524.github.io/cigdem-tas-talk-and-heal/gizlilik-politikasi.html`

**Deploy yolculuğu (önemli, tekrar karşılaşılırsa hatırlanmalı):**
1. `talkandheal.co.uk` (gerçek domain) hâlâ ESKİ WORDPRESS sunucusunda — bu proje deposundaki
   statik siteye HENÜZ geçilmedi (bkz. `hosting-devir-gorusmesi-goker.md`). GitHub'a push etmek
   bu domain'i güncellemedi.
2. İlk denenen yol: yeni bir Cloudflare Pages projesi (`talk-and-heal`, hesap `engintass19@gmail.com`,
   form-backend ile aynı hesap) — `https://talk-and-heal.pages.dev`. Deploy Cloudflare Dashboard'da
   "başarılı"/"Production" görünüyor ama **`*.pages.dev` alt alan adına hem bu makineden hem
   kullanıcının telefonundan (wifi+mobil) 10+ dakika boyunca `ERR_CONNECTION_TIMED_OUT` alındı** —
   sunucu tarafı yayılma/provizyon sorunu, çözülmeden bırakıldı (proje Cloudflare'de duruyor,
   zararsız, silinmedi).
3. **Çalışan çözüm: GitHub Pages** — repoda zaten etkinmiş (`gh api repos/.../pages` → "already
   enabled", `main` branch, root path). Push sonrası birkaç dakika içinde otomatik build oldu,
   `curl` ve tarayıcıdan anında 200 doğrulandı. Yeni bir platform hesabı/site eklerken önce bunu
   dene, Cloudflare Pages'e gerek yok.

## Postiz sunucu-config notu — Mastodon (2026-08-26)

`/opt/postiz/docker-compose.yaml`'da `MASTODON_CLIENT_ID`/`MASTODON_CLIENT_SECRET` boş bırakılmıştı
(muhtemelen ilk kurulumda hiç doldurulmamış) — bu yüzden Postiz'in "Add Channel → Mastodon" akışı
`client_id` boş bir OAuth URL üretip "Gerekli parametre eksik: client_id" hatası veriyordu. Yukarıdaki
Mastodon Uygulaması'nın anahtarları bu iki env değişkenine yazılıp `docker exec postiz pm2 restart backend`
ile container'a yüklendi. Aynı desen ileride başka bir Mastodon instance'ı gerekirse tekrarlanabilir.

## Sunucu-tarafı not (2026-08-26)

Postiz'in backend süreci (PM2 `backend` app) migration sonrası port 3000'i hiç bind etmemişti —
`docker exec postiz pm2 restart backend` ile düzeltildi (Postgres/Redis bağlantıları zaten
sağlamdı, sadece backend'in kendisi başlatma sırasında takılmıştı). Aynı sorun tekrar çıkarsa
aynı komutla çözülebilir.

## Meta Developer App kurulumu — Çiğdem'in kişisel Facebook hesabı bulundu (2026-08-27)

**Karar (kullanıcı onayladı):** Meta Developer App, Sparrow'un `engintass19@gmail.com` hesabından
AYRI olarak, **`tascigdem1977@gmail.com`** (Çiğdem'in kendi hesabı) ile oluşturuluyor — mülkiyet
baştan Çiğdem'de kalsın diye ([[feedback_l5_dogtrini_her_proje_kontrolu]] ile tutarlı).

**Bu hesapla ilgili yeni öğrenilen bilgiler (daha önce hiçbir yerde kayıtlı değildi):**
- `tascigdem1977@gmail.com` ile giriş yapılınca gerçek bir kişisel Facebook hesabı açıldı: **"Cigdem
  Tas"**. Bu hesap İngiltere numarasıyla (`+447595455398`) korunuyor, Çiğdem şu an bu numaraya
  erişebiliyor (SMS kodlarını okuyabiliyor, kullanıcı ile görüşme halinde teyit etti).
- Bu Facebook hesabının **Meta Accounts Center**'ında (`accountscenter.facebook.com`) zaten 4 profil
  bağlı çıktı:
  - Facebook — **Cigdem Tas**
  - Instagram — **ctsolin** (⚠️ **daha önce bilinmeyen, muhtemelen Çiğdem'in ESKİ/kişisel Instagram
    hesabı** — `TALK_AND_HEAL_HESAPLAR.md`'nin geri kalanında bahsi geçen `talkandheal.uk` hesabından
    FARKLI. Talk & Heal işiyle karıştırılmamalı, silinmemeli/değiştirilmemeli — sadece var olduğu
    not edildi.)
  - Instagram — **talkandhealuk** (bu, yukarıda kayıtlı olan asıl Talk & Heal Instagram hesabı)
  - Threads — **ctsolin** (yukarıdaki eski Instagram hesabından otomatik türemiş görünüyor)
- Contact info (Accounts Center → Profiles and personal details → Personal details → Contact info)
  altında kayıtlı 3 iletişim noktası: `+447595455398` (telefon), `help@talkandheal.co.uk` (e-posta —
  daha önce bilinmiyordu, muhtemelen Çiğdem'in kurumsal e-postası), `tascigdem@hotmail.com` (e-posta
  — muhtemelen Çiğdem'in eski/kişisel e-postası). Bu üçü Meta Developer App tarafından zaten
  görülebilir/kullanılabilir durumda.

**BLOKE — Meta Developer hesabı kayıt sihirbazı "Verify Account" adımında takıldı (2026-08-27):**
`developers.facebook.com/apps/creation/` ilk kez açılınca 4 adımlı bir sihirbaz çıkıyor (Register →
Verify account → Contact info → About you). "Verify account" adımı bir mobil numara istiyor. Country
"United Kingdom (+44)" seçilip `7595455398` girilince (yani hesabın ZATEN doğrulanmış telefon
numarası), buton aktif olmasına rağmen **hemen** kırmızı hata çıkıyor: *"You can only complete this
action in Accounts Center. Go to Accounts Center to send a new SMS confirmation code."* — yani bu
eski/legacy diyalog, hesapta zaten onaylı olan bir numaraya YENİDEN SMS göndermeyi reddediyor.

- "Accounts Center" linkine tıklanınca Contact Information sayfasına düşülüyor, numara orada zaten
  tam onaylı görünüyor (Facebook + 3 profile bağlı), ama "geliştirici hesabı için onayla" gibi özel
  bir aksiyon YOK — sadece "Add to another account" / "Delete number" seçenekleri var.
- Numaranın detayına girilince "Cigdem Tas / Facebook / **Shared with another person**" notu
  görüldü — bunun tam anlamı netleşmedi (numara başka bir Facebook hesabıyla da mı paylaşılıyor,
  yoksa standart bir ifade mi, belirsiz). Riskli bir sinyal olabilir, takip edilmeli.
- "Password and security" → "Two-factor authentication" altında da doğrudan bir çözüm bulunamadı.
- Sihirbazın alternatif yolu: **"adding a credit card"** linki — tıklanınca Facebook'un genel Meta
  Pay yardım makalesine gidiyor (gerçek bir kart ekleme formu değil, sadece nasıl yapılacağını
  anlatan yardım sayfası). Gerçek kart bilgisi girmek Claude için yasak bir işlem (finansal
  kimlik bilgisi) — bu yol denenirse Çiğdem'in kendisinin kart bilgisini girmesi gerekir.

**Kart eklenince "Verify account" adımı geçildi (2026-08-27):** Çiğdem kendi kartını Accounts
Center → Meta Pay → Manage → Add payment method'dan ekledi (Claude kart bilgisini asla görmedi/
girmedi). Sihirbaz otomatik olarak "Contact info" adımına geçti (e-posta doğrulama).

**KÖK NEDEN BULUNDU — asıl engel e-posta/telefon değil, CİHAZ GÜVENİ (2026-08-27):**
"Contact info" adımında sırasıyla denenen e-postalar:
- `tascigdem1977@gmail.com` → red ("This email address can't be used") — hesabın kendi giriş
  e-postası olduğu için.
- `tascigdem@hotmail.com` → aynı red — muhtemelen Çiğdem'in BAŞKA bir Facebook hesabının giriş
  e-postası.
- `engintass19@gmail.com` → aynı red — Sparrow'un kendi Facebook hesabının giriş e-postası.
- `engintass@gmail.com` (19'suz) → FARKLI hata: "Email cannot be sent. Please try later."
- `help@talkandheal.co.uk` → kabul edildi, kod gönderildi, Çiğdem webmail'den kodu okudu (`29655`),
  koda girildi, "Continue"a basılınca: **"You can't make this change at the moment... we noticed
  you are using a device you don't usually use... we'll allow you to make this change after you've
  used this device for a while."**

Yani gerçek engel: bu, Çiğdem'in tarafından **çok yeni açılmış** bir Facebook hesabı, ve Meta bu
hesap için güvenlik-hassas değişiklikleri (yeni e-posta ekleme, yeni telefon onaylama vb.) tanıdık
olmayan bir cihazdan (bu oturumdaki Chrome) geçici olarak engelliyor. Önceki tüm "email
can't be used" hataları da muhtemelen aynı kök nedenin farklı belirtileriydi.

**Çiğdem KENDİ cihazından denedi, AYNI hata çıktı (2026-08-27) — teşhis düzeltildi:**
Çiğdem'e `https://developers.facebook.com/apps/creation/` linki verildi, kendi telefonundan/
tarayıcısından "Cigdem Tas" hesabıyla girip aynı "Contact info" adımını denedi — **birebir aynı**
"You can't make this change at the moment... we noticed you are using a device you don't usually
use..." uyarısını ORADA DA aldı. Yani sorun **Selen'in Chrome'u DEĞİLMİŞ** — hesabın kendisi
(`Cigdem Tas`) o kadar yeni ki, Meta'nın fraud/güvenlik sistemi HANGİ cihazdan gelirse gelsin
(hatta Çiğdem'in kendi normal cihazından bile) yeni-hesap üzerinde hassas değişiklikleri (yeni
e-posta onaylama gibi) geçici olarak engelliyor. Bu, cihaz-bazlı değil **hesap-yaşı-bazlı** bir
soğuma (cool-down) süresi — ne kadar süreceği belirsiz (muhtemelen saatler-birkaç gün).

**Sıradaki olası çözümler (bir sonraki oturumda buradan devam et):**
1. **En olası/gerçek çözüm: BEKLEMEK.** Hesap (`Cigdem Tas`) bir süre normal şekilde kullanılsın
   (Çiğdem kendi telefonundan ara sıra Facebook'u aç/gezin — aktif "insan gibi" kullanım sinyali
   versin), birkaç gün sonra (örn. 2026-08-29+) `developers.facebook.com/apps/creation/` tekrar
   denenmeli — büyük ihtimalle Çiğdem'in kendi cihazından.
2. Meta/Facebook destek üzerinden bu hesap-yaşı kısıtlamasının kaldırılması istenebilir (genelde
   işe yaramaz, otomatik bir sistem).
3. Alternatif olmayabilir: yepyeni bir Facebook hesabı açmak da aynı soğuma süresine tabi olur,
   bu yüzden "hesap değiştirmek" bir kısayol DEĞİL.
