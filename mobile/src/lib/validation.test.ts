import { validateAsuEmail, validatePassword } from "./validation";

describe("validateAsuEmail", () => {
	it("requires a value", () => {
		expect(validateAsuEmail("")).toBe("Email is required.");
		expect(validateAsuEmail("   ")).toBe("Email is required.");
	});

	it("rejects a malformed address", () => {
		expect(validateAsuEmail("not-an-email")).toMatch(/doesn't look right/);
	});

	it("rejects a non-ASU domain", () => {
		expect(validateAsuEmail("someone@gmail.com")).toMatch(/ASU/);
	});

	it("accepts a valid ASU address", () => {
		expect(validateAsuEmail("sun.devil@asu.edu")).toBeNull();
	});

	it("normalises case and surrounding whitespace", () => {
		expect(validateAsuEmail("  Sun@ASU.EDU ")).toBeNull();
	});

	it("is not fooled by a lookalike domain", () => {
		expect(validateAsuEmail("attacker@asu.edu.evil.com")).toMatch(/ASU/);
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
