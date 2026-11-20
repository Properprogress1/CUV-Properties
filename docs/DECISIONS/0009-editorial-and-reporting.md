# 0009 Editorial and reporting

Accepted for Phase 7.

Store editable drafts separately from published snapshots. Apply optimistic versions to editing and publication and record changes in the editorial audit log. Render plain text in the storefront and allow site-relative CTA links. Homepage and banner content are separate from standalone articles, FAQ, contact, about and legal pages.

Collect day-level aggregate counts by category. The storefront sends event type and listing slug or category while omitting cookie credentials and search text. Slugs are validated against published inventory and used to resolve a category. The stored rows contain no visitor or listing identifiers. Client signals respect Do Not Track and Global Privacy Control where available. These counts represent events, with no unique-visitor or attribution claim.

Reports use Africa/Lagos calendar days. Inventory is a current snapshot. Payment and refund totals are separate exact minor-unit amounts and sandbox payments are identified by provider. Summary reports contain aggregates, and inventory exports include only selected listing fields. CSV exports need separate permission, escape spreadsheet formulas, and are audited. Traffic from staging should not be combined with production reporting.
