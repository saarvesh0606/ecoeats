jest.mock("expo-constants", () => ({
	__esModule: true,
	default: { expoConfig: { version: "1.2.3", ios: { buildNumber: "42" } } },
}));

/** Load initMonitoring fresh, with a chosen DSN and a chosen SDK. */
function load(dsn: string | undefined, sdk: { init: jest.Mock } | "missing") {
	let init: () => void = () => {};
	jest.isolateModules(() => {
		jest.doMock("@/config", () => ({ config: { sentryDsn: dsn } }));
		jest.doMock(
			"@sentry/react-native",
			() => {
				// A binary built before the native module existed: requiring it
				// throws, which is the case the guard is for.
				if (sdk === "missing") throw new Error("native module not found");
				return sdk;
			},
			{ virtual: true },
		);
		init = require("./monitoring").initMonitoring;
	});
	return init;
}

describe("initMonitoring", () => {
	// One test, not two: both concern the same init call, and re-registering the
	// virtual module a second time does not take.
	it("starts reporting, stamped with the build and carrying no personal data", () => {
		const sdk = { init: jest.fn() };
		load("https://key@o1.ingest.sentry.io/2", sdk)();

		expect(sdk.init).toHaveBeenCalledTimes(1);
		const options = sdk.init.mock.calls[0][0];
		expect(options.dsn).toBe("https://key@o1.ingest.sentry.io/2");
		// Which build a report came from. Without it every crash looks like the
		// same version, and that matters more here than usual because the
		// JavaScript now moves independently of the binary.
		expect(options.release).toBe("1.2.3");
		expect(options.dist).toBe("42");
		// Breadcrumbs would otherwise carry whatever was typed, and the fields on
		// the first screen are an ASU email and a password.
		expect(options.sendDefaultPii).toBe(false);
		// Traces cost quota answering questions nobody is asking yet.
		expect(options.tracesSampleRate).toBe(0);
	});

	it("does nothing at all without a DSN", () => {
		const sdk = { init: jest.fn() };
		load(undefined, sdk)();

		// A missing DSN is a configuration state — a fork, a local checkout — not
		// something to complain at anyone about.
		expect(sdk.init).not.toHaveBeenCalled();
	});

	it("survives a binary that has no native Sentry in it", () => {
		// The reason this guard exists: updates ship over the air and reach
		// binaries built before the module was added. Throwing here would take the
		// app down on launch, and would mean no update could go out until a build
		// existed to match it.
		const init = load("https://key@o1.ingest.sentry.io/2", "missing");

		expect(() => init()).not.toThrow();
	});
});
