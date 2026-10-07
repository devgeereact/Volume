# Permissions

The server resolves owner and workspace context. Repository queries and object access enforce workspace membership, including imports, assets, project versions, jobs and exports. Client-side visibility is not authorisation. Author profiles are not separate login identities.

Preserve workspace identifiers and isolation tests during refactoring. Cross-workspace access must remain denied. Public users/roles and tenancy are not implemented by this rebuild. See apps/server/src/auth/, repos/, routes/ and the server integration suite.
