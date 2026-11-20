# Release and operations

## Environment gates

| Area           | Local and staging                                          | Production requirement                                                                          |
| -------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| API            | Apply the workspace migrations and verify `/api/v1/health` | HTTPS, exact frontend origins, private PostgreSQL, restricted DB users and managed secrets      |
| Sessions       | Customer and staff cookie sessions                         | Staff MFA enforcement and tested recovery and offboarding                                       |
| Media          | Private local media for disposable fixtures                | Object storage adapter, scanning, signed private access, and CDN for approved public media      |
| Mail           | Local PostgreSQL worker and private spool                  | Provider adapter, a retention policy, and monitored delivery retries                            |
| Commerce       | Opt-in sandbox with ephemeral signing secret               | Approved business rules, configured provider, verified callbacks and independent reconciliation |
| Abuse controls | Process-local limits and origin verification               | Shared edge or Redis limits, trusted proxy configuration and tested CSRF boundaries             |
| Monitoring     | Structured request IDs and DB health                       | TLS endpoint probes, alerts, error rates, latency, queue depth, and backup alerts               |

Production launch also needs the applicable business and privacy review, authorized content, staging UAT, and production credentials. Redis is configured for the baseline environment. The current mail worker uses the PostgreSQL outbox.

## Staging and deployment

1. Build and test the same revision you intend to release with `corepack pnpm check`, `corepack pnpm --filter @marketplace/api test:integration` and `corepack pnpm test:e2e`.
2. Supply each service's configuration from its secret store. Set the public API origin before building the storefront and admin console. Configure an internal API origin for storefront server requests when available.
3. Take and verify a restorable database backup before applying migrations. Apply `corepack pnpm --filter @marketplace/api db:migrate:deploy` once from the release job, using the migration role.
4. Start the API, storefront and staff console from the built release and verify their routes. Use separate process identities and restrict origins, admin access and API ingress. Run only configured workers.
5. Check UAT below, capture the sign-off and release the previously verified artifact. Roll back the application revision if the schema remains compatible. Restore data only after choosing and documenting the acceptable recovery point and downtime.

## Backup and restore rehearsal

On a disposable staging database or an isolated copy, export PostgreSQL in custom format and restore into a **new empty database**. Run the tools from a trusted host that can reach both databases. Keep dumps encrypted and outside the repository.

```sh
pg_dump --format=custom --no-owner --no-privileges --dbname="$SOURCE_DATABASE_URL" --file=marketplace.dump
pg_restore --exit-on-error --no-owner --no-privileges --dbname="$RESTORE_DATABASE_URL" marketplace.dump
```

Point a staging API at the restored database and check migration status, health, record counts, a published content page and an owner-scoped order. Back up media objects separately, preserve their keys and verify sample downloads. Record the backup age, restore time and target recovery objectives. Avoid sending restore-test mail or triggering real payment actions.

## UAT and incidents

- Browse, filter, and open published inventory on desktop and mobile. Check keyboard focus and controls, gallery dismissal, viewport overflow, and stale media access after unpublishing.
- Verify customer isolation with two accounts across profile, enquiries, appointments, quotes, receipts and refund requests. Verify staff and Super Admin permissions using distinct sessions.
- Publish, edit, and unpublish content. Check public metadata, reporting date boundaries, export permission, and spreadsheet-safe CSV.
- Complete sandbox checkout and exercise failure, retry, duplicate callback and refund paths. Validate reconciliation exceptions and receipt ownership.
- On a health or latency alarm, use the request ID and deployment revision to correlate API logs, verify database connectivity and pool pressure, and compare to the last healthy revision.
- On settlement discrepancies, pause sandbox or live payment initialization as appropriate and reconcile against provider records before retrying. Preserve payment and audit events.
- On mail failure, inspect pending and failed rows in the outbox and review provider health before retrying. For account compromise, disable the account, revoke sessions and review staff activity.

## Local release evidence

The frozen workspace install, build, lint, formatting, strict typecheck, three unit tests, seven PostgreSQL HTTP suites and two Playwright browser tests passed. The advisory registry reported zero findings across 367 locked dependencies after the validation and toolchain updates.

The PostgreSQL rehearsal restored a published content entry and all seven applied migrations into a separate database. Prisma found no schema drift after restore. The local catalog smoke measured 40 requests at concurrency five with a 505.8 ms median and 796.2 ms p95. It used a small synthetic data set and did not establish staging throughput or production latency.

Docker Compose and hosted CI remain unverified on this machine. The Docker CLI could not reach a daemon and did not have the Compose plugin. Complete full accessibility review, representative performance tests and staging UAT before production sign-off.
