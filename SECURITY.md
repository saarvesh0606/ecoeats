# Security policy

EcoEats is a live service. The code in this repository is what runs at
`ecoeats-api.onrender.com` and inside the iOS app, so a vulnerability here is a
vulnerability against real accounts.

## Reporting

Email **hello@ecoeatsapp.com**. Please do not open a public issue.

Include what you can of:

- the endpoint or screen involved
- steps to reproduce, or the request that demonstrates it
- what you were able to see or do that you should not have been
- whether you believe anyone else's data was exposed

You will get an acknowledgement within 72 hours and a status update when the
fix ships. If the report leads to a change, you will be credited in the commit
unless you ask not to be.

## Scope

In scope: anything in this repository as deployed — the API, the client, the
generated legal site, the build and deploy configuration.

Out of scope: the third-party services the app depends on (Firebase, Cloudinary,
Expo, Render, Neon, Upstash) except where EcoEats misuses them, and denial of
service against the free-tier infrastructure.

## Please don't

- test against other people's accounts or listings — use your own
- run automated scanners against production; the per-user rate limit will stop
  you and it makes the logs harder to read for everyone
- access or retain any data that is not yours, even to prove a point

## Supported versions

Only the current App Store release and `main` receive fixes. Older TestFlight
builds are cut off deliberately when the runtime version changes.
