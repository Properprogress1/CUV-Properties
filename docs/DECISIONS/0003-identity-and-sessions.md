# 0003 Identity and sessions

Accepted for Phase 1.

Store server-owned sessions in PostgreSQL. The browser holds a random token in an HTTP-only SameSite=Lax cookie, with a Secure host-only cookie in production. PostgreSQL stores its SHA-256 digest, owner and expiry. Require an exact allowed Origin on mutating requests and use the same origins for credentialed CORS. Deploy the browser and API on the same site when using these cookies.

Hash passwords with Node's built-in asynchronous scrypt using a random salt, a versioned storage format, and constant-time comparison. This selects a memory-hard built-in implementation in place of the architecture draft's Argon2id or bcrypt options. Bound hash concurrency per process and rate-limit login and registration per connection address. Deploy a shared Redis or edge rate limit and explicitly configure trusted proxy topology before relying on limits across replicas.

Look up account status and current permissions on each protected request. Public registration grants CUSTOMER only. The migration establishes staff access permission mappings. Development seed bootstraps a Super Admin from environment inputs. Scoped session revocation uses the caller's user ID in the same database operation.

Phase 4 owns account verification, recovery, and notification delivery. Keep privileged onboarding restricted until staff MFA and audit controls are available. Staff MFA, email verification and recovery, shared abuse controls, and staff permission administration are production blockers. Scheduled expired-session cleanup will follow with worker jobs.
