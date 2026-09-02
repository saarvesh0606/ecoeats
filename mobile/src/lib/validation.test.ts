import { validateEmail, validatePassword } from "./validation";

describe("validateEmail", () => {
	it("requires a value", () => {
		expect(validateEmail("")).toBe("Email is required.");
		expect(validateEmail("   ")).toBe("Email is required.");
	});

	it("rejects a malformed address", () => {
		expect(validateEmail("not-an-email")).toMatch(/doesn't look right/);
	});

	it("accepts an ordinary address", () => {
		expect(validateEmail("sam.rivera@gmail.com")).toBeNull();
	});

	it("normalises case and surrounding whitespace", () => {
		expect(validateEmail("  Sam@GMAIL.COM ")).toBeNull();
	});

	it("accepts any domain, including an Apple private relay address", () => {
		// There is deliberately no domain rule here any more. Enforcing one
		// client-side would mean two places to change it and a client refusing
		// addresses the server would accept — and it would reject the relay
		// addresses Sign in with Apple hands out.
		expect(validateEmail("someone@outlook.com")).toBeNull();
		expect(validateEmail("a1b2c3d4@privaterelay.appleid.com")).toBeNull();
		expect(validateEmail("student@university.edu")).toBeNull();
	});
});

describe("validatePassword", () => {
	it("rejects passwords under 6 characters", () => {
		expect(validatePassword("12345")).toMatch(/6 characters/);
	});

	it("accepts 6 or more", () => {
		expect(validatePassword("123456")).toBeNull();
	});
});
