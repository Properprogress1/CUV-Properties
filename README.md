# CUV Marketplace

An admin-managed marketplace for property, land, vehicles, and professional services. The API foundation includes registration, customer and staff sessions, role-based authorization, OpenAPI, and a PostgreSQL health check. The staff console manages inventory, listing states, galleries and activity.

## Quick start

Use Node.js 22.23.2 with Corepack and Docker with the Compose plugin.

```sh
corepack pnpm install --frozen-lockfile
cp -n .env.example .env
docker compose up -d --wait
corepack pnpm env:check
corepack pnpm check
corepack pnpm --filter @marketplace/api db:migrate:deploy
corepack pnpm --filter @marketplace/api start
```

In a second terminal, start the staff console with `corepack pnpm --filter @marketplace/admin start`. Open [the admin console](http://localhost:3002) after seeding a development staff account.

Start the public storefront with `corepack pnpm --filter @marketplace/web start` and open [the marketplace](http://localhost:3000). The setup guide includes the optional development demo seed.

The customer account and staff engagement tabs are ready after migrating. The setup guide includes the local mail worker for email verification and password recovery.

The setup guide also covers sandbox checkout and staff reconciliation. Sandbox payments are disabled by default.

The local API provides [health](http://localhost:3001/api/v1/health) and [Swagger](http://localhost:3001/api/docs). See the [setup guide](docs/SETUP.md) for database inspection, admin seeding, and integration tests. The [product requirements](docs/PRD.md), [architecture](docs/ARCHITECTURE.md), and [implementation plan](docs/IMPLEMENTATION_PLAN.md) cover upcoming features.

See the [release and operations guide](docs/RELEASE.md) for staging checks, production gates, monitoring and PostgreSQL backup rehearsal.
