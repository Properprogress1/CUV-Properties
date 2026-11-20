# Implementation plan

The [build prompt](../Docs.md/Marketplace_Codex_Build_Prompt.pdf) governs sequencing and phase checkpoints.

## Phase 0 — Inspect and plan

- [x] Inspect workspace and source PDFs. The initial workspace contained `Docs.md/` and macOS metadata. It had no Git repository, application code, or workspace instructions.
- [x] Record product requirements, architecture, setup, and ADRs.
- [x] Inspect toolchain. macOS x86_64, Node 22.23.2, npm 10.9.8, Corepack 0.34.6, pnpm 10.11.0 via Corepack, Git 2.55.0, and Docker CLI 29.7.1.
- [x] Add workspace scaffold, pinned tooling, TypeScript, formatting, linting, and executable server environment checks.
- [x] Add Compose and CI workflow.
- [x] Verify the frozen install, formatting, lint, strict typecheck, two environment tests, config build, and Prisma schema validation.
- [x] Run the migration deploy command against a temporary PostgreSQL 16.14 instance. Prisma connected and reported no pending migrations. The first migration is scheduled for Phase 1.
- [ ] Verify Compose service health and the hosted CI run. This shell lacks the Compose plugin and a reachable Docker daemon, and the workspace has no Git remote.

No product decision blocks the Phase 0 scaffold. The npm registry marked the pinned ESLint release deprecated. Lint passed with that pin.

## Phase 1 — Backend foundation

- [x] Add the NestJS REST API, Prisma/Auth/Users/Health module boundaries, startup validation, JSON request logs and request IDs, database health, and local OpenAPI.
- [x] Add the initial transactional identity migration and a repeatable environment-driven development Super Admin seed.
- [x] Implement registration, login/logout, opaque cookie sessions, API staff permission checks, and owner-scoped session revocation.
- [x] Verify frozen install and workspace checks. Three unit tests passed. The PostgreSQL-backed HTTP suite passed, including CORS/CSRF, validation, throttling, permission changes, and cross-user revocation attempts.
- [x] Apply and rerun migration deploy on PostgreSQL 16.14, check for schema drift, and run the seed twice. Prisma found no drift, and the second seed preserved the existing account.

Hosted CI and Compose verification remain open from Phase 0. The [identity ADR](DECISIONS/0003-identity-and-sessions.md) records the password hashing decision and production gates.

## Phase 2 — Listing core

- [x] Add the inventory migration, category-specific detail tables, normalized locations, listing references and slugs.
- [x] Add staff-scoped listing CRUD with archive, versioned lifecycle transitions, database-backed audit, and atomic bulk actions.
- [x] Add private local media upload, decoding and container validation, gallery ordering and cover selection.
- [x] Build the staff inventory console with filtering, pagination, category forms, preview, media and activity.
- [x] Apply both migrations and rerun deploy against disposable PostgreSQL. Prisma detected no drift. Verify cross-role permissions, stale revisions, bulk rollback, media handling and audit over HTTP.
- [x] Verify the frozen install, API and production console builds, formatting, lint, strict typechecking, three unit tests, Prisma validation and both PostgreSQL HTTP suites.
- [x] Verify sign-in, location creation, draft creation, preview, activity, filters and sign-out in headless Chrome at a 390 px viewport.

Production object storage and asynchronous media processing remain open. Duplicate-candidate suggestions and inventory CSV export are deferred to follow-up inventory and reporting work.

## Phase 3 — Public marketplace

- [x] Add a public catalog, field allowlist, published-and-active predicates and scoped media reads.
- [x] Add homepage, category and browse routes, URL filters, sorting, pagination, listing cards and listing detail.
- [x] Add gallery controls, zoom, sharing, responsive layout, and canonical and Open Graph metadata.
- [x] Package four labeled synthetic fixtures and a development-only seed. Exclude demo inventory in production.
- [x] Verify frozen install, builds for the API and storefront, formatting, lint, strict typechecking, three unit tests, and Prisma schema validation.
- [x] Apply all three migrations on disposable PostgreSQL and rerun deployment. Prisma detected no schema drift.
- [x] Pass all three PostgreSQL HTTP suites. Verify category navigation, URL-based filters, listing details and title metadata, media loading, gallery zoom and empty results in headless Chrome at 390 px.

