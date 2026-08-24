# Handoff — 2026-08-24 (devam oturumu)

## Bu oturumda yapılan başarılı değişiklikler

- **"Rakip Platform Envanteri" özelliği (checkbox-bazlı manuel tasarım) TAMAMLANDI ve commit
  edildi.** `RAKIP_PLATFORM_LISTESI` (11 platform) + 4 yeni sütun (`aktifPlatformlar`,
  `googlePuaniGozlemi`, `googleYorumSayisiGozlemi`, `gozlemTarihiUtc`), `handleRakipEkle`/
  `handleRakipDuzelt`/`handleRakipListe` yeni alanları kabul ediyor, `platformDagilimOzetiGetir`
  (deterministik "X/Y rakip Platform'de aktif" istatistiği, sadece checkbox-onaylı veri) her iki
  rapor promptuna bağlandı, `rakip-analizi.html`'e 11 checkbox + 2 manuel Google-gözlem alanı
  eklendi. Commit'ler: `3aeedea`, `23d4e7d`, `a1f67c5`, `096988f` (frontend değişikliği
  yanlışlıkla `5f8930e`'ye karıştı — içerik doğru, sadece mesaj bunu anmıyor).
- **Google puanı/yorum sayısı otomatik-doldurma tasarımı ToS ihlaliydi, koda dökülmeden
  yakalanıp düzeltildi** (bkz. hata günlüğü BE-113). Artık tamamen manuel giriş — Google Places
  API'den hiç çekilmiyor. Spec commit `42774d0`, Sparrow tarafı commit `31ec190` (Sparrow deposu).
- **KRİTİK GÜVEN DÜZELTMESİ — "Kanıt Zorunluluğu" (bkz. hata günlüğü BE-114).**
  `parametreSkorlariUret`'in "asla tahmin etme" talimatı canlı testte ihlal edilmiş bulundu (20
  parametreden 3'üne sıfır bilgiyle uydurma puan). İki katmanlı deterministik doğrulama eklendi:
  (1) kanıt kaynak metinde birebir geçmeli, (2) kanıt o parametrenin kendi anahtar kelime
  listesiyle de örtüşmeli. 13 adversarial test + gerçek API çağrısıyla doğrulandı. 375/375 test
  yeşil. Commit'ler: `5f8930e`, `7b363ef`. Sparrow tarafı: `f0f30e1` (Sparrow deposu, §2.1b).
- Bu iki güven/hukuk düzeltmesi hem `talk-and-heal-hata-gunlugu/05-Backend-Entegrasyon/` (BE-113,
  BE-114, .docx yeniden üretildi) hem hafızaya (`feedback_tos_workaround_dogrulama_birincil_kaynak.md`,
  `feedback_llm_skorlama_kanit_zorunlulugu.md`) işlendi.

## Bir sonraki adımda yapılması gerekenler

**1. Task 5'in (panel UI) tam manuel doğrulaması yarım kaldı.** Kullanıcı `localhost:5173` +
`localhost:8787` (wrangler dev, hâlâ arka planda çalışıyor olabilir — `pkill -f "wrangler dev"`
ile temizleyip yeniden başlatmak gerekebilir) üzerinden checkbox'ların kaydedilip geri
yüklendiğini doğruladı, AMA planın Adım 4'teki tam checklist'i (özellikle DevTools Network
sekmesinde `places.googleapis.com`'a hiç istek gitmediğinin teyidi) tamamlanmadı — büyük
otomasyon tartışmasına sapıldı. Bu adım hâlâ açık.

**2. Otomatik platform tespiti — TASARLANDI ama HENÜZ KODLANMADI.** Kullanıcı haklı olarak
checkbox-only tasarımın 20 rakiplik bir aramada elle işaretlenemeyeceğini belirtti. Kararlaştırılan
(ama koda dökülmemiş) tasarım `docs/superpowers/specs/2026-08-24-rakip-platform-envanteri-design.md`'nin
**"DURUM (2026-08-24)"** bölümünde tam olarak yazılı — özet:
- Rapor üretimi anında LLM web_search ile canlı platform tespiti (ephemeral, `aktifPlatformlar`
  ana değerine YAZILMAZ).
- Sheets native hücre notuna ("LLM tespiti, [tarih]: ...") kaydedilir, ana değerle karışmaz.
- `platformDagilimOzetiGetir`'in deterministik sayısı DEĞİŞMEZ, sadece checkbox-onaylı veri kullanır.
- LLM'in kendi rapor metninde (tekil VEYA çoklu rakip sentezinde serbestçe) bu ephemeral veriyi
  yorumlamasına izin verilir.
- Gerçek ölçülen maliyet: ~$0.11/rakip (3 arama). Sert üst sınır yok, sadece kota+uyarı.
- Sparrow'a da (kod değil, doküman notu) işlenmesi gerekiyor.

**Sıradaki iş:** Bu tasarımı resmi bir spec bölümü haline getirip (kod örnekleri, fonksiyon
imzaları, test planı ile), kullanıcı onayı alıp `writing-plans` → `executing-plans` akışına
sokmak.

**3. Eski açık maddeler (değişmedi):**
- NOTES.md: `tascigdem1977@gmail.com` üzerinden gerçek Anthropic + Google Places API key'leri
  henüz alınmadı.
- `aksiyonAnaliz` kotası 13/13 dolu, kullanıcı "Limiti Yükselt" ile açmayı düşünüyor.
