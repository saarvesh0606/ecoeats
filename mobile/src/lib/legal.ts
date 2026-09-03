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

export const TERMS_VERSION = "2026-09-03";

export interface LegalDocument {
	title: string;
	/** Shown under the title, before the body. */
	summary: string;
	sections: { heading: string; body: string }[];
}

export type LegalDocumentKey = "terms" | "safety" | "privacy";

export const FOOD_SAFETY_DISCLAIMER: LegalDocument = {
	title: "Food safety & disclaimers",
	summary:
		"This app connects independent people with surplus food. It does not prepare, handle, inspect, or transport any of it. The food safety disclaimer forms part of the terms of use and you should read it in full before using the app.",
	sections: [
		{
			heading: "You decide what is safe to eat",
			body: "Food listed on this platform is prepared, stored, and described solely by the private individual posting it, not by the app developers. We do not inspect food, verify descriptions, check temperatures or storage times, or confirm that any kitchen involved is licensed.\n\nNo institution, university, or third-party dining vendor has reviewed, inspected, or verified the items posted here. You are completely and solely responsible for judging whether something is safe for you to eat, and for collecting it promptly.",
		},
		{
			heading: "Allergies and dietary needs",
			body: "Allergen information is written by the person posting the food and may be incomplete or wrong. Dietary tags such as vegetarian or halal are filters to help you browse — they are not verified and are not a safety guarantee. If you have a food allergy, an intolerance, or a religious or medical dietary requirement, do not rely on this app. Ask the host directly, and when in doubt do not eat it.",
		},
		{
			heading: "No warranty",
			body: "This app is provided as is, without warranties of any kind, express or implied, including any implied warranty of merchantability or fitness for a particular purpose. We do not warrant that food obtained through this service is safe, wholesome, accurately described, or fit to eat.",
		},
		{
			heading: "Limitation of liability",
			body: "To the fullest extent permitted by law, the development team, its members, and anyone operating this private service are not liable for any illness, injury, allergic reaction, loss, or damage arising from food obtained, offered, or consumed through this app, or from any interaction between users.\n\nFurthermore, because this service is entirely independent and unaffiliated, no university, college, institutional body, or commercial food vendor — nor their respective subsidiaries, employees, or affiliates — bears any liability, responsibility, or obligation for any claims, disputes, or health issues arising from the use of this application. You use this platform entirely at your own risk.",
		},
		{
			heading: "In an emergency",
			body: "If you believe you are having a severe allergic reaction or a medical emergency, call 911 immediately. Do not use this app to report it. Suspected foodborne illness can also be reported to your local health department.",
		},
	],
};

export const TERMS: LegalDocument = {
	title: "Terms of use",
	summary:
		"The rules for using this app. By continuing you agree to them, and to the food safety disclaimer.",
	sections: [
		{
			heading: "Who can use this app",
			body: "This app is open to anyone with a valid email address you can confirm — we send a verification link and the account does nothing until you click it. Sign in with Apple's private relay addresses are accepted.\n\nYou must be at least 18 years old, and able to form a binding agreement, to use this app. It is not directed at children. Accounts are personal — do not share yours or use anyone else's.",
		},
		{
			heading: "If you post food",
			body: "Only post food that is genuinely surplus, that you have the right to give away, and that you would be willing to eat yourself. Describe it honestly, including anything you know about allergens and how it has been stored. Take your post down when the food is gone.\n\nBy posting food on this platform, you legally warrant and represent that:\n\n1. You are acting strictly in your private, individual capacity and NOT as an employee, agent, or representative of any university, student housing department, or commercial campus dining service.\n\n2. The food being posted is your personal property (such as leftovers from a personal event or private groceries) and is NOT the property of university dining services, campus caterers, or commercial vendors.\n\n3. You have the full legal right and authorization to distribute this food.\n\nDo not post alcohol, food you have already served to individuals, commercial kitchen surplus, or anything you have reason to think is unsafe.",
		},
		{
			heading: "If you claim food",
			body: "Claim only what you will collect, and collect it within the window shown. A claim holds a portion back from someone else, so releasing a claim you cannot honour matters. Treat hosts and the spaces you collect from with respect.",
		},
		{
			heading: "Conduct",
			body: "Do not use this app to harass anyone, to misrepresent who you are or what you are offering, to sell anything, or for any unlawful purpose. Do not post content that is abusive, obscene, threatening, discriminatory, or that infringes someone else's rights.\n\nWe may remove any listing or content, and suspend or remove any account, that breaks these rules — without notice where the content is harmful.",
		},
		{
			heading: "Reporting content or a person",
			body: "If you see a listing that is offensive, misleading, unsafe, or otherwise breaks these rules, open it and tap Report this listing. Reports are private, are reviewed promptly, and content that breaks these rules is removed — accounts responsible for it can be suspended. You can also email hello@ecoeatsapp.com.\n\nYou can block anyone from a listing they posted. Blocking hides their food from you and yours from them, and neither of you can claim the other's. Undo it any time in Settings under Blocked accounts.\n\nIf you believe someone is in danger, contact your local emergency services first — we are not an emergency service and cannot respond as one.",
		},
		{
			heading: "Your content",
			body: "You keep ownership of the photos and text you post. You give this app permission to display them within the application so the service can work. Do not post photos you do not have the right to use, or images of identifiable people without their agreement.",
		},
		{
			heading: "The service can change",
			body: "This app is an independent student project offered free of charge. It may change, break, or stop entirely, and we do not promise it will be available at any particular time.",
		},
		{
			heading: "Not affiliated with any university or commercial vendor",
			body: "This platform is a completely independent, private service. It is not operated, managed, sponsored, endorsed, or affiliated with any university, college, student housing department, institutional body, or commercial food vendor. All transactions, listings, and distributions are strictly peer-to-peer between independent private individuals.",
		},
		{
			heading: "Changes to these terms",
			body: "If these terms change materially we will ask you to accept the new version before you continue using the app.",
		},
		{
			heading: "Apple is not part of this agreement",
			body: "This agreement is between you and us only, not with Apple. Apple has no responsibility for this app or its content, and no obligation to provide any maintenance or support for it.\n\nIf the app fails to conform to any applicable warranty, you may notify Apple and Apple will refund the purchase price, if any. To the maximum extent permitted by law, Apple has no other warranty obligation at all, and any claims, losses, liabilities, damages, costs or expenses attributable to a failure to conform to a warranty are our responsibility and not Apple's.\n\nWe, not Apple, are responsible for addressing any claim relating to this app, including product liability claims, any claim that it fails to conform to a legal or regulatory requirement, and claims arising under consumer protection or similar law. Apple and its subsidiaries are third-party beneficiaries of these terms and may enforce them against you.",
		},
		{
			heading: "Contact",
			body: "For anything at all — a report, a data request, a bug, or a question about these terms — email hello@ecoeatsapp.com.",
		},
	],
};

