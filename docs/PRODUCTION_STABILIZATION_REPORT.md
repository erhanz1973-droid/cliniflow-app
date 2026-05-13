# Production stabilization: OAuth, native builds, push, account linking

**Scope:** Reliability and operability only — no new product features.  
**Repos:** `cliniflow-app` (patient), `cliniflow-backend-clean` (Railway), optional `doctor-clean`.

---

## 1. Build / native stabilization

### Yapılan / doğrulanan

| Item | Durum |
|------|--------|
| OAuth native deps | `expo-web-browser`, `expo-auth-session`, `expo-apple-authentication` SDK 54 ile `package.json`’da; `npx expo install …` ile hizalı. |
| Config plugins | `app.json`: `expo-router`, `expo-web-browser`, `expo-apple-authentication`, `expo-notifications`. `ios.usesAppleSignIn: true`. |
| iOS native | `ios/` prebuild ile üretildi; `Cliniflow.entitlements` içinde Sign in with Apple. |
| Expo Go | Hasta push kaydı `Constants.appOwnership === "expo"` iken native modül yüklenmez (bilinçli no-op). **Production / dev client** hedeflenir. |

### Development vs production build

| | Development (EAS `development`) | Production (`production`) |
|--|----------------------------------|----------------------------|
| Amaç | `expo-dev-client`, hızlı iterasyon, debug | Store / TestFlight |
| `expo-dev-client` | Evet | Hayır |
| Dağıtım | `internal` (profil tanımına bağlı) | Store pipeline |
| OAuth | Aynı native modüller; scheme / env `.env.*` ile ayrılır | `EXPO_PUBLIC_*` production değerleri doğrulanmalı |

### Xcode 14.2 uyumsuzluğu

Yerel `pod install` şu hatayı verebilir: **React Native requires Xcode >= 16.1. Found 14.2.**  
Çözüm sırası:

1. **EAS Build** kullanın (önerilen) — Expo bulutta güncel Xcode ile derler.  
2. Yerel derleme için **Xcode 16.1+** kurun.  
3. CocoaPods UTF-8: `export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8` sonra `cd ios && pod install --repo-update`.

### EAS pipeline

- `eas.json`: `development` (`developmentClient: true`), `preview`, `production`.  
- iOS `ios/` varken bundle id native projeden okunur; `app.config.js` / `app.json` uyarısı normal.  
- Arşiv büyük (~205 MB) → `.easignore` ile `*.aab`, `*.jks`, gereksiz yedekleri dışlayın.

### Smoke test checklist (build sonrası)

- [ ] Uygulama açılışı (cold start)  
- [ ] Oturum restore (JWT / SecureStore)  
- [ ] Google OAuth tam akış  
- [ ] Apple OAuth (yalnızca iOS fiziksel cihaz / uygun profil)  
- [ ] Push izni + token backend’e POST  
- [ ] Foreground bildirim (ses + banner)  
- [ ] Background bildirim  
- [ ] Uygulama kapalıyken bildirim → dokununca doğru ekran  
- [ ] Sohbet socket açık/kapalı mesaj alma  
- [ ] Badge sayısı ile sunucu unread tutarlılığı  

**Riskler:** Eski dev client binary yeni native modülleri içermez → yeni build şart.  
**Migration:** Yok.  
**Prod etkisi:** Yalnızca yeni binary dağıtımı.

---

## 2. Push reliability

### Test matrisi (manuel)

| Senaryo | Beklenti |
|---------|-----------|
| Foreground | Banner / ses (tercih açıksa), duplicate yok |
| Background | Bildirim + doğru deep link verisi |
| Terminated | Cold start + son bildirimden routing (varsa) |
| Socket connected | Anlık UI + push (çift tetik kontrolü) |
| Socket disconnected | Yalnız push ile güncelleme |

### Kontroller

