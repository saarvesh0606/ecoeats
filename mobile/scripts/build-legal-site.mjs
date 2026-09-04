/**
 * Builds the public legal site from src/lib/legal.ts.
 *
 * App Store Connect demands a privacy policy URL and a support URL, and both
 * have to be reachable without installing anything. The obvious way to get
 * them is to paste the copy into a web page — and then the page and the app
 * say different things the first time someone edits one of them. So the pages
 * are generated instead: legal.ts stays the single source of truth, and a
 * wording change is a rebuild rather than a retype.
 *
 * Run from mobile/:  npm run build:legal
 */

import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const here = path.dirname(fileURLToPath(import.meta.url));
const legalPath = path.join(here, "..", "src", "lib", "legal.ts");
const outDir = path.join(here, "..", "..", "web");

const CONTACT = "hello@ecoeatsapp.com";

/** legal.ts is plain data with no imports, so transpiling it is enough. */
async function loadLegal() {
	const source = fs.readFileSync(legalPath, "utf8");
	const { outputText } = ts.transpileModule(source, {
		compilerOptions: {
			module: ts.ModuleKind.ESNext,
			target: ts.ScriptTarget.ES2022,
		},
	});
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ecoeats-legal-"));
	const tmp = path.join(dir, "legal.mjs");
	fs.writeFileSync(tmp, outputText);
	return await import(pathToFileURL(tmp).href);
}

const escape = (s) =>
	s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");

/** The one address in the copy, made tappable wherever it appears. */
const linkify = (s) =>
	s.replace(
		new RegExp(CONTACT.replace(/\./g, "\\."), "g"),
		'<a href="mailto:' + CONTACT + '">' + CONTACT + "</a>",
	);

/**
 * Bodies are written for a phone screen: blank lines separate paragraphs, and
 * lists are bullets or "1." prefixes rather than markup. Consecutive list
 * blocks belong to one list — "If you post food" writes its three warranties
 * as three separate paragraphs.
 */
function renderBody(body) {
	const blocks = body.split("\n\n").filter((b) => b.trim());
	const out = [];
	let list = null;

	const flush = () => {
		if (list) {
			out.push("<" + list.tag + ">" + list.items.join("") + "</" + list.tag + ">");
			list = null;
		}
	};

	for (const block of blocks) {
		const lines = block.split("\n").filter((l) => l.trim());
		const bulleted = lines.every((l) => l.trimStart().startsWith("•"));
		const numbered = lines.length === 1 && /^\d+\.\s/.test(lines[0].trim());

		if (bulleted) {
			if (list && list.tag !== "ul") flush();
			if (!list) list = { tag: "ul", items: [] };
			for (const line of lines) {
				const text = line.trimStart().replace(/^•\s*/, "");
				list.items.push("<li>" + linkify(escape(text)) + "</li>");
			}
		} else if (numbered) {
			if (list && list.tag !== "ol") flush();
			if (!list) list = { tag: "ol", items: [] };
			const text = lines[0].trim().replace(/^\d+\.\s*/, "");
			list.items.push("<li>" + linkify(escape(text)) + "</li>");
		} else {
			flush();
			out.push("<p>" + linkify(escape(block.replace(/\n/g, " "))) + "</p>");
		}
	}
	flush();
	return out.join("\n\t\t");
}

const NAV = [
	["index.html", "Support"],
	["privacy.html", "Privacy"],
	["terms.html", "Terms"],
	["safety.html", "Food safety"],
];

function page({ title, slug, version, lead, main }) {
	const nav = NAV.map(([href, label]) =>
		href === slug
			? '<span aria-current="page">' + label + "</span>"
			: '<a href="' + href + '">' + label + "</a>",
	).join("");

	const versionNote = version
		? '\n\t<p class="version">Version ' +
			escape(version) +
			". This is the same text the app shows.</p>"
		: "";

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)} &middot; EcoEats</title>
<meta name="description" content="${escape(lead)}">
<link rel="stylesheet" href="styles.css">
</head>
<body>
<header>
	<a class="wordmark" href="index.html">EcoEats</a>
	<nav>${nav}</nav>
</header>
<main>
	<h1>${escape(title)}</h1>
	<p class="lead">${escape(lead)}</p>${versionNote}
	${main}
</main>
<footer>
	<p>EcoEats is an independent student project. It is not operated, sponsored or endorsed by any university, college or commercial food vendor.</p>
	<p>Questions, reports and data requests: <a href="mailto:${CONTACT}">${CONTACT}</a></p>
