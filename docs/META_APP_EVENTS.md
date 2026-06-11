# Meta App Events (Facebook SDK)

Configured App ID: `1908819279802983`  
Client Token: set in `eas.json`, `app.config.js`, and native `Info.plist` / `strings.xml`.

## Launch audit (build 71)

**Introducing commit:** `026b98d3` — *Add Meta App Events SDK (v126.0) for ad conversion tracking.*

Build 69 (`41908d33`) was the last build without Meta SDK. Build 71 added native Facebook SDK + ATT on cold start.

**Likely failure mode:** native crash or iOS watchdog kill during `expo-tracking-transparency@56.x` (wrong for Expo SDK 54 — use `~5.2.4`) when `requestTrackingPermissionsAsync()` ran before `initializeSDK()`.

**Startup logs (TestFlight):** set `EXPO_PUBLIC_LAUNCH_AUDIT=1` in EAS env, connect device to Xcode → Devices → Open Console, filter `[launch]`. Expected order:

1. `App Launch`
2. `Root Layout Mounted`
3. `App Shell Layout Mounted`
4. `Meta Bootstrap Mounted`
5. `Meta SDK Init Start` → `Meta SDK Init Complete`
6. `Navigation Ready`

## Package

- `react-native-fbsdk-next` + `expo-tracking-transparency` (~5.2.4 for Expo 54)
- Config plugin: `plugins/withFacebookSDK.js`
- Bootstrap: `components/MetaAppEventsBootstrap.tsx` (mounted in `app/(app)/_layout.tsx`)

## Native config

**iOS** (`Info.plist` / prebuild):

- `FacebookAppID`
- `FacebookClientToken`
- URL scheme `fb1908819279802983`
- `NSUserTrackingUsageDescription`

**Android** (`AndroidManifest.xml` + `strings.xml`):

- `com.facebook.sdk.ApplicationId`
- `com.facebook.sdk.ClientToken`

## Events tracked (mobile)

| Event | Meta name | Trigger |
|-------|-----------|---------|
| App Open | `fb_mobile_activate_app` | Startup + foreground |
| User Registration | `CompleteRegistration` | Patient register / OTP verify |
| Photo Upload | `PhotoUpload` | Successful image upload in chat |
| Clinic Contact | `ContactClinic` | First message to a clinic |
| Doctor Registration | `DoctorRegistration` | Doctor register success |

Clinic registration (`ClinicRegistration`) fires on web `admin-register.html` via Meta Pixel.

## Verify in Meta Events Manager

1. Meta Events Manager → App `1908819279802983` → **Test Events**
2. Install production/preview build on a physical device (simulators may not send reliably)
3. Flow: open app → register → upload photo → message a clinic
4. Events typically appear within a few minutes in Test Events

Debug logging: set `EXPO_PUBLIC_ANALYTICS_DEBUG=1` in the build profile env.

## Production build

```bash
cd cliniflow-app
eas build --platform all --profile production
```
