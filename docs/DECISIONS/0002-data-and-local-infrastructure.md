# 0002 Data and local infrastructure

Accepted for Phase 0.

Pin Prisma 6.19.0 and use the Prisma 6 datasource configuration with `env("DATABASE_URL")` in the schema. Phase 1 will add the aligned client, first additive migration, and development seed.

Use PostgreSQL 16 and Redis 7.4 through Compose with loopback bindings and named volumes. Add object storage when the media workflow needs it. PostgreSQL remains the initial search engine. External payments, storage, and messaging use adapters at their domain boundaries.
