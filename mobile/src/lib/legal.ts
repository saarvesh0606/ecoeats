/**
 * The terms, disclaimer and privacy notice shown in the app.
 *
 * ⚠️⚠️ THIS IS A DRAFT WRITTEN BY THE DEVELOPMENT TEAM, NOT BY A LAWYER, AND
 * IT HAS NOT BEEN REVIEWED BY ONE. It is a starting point to hand to counsel,
 * not a finished document to launch on. EcoEats hands out food on a US campus;
 * the liability questions are real and jurisdiction-specific, and the wording
 * that actually protects anyone is the wording a lawyer signs off.
 *
 * Worth raising with counsel specifically: the federal Bill Emerson Good
 * Samaritan Food Donation Act and Arizona's own food-donation provisions exist
 * to shield good-faith donors, and may already cover a good deal of this.
 *
 * ⚠️ TERMS_VERSION must match api/legal.py's CURRENT_TERMS_VERSION. The server
 * decides what counts as accepted; this constant only labels what is on screen.
 * Change the wording of a published version and the acceptance already stored
 * points at a document nobody saw — bump both instead.
 */

export const TERMS_VERSION = "2026-08-21";

export interface LegalDocument {
	title: string;
	/** Shown under the title, before the body. */
	summary: string;
	sections: { heading: string; body: string }[];
}

export const FOOD_SAFETY_DISCLAIMER: LegalDocument = {
	title: "Food safety",
	summary:
		"EcoEats connects people with surplus food. It does not prepare, handle, inspect or transport any of it.",
	sections: [
		{
			heading: "You decide what is safe to eat",
			body: "Food listed on EcoEats is prepared, stored and described by the person posting it, not by EcoEats. We do not inspect food, verify descriptions, check temperatures or storage times, or confirm that any kitchen involved is licensed. You are responsible for judging whether something is safe for you to eat, and for collecting it promptly.",
		},
		{
			heading: "Allergies and dietary needs",
			body: "Allergen information is written by the person posting the food and may be incomplete or wrong. Dietary tags such as vegetarian or halal are filters to help you browse — they are not verified and are not a safety guarantee. If you have a food allergy, an intolerance, or a religious or medical dietary requirement, do not rely on this app. Ask the host directly, and when in doubt do not eat it.",
		},
		{
			heading: "No warranty",
			body: "EcoEats is provided as is, without warranties of any kind, express or implied, including any implied warranty of merchantability or fitness for a particular purpose. We do not warrant that food obtained through EcoEats is safe, wholesome, accurately described, or fit to eat.",
		},
		{
			heading: "Limitation of liability",
			body: "To the fullest extent permitted by law, the EcoEats development team, its members, and anyone operating the service are not liable for any illness, injury, allergic reaction, loss or damage arising from food obtained, offered or consumed through EcoEats, or from any interaction between users. You use EcoEats at your own risk.",
		},
		{
			heading: "In an emergency",
			body: "If you believe you are having a severe allergic reaction or a medical emergency, call 911. Do not use this app to report it. Suspected foodborne illness can also be reported to your local health department.",
		},
	],
};

export const TERMS: LegalDocument = {
	title: "Terms of use",
	summary:
		"The rules for using EcoEats. By continuing you agree to them, and to the food safety disclaimer.",
	sections: [
		{
			heading: "Who can use EcoEats",
			body: "EcoEats is for members of the Arizona State University community with a valid asu.edu email address. You must be able to form a binding agreement to use it. Accounts are personal — do not share yours or use anyone else's.",
		},
		{
			heading: "If you post food",
			body: "Only post food that is genuinely surplus, that you have the right to give away, and that you would be willing to eat yourself. Describe it honestly, including anything you know about allergens and how it has been stored. Do not post alcohol, food you have already served to individuals, or anything you have reason to think is unsafe. Take your post down when the food is gone.",
		},
		{
			heading: "If you claim food",
			body: "Claim only what you will actually collect, and collect it within the window shown. A claim holds a portion back from someone else, so releasing a claim you cannot honour matters. Treat hosts and the spaces you collect from with respect.",
		},
		{
			heading: "Food safety",
			body: "EcoEats does not prepare, handle, inspect or transport food, and does not verify what is posted. The food safety disclaimer forms part of these terms and you should read it in full before using the app.",
		},
		{
			heading: "Conduct",
			body: "Do not use EcoEats to harass anyone, to misrepresent who you are or what you are offering, to sell anything, or for any unlawful purpose. We may suspend or remove accounts that do.",
		},
		{
			heading: "Your content",
			body: "You keep ownership of the photos and text you post. You give EcoEats permission to display them within the app so the service can work. Do not post photos you do not have the right to use, or images of identifiable people without their agreement.",
		},
		{
			heading: "The service can change",
			body: "EcoEats is a student project offered free of charge. It may change, break, or stop entirely, and we do not promise it will be available at any particular time.",
		},
		{
			heading: "Not affiliated with ASU",
			body: "EcoEats is not an official Arizona State University service and is not endorsed by the university.",
		},
		{
			heading: "Changes to these terms",
			body: "If these terms change materially we will ask you to accept the new version before you continue using the app.",
		},
	],
};

export const PRIVACY: LegalDocument = {
	title: "Privacy",
	summary:
		"What EcoEats collects, why, and what it never does with it. Short, because the app collects little.",
	sections: [
		{
			heading: "What we collect",
			body: "Your asu.edu email address and display name, so accounts are real and hosts and recipients can recognise one another. The posts, claims and ratings you create. Photos you attach to a post. A push notification token for the device you sign in on, so we can tell you when your food is claimed or your pickup is confirmed.",
		},
		{
			heading: "Location",
			body: "Location is only read when you tap Pin my location while writing a post, and only the coordinates you pin are stored — attached to that post, so people can see how far away the food is. EcoEats does not track your location in the background, and never reads it at all if you are only browsing.",
		},
		{
			heading: "What we never do",
			body: "We do not sell your data, we do not share it with advertisers, and there is no analytics or advertising SDK in this app. Crash reporting, if enabled, records technical diagnostics only.",
		},
		{
			heading: "Who can see what",
			body: "Your display name and rating are visible to people who interact with your posts or claims. Your email address is not shown to other users.",
		},
		{
			heading: "Where it lives",
			body: "Account and listing data is held in a hosted database, photos with a hosted image provider, and sign-in is handled by Google Firebase Authentication. Each of those providers holds data under its own terms.",
		},
		{
			heading: "Deleting your account",
			body: "Settings has a Delete account option. It removes your profile, your posts, your claims, your ratings and your notifications, and deletes your sign-in identity so the account cannot be used again. Deleting a host account also removes that host's posts, including any claims other people have made on them.",
		},
	],
};
