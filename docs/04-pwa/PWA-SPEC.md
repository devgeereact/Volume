# Pwa Spec

Applicability decision: the owner-approved rebuild (7 October 2026) did not add an installable or offline-first PWA. Facts rechecked 1 November 2026.

Volume is a hosted web application at https://volume.gakinz.com: the Fastify server serves the built web app and the API behind Passenger and Cloudflare (D-038, D-039). Local development runs the same app on 127.0.0.1.

What exists: a web app manifest (`apps/web/public/manifest.webmanifest`, linked from `apps/web/index.html`; `display: standalone`, `lang: en-GB`) with an SVG icon, 192 and 512 px PNG icons, a 512 px maskable icon and an Apple touch icon (`apps/web/public/`). What does not exist: a service worker, offline caching or install prompts. Browsers may still offer to add the site to the home screen from the manifest; that has not been tested on real devices.

Future scope is tracked in [roadmap](../01-product/ROADMAP.md). No PWA readiness claim is made.
