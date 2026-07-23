# Running EcoEats on a real iPhone

You're on Windows, so there's no iOS simulator and no local Xcode build. The
path is **EAS Build** — Expo compiles the app on their cloud Macs, and you
install the result on your iPhone over the air. After that one-time install, you
edit code on Windows and the phone updates live over Wi-Fi.

> **Do this at the end.** The app is fully built and works in the browser today.
> This is the last step, once you have the two things below. Nothing here is
> needed until then.

## What you need first

1. **An Apple Developer account** — $99/year, at
   [developer.apple.com](https://developer.apple.com). Enrolment can take a day
   or two to be approved, so start it early.
2. **An Expo account** — free, at [expo.dev](https://expo.dev).
3. Your **iPhone**, on the **same Wi-Fi** as this PC.

Everything below is run from the `mobile/` folder.

## One-time setup

**1 · Log in to Expo**

```bash
npx expo login
```

**2 · Link the project to EAS** (creates a project ID and writes it into
app.json)

```bash
npx eas-cli init
```

**3 · Register your iPhone** so the build is allowed to run on it. This prints a
QR code / link — open it on the phone and install the profile it offers.

```bash
npx eas-cli device:create
```

**4 · Build the development client** on Expo's cloud Macs. Takes ~10–15 minutes;
you'll be asked to log in with your Apple ID so EAS can manage signing.

```bash
npx eas-cli build --profile development --platform ios
```

When it finishes, it shows a QR code. Scan it with the iPhone camera and install
**EcoEats** — a custom version of Expo Go with our native code (image picker,
and later maps and speech) baked in.

## Every day after that

**1 · Point the app at this PC.** The phone can't reach `localhost`; it needs
this machine's Wi-Fi address. Edit `mobile/.env`:

```env
EXPO_PUBLIC_API_URL=http://192.168.1.34:8000
```

> `192.168.1.34` is this PC's current LAN IP. It can change when you reconnect
> to Wi-Fi — re-check with `ipconfig` (look for "IPv4 Address") if the phone
> can't reach the API.

**2 · Let the phone through the Windows firewall** (one time). In an
**Administrator** PowerShell:

```powershell
New-NetFirewallRule -DisplayName "EcoEats API" -Direction Inbound -LocalPort 8000 -Protocol TCP -Action Allow
```

**3 · Start the backend** (it already binds all interfaces, so the phone can
reach it):

```bash
docker compose up -d db
```

```bash
.venv/Scripts/python.exe -m uvicorn api.main:create_app --factory --host 0.0.0.0 --port 8000
```

**4 · Start Metro for the dev client** (not `--web`):

```bash
npx expo start --dev-client
```

Scan the QR with the iPhone. The **EcoEats** app you installed opens, connects
to Metro over Wi-Fi, and from here code changes reload in ~2 seconds.

## When to rebuild (step 4 of setup again)

Only when the **native** layer changes — a new native module (the map, native
speech), a new permission, or an app.json plugin change. Plain screen edits
(JavaScript) never need a rebuild; they hot-reload.

## Turn the dev bypass off for real testing

Once you're signing in with a real `@asu.edu` account on the phone, disable the
dev shortcuts:

- `mobile/.env` → `EXPO_PUBLIC_DEV_AUTH=false`
- backend `.env` → `DEV_AUTH_BYPASS=false`

## Still to build before/with this step

- **Map screen** — needs `react-native-maps` (native), so it only runs on this
  dev build, not the browser. Add its location permission strings to app.json
  when it's wired.
- **Native voice** — the description mic uses the browser's speech engine today;
  the device build will use `expo-speech-recognition`, which needs
  `NSMicrophoneUsageDescription` and `NSSpeechRecognitionUsageDescription` added
  to app.json at that point.
