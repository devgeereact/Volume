# Update Strategy

Applicability decision: the owner-approved rebuild (7 October 2026) did not add service-worker updates. Facts rechecked 1 November 2026.

A new version reaches the host as a release folder (`npm run deploy`, run automatically after "Check Volume" passes on `main`; see [deployment](../07-operations/DEPLOYMENT.md)). The server sends `index.html` with `Cache-Control: no-cache` and the hashed files under `/assets/` as immutable (`apps/server/src/http/hosting.ts`), so the next page load picks up the new release. An open tab keeps the old code until it reloads. There is no service worker and no update prompt; adding one needs a product and security decision.

Future scope is tracked in [roadmap](../01-product/ROADMAP.md). No PWA readiness claim is made.
