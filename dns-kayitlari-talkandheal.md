# talkandheal.co.uk — DNS'e Eklenmesi Gereken 3 Kayıt

Merhaba, Talk & Heal sitesinden gönderilen e-postaların (randevu onayı, hatırlatma vb.) spam'e
düşmeden gitmesi için **Resend** adlı e-posta servisinin alan adını doğrulaması gerekiyor. Bunun
için `talkandheal.co.uk` alan adının DNS ayarlarına aşağıdaki **3 yeni kaydı** eklemeniz yeterli.

**Bu bir işlem talimatıdır, bizden bir bilgi istenmiyor** — yani sizden herhangi bir şey öğrenmemiz
gerekmiyor, sadece aşağıdaki 3 kaydı (değerleriyle birlikte, olduğu gibi) DNS panelinize
eklemenizi rica ediyoruz.

✅ **Güvenli:** Sadece 3 yeni kayıt eklenecek. Mevcut web sitesi, e-posta adresleri veya başka hiçbir
ayar silinmez, değiştirilmez veya etkilenmez.

---

## 1. Kayıt (TXT — DKIM doğrulama)

| Alan | Değer |
|---|---|
| **Tür (Type)** | `TXT` |
| **Ad/Host (Name/Host)** | `resend._domainkey` |
| **Değer (Value)** | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDfOGJ4iShbKs+Uf6MCQgIFtxlKfwnSa7bg4FVZ/le6RaVD8JEHRGjLfVvbcRN7/ASAWYKAHdL1BHYcqAO91epu/kqwA/GbtU9r72LzcLFZZXgdJNSUHdR396TNRyRiVFibE1fckSZ2/xIQ5mmiIVybMP+OZBxzk/NtlsMB/Zop7QIDAQAB` |
| **TTL** | Otomatik / varsayılan (Auto, ya da panelin izin verdiği en düşük değer, örn. 300 veya 3600) |

## 2. Kayıt (MX)

| Alan | Değer |
|---|---|
| **Tür (Type)** | `MX` |
| **Ad/Host (Name/Host)** | `send` |
| **Değer/Hedef (Value/Target)** | `feedback-smtp.us-east-1.amazonses.com` |
| **Öncelik (Priority)** | `10` |
| **TTL** | Otomatik / varsayılan |

## 3. Kayıt (TXT — SPF)

| Alan | Değer |
|---|---|
| **Tür (Type)** | `TXT` |
| **Ad/Host (Name/Host)** | `send` |
| **Değer (Value)** | `v=spf1 include:amazonses.com ~all` |
| **TTL** | Otomatik / varsayılan |

---

## Not: "Ad/Host" alanına ne yazılacağını panel soruyorsa

Yukarıdaki tablolarda "Ad/Host" için `resend._domainkey` veya `send` yazıyor. Kullandığınız panel
bunu direkt kabul etmiyorsa (bazı paneller alan adını otomatik sonuna eklemez), tam hâlini deneyin:
`resend._domainkey.talkandheal.co.uk` veya `send.talkandheal.co.uk`. Emin olamazsanız önce kısa
hâli deneyin — panellerin çoğunda doğru olan budur.

## Bitince ne yapmalı?

3 kayıt da eklendikten sonra başka bir işlem yapmanıza gerek yok — sadece **Çiğdem Taş'a
tamamladığınızı bildirin**, doğrulamayı biz kontrol edeceğiz. (Doğrulama genelde birkaç dakika,
bazen birkaç saat sürebilir — bu normaldir, DNS'in yayılma süresidir.)
