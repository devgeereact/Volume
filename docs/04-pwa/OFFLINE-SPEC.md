# Offline Spec

Applicability decision: the owner-approved rebuild (7 October 2026) did not add offline working. Facts rechecked 1 November 2026.

Volume needs its server for every saved change: on the host that is https://volume.gakinz.com, locally the API on 127.0.0.1:5181. There is no service worker and no offline copy. When the API stops answering after the app has reached it once, the app keeps the last real data on screen, shows the Not connected banner, refuses writes with a plain reason and queues nothing (D-061, `apps/web/src/shell/NotConnectedBanner.tsx`, checked by the `offline` phase of `tests/smoke/smoke.mjs`). Sample data appears only in a local build that has never reached an API in that page session, under the Demo badge; the hosted build never uses it. Offline editing and synchronisation are future scope.

Future scope is tracked in [roadmap](../01-product/ROADMAP.md). No PWA readiness claim is made.
