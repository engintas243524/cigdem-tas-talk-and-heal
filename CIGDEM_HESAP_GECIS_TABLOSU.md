# Çiğdem'den Alınacak Hesap Bilgileri — Test → Gerçek Hesap Geçişi

**Tarih:** 2026-07-27
**Amaç:** Geliştirme/test aşamasında Selen'in kendi hesaplarıyla kurulan tüm entegrasyonların
(Google Calendar/Sheets, Stripe, WhatsApp, e-posta, panel şifresi) canlıya geçmeden önce
Çiğdem'in KENDİ hesaplarına devredilmesi gerekiyor. Bu, `NOTES.md`'deki kritik pre-launch
şartıdır — aşağıdaki tablo doldurulmadan `git push`/deploy yapılmayacak.

Çiğdem bu dosyayı (veya bir kopyasını) alıp sağ sütunu doldurabilir; bilgiler geldiğinde
`form-backend/.dev.vars` ve ilgili dış servis panelleri buna göre güncellenecek.

| # | Kategori | Ne gerekiyor / neden | Çiğdem'in dolduracağı bilgi |
|---|----------|----------------------|------------------------------|
| 1 | **Google hesabı** | Takvim ve Sheets (veritabanı) bu hesaba bağlanacak. Google hesap e-postası + bu hesaba ait bir Google Takvim | |
| 2 | **Google Calendar erişimi** | Backend'in randevu event'i oluşturabilmesi için bir servis hesabı e-postasını takvime "değişiklik yapabilir" yetkisiyle davet etmesi gerekiyor (davet linki bizden gidecek, sadece kabul etmesi yeterli) | Kabul edildi mi? (Evet/Hayır) |
| 3 | **Stripe hesabı** | Ödeme/iade işlemleri şu an test modunda (Selen'in test hesabı). Gerçek ödeme almak için Çiğdem'in kendi (live) Stripe hesabı | Stripe hesap e-postası |
| 4 | **Stripe banka hesabı (payout)** | Alınan ödemelerin yatacağı hesap | IBAN / banka hesap bilgisi (Stripe panelinden kendisi de girebilir) |
| 5 | **WhatsApp iş numarası** | Müşteri bildirimleri şu an test numarasından gidiyor (`447000000000` placeholder) | Gerçek WhatsApp iş numarası |
| 6 | **Meta Business / WhatsApp Cloud API erişimi** | WhatsApp mesajlarının gerçek numaradan gönderilebilmesi için Meta Business hesabı kurulumu/erişimi gerekiyor | Meta Business hesabı var mı? (Evet/Hayır) — yoksa kurulum için birlikte bir oturum planlanacak |
| 7 | **Bildirim e-postası** | Şu an `help@talkandheal.co.uk` kullanılıyor ama teyitli değil, değişebilir dendi | Kesin/nihai e-posta adresi |
| 8 | **E-posta gönderim servisi (Resend)** | Otomatik e-postalar (onay, hatırlatma) şu an test Resend hesabından gidiyor | Kendi Resend hesabı kurulacak mı, yoksa mevcut domain e-postası mı kullanılacak? |
| 9 | **Bildirim WhatsApp numarası** | Şu an yeni randevu bildirimleri Selen'in WhatsApp'ına gidiyor (test amaçlı) | Bildirimlerin gitmesini istediği kendi WhatsApp numarası |
| 10 | **Panel şifresi** | Randevu notları panelinin girişi için, kendisinin seçeceği ve unutmayacağı bir şifre | Seçtiği panel şifresi |
| 11 | **Domain/DNS erişimi (talkandheal.co.uk)** | E-posta gönderim doğrulaması (SPF/DKIM) ve olası diğer DNS kayıtları için erişim/yetki gerekebilir | DNS paneline erişimi var mı, yoksa hosting sağlayıcısı üzerinden mi ilerlenecek? |

## Notlar
- Yukarıdakilerin hiçbiri aynı anda istenmek zorunda değil — Çiğdem hangisini şu an biliyorsa onu
  doldurup gönderebilir, eksikler sonra tamamlanır.
- Stripe/Meta/Google gibi hesapların *kurulumunda* (hesap açma adımları) gerekirse birlikte bir
  ekran paylaşımlı oturum yapılabilir; sadece bilgi istemek şart değil.
- Bu tablo doldukça `form-backend/.dev.vars` (gizli, git'e girmez) ve varsa ilgili şifre yöneticisi
  notu güncellenecek.
