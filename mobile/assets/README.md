# Image assets

Drop image files here. Nothing in this folder is gitignored, so anything added
gets committed with the app.

Expo resolves these at build time via `require("../../assets/<name>")`, so the
filenames matter — a file added under a different name won't be picked up
without a code change.

| File | Used for | Status |
|---|---|---|
| `google-g.png` | The Google mark on "Continue with Google" | optional — currently drawn with Ionicons' `logo-google` glyph, which is monochrome |
| `icon.png` | App icon (1024×1024, no transparency, no rounded corners) | **needed before the iOS/Android build** |
| `splash-icon.png` | Native launch screen mark | needed before the device build |

A photo was considered for a sign-in hero and **deliberately dropped** — the
auth screen shows the app mark, the name, and one line of what it is for.

## The auth screen mark

`src/screens/AuthScreen.tsx` renders `icon.png` — the same file the home screen
icon comes from, rounded in code to match how iOS draws it there. There is no
separate logo asset, on purpose: two files would drift, and the app someone
tapped should look like the screen that greets them.

It replaced a university wordmark, dropped along with the rest of that
branding pending permission to use the name.

A new mark, if one is ever drawn, goes in as its own file rather than
overwriting `icon.png`, which the build reads for the launcher icon. Note that
Metro resolves `require()` at build time, so a file that does not exist yet
fails the whole bundle rather than degrading to a placeholder — add the asset
before pointing code at it.

## Sizes

- **Logos/marks**: PNG with transparency, ~3× the display size (the auth mark
  renders at 56pt, so ~168px wide is plenty).
- **Photos**: JPG, around 1200px on the long edge. Larger is wasted — the app is
  capped at 430pt wide (see `PhoneFrame`).
- **App icon**: exactly 1024×1024 PNG, fully opaque. Apple rejects transparency
  and applies its own corner rounding.
