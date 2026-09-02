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

1. Register or sign in with any email address (email + password).
2. Firebase sends a verification link — the backend refuses any unverified
   token, so this step is mandatory.
3. First verified sign-in has no profile yet, so the app asks the user to pick
   a role (organizer or recipient), which creates the profile via our API.
4. From then on, every request carries the Firebase ID token; the backend
   verifies it and returns the profile.

The status machine lives in `src/context/AuthContext.tsx`; the router in
`app/_layout.tsx` turns each status into the right screen.

## Layout

```text
app/                 expo-router screens
  _layout.tsx        auth gate + routing
  (auth)/            login, register, verify-email, role selection
  (app)/             authenticated area (home stub for now)
src/
  config.ts          env access
  lib/firebase.ts    Firebase init + auth calls
  lib/api.ts         typed client for the FastAPI backend
  context/           AuthContext
  components/ui/      Button, Input, Spinner
```
