# Sync Spec

Applicability decision: the owner-approved rebuild (7 October 2026) did not add a sync service. Facts rechecked 1 November 2026.

There is one copy of the data: the server's database (MariaDB on the host, SQLite locally). Every device signed in to https://volume.gakinz.com reads and writes that copy through the API, so there is nothing to synchronise between devices. Server-sent events (SSE) deliver job progress and change notices; they are not a data sync. Moving a book between two Volumes uses the project zip (D-051, [deployment](../07-operations/DEPLOYMENT.md)).

Future scope is tracked in [roadmap](../01-product/ROADMAP.md). No PWA readiness claim is made.
