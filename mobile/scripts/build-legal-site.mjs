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

/**
 * The same line the app shows under the icon (see components/AuthBrand.tsx).
 * Kept in sync by hand: it is one sentence, and the alternative is importing a
 * React Native component into a build script.
 */
const TAGLINE = "Share more. Waste less. Impact together.";

/**
 * The app icon, copied rather than redrawn. A hand-made SVG copy would be one
 * edit away from disagreeing with the thing people actually installed, and the
 * whole point of the mark here is to say this page belongs to that app.
 */
const ICON_SRC = path.join(here, "..", "assets", "icon.png");

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

function page({ title, slug, version, lead, main, hero = false }) {
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

	/**
	 * The landing page leads with the mark, the name and the tagline — the same
	 * block sign-in opens with, because this is the page someone reaches from the
	 * App Store listing before they have installed anything.
	 *
	 * There, the name IS the heading: adding a second "Support" line under it
	 * would stack two display-bold lines competing for the same job, which is the
	 * reason AuthBrand keeps its wordmark behind a flag. The legal pages keep
	 * their own title as the heading and carry the mark quietly in the header,
	 * where it says whose policy this is without dressing it up.
	 */
	const heading = hero
		? `<div class="hero">
		<img src="icon.png" alt="" width="76" height="76">
		<h1>EcoEats</h1>
		<p class="tagline">${escape(TAGLINE)}</p>
	</div>`
		: `<h1>${escape(title)}</h1>`;

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)} &middot; EcoEats</title>
<meta name="description" content="${escape(lead)}">
<link rel="icon" href="icon.png">
<link rel="apple-touch-icon" href="icon.png">
<link rel="stylesheet" href="styles.css">
</head>
<body>
<header>
	<a class="wordmark" href="index.html"><img src="icon.png" alt="" width="26" height="26">EcoEats</a>
	<nav>${nav}</nav>
</header>
<main>
	${heading}
	<p class="lead">${escape(lead)}</p>${versionNote}
	${main}
</main>
<footer>
	<p>EcoEats is an independent student project. It is not operated, sponsored or endorsed by any university, college or commercial food vendor.</p>
	<p>Questions, reports and data requests: <a href="mailto:${CONTACT}">${CONTACT}</a></p>
</footer>
<script>
/* Adds the class first, then observes: nothing is dimmed unless this runs. */
(function () {
	if (!window.IntersectionObserver) return;
	if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
	/* Top-level blocks only. Observing .card as well would nest a dimmed
	   element inside a dimmed one, and opacity multiplies — 0.3 inside 0.3 is
	   0.09, which is genuinely unreadable rather than merely quiet. */
	var els = document.querySelectorAll("main > *");
	for (var i = 0; i < els.length; i++) els[i].classList.add("reveal");
	var io = new IntersectionObserver(
		function (entries) {
			for (var j = 0; j < entries.length; j++) {
				entries[j].target.classList.toggle("is-in", entries[j].isIntersecting);
			}
		},
		{ threshold: 0.08, rootMargin: "0px 0px -8% 0px" }
	);
	for (var k = 0; k < els.length; k++) io.observe(els[k]);
})();
</script>
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
		<div class="contact">
			<p class="addr"><a href="mailto:${CONTACT}">${CONTACT}</a></p>
			<p>Read by a person. It is the right address for a bug, a question, a report about someone's behaviour, a request for a copy of your data, or anything about the documents on this site.</p>
		</div>
	</section>
	<section>
		<h2>Questions that come up often</h2>
		<div class="card">
			<h3>The feed is empty. Is it broken?</h3>
			<p>Probably not. Food posts expire within an hour of being posted, because surplus food does not stay good, or stay available, for longer than that. An empty feed means nobody nearby has posted in the last hour.</p>
		</div>
		<div class="card">
			<h3>How do I report a listing, or block someone?</h3>
			<p>Open the listing and scroll to the bottom: <strong>Report this listing</strong> and <strong>Block this host</strong> are there. Blocking hides that person's food from you and yours from them. Undo it in Settings, under Blocked accounts.</p>
		</div>
		<div class="card">
			<h3>How do I delete my account?</h3>
			<p>Settings has a Delete account option. It happens immediately, in the app &mdash; no email and no waiting. It removes your profile, posts, claims, ratings and notifications.</p>
		</div>
		<div class="card">
			<h3>Why does it ask for my location?</h3>
			<p>Only to sort food by how far away it is, and to attach a pin to food you post so people can find it. You can decline and still use the app. It is never read in the background.</p>
		</div>
	</section>`;

const CSS = `/* Generated alongside the pages. Edit build-legal-site.mjs, not this. */
/*
 * Taken from the app's own palette (mobile/global.css), value for value, so the
 * site and the thing it documents read as one product. The names there are
 * roles: --c-page is the page, --c-card a card, --c-brand green used as INK
 * (headings, links) as opposed to green used as a SURFACE (buttons, filled
 * chips), which is the forest ramp. That distinction is why there are two
 * greens here rather than one.
 */
