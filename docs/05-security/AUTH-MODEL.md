# Authentication model

Current identity is an owner-only local stub in apps/server/src/auth/context.ts. It is not a public login system. Registration, password reset, MFA and remote session management are not implemented. The API and frontend remain bound to loopback; Host/Origin controls do not substitute for authentication.

Future accounts are roadmap scope and require an explicit security design before exposing the app to a LAN or public interface. See [security](SECURITY.md) and [permissions](PERMISSIONS.md).
