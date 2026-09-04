import { fireEvent, render } from "@testing-library/react-native";
import { Linking } from "react-native";
import { VoicePanel } from "./VoicePanel";

// The panel samples microphone loudness for the waveform. That needs a real
// recogniser emitting volume events, which no test has, and the bars are not
// what any of this is about.
jest.mock("@/hooks/useAudioLevels", () => ({
	useAudioLevels: () => ({ levels: new Array(32).fill(0), available: false }),
}));

describe("the voice panel", () => {
	it("shows the way to Settings once the mic is refused for good", () => {
		const { getByLabelText } = render(
			<VoicePanel
				listening={false}
				onToggle={jest.fn()}
				error="Microphone access is off. Turn on Microphone and Speech Recognition in Settings."
				blocked
			/>,
		);

		const openSettings = jest.spyOn(Linking, "openSettings").mockResolvedValue();
		fireEvent.press(getByLabelText("Open Settings to turn on the microphone"));

		expect(openSettings).toHaveBeenCalled();
		openSettings.mockRestore();
	});

	it("keeps Settings out of the way when the mic is simply unused", () => {
		// An ordinary panel with nothing wrong must not suggest anything is.
		const { queryByLabelText } = render(
			<VoicePanel listening={false} onToggle={jest.fn()} />,
		);

		expect(
			queryByLabelText("Open Settings to turn on the microphone"),
		).toBeNull();
	});

	it("does not offer Settings for an error Settings cannot fix", () => {
		// "Didn't catch that" is not a permission problem, and sending someone to
		// a screen where everything is already switched on teaches them the
		// message is noise.
		const { queryByLabelText } = render(
			<VoicePanel
				listening={false}
				onToggle={jest.fn()}
				error="Didn't catch that. Try again, or type it."
			/>,
		);

		expect(
			queryByLabelText("Open Settings to turn on the microphone"),
		).toBeNull();
	});
});