export const PRIVACY: LegalDocument = {
	title: "Privacy policy",
	summary:
		"What this app collects, why, and what it never does with it. Short, because the app collects very little.",
	sections: [
		{
			heading: "What we collect",
			body: "Your email address and display name, so accounts are real and hosts and recipients can recognise one another. The posts, claims and ratings you create. Photos you attach to a post. A push notification token for the device you sign in on, so we can tell you when your food is claimed or your pickup is confirmed.",
		},
		{
			heading: "Location",
			body: "Location is used for two things, both only while the app is open.\n\nWhen you write a post and tap Pin my location, the coordinates you pin are stored and attached to that post, so people can see how far away the food is and get directions to it.\n\nWhen you browse the feed, your device's approximate location is sent with the request so listings can be sorted and filtered by distance. It is used to answer that request and is not stored against your account or written to our logs. You can decline the location permission and still use the app — only the distance sorting becomes unavailable.\n\nThis app never reads your location in the background.",
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
			heading: "Who we share it with",
			body: "Only the service providers the app needs to run, and only for that purpose:\n\n• Google Firebase Authentication — sign-in and email verification\n• Our hosting and database providers — account, listing and claim records\n• Cloudinary — storage and delivery of the photos you attach to a post\n• Expo — delivery of push notifications to your device\n• Sentry — crash and error diagnostics, configured not to send personal information\n\nThese are processors acting on our instructions, not partners buying data. Each is required to protect your data to a standard at least equivalent to this policy, and none is permitted to use it for its own purposes. We do not sell your data and we share it with no one else, other than where the law requires it.",
		},
		{
			heading: "How long we keep it",
			body: "Listings and claims are kept while your account exists, so your history and a host's rating stay meaningful. Expired listings are retired from the feed but the record remains until the account is deleted.\n\nDeleting your account removes your data as described below. Crash diagnostics are held by Sentry on its own retention schedule, normally 90 days, and contain no personal information. Backups may retain data for a short period after deletion before they age out.",
		},
		{
			heading: "Deleting your account",
			body: "Settings has a Delete account option. It removes your profile, your posts, your claims, your ratings and your notifications, and deletes your sign-in identity so the account cannot be used again. If you signed in with Apple, your Apple authorization is revoked at the same time. Deleting a host account also removes that host's posts, including any claims other people have made on them.\n\nNo email, no form and no waiting — it happens in the app, immediately.",
		},
		{
			heading: "Your choices",
			body: "Location and notification permissions are yours to grant or withdraw at any time in the iOS Settings app, under EcoEats. The app keeps working without either; you lose distance sorting and pickup alerts respectively.\n\nYou can edit your display name and dietary preferences in Profile at any time. For a copy of your data, or any question about how it is handled, email hello@ecoeatsapp.com.",
		},
		{
			heading: "Children",
			body: "This app is intended for adults and is not directed at children. We do not knowingly collect personal information from anyone under 13. If you believe a child has created an account, email hello@ecoeatsapp.com and we will remove it.",
		},
		{
			heading: "Changes to this policy",
			body: "If this policy changes materially we will ask you to accept the new version in the app before you continue using it. The date of the version you accepted is recorded against your account.",
		},
	],
};

/**
 * The documents by route key, so `/settings/terms` and friends can resolve one
 * without a switch statement in the screen.
 */
export const LEGAL_DOCUMENTS: Record<LegalDocumentKey, LegalDocument> = {
	terms: TERMS,
	safety: FOOD_SAFETY_DISCLAIMER,
	privacy: PRIVACY,
};
