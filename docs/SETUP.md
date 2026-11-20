# Local setup and verification

Use Node.js 22.23.2, Corepack with pnpm 10.11.0, and a running Docker engine with Compose v2. Follow the [quick start](../README.md#quick-start) for install, startup, and the first migration.

| Environment variable                      | Purpose                                                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `NODE_ENV`                                | Runtime mode, defaults to `development`                                                                |
| `DATABASE_URL`                            | PostgreSQL endpoint for the API and Prisma                                                             |
| `REDIS_URL`                               | Validated Redis endpoint for later queue and shared rate-limit work                                    |
| `API_PORT`                                | API listener port, defaults to 3001                                                                    |
| `API_ALLOWED_ORIGINS`                     | Comma-separated exact web and admin origins for CORS and CSRF checks                                   |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | Development-only seed inputs. Use a synthetic email and a locally chosen password of 12–128 characters |
| `TEST_DATABASE_URL`                       | Disposable PostgreSQL database with permission to create and drop test schemas                         |

Copy `.env.example` to `.env` once. The Compose credentials are for local development. The API validates the server configuration at startup. The health endpoint probes PostgreSQL.

## Database

```sh
corepack pnpm --filter @marketplace/api db:migrate:deploy
corepack pnpm --filter @marketplace/api db:studio
```

To create a development Super Admin, add `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` to the ignored local `.env`, keep `NODE_ENV=development`, and run `corepack pnpm --filter @marketplace/api db:seed` after building and migrating. Repeating the command preserves an existing Super Admin. An email belonging to another account causes the seed to fail.

## API requests

Send requests to `/api/v1`. Mutating requests require an `Origin` matching the allowlist, including when testing with curl. Browser callers use `credentials: "include"` for cookie-authenticated requests. Registration and login accept JSON with email and password.

| Route                                                          | Access                                            |
| -------------------------------------------------------------- | ------------------------------------------------- |
| `GET /health`                                                  | Public                                            |
| `POST /auth/register`, `POST /auth/login`, `POST /auth/logout` | Public, origin checked                            |
| `GET /auth/me`, `GET /users/me`                                | Active session                                    |
| `DELETE /auth/sessions/:id`                                    | Active session that owns the target session       |
| `GET /admin/access`                                            | Active session with the `staff:access` permission |

## Checks

`corepack pnpm check` runs formatting, lint, Prisma client generation, build, strict typechecking, unit tests, and Prisma schema validation. After building, use a disposable local database to run the HTTP integration suite.

```sh
NODE_ENV=test TEST_DATABASE_URL=postgresql://marketplace:marketplace_local@127.0.0.1:5432/marketplace \
  corepack pnpm --filter @marketplace/api test:integration
```

The integration suite creates a randomly named schema, applies migrations and removes that schema after the run. The hosted workflow additionally deploys migrations to the Compose database. Use `docker compose down` to stop services and keep local data.

## Staff inventory

Run the API and admin console in separate terminals after the migration and development seed.

```sh
corepack pnpm --filter @marketplace/api start
corepack pnpm --filter @marketplace/admin start
```

Open [the admin console](http://localhost:3002) and sign in with the seeded staff account. Add a location, create a draft, complete its category fields, then upload a cover image with alternative text. Use Preview to review what will be shown to customers. The Activity view lists the recorded inventory operations.

Set `NEXT_PUBLIC_API_ORIGIN` before building the admin console to point it at a different API. Set `MEDIA_LOCAL_DIR` on the API to choose the private development media directory. The default is `apps/api/.local-media`. Local storage should be backed up with the database if keeping development inventory. The console and API need same-site URLs for session cookies.

The integration command above now runs both identity and inventory HTTP suites. Admin listings are under `/api/v1/admin/listings`, with separate permissions for read, write, publish, media, and audit.

## Public storefront

After building and applying the migrations, start the API and optionally seed the development catalog.

```sh
corepack pnpm --filter @marketplace/api db:seed:demo
corepack pnpm --filter @marketplace/web start
```

Open [the public storefront](http://localhost:3000). The seed creates one labeled example in each category, with packaged synthetic imagery. It requires `NODE_ENV=development` and preserves existing demo listings on repeat runs. Run it before starting the API or in a separate terminal.

Set `MARKETPLACE_SITE_URL` to the public website origin for canonical URLs and sharing. `MARKETPLACE_INTERNAL_API_ORIGIN` optionally overrides the API origin for server-side data requests. Published media uses `NEXT_PUBLIC_API_ORIGIN`. The public price filters default to NGN and display kobo inputs.

The integration command also covers public catalog filtering, field redaction, expiry, reserve visibility, media and demo seed behavior.

## Customer engagement

Apply the engagement migration before starting the API and both frontends. The public [account page](http://localhost:3000/account) supports registration, profile, email verification, recovery, favourites, saved searches, enquiries, appointments and notifications. The staff console's Enquiries and Appointments tabs use the development admin seeded earlier. Enter the exact email of an active staff user when assigning work.

Set `MARKETPLACE_SITE_URL` to the storefront origin and optionally set `MARKETPLACE_WHATSAPP_NUMBER` to an international number such as `+234` followed by the national digits. The storefront builds the WhatsApp link with a URL-encoded listing reference and page URL. Demo listings remain browseable and saveable. Enquiry and appointment forms appear on real listings only.

Run the email adapter in a separate terminal to process verification, reset and optional update emails in development.

```sh
corepack pnpm --filter @marketplace/api worker:mail
```

Set `MAIL_LOCAL_DIR` to select a private spool directory. The default is `apps/api/.local-mail`. Open the JSON files locally and follow the verification or reset links. Use `worker:mail --once` to drain ready jobs and exit. Keep the spool private because it holds live account links.

The database integration suite exercises customer ownership, private notes, competing bookings, notification preferences, throttling, and one-time mail links. The local worker has no external mail provider.

## Sandbox commerce

Apply the commerce migration and build before starting the API and frontends. Enable sandbox payments in the API's development environment with these settings. Keep the generated value in the ignored local `.env` or in your shell environment.

```sh
export PAYMENT_SANDBOX_ENABLED=true
export PAYMENT_SANDBOX_SECRET="$(openssl rand -hex 32)"
corepack pnpm --filter @marketplace/api start
```

Create a published fixed-price professional service in the staff console with a positive price and a ready cover image. Sign in as a customer, open its public listing, and start sandbox checkout. Choose a test result. Successful simulated payments generate a downloadable PDF and appear in the account's orders and receipts section. The labeled demo seed remains ineligible for checkout.

The staff Commerce workspace has payment reconciliation, audit history, verification exceptions and refunds. Standard admins can reconcile payments and request refunds. Seeded Super Admins can also approve and process them, including simulating a provider failure.

The sandbox webhook accepts JSON at `POST /api/v1/payments/webhook/sandbox`. Sign the exact raw request bytes with HMAC-SHA256 over `<unix-seconds>.<raw-body>` using the sandbox secret. Send the timestamp and lowercase hex signature as `X-Payment-Timestamp` and `X-Payment-Signature`. The signed event includes UUID `id`, `paymentReference`, `providerReference`, `status`, decimal-string `amountMinor`, `currency` and UTC ISO `occurredAt`. The built-in simulator invokes the same verification code.

Neither checkout nor refunds move money. The production API rejects enabling the sandbox. No provider credentials are required for these tests.

## Professional services

Build and apply the service migration, then start the API and both frontends. Use a published professional service from the staff inventory. A signed-in customer can open the listing, submit a service request and check its status under **Service requests and projects** in their account.

Open **Professional services** in the staff console to assign the request, ask the customer for more details, or send a quotation. A quotation requires at least one priced line, a future expiry, terms and an expected timeline. The customer can review and accept or decline the current revision. Acceptance creates an order and the project. Enable the sandbox to pay the order and exercise the milestone workflow. Staff can add planned milestones before payment and must provide completion evidence when marking a milestone complete.

## Content and release checks

Use **Content** in the staff console to manage the homepage, banners, information pages, FAQs, articles and legal pages. Save the draft before publishing it. The storefront uses its existing copy until a homepage entry is published. Use **Reports** for Lagos-dated aggregates. Super Admins can also download CSV exports.

For the browser smoke test, use a disposable database with migrations applied. Seed the development Super Admin and demo catalog, set `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` in the test shell, and run the API and both frontends.

```sh
corepack pnpm exec playwright install chromium
corepack pnpm test:e2e
```

Set `PLAYWRIGHT_CHROME_EXECUTABLE` to an installed compatible Chrome if using that browser in place of Playwright's download. The test writes a synthetic article to the disposable database. See the [release and operations guide](RELEASE.md) for staging checks, production gates and backup rehearsal.

The storefront links to `/contact` from the header and footer. Publish a
**Contact** entry in the staff Content section to add the team's public contact
details. Set `MARKETPLACE_CONTACT_PHONE` to the public call number in
international format, `MARKETPLACE_CONTACT_EMAIL` to the public email address,
and `MARKETPLACE_WHATSAPP_NUMBER` to the WhatsApp number. Configured channels
appear on the Contact page and on live listing summaries.
