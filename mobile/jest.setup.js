// Runs before modules load. src/config.ts requires these EXPO_PUBLIC_* values
// at import time, so anything importing it (e.g. validation) needs them set.
// The values are placeholders — no test talks to Firebase.
process.env.EXPO_PUBLIC_API_URL = "http://localhost:8000";
process.env.EXPO_PUBLIC_FIREBASE_API_KEY = "test-api-key";
process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN = "test.firebaseapp.com";
process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID = "test-project";
process.env.EXPO_PUBLIC_FIREBASE_APP_ID = "1:1:web:test";