- **Duplicate:** `chat_push_dispatches` + stabil message id ile idempotent claim.  
- **Badge:** `data.unreadBadge` string; Expo `badge` number — backend `sendExpoToEntity` içinde hizalı.  
- **Unread drift:** doktor/hasta `ack-open` ve unread tally endpoint’leri ile periyodik düzeltme.  
- **Stale / invalid token:** `EXPO_PUSH_RECEIPT_PRUNE=1` + receipt’ta device/token hatalarında `pruneExpoInvalidTokens`.  
- **Experience karışımı:** `push_tokens.expo_experience_id` + batch başına tek Expo project (`PUSH_TOO_MANY_EXPERIENCE_IDS` önlemi).

### Push log formatı (backend)

Tek satır JSON: **`PUSH_DELIVERY_V1`** (`lib/pushLog.cjs` → `pushDeliveryV1`).

Tipik alanlar: `traceId`, `phase`, `doctorId`, `patientId`, `recipientKind`, `threadId`, `experiencePartition`, `expoTicketIds` / `expoTicketId`, `httpOk`, `httpStatus`, `pruneCount`, `tokenPreview` / `tokenPreviews` (maskeli).

**Aktifleştirme:** `DOCTOR_PUSH_EXPO_TRACE=1` (doktor push ayrıntısı). İsteğe bağlı: `PUSH_DELIVERY_UNIFIED_LOG=1` (experience partition drop logları).  
**Eski satırlar:** `[CHAT_PUSH_BADGE]`, `[CHAT_PUSH_ROUTING]` ayrı etiketle kalabilir (badge/routing teşhis).

**Risk:** Log hacmi `DOCTOR_PUSH_EXPO_TRACE` açıkken artar — prod’da süreli açıp kapatın.  
**Migration:** `expo_experience_id` kolonu için `20260513140000_push_tokens_expo_experience_id.sql` Supabase’de uygulanmış olmalı.

---

## 3. OAuth flow hardening

### Uygulama tarafı (`lib/patientOAuth.ts` + login ekranı)

| Edge case | Davranış |
|-----------|----------|
| Session restore | `useAuth` + SecureStore; Supabase session ayrı yönetilmeli |
| Refresh token | Supabase client varsayılanı; süresi dolunca yeniden OAuth |
| Revoked credential | Supabase `signInWithIdToken` / exchange hata mesajı → kullanıcıya anlaşılır metin |
| Cancel | `oauth_cancelled` |
| Network | Timeout + retry UI |
| Provider mismatch | Sunucu `exchangeCliniflyJwtFromOAuthSession` kodları (`patient_not_found`, `patient_merge_conflict`, …) |
| Duplicate merge | `patient_merge_conflict` → kullanıcıya hata |

**Manuel test:** Her satır için bir test vakası checklist’e işaretlenir.  
**Risk:** Apple nonce / Supabase yapılandırması hatalıysa sessiz başarısızlık — staging’de log açık test.

---

## 4. Account linking safety

Önerilen kontroller (backend `POST /api/patient/auth/oauth` ve ilgili tablolar):

- Aynı email + farklı provider → tek `auth.users` / mapping kuralı netleştirilmeli.  
- OTP → OAuth geçişi → `pendingOtpSession` / link tablosu tutarlılığı.  
- `auth_user_id` mismatch → audit log (aşağıda).  
- `provider_subject` fallback (Apple sub / Google sub).  
- Duplicate patient → sunucu `patient_merge_conflict` + idempotent insert.

**Audit log (öneri):** `patient_oauth_link_audit` tablosu veya mevcut log pipeline’a `traceId` + `supabaseUserId` + `cliniflyPatientId` + `provider` (PII’siz). **Kod eklemedik** — gereksinim olarak backlog.

---

## 5. Database / backend cleanup

### Migrations

- `push_tokens` oluşturma + `expo_experience_id` — sırayla uygulayın.  
- Diğer migration’lar repo içi tarih sırasına göre.

