# Image assets

Drop image files here. Nothing in this folder is gitignored, so anything added
gets committed with the app.

Expo resolves these at build time via `require("../../assets/<name>")`, so the
filenames matter — a file added under a different name won't be picked up
without a code change.

| File | Used for | Status |
|---|---|---|
| `asu-logo.png` | ASU wordmark at the top of the auth screen | **wanted** — a text mark stands in for it today, see below |
| `google-g.png` | The Google mark on "Continue with Google" | optional — currently drawn with Ionicons' `logo-google` glyph, which is monochrome |
| `icon.png` | App icon (1024×1024, no transparency, no rounded corners) | **needed before the iOS/Android build** |
| `splash-icon.png` | Native launch screen mark | needed before the device build |

A campus photo was considered for a sign-in hero and **deliberately dropped** —
the auth screen uses the ASU wordmark only.

## Adding `asu-logo.png`

`src/screens/AuthScreen.tsx` currently renders a maroon "ASU / ARIZONA STATE
UNIVERSITY" text mark above the EcoEats leaf. Once the real file is in this
folder, replace that text block with the `<Image>` in the TODO comment directly
above it.

The image can't be referenced ahead of time: Metro resolves `require()` at build
time, so pointing at a file that doesn't exist fails the entire bundle rather
than degrading to a placeholder.

## Sizes

- **Logos/marks**: PNG with transparency, ~3× the display size (the auth mark
  renders at 56pt, so ~168px wide is plenty).
- **Photos**: JPG, around 1200px on the long edge. Larger is wasted — the app is
  capped at 430pt wide (see `PhoneFrame`).
- **App icon**: exactly 1024×1024 PNG, fully opaque. Apple rejects transparency
  and applies its own corner rounding.
