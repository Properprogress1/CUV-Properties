# 0006 Customer engagement

Accepted for Phase 4.

Customers access favourites, saved searches, enquiries, appointments and notifications by the user ID on their active session. Staff CRM and booking routes require independent permissions. Customer summaries omit staff assignment and private notes. Guests can submit an enquiry with explicit contact consent and receive a reference. Staff can see the submitted contact details. Guest submissions never trigger outbound mail to an unverified address.

Appointments store UTC instants and the submitted IANA time zone. Requests can overlap. Confirmation and rescheduling serialize contenders for the assigned staff member and the customer through PostgreSQL transaction locks and reject overlapping active slots. References, appointment history and customer notifications are stored with the changes.

Issue random, short-lived email verification and password reset links, store their digests and consume them once. Put link tokens in URL fragments to keep them out of ordinary website request logs. Password resets invalidate existing sessions. Authenticated users can manage settings and request appointments before email verification. Optional email updates require a verified address and the email preference. Credentials and verification links are available in the local mail directory during development only.

Use a PostgreSQL outbox for Phase 4 mail so domain writes and delivery jobs commit together. The standalone worker claims rows with `FOR UPDATE SKIP LOCKED`, deduplicates local delivery, retries with backoff and marks terminal failures. This avoids coordinating a database write and a Redis publish for the initial mail use case. Production needs an actual provider adapter and a sensitive-message retention policy. The worker refuses production execution until a provider is configured in code. Automated saved-search alerts and scheduled appointment reminders are future work.
