# P2P Fiat Trading E2E Test Scenarios

Bu belge, P2P fiat alım-satım sisteminin uçtan uca (E2E) test senaryolarını açıklar.

## Genel Bakış

Testler beş ana senaryoyu kapsar:

1. **Mutlu Yol (Happy Path)** - İki dürüst kullanıcı başarılı ticaret yapar
2. **Alıcı Dolandırıcılığı** - Alıcı ödeme yaptığını söyler ama yapmaz
3. **Satıcı Dolandırıcılığı** - Satıcı ödemeyi aldığına rağmen crypto'yu serbest bırakmaz
4. **İptal Senaryosu** - Alıcı ödeme yapmadan önce ticareti iptal eder
5. **Zaman Aşımı** - Ödeme süresi dolar

## Test Kullanıcıları

```
Alice  - Telegram ID: 111111111 - Dürüst satıcı
Bob    - Telegram ID: 222222222 - Dürüst alıcı
Scammer - Telegram ID: 333333333 - Dolandırıcı
```

## Senaryo 1: Mutlu Yol - İki Dürüst Kullanıcı

### Adımlar

1. **Alice teklif oluşturur**
   - 5 HEZ satılık
   - 100 TRY karşılığında
   - Ödeme yöntemi: Banka havalesi

2. **Sistem escrow'u kilitler**
   - Alice'in internal balance'ından 5 HEZ kilitlenir
   - `lock_escrow_internal` RPC çağrılır

3. **Bob teklifi kabul eder**
   - `accept_p2p_offer` RPC çağrılır
   - Trade kaydı oluşturulur (status: pending)

4. **Bob ödemeyi yapar ve işaretler**
   - Banka havalesi yapar
   - "Ödeme yaptım" butonuna tıklar
   - Trade status: payment_sent

5. **Alice ödemeyi teyit eder**
   - Bankasını kontrol eder, 100 TRY gelmiş
   - "Ödeme alındı" butonuna tıklar
   - `release_escrow_internal` çağrılır
   - Bob'un bakiyesine 5 HEZ eklenir

6. **Trade tamamlanır**
   - Her iki tarafın reputation'ı artar
   - Trade status: completed

### Beklenen Sonuç

- ✅ Alice: 100 TRY alır (banka hesabında)
- ✅ Bob: 5 HEZ alır (internal balance)
- ✅ Her ikisinin de reputation'ı artar

---

## Senaryo 2: Alıcı Dolandırıcılığı - "Sattım Desin Yollamasın"

### Durum

Scammer, ödeme yaptığını işaretler ama aslında hiç ödeme yapmamıştır.

### Adımlar

1. Alice 5 HEZ satış teklifi oluşturur
2. Scammer teklifi kabul eder
3. **Scammer ödeme yapmadan "Ödeme yaptım" der**
4. Alice bankasını kontrol eder - para YOK
5. **Alice escrow'u serbest BIRAKMAZ**
6. Alice dispute açar

### Dispute Çözümü

Admin inceleme yapar:

- Ödeme kanıtı var mı? ❌ HAYIR
- Banka hesabında para var mı? ❌ HAYIR

**Karar: Escrow Alice'e iade edilir**

```sql
-- Admin işlemi
UPDATE p2p_fiat_trades
SET status = 'refunded',
    dispute_resolved_at = NOW(),
    dispute_resolution = 'Refunded to seller - no payment proof'
WHERE id = 'trade-id';

-- Escrow iadesi
SELECT refund_escrow(
  p_from_user_id := alice_id,
  p_token := 'HEZ',
  p_amount := 5
);
```

### Beklenen Sonuç

- ✅ Alice: 5 HEZ'i geri alır
- ❌ Scammer: Hiçbir şey alamaz
- ⚠️ Scammer'ın reputation'ı düşer

---

## Senaryo 3: Satıcı Dolandırıcılığı - "Param Gelmedi Release Etmiyorum"

### Durum

Scammer satıcıdır. Bob gerçekten ödeme yapar ama Scammer parayı almasına rağmen crypto'yu release etmez.

### Adımlar