## Phase 4 — Customer engagement

- [x] Add the additive engagement migration, owner-scoped API and staff CRM and booking permissions.
- [x] Add the customer account, profile, favourites, saved searches, enquiry form, bookings, and notification inbox.
- [x] Add staff enquiry assignment, private notes, follow-up dates, status history and booking conflict checks.
- [x] Add configurable WhatsApp links, single-use account links, and a transactional mail queue with a local worker.
- [x] Apply all four migrations and rerun deploy on disposable PostgreSQL. Prisma detected no drift.
- [x] Pass the full workspace checks, three unit tests and four PostgreSQL HTTP suites. A targeted rerun verified expired and replayed account links.
- [x] Pass a 390 px Chrome smoke test covering account creation, favourites, saved searches, enquiry submission and staff CRM updates.

See the [engagement ADR](DECISIONS/0006-customer-engagement.md) for the PostgreSQL worker decision and remaining production mail, saved-search alerts and appointment reminders.

## Phase 5 — Commerce

- [x] Add the commerce migration with immutable order items and receipts and one pending or captured payment per order.
- [x] Add server-priced checkout, idempotent payment initialization and retries, a sandbox provider and verified event settlement.
- [x] Add protected order history and PDF receipts, customer refund requests, and staff reconciliation, audit and refund tools.
- [x] Apply all five migrations on disposable PostgreSQL, rerun deployment and verify no Prisma schema drift.
- [x] Pass the workspace checks and all five PostgreSQL HTTP suites. A targeted rerun verified canonical idempotency keys and database immutability.
- [x] Pass the 390 px Chrome smoke test for checkout, pending and successful simulation, receipt link, and customer-to-staff refund processing.

See the [commerce ADR](DECISIONS/0007-commerce-sandbox.md) for the sandbox eligibility, provider verification and production limits.

## Phase 6 — Professional services

- [x] Add service requests, assignment, customer replies and request history.
- [x] Add itemized quotation revisions, expiry, owner-only decisions and atomic order and project creation.
- [x] Reuse sandbox payment, receipts and notifications. Add staff milestone management and customer-visible completion evidence.
- [x] Apply all six migrations and rerun deployment with no Prisma schema drift. Pass workspace checks and all six PostgreSQL HTTP suites.
- [x] Pass the 390 px Chrome smoke test for customer request, staff quotation, acceptance, sandbox payment and receipt link.

See the [services ADR](DECISIONS/0008-service-quotations.md) for customer-visible text evidence, deferred attachments and payment rules.

## Phase 7 — CMS, analytics, and hardening

- [x] Add audited draft and publication workflows, homepage and banners, information pages, FAQ, articles and legal content.
- [x] Add privacy-conscious catalog signals, Lagos-dated reports, permission-checked CSV export, and spreadsheet formula protection.
- [x] Add frontend security headers, dependency audit tracking, and a repeatable Playwright release smoke test.
- [x] Pass the frozen install and workspace check, three unit tests, seven PostgreSQL HTTP suites and two Playwright browser tests.
- [x] Apply all seven migrations and rehearse backup and restore into a new PostgreSQL database. Verify published content and migration history survived with no schema drift.
- [x] Complete the lockfile advisory audit with zero findings across 367 dependencies after dependency updates.
- [x] Measure the short local catalog smoke with 40 requests at concurrency five. Median was 505.8 ms and p95 was 796.2 ms on the synthetic data set.
- [ ] Complete representative load tests, full accessibility review, staging UAT and production-provider sign-off in the target environment.

The [release and operations guide](RELEASE.md) lists the remaining infrastructure and production gates.
