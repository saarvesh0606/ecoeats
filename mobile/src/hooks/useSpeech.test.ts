import { act, renderHook, waitFor } from "@testing-library/react-native";
import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";
import { useNativeSpeech } from "./useSpeech";

// The native implementation is exercised directly. `useSpeech` resolves to one
// of the two at module load, which a test cannot steer without mocking
// Platform itself — and mocking that deep path breaks React Native's own
// re-export of it.

/** Handlers registered through useSpeechRecognitionEvent, by event name. */
const mockHandlers: Record<string, (event: unknown) => void> = {};

jest.mock("expo-speech-recognition", () => ({
	ExpoSpeechRecognitionModule: {
		isRecognitionAvailable: jest.fn(() => true),
		requestPermissionsAsync: jest.fn(),
		start: jest.fn(),
		stop: jest.fn(),
		abort: jest.fn(),
	},
	useSpeechRecognitionEvent: (
		name: string,
		handler: (event: unknown) => void,
	) => {
		mockHandlers[name] = handler;
	},
}));

const speech = ExpoSpeechRecognitionModule as unknown as {
	isRecognitionAvailable: jest.Mock;
	requestPermissionsAsync: jest.Mock;
	start: jest.Mock;
	stop: jest.Mock;
	abort: jest.Mock;
};

function emit(name: string, event: unknown = null) {
	act(() => mockHandlers[name]?.(event));
}

beforeEach(() => {
	jest.clearAllMocks();
	speech.isRecognitionAvailable.mockReturnValue(true);
	speech.requestPermissionsAsync.mockResolvedValue({ granted: true });
});

describe("the device recogniser", () => {
	it("reports itself supported when the device has one", async () => {
		const { result } = renderHook(() => useNativeSpeech(jest.fn()));
		expect(result.current.supported).toBe(true);
	});

	it("is unsupported where no recogniser is installed", async () => {
		// Some Android builds ship without Google's, and it can't appear while
		// the screen is open.
		speech.isRecognitionAvailable.mockReturnValue(false);
		const { result } = renderHook(() => useNativeSpeech(jest.fn()));
		expect(result.current.supported).toBe(false);
	});

	it("asks permission before opening the microphone", async () => {
		const { result } = renderHook(() => useNativeSpeech(jest.fn()));

		act(() => result.current.start());

		await waitFor(() => expect(speech.start).toHaveBeenCalled());
		expect(speech.requestPermissionsAsync).toHaveBeenCalled();
	});

	it("turns on volume events, or the waveform has nothing to read", async () => {
		const { result } = renderHook(() => useNativeSpeech(jest.fn()));

		act(() => result.current.start());

		await waitFor(() => expect(speech.start).toHaveBeenCalled());
		expect(speech.start).toHaveBeenCalledWith(
			expect.objectContaining({
				volumeChangeEventOptions: expect.objectContaining({ enabled: true }),
			}),
		);
	});

	it("passes a finished phrase to the caller", async () => {
		const onText = jest.fn();
		renderHook(() => useNativeSpeech(onText));

		emit("result", {
			isFinal: true,
			results: [{ transcript: "  Leftover pizza  ", confidence: 0.9 }],
		});

		expect(onText).toHaveBeenCalledWith("Leftover pizza");
	});

	it("ignores a partial phrase, which would append gibberish", async () => {
		const onText = jest.fn();
		renderHook(() => useNativeSpeech(onText));

		emit("result", {
			isFinal: false,
			results: [{ transcript: "Left", confidence: 0.4 }],
		});

		expect(onText).not.toHaveBeenCalled();
	});

	it("stops listening however recognition ended", async () => {
		// `end` fires for a result, a timeout, an error or a tap on stop. Without
		// it the panel would stay red for ever.
		const { result } = renderHook(() => useNativeSpeech(jest.fn()));

		act(() => result.current.start());
		await waitFor(() => expect(result.current.listening).toBe(true));

		emit("end");

		expect(result.current.listening).toBe(false);
	});

	it("says something useful when permission is refused", async () => {
		speech.requestPermissionsAsync.mockResolvedValue({ granted: false });
		const { result } = renderHook(() => useNativeSpeech(jest.fn()));

		act(() => result.current.start());

		await waitFor(() =>
			expect(result.current.error).toBe(
				"Microphone access is off — type instead.",
			),
		);
		expect(speech.start).not.toHaveBeenCalled();
		expect(result.current.listening).toBe(false);
	});

	it("reports a recogniser error without stranding the panel", async () => {
		const { result } = renderHook(() => useNativeSpeech(jest.fn()));

		act(() => result.current.start());
		await waitFor(() => expect(result.current.listening).toBe(true));

		emit("error", { error: "no-speech" });

		expect(result.current.error).toBe(
			"Didn't catch that. Try again, or type it.",
		);
		expect(result.current.listening).toBe(false);
	});

	it("abandons recognition when the screen goes away", async () => {
		// Leaving PostFood mid-phrase must not leave the mic open.
		const { unmount } = renderHook(() => useNativeSpeech(jest.fn()));

		unmount();

		expect(speech.abort).toHaveBeenCalled();
	});
});