### Operasyonel SQL (manuel, prod öncesi yedek)

```sql
-- Orphan: artık var olmayan owner
-- DELETE FROM push_tokens WHERE owner_kind = 'doctor' AND owner_id NOT IN (SELECT id FROM doctors);

-- Yanlış experience (doktor satırında hasta uygulaması token’ı)
DELETE FROM push_tokens
WHERE owner_kind = 'doctor' AND expo_experience_id = '@erhanzorlu/clinifly-new';

-- Uniqueness: (owner_kind, owner_id, expo_push_token) zaten unique index
```

**Index:** `push_tokens_owner_idx`, `push_tokens_owner_experience_idx`.  
**Nullable audit:** `expo_experience_id` null = legacy; yeni client’lar doldurur.

**Risk:** DELETE’ler geri alınamaz — önce `SELECT` ile sayım.

---

## 6. App Store readiness checklist

- [ ] Hesap silme (Apple gereksinimi)  
- [ ] Gizlilik politikası URL (canlı, uygulama içi ve Store metadata)  
- [ ] Sign in with Apple (Google ile birlikte sunuluyorsa zorunlu)  
- [ ] Bildirim izni gerekçesi (iOS string / UX)  
- [ ] Onboarding netliği  
- [ ] Production env (`EXPO_PUBLIC_API_URL`, Supabase anon, Railway API)  
- [ ] Deep link / scheme `clinifly` → OAuth redirect ve push data ile uyum  

---

## 7. Git safety — **kritik**

`cliniflow-app` çalışma ağacında görülen durum:

- Eski yollar: `app/(patient/*`, `app/(tabs/*`, `app/login/*` vb. **tracked silinmiş** (`D`) görünüyor.  
- Yeni yollar: `app/(app)/**` çoğunlukla **`??` (untracked)**.

Bu, **router dosyalarının Git’te “silindi” ama yenileri commitlenmedi”** anlamına gelebilir; CI veya başka makinede clone **eksik route** ile kırılır.

### Yapılması gereken (bir kez, dikkatli)

```bash
cd cliniflow-app
git status
# Yeni yapıyı inceleyin:
git add app/(app)
# Eski silinmeleri kasıtlıysa:
git add -u app/
git status   # beklenen: rename/migrate, gereksiz .jks/.aab commit dışı
git commit -m "chore: complete app/(app) route tree for git consistency"
```

**Kontrol listesi:** `app/(app)/login/patient.tsx`, `_layout.tsx`, `registerExpoPush.ts`, `lib/auth.tsx`, `lib/patientOAuth.ts`, `ios/` — hepsi commit’te mi?

**Risk:** Yanlış `git add -u` ile istenmeyen silme commitlenir — diff mutlaka okuyun.

---

## 8. Özet tablo (bölüm bazlı)

| Bölüm | Yapılan değişiklikler | Risk | Migration | Prod etki | Manuel test |
|-------|----------------------|------|-----------|-----------|-------------|
| 1 Native | README + rapor; Xcode/EAS notları | Eski Xcode’da yerel pod başarısız | Yok | Yeni binary | Smoke checklist |
| 2 Push | `PUSH_DELIVERY_V1` birleşik log; traceId notify’da | Trace log hacmi | `expo_experience_id` | Düşük (log) | Foreground/background/… |
| 3 OAuth | Rapor + mevcut kod referansı | — | Yok | — | OAuth matrix |
| 4 Linking | Öneriler | — | İsteğe bağlı tablo | — | Staging |
| 5 DB | SQL örnekleri | DELETE | Supabase | Veri temizliği | Staging |
| 6 Store | Checklist | — | Yok | Metadata | Review |
| 7 Git | **add `app/(app)`** uyarısı | Yüksek | Yok | Repo bütünlüğü | `git diff` |

---

*Son güncelleme: otomatik üretim + repo taraması ile uyumlu hale getirildi.*
