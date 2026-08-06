# Compiling EcoEats for Android

**Do this one first — before the iPhone build, and before spending the $99.**

Every check this app has ever passed was React Native **Web**. It has never been
compiled natively. Native is a different bundler path and different module
implementations: `react-native-sse`, `expo-image-picker`, `expo-haptics`,
NativeWind, the Google Fonts, the safe areas and all the `Animated` work have
only ever run in a browser.

Android is the cheap way to find that out. It needs **no paid account**, and it
produces an APK you can install directly. Apple's $99 is an iOS-only gate, so
paying it before knowing whether the app compiles at all means fighting native
breakage and Apple's signing flow at the same time.

## What you need

An **Expo account** — free, at [expo.dev](https://expo.dev). That's the whole
list. No Google Play account is needed to build or install an APK.

Everything below runs from the `mobile/` folder.

## Build it

**1 · Log in.** This asks for your Expo password, so it has to be you.

```bash
npx eas-cli login
```

**2 · Link the project.** Creates an EAS project and writes its id into
`app.json`.

```bash
npx eas-cli init
```

**3 · Build.** Expo compiles it on their machines and hands back an APK.

```bash
npx eas-cli build --profile preview --platform android
```

It will offer to **generate a new Android Keystore** — say yes. That's the
signing key for the app; EAS keeps it, and you can export it later with
`npx eas-cli credentials`.

Expect **10–20 minutes**, plus queue time on the free tier. The `preview`
profile bundles the JavaScript into the app, so what you install runs on its
own — no Metro, no laptop, no Wi-Fi pairing. That is what makes it a real test
rather than a development shell.

## Install it

The build finishes with a QR code and a URL. Open either on an Android phone and
install the APK — Android will ask you to allow installs from that source.

No phone? The same URL works in an emulator: install Android Studio, start any
device from its Device Manager, and drag the downloaded `.apk` onto it.

## What you are actually looking for

The build succeeding is only half of it. Once it opens, check the things that
have never run outside a browser:

- **The feed loads at all** — that's `react-native-sse` and the API client
  surviving the native bundler.
- **Live updates.** Post from the web client and watch the phone's feed change
  without a refresh. SSE is the most likely thing to behave differently here.
- **Haptics.** Chips, the portions stepper, the tab bar, a claim landing. This
  is the first time they run on real hardware rather than through a browser's
  vibration shim.
- **Fonts.** If Playfair and DM Sans didn't load, text falls back to the system
  face and the whole design reads wrong.
- **Photos.** `expo-image-picker` opening the real Android picker, and the
  upload completing.
- **Motion and safe areas** — the splash, the toast, the hero parallax, and
  whether anything hides under the status bar or the gesture bar.

Voice posting will do nothing, and there is no map. Both are known and expected:
they're web-only and unbuilt respectively.

## The icon

`app.json` declares no `icon`, so this build carries Expo's default mark. That's
fine for a test build and does not affect anything above. A real icon needs
`assets/icon.png` at exactly **1024×1024 with no alpha channel** — Apple rejects
transparency — and an `icon` key added to `app.json` *after* the file exists.
Metro resolves assets at build time, so pointing at a file that isn't there
fails the entire bundle rather than degrading.

## When to rebuild

Only when the **native** layer changes: a new native module, a new permission,
or an `app.json` plugin change. Ordinary screen edits are JavaScript and never
need one.
