# 21 — Building APKs & App Store Release (EAS)

All three mobile apps build with **EAS Build** (Expo Application Services). Local builds are possible (`eas build --local`) but cloud builds are the sane default.

## One-Time Setup

```bash
npm i -g eas-cli
eas login
cd apps/customer && eas build:configure   # creates/links EAS project (eas.json already provided)
```
Repeat in `apps/rider` and `apps/hotel`. EAS project ids get written into each `app.json` (`extra.eas.projectId`).

## APK for Internal Testing (preview profile)

```bash
cd apps/customer
eas build --platform android --profile preview     # → downloadable .apk
```

The preview profile sets production API env (`https://api.bocardo.in`) and uses `buildType: apk` — sideload straight onto test phones/tablets. Do this for **hotel** (tablets) and **rider** first; they're internal-fleet apps and may never need Play Store.

## Play Store Release (production profile)

1. **Google Play Console** → create app → package name must match `app.json` (`in.bocardo.customer`).
2. Build the **AAB**:
   ```bash
   eas build --platform android --profile production   # app-bundle
   ```
3. First upload: download the `.aab`, upload manually in Play Console → Production → New release. EAS manages the upload keystore by default (back it up: `eas credentials`).
4. Complete Play requirements: privacy policy URL (mandatory — covers GPS + payments disclosure), content rating questionnaire, data-safety form (location: precise, foreground; payments: Razorpay), target API level (current).
5. Subsequent releases: `eas submit --platform android` (needs a Google service-account JSON key).

## iOS (customer app, later)

Requires Apple Developer Program ($99/yr). `eas build --platform ios --profile production` + `eas submit`. Rider/hotel apps stay Android-only (fleet devices).

## Versioning Discipline

- Bump `version` in `app.json` per release; `appVersionSource: remote` lets EAS auto-increment Android `versionCode`.
- Tag releases in git: `git tag customer-v1.0.1 && git push --tags`.

## OTA Updates (EAS Update — optional but recommended)

JS-only fixes (UI, copy, minor logic) can ship without a store review:

```bash
eas update --branch production --message "fix cart badge"
```
Native changes (new expo modules, permissions) still require a full build. Set `updates.url` in `app.json` when enabling.

## Web PWA (customer)

```bash
cd apps/customer && pnpm web      # metro static export
# serve dist/ from any static host or behind Caddy at app.<domain>
```
