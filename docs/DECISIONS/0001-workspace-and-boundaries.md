# 0001 Workspace and application boundaries

Accepted for Phase 0.

Use pnpm workspaces with strict TypeScript and exact direct dependency versions. Use a modular monolith behind REST/OpenAPI with dedicated public and admin frontends. Use the API's source tree for the worker entry point when the first jobs are implemented. These boundaries support separate deployments while keeping shared database transactions and domain ownership clear.

Use the build prompt's numbering. Its Phase 1 covers backend foundation and identity, which the PRD groups with foundation. Add framework dependencies and shared packages alongside their first consumers.