:root {
	--forest: #0C3226; /* --c-brand: green as ink */
	--lime: #52B788;
	--cream: #FBF9F4; /* --c-page */
	--ink: #1B1C19; /* --c-ink */
	--muted: #414845; /* --c-ink-muted */
	--rule: #E5E7EB; /* --c-gray-200, the app's hairline */
	--card: #FFFFFF; /* --c-card */
	/* Green as a SURFACE: --c-forest-800 into --c-forest-600, which is the
	   app's own button ramp. White sits on it, exactly as it does in the app. */
	--tab-a: #0C3226;
	--tab-b: #2D6A4F;
	--on-tab: #FFFFFF;
	--tab-hover: #F3F4F6;
	--tab-sheen: rgba(255, 255, 255, 0.45);
}
@media (prefers-color-scheme: dark) {
	:root {
		--forest: #A8CFBD; /* --c-brand, dark */
		--lime: #74C69D;
		--cream: #121311; /* --c-page, dark */
		--ink: #F2F1EA; /* --c-ink, dark */
		--muted: #B3B6AC; /* --c-ink-muted, dark */
		--rule: #46493F; /* --c-gray-300, dark */
		--card: #21231E; /* --c-card, dark — lifted OFF the page, not level with
		                    it, which is the note global.css makes about cards
		                    ceasing to read as cards at 1.10 contrast. */
		/* The app does NOT flip its button text in dark. Its dark greens are
		   re-picked to be more saturated precisely so white legends still clear
		   4.5:1 — so the tab stays green with white on it in both themes, and
		   this ramp uses --c-forest-700 into --c-forest-800 (white at 6.3:1 and
		   4.9:1). --c-forest-600 is #52B788 in dark, where white would be
		   2.4:1, so it is deliberately not an endpoint here. */
		--tab-a: #0E6A4A;
		--tab-b: #12805A;
		--on-tab: #FFFFFF;
		--tab-sheen: rgba(255, 255, 255, 0.34);
		--tab-hover: #2D2F28; /* --c-gray-100, dark */
	}
}
/* Cross-fades between pages where the browser does it natively (Chrome 126+,
   Safari 18.2+). One line, no script, and browsers without it simply navigate
   the old way. */
@view-transition { navigation: auto; }

/* Reveal-on-scroll, in BOTH directions: the observer toggles .is-in as things
   enter and leave, so scrolling back up replays it rather than firing once and
   staying done.
 *
 * The .reveal class is added by script, never by the generator. That ordering
 * is the whole safety argument: if the script fails, is blocked, or the browser
 * is ancient, no element ever gets .reveal — and a privacy policy nobody can
 * read is a legal problem, not a missing flourish. Opacity floors at 0.3 rather
 * than 0 for the same reason. */
.reveal {
	opacity: 0.3;
	transform: translateY(14px);
	transition: opacity 0.55s ease, transform 0.55s cubic-bezier(0.22, 0.61, 0.36, 1);
}
/* A short stagger so an arriving page settles in sequence rather than as one
   slab. On a transition rather than an animation: a delayed transition still
   leaves the element at its real value, where a delayed animation with
   backwards fill would hold it at the invisible starting frame. */
