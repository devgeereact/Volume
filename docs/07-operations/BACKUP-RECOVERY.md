# Restoring a Volume backup

SQLite snapshots contain the entire library, including uploaded file chunks. Settings creates snapshots under `DATA_DIR/backups`; Volume retains the newest 14. MySQL uses the host's cPanel backup tools instead.

1. Identify the intended snapshot and the configured SQLite database location. Work on a copy first. Do not overwrite a running database.
2. Stop the Volume process you control and preserve the current database, its WAL and SHM companions together as a rollback copy. Ask the owner before replacing production data.
3. Copy the snapshot to a separate temporary location. Open that copy with SQLite, run `PRAGMA integrity_check`, and confirm representative books, section versions and asset chunks. The server backup integration test performs this check against synthetic data.
4. With Volume stopped, replace the configured SQLite database with the validated snapshot. Keep the rollback copy outside the active database location. Stale WAL/SHM files must not accompany the restored snapshot.
5. Start Volume. Verify the Library, editor text and an attached file download before accepting the restore. If verification fails, stop Volume and restore the preserved current database and its companions.

No restore of the owner's data was attempted during the 6 October fixes. A cPanel restore needs a separate rollback plan and owner approval.
