# EcoEats — mobile client

Expo / React Native app. iOS first, then Android; runs in a browser during
development.

## Setup

```bash
npm install --legacy-peer-deps
```

```bash
cp .env.example .env
```

Fill `.env` with the Firebase **web** config (Project settings → General → Your
apps) and the API URL. Every `EXPO_PUBLIC_*` value is bundled into the client
and is not secret.

## Run

The backend must be running first (see the repo root README): `docker compose
up -d db` and the FastAPI server on `http://localhost:8000`.

```bash
npm run web
```

Opens the app at `http://localhost:8081`.

When testing on a physical iPhone later, set `EXPO_PUBLIC_API_URL` to your PC's
LAN address (e.g. `http://192.168.1.20:8000`) — the phone can't reach
`localhost`.

## How auth works

Firebase handles sign-in; our backend is the authority on everything else.

1. Sign in with email and password, Sign in with Apple, or Google.
2. Email sign-ups get a verification link — the backend refuses any unverified
   token, so this step is mandatory. Apple and Google addresses arrive verified.
3. First verified sign-in has no profile yet, so the app asks the user to pick
   a role (organizer or recipient) and accept the terms, which creates the
   profile via our API.
4. From then on, every request carries the Firebase ID token; the backend
   verifies it and returns the profile.

The status machine lives in `src/context/AuthContext.tsx`; the router in
`app/_layout.tsx` turns each status into the right screen.

## Tests

```bash
npm test
```

446 tests with Jest and Testing Library. `npm run lint` runs Biome.

## Layout

```text
app/                   expo-router — the file tree is the navigation
  _layout.tsx          auth gate + routing
  (auth)/              login, register, forgot-password, verify-email, role,
                       terms, connection-problem
  (app)/(tabs)/        feed, post, posts, claims, activity, profile
  (app)/listing/[id]   detail + claim
  (app)/manage/[id]    host view of one listing
  (app)/settings/      index, blocked, [doc] legal pages
src/
  config.ts            env access — throws on a missing Firebase value
  screens/             the screen implementations the routes render
  components/          ListingCard, FeedFilterSheet, ReportSheet, VoicePanel,
                       SignInMethods, Apple/Google sign-in buttons
  components/ui/       primitives: Button, Input, Toast, Skeleton, SwipeableRow,
                       ConfirmDialog, OfflineNotice, Waveform, …
  context/             AuthContext, UnreadContext
  hooks/               device location, speech, audio levels, push navigation,
                       theme colours
  lib/                 api, firebase, appleAuth, listingStream (SSE),
                       moderation, legal (the terms — single source of truth),
                       push, uploads, session, preferences, validation
scripts/
  build-legal-site.mjs generates ../web/ from src/lib/legal.ts
```
