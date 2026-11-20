# Product requirements

Source of truth is the [Marketplace PRD](../Docs.md/Marketplace_PRD.pdf). This summary keeps the implementation requirements accessible in the workspace.

## Product and roles

CUV Marketplace is a Nigeria-first, responsive marketplace for property, land, vehicles, and professional services including urban planning, feasibility, site and master planning, and GIS. Locales, currencies, and providers are configurable.

| Role             | MVP capabilities                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Guest            | Browse, search, filter, share, and submit a rate-limited enquiry                                                                |
| Customer         | Manage their profile, favourites, saved searches, appointments, service requests, orders, payments, receipts, and notifications |
| Authorized staff | Manage inventory, listings, media, leads, appointments, quotations, commerce, CMS, and reporting within assigned permissions    |
| Super Admin      | Manage staff permissions, configuration, integrations, and sensitive operations                                                 |

The MVP excludes seller self-service, native apps, custody of funds, title guarantees, and multi-vendor settlement.

## Acceptance criteria

- Staff can draft, preview, publish, reserve, unpublish, and close listings through permission-checked transitions. Publication validates category details, location, price policy, and media.
- Visitors see approved data for active, published, non-expired inventory. Search filters are category-specific and shareable via URL. Listing details include accessible media, verification scope, and contact actions.
- Enquiries reach an assigned CRM pipeline with private notes, follow-up dates, and activity. Customers can access their own records. Appointments preserve time-zone context and prevent conflicts for managed resources.
- Service requests progress through triage, versioned quotations, acceptance, order creation, and customer-visible milestones.
- Eligible checkout snapshots server-calculated amounts and currency. Verified provider events determine payment success. Issue one receipt per confirmed payment, and track refunds and reconciliation separately. A receipt documents payment only.
- Search-to-detail, leads, response times, and payment outcomes are measurable. Target WCAG 2.2 AA, LCP at or below 2.5 seconds on a representative connection, and normal API read P95 at or below 500 ms.

## Decisions before production

Confirm brand and domain, staff permission assignments, inventory verification labels, location privacy, and business contact channels. Confirm payment provider, currency, fees, limits, eligible payment types, reservation and refund terms, and quotation and dispute policies. Confirm hosting, data retention, consent, and compliance with qualified reviewers before launch.