</footer>
</body>
</html>
`;
}

function documentPage(doc, slug, version) {
	const main = doc.sections
		.map(
			(s) =>
				"<section>\n\t\t<h2>" +
				escape(s.heading) +
				"</h2>\n\t\t" +
				renderBody(s.body) +
				"\n\t</section>",
		)
		.join("\n\t");
	return page({ title: doc.title, slug, version, lead: doc.summary, main });
}

const SUPPORT_MAIN = `<section>
		<h2>What EcoEats is</h2>
		<p>EcoEats connects people who have surplus food with people nearby who want it, before it goes to waste. Someone posts what is left over from an event; anyone nearby can claim a portion and collect it.</p>
	</section>
	<section>
		<h2>Getting help</h2>
		<p>Email <a href="mailto:${CONTACT}">${CONTACT}</a>. It is read by a person, and it is the right address for a bug, a question, a report about someone's behaviour, a request for a copy of your data, or anything about the documents on this site.</p>
	</section>
	<section>
		<h2>Questions that come up often</h2>
		<h3>The feed is empty. Is it broken?</h3>
		<p>Probably not. Food posts expire within an hour of being posted, because surplus food does not stay good, or stay available, for longer than that. An empty feed means nobody nearby has posted in the last hour.</p>
		<h3>How do I report a listing, or block someone?</h3>
		<p>Open the listing and scroll to the bottom: <strong>Report this listing</strong> and <strong>Block this host</strong> are there. Blocking hides that person's food from you and yours from them. Undo it in Settings, under Blocked accounts.</p>
		<h3>How do I delete my account?</h3>
		<p>Settings has a Delete account option. It happens immediately, in the app &mdash; no email and no waiting. It removes your profile, posts, claims, ratings and notifications.</p>
		<h3>Why does it ask for my location?</h3>
		<p>Only to sort food by how far away it is, and to attach a pin to food you post so people can find it. You can decline and still use the app. It is never read in the background.</p>
	</section>`;

const CSS = `/* Generated alongside the pages. Edit build-legal-site.mjs, not this. */
:root {
	--forest: #0C3226;
	--lime: #52B788;
	--cream: #FBF9F4;
	--ink: #1A2420;
	--muted: #5A6B63;
	--rule: #E3E0D8;
	--card: #FFFFFF;
}
@media (prefers-color-scheme: dark) {
	:root {
		--forest: #A8CFBD;
		--lime: #74C69D;
		--cream: #0B1512;
		--ink: #E8EDEA;
		--muted: #9DB0A6;
		--rule: #24352E;
		--card: #101F1A;
	}
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
	margin: 0;
	background: var(--cream);
	color: var(--ink);
	font: 17px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}
a { color: var(--forest); text-decoration-thickness: 1px; text-underline-offset: 2px; }
a:hover { color: var(--lime); }
header {
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	gap: 8px 20px;
	max-width: 42rem;
	margin: 0 auto;
	padding: 28px 22px 0;
}
.wordmark {
	font-size: 20px;
	font-weight: 700;
	letter-spacing: -0.01em;
	color: var(--forest);
	text-decoration: none;
}
header nav { display: flex; flex-wrap: wrap; gap: 16px; font-size: 15px; }
header nav [aria-current] { color: var(--muted); }
main { max-width: 42rem; margin: 0 auto; padding: 8px 22px 48px; }
h1 { font-size: 30px; line-height: 1.2; letter-spacing: -0.02em; margin: 28px 0 12px; }
h2 { font-size: 20px; line-height: 1.3; margin: 34px 0 10px; }
h3 { font-size: 17px; margin: 24px 0 6px; }
p { margin: 0 0 14px; }
.lead { font-size: 19px; color: var(--muted); margin-bottom: 20px; }
.version {
	font-size: 14px;
	color: var(--muted);
	background: var(--card);
	border: 1px solid var(--rule);
	border-radius: 10px;
	padding: 10px 14px;
	margin-bottom: 8px;
}
section { border-top: 1px solid var(--rule); padding-top: 4px; }
ul, ol { margin: 0 0 14px; padding-left: 22px; }
li { margin-bottom: 6px; }
footer {
	max-width: 42rem;
	margin: 0 auto;
	padding: 24px 22px 56px;
	border-top: 1px solid var(--rule);
	color: var(--muted);
	font-size: 14px;
}
footer p { margin: 0 0 8px; }
@media (max-width: 480px) {
	body { font-size: 16px; }
	h1 { font-size: 26px; }
}
`;

const legal = await loadLegal();
fs.mkdirSync(outDir, { recursive: true });

const files = {
	"styles.css": CSS,
	"index.html": page({
		title: "Support",
		slug: "index.html",
		version: null,
		lead: "EcoEats is a free app for sharing surplus food before it goes to waste. This page is how to reach us, and where the terms and privacy policy live.",
		main: SUPPORT_MAIN,
	}),
	"privacy.html": documentPage(legal.PRIVACY, "privacy.html", legal.TERMS_VERSION),
	"terms.html": documentPage(legal.TERMS, "terms.html", legal.TERMS_VERSION),
	"safety.html": documentPage(
		legal.FOOD_SAFETY_DISCLAIMER,
		"safety.html",
		legal.TERMS_VERSION,
	),
};

for (const [name, contents] of Object.entries(files)) {
	fs.writeFileSync(path.join(outDir, name), contents);
	console.log("wrote web/" + name);
}