main > *:nth-child(2).reveal { transition-delay: 0.06s; }
main > *:nth-child(3).reveal { transition-delay: 0.12s; }
main > *:nth-child(n + 4).reveal { transition-delay: 0.18s; }
.reveal.is-in {
	opacity: 1;
	transform: none;
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
/* Sticky, so the nav is reachable from anywhere on a long legal document
   rather than only at the top. The bar spans the full width while its contents
   stay in the same 42rem column as the text — hence the padding expression
   rather than the max-width the other blocks use. */
header {
	position: sticky;
	top: 0;
	z-index: 10;
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px 20px;
	padding: 14px max(22px, calc((100% - 42rem) / 2 + 22px));
	background: var(--cream);
	border-bottom: 1px solid var(--rule);
}
.wordmark {
	display: inline-flex;
	align-items: center;
	gap: 9px;
	font-size: 20px;
	font-weight: 700;
	letter-spacing: -0.01em;
	color: var(--forest);
	text-decoration: none;
}
/* The icon carries its own dark background, so it needs a hairline to sit on
   the dark theme without dissolving into it. Radius matches how iOS draws it —
   squared off, it reads as a stray image rather than the app's mark. */
.wordmark img, .hero img {
	border-radius: 22%;
	box-shadow: 0 0 0 1px var(--rule);
}

/* The landing page opens the way sign-in does: mark, name, what it is for. */
.hero { text-align: center; padding: 26px 0 8px; }
.hero h1 { font-size: 34px; margin: 18px 0 6px; color: var(--forest); }
.hero .tagline { color: var(--muted); font-size: 16px; margin: 0; }
.hero + .lead { text-align: center; margin-bottom: 26px; }

/* Support answers are cards, so the page reads as somewhere you get help
   rather than a fifth legal document. The legal pages stay plain on purpose. */
.card {
	background: var(--card);
	border: 1px solid var(--rule);
	border-radius: 12px;
	padding: 15px 18px;
	margin-bottom: 10px;
}
.card h3 { margin: 0 0 6px; }
.card p:last-child { margin-bottom: 0; }

/* The support URL exists so someone stuck can reach a person. That address is
   the whole job of the page, so it gets to look like it. */
.contact {
	background: var(--card);
	border: 1px solid var(--rule);
	border-left: 3px solid var(--lime);
	border-radius: 12px;
	padding: 15px 18px;
	margin-bottom: 14px;
}
.contact .addr { font-size: 19px; font-weight: 600; margin-bottom: 6px; }
.contact p:last-child { margin-bottom: 0; }
/* A segmented control rather than a row of links: this is an iOS app's site,
   and underlined text in a header reads as a footer. */
header nav {
	display: flex;
	flex-wrap: wrap;
	gap: 3px;
	font-size: 15px;
	background: var(--card);
	border: 1px solid var(--rule);
	border-radius: 999px;
	padding: 4px;
}
header nav a,
header nav [aria-current] {
	padding: 6px 14px;
	border-radius: 999px;
	line-height: 1.35;
	text-decoration: none;
	white-space: nowrap;
	transition: background-color 0.15s ease, color 0.15s ease;
}
header nav a { color: var(--muted); }
header nav a:hover { color: var(--ink); background: var(--tab-hover); }
header nav [aria-current] {
	position: relative;
	overflow: hidden;
	/* Three stops, not two: the ramp has to return to where it started or the
	   loop visibly jumps at the seam. */
	background: linear-gradient(115deg, var(--tab-a), var(--tab-b), var(--tab-a));
	background-size: 220% 100%;
	color: var(--on-tab);
	font-weight: 600;
	box-shadow: 0 1px 2px rgba(0, 0, 0, 0.16);
	animation: tab-flow 9s ease-in-out infinite;
}
/* The sheen is a separate layer so it can be composited — it moves with
   transform, which the GPU handles, rather than repainting the gradient. */
header nav [aria-current]::after {
	content: "";
	position: absolute;
	inset: 0;
	pointer-events: none;
	background: linear-gradient(
		100deg,
		transparent 15%,
		var(--tab-sheen) 50%,
		transparent 85%
	);
	transform: translateX(-130%);
	animation: tab-sheen 6s ease-in-out infinite;
}
@keyframes tab-flow {
	0% { background-position: 0% 50%; }
	50% { background-position: 100% 50%; }
	100% { background-position: 0% 50%; }
}
/* Idle for most of the cycle, then one pass. A sheen that never rests reads as
   a loading spinner — something is working — rather than as polish. */
@keyframes tab-sheen {
	0%, 70% { transform: translateX(-130%); }
	100% { transform: translateX(130%); }
}

/* Someone who has asked their OS for less motion has asked for exactly this:
   a thing that moves forever in the corner of their eye. The pill keeps its
   gradient and stays legible; it simply holds still. */
@media (prefers-reduced-motion: reduce) {
	header nav [aria-current] { animation: none; }
	header nav [aria-current]::after { display: none; }
	header nav a { transition: none; }
}
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
	/* Once the pills wrap to two rows, a pill-shaped container reads as a
	   mistake — the ends curve around nothing. */
	header nav { border-radius: 14px; }
}
`;

const legal = await loadLegal();
fs.mkdirSync(outDir, { recursive: true });

const files = {
	"styles.css": CSS,
	"index.html": page({
		title: "Support",
		slug: "index.html",
		hero: true,
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

/* Copied, not committed by hand: web/icon.png is a build output like the rest
   of the folder, and copying keeps it the same file the app ships. */
fs.copyFileSync(ICON_SRC, path.join(outDir, "icon.png"));
console.log("copied web/icon.png");
