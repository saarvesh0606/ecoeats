# The public site

Four static pages: a support page, and the three legal documents the app
shows. App Store Connect requires a **privacy policy URL** and a **support
URL**, and neither may sit behind a login or an install.

## These files are generated. Do not edit them.

The copy lives in `mobile/src/lib/legal.ts` and nowhere else. Edit it there,
then rebuild:

```bash
cd mobile && npm run build:legal
```

Editing the HTML by hand would put the app and the website one keystroke apart
from disagreeing about what people agreed to — and the version stamped on each
page (`TERMS_VERSION`) is what the server records against every account.

Rebuild and redeploy whenever `legal.ts` changes, in the same breath as the
version bump.

## Deploying it

Any static host works; there is no build step and no JavaScript. Two that cost
nothing:

- **Netlify Drop** — drag this folder onto <https://app.netlify.com/drop>, then
  point `ecoeatsapp.com` at it under Domain settings. No repository access
  needed, which suits a private repo.
- **Cloudflare Pages** — connect the repo (private is fine on the free plan),
  set the build output directory to `web/` and leave the build command empty.

The domain already resolves for mail (`hello@ecoeatsapp.com` runs through
Brevo with DKIM, SPF and DMARC). Adding the site is a separate record — putting
the pages on a subdomain such as `ecoeatsapp.com` or `www.ecoeatsapp.com` does
not disturb the mail records, but **do not remove the existing TXT records**
when editing DNS.

## The URLs App Store Connect wants

| Field | URL |
| --- | --- |
| Privacy Policy URL | `https://ecoeatsapp.com/privacy.html` |
| Support URL | `https://ecoeatsapp.com/` |
| Marketing URL (optional) | `https://ecoeatsapp.com/` |

Load each one in a private browser window before pasting it in. App Review
checks that they resolve, and a 404 there is a rejection for something that
takes a minute to fix.
