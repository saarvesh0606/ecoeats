import { sendAppleAuthorization } from "@/lib/api";
import {
	flushAppleAuthorization,
	holdAppleAuthorization,
} from "./appleAuth";

jest.mock("@/lib/api", () => ({ sendAppleAuthorization: jest.fn() }));
jest.mock("expo-apple-authentication", () => ({}));
jest.mock("expo-crypto", () => ({}));

const send = sendAppleAuthorization as jest.MockedFunction<
	typeof sendAppleAuthorization
>;

beforeEach(() => {
	jest.clearAllMocks();
	holdAppleAuthorization(null); // no leakage between tests
});

describe("the held Apple authorization code", () => {
	it("is spent on the first flush", async () => {
		holdAppleAuthorization("code-123");

		await flushAppleAuthorization();

		expect(send).toHaveBeenCalledWith("code-123");
	});

	it("is not spent twice", async () => {
		// Apple's code is one-shot. Both the sign-in button and role selection
		// flush, because either can be the first to have a profile to attach to
		// — so the second flush must be a no-op rather than a wasted call that
		// Apple rejects.
		holdAppleAuthorization("code-123");

		await flushAppleAuthorization();
		await flushAppleAuthorization();

		expect(send).toHaveBeenCalledTimes(1);
	});

	it("does nothing when there is none", async () => {
		await flushAppleAuthorization();

		expect(send).not.toHaveBeenCalled();
	});

	it("swallows a failure rather than blocking the way in", async () => {
		// It buys a revocation at deletion time. It must never stand between
		// somebody and their account.
		send.mockRejectedValue(new Error("no profile yet"));
		holdAppleAuthorization("code-123");

		await expect(flushAppleAuthorization()).resolves.toBeUndefined();
	});

	it("drops the code even when sending failed", async () => {
		// One-shot: a retry would be refused by Apple anyway, so holding it
		// would only keep a dead credential in memory.
		send.mockRejectedValue(new Error("no profile yet"));
		holdAppleAuthorization("code-123");
		await flushAppleAuthorization();

		send.mockResolvedValue(undefined);
		await flushAppleAuthorization();

		expect(send).toHaveBeenCalledTimes(1);
	});
});