1. Scammer 5 HEZ satış teklifi oluşturur
2. Bob teklifi kabul eder
3. **Bob gerçekten 100 TRY gönderir** (banka dekontu var)
4. Bob "Ödeme yaptım" der ve dekont yükler
5. **Scammer "Para gelmedi" diye yalan söyler ve release etmez**
6. Confirmation deadline geçer
7. Bob dispute açar

### Dispute Çözümü

Admin inceleme yapar:

- Ödeme kanıtı var mı? ✅ EVET (banka dekontu)
- Dekont doğrulanabilir mi? ✅ EVET (IBAN, tarih, miktar uyuşuyor)

**Karar: Admin zorla release yapar**

```sql
-- Admin zorla release
SELECT release_escrow_internal(
  p_from_user_id := scammer_id,
  p_to_user_id := bob_id,
  p_token := 'HEZ',
  p_amount := 5,
  p_reference_type := 'admin_forced_release',
  p_reference_id := 'trade-id'
);

-- Trade güncelleme
UPDATE p2p_fiat_trades
SET status = 'completed',
    dispute_resolved_at = NOW(),
    dispute_resolution = 'Admin forced release - valid payment verified'
WHERE id = 'trade-id';

-- Scammer cezası
UPDATE p2p_reputation
SET disputed_trades = disputed_trades + 1,
    reputation_score = GREATEST(0, reputation_score - 20),
    trust_level = 'new'
WHERE user_id = scammer_id;
```

### Beklenen Sonuç

- ✅ Bob: 5 HEZ alır (haklı taraf)
- ❌ Scammer: Parayı aldı ama reputation çöker
- ⚠️ Scammer hesabı: "new" trust level, düşük score

---

## Senaryo 4: Trade İptali

### Durum

Bob teklifi kabul eder ama ödeme yapmadan vazgeçer.

### Adımlar

1. Alice 5 HEZ satış teklifi oluşturur
2. Bob teklifi kabul eder (status: pending)
3. **Bob fikrini değiştirir ve iptal eder**
4. Offer tekrar "open" durumuna döner

### Beklenen Sonuç

- ✅ Alice: Teklifi hala açık, başkası kabul edebilir
- ⚠️ Bob: reputation hafifçe düşebilir (çok fazla iptal zararlı)

---

## Senaryo 5: Zaman Aşımı

### Durum

Bob teklifi kabul eder ama süre dolana kadar ödeme yapmaz.

### Adımlar

1. Alice 5 HEZ teklifi oluşturur (30 dk limit)
2. Bob kabul eder
3. **30 dakika geçer, Bob ödeme yapmaz**
4. Sistem otomatik iptal eder (cron job)
5. Offer tekrar açılır

### Otomatik İşlem (Cron Job)

```sql
-- Süresi dolmuş pending trade'leri iptal et
UPDATE p2p_fiat_trades
SET status = 'cancelled',
    cancel_reason = 'Payment deadline expired'
WHERE status = 'pending'
AND payment_deadline < NOW();

-- Offer'ları tekrar aç
UPDATE p2p_fiat_offers o
SET remaining_amount = remaining_amount + t.crypto_amount,
    status = 'open'
FROM p2p_fiat_trades t
WHERE t.offer_id = o.id
AND t.status = 'cancelled'
AND t.cancel_reason = 'Payment deadline expired';
```

---

## Testleri Çalıştırma

### Unit Testler (Service key gerekmez)

```bash
npm run test:unit
```

### E2E Testler (Service key gerekli)

```bash
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
npm run test:e2e
```

### Tüm P2P Testleri

```bash
npm run test:p2p
```

---

## Önemli Notlar

### Escrow Güvenliği

- Escrow internal ledger'da tutulur (blockchain'de değil)
- P2P ticareti sırasında blockchain transaction OLMAZ
- Blockchain sadece deposit/withdraw'da kullanılır

### Dispute Politikası

1. Ödeme kanıtı olmadan dispute açılamaz
2. Admin her iki tarafı da dinler
3. Banka kayıtları delil olarak kabul edilir
4. Haksız tarafın reputation'ı ciddi şekilde düşer

### Reputation Sistemi

- Her başarılı trade: +1 puan
- Her iptal: -2 puan
- Kaybedilen dispute: -20 puan
- Trust level'lar: new → basic → intermediate → advanced → verified
