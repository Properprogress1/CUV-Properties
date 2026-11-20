# 0005 Public catalog

Accepted for Phase 3.

Expose public listing data via an explicit field allowlist. The catalog and media endpoints require published status, a publication date at or before request time and an unexpired listing. Hide reserved inventory and exclude synthetic fixtures in production. Serve media without shared caching so removing a listing also removes normal access to its imagery.

Search uses PostgreSQL with exact city, category and structured filters and case-insensitive matching on approved text. Price limits and price sorting apply to one currency. Put filters and pagination in the URL so visitors can share and revisit searches. Use a partially indexed publication feed and defer dedicated text-search infrastructure until query measurements justify it.

The storefront uses server rendering for browse and details. Detail metadata includes canonical and Open Graph fields. Demo listings use noindex. Direct enquiries use the configured email address for real listings until the Phase 4 engagement workflows are ready.

The demo seed is development-only and marks all fixtures as synthetic. Images are AI-generated illustrations packaged with the seed. Production media still requires the object storage adapter documented in the inventory ADR.
