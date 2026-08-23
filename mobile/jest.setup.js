// Runs before modules load. src/config.ts requires these EXPO_PUBLIC_* values
// at import time, so anything importing it (e.g. validation) needs them set.
// The values are placeholders — no test talks to Firebase.
process.env.EXPO_PUBLIC_API_URL = "http://localhost:8000";
process.env.EXPO_PUBLIC_FIREBASE_API_KEY = "test-api-key";
process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN = "test.firebaseapp.com";
process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID = "test-project";
process.env.EXPO_PUBLIC_FIREBASE_APP_ID = "1:1:web:test";

// expo-speech-recognition resolves its native module at import time and throws
// "Cannot find native module 'ExpoSpeechRecognition'" under Jest. It is pulled
// in transitively by useAudioLevels -> Waveform -> VoicePanel -> PostFood, so
// without this any suite touching the post form fails to load at all.
// A file that cares about the behaviour (useSpeech.test.ts) declares its own
// jest.mock, which takes precedence over this one.
jest.mock("expo-speech-recognition", () => ({
	ExpoSpeechRecognitionModule: {
		isRecognitionAvailable: () => false,
		requestPermissionsAsync: async () => ({ granted: false }),
		getPermissionsAsync: async () => ({ granted: false }),
		start: () => {},
		stop: () => {},
		abort: () => {},
	},
	useSpeechRecognitionEvent: () => {},
}));

// Reanimated's real entry point initialises the native worklets runtime, which
// does not exist under Jest — importing it throws before any test runs. Its
// own shipped mock is no use either: react-native-reanimated/mock re-imports
// the real index, so it throws in exactly the same place. Hence a hand-written
// stand-in covering only what ReflowRow touches — Animated.View and two
// chainable animation builders.
jest.mock("react-native-reanimated", () => {
	const { View } = require("react-native");
	const builder = () => {
		const chain = new Proxy(
			{},
			{ get: () => () => chain },
		);
		return chain;
	};
	return {
		__esModule: true,
		default: { View },
		FadeOut: builder(),
		LinearTransition: builder(),
	};
});

// Google sign-in opens a real browser and demands real OAuth client ids —
// useIdTokenAuthRequest throws outright without them. Nothing under test wants
// either, so the provider is stubbed as "no response yet", which is the state
// the button spends all its time in anyway.
jest.mock("expo-auth-session/providers/google", () => ({
	useIdTokenAuthRequest: () => [null, null, jest.fn()],
}));

jest.mock("expo-web-browser", () => ({
	maybeCompleteAuthSession: jest.fn(),
	openAuthSessionAsync: jest.fn(),
}));
