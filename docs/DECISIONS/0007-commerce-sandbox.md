# 0007 Commerce sandbox

Accepted for Phase 5.

Sandbox checkout is opt-in and available for active, published, fixed-price services with positive prices. Test clients send a listing slug and an idempotency key. The API snapshots the title, reference, quantity, amount and currency under a listing lock. Store amounts in PostgreSQL bigint minor units and send them as decimal strings. Database constraints prevent a second pending or captured attempt per order. Order items and receipts are protected against updates and deletes by database triggers.

The provider adapter verifies raw signed webhook bodies with an HMAC and a five-minute timestamp window. The settlement transaction validates provider and internal references, currency, amount, occurrence time and the recorded state. An event key and digest detect repeated or conflicting deliveries. The payment, order, receipt, in-app notification and any optional email job commit together. Rejected signed events appear in the reconciliation view.

The sandbox simulator is a provider-side test harness for the owner of a pending payment. It records the first terminal simulation and submits a signed event through the same verification logic. Staff can verify provider state independently to recover undelivered sandbox results. Expired attempts can be timed out and retried. The captured payment remains recorded after refunds. Separate refund permissions and audit rows govern requests, approvals and processing, with limits on allocated and refunded amounts.

Live payments, reservation and deposit fees, tax rules and provider webhooks are disabled pending business approval and a real provider adapter. The sandbox is blocked when the API runs in production. The sandbox receipt states that no funds were charged and that the document conveys no ownership, title or service completion. Automated reconciliation and provider dispute operations remain production follow-up work.
