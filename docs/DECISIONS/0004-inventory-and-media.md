# 0004 Inventory and media

Accepted for Phase 2.

A listing has a fixed category and exactly one category detail record created by the API. The detail tables each hold their category's validated payload. Shared Zod schemas enforce draft and publication rules. Phase 3 can add generated columns or expression indexes for measured category filters without changing the API payload.

Persist prices as PostgreSQL bigint minor units and transport them as decimal strings. Assign a stable reference and slug when a draft is created. The database enforces uniqueness and the service retries reference collisions. Every listing mutation checks the supplied version and records an audit event in the same transaction. Bulk changes lock listings in stable ID order and roll back as a group.

The local adapter accepts authenticated uploads up to 8 MB, verifies image content by decoding it, strips image metadata by encoding WebP and checks MP4 container structure. It writes blobs outside the public tree, scopes downloads to the listing and requires staff inventory access. Local uploads are validated and written during the request. The media state model reserves processing and failure states for a later asynchronous adapter. Production media needs object storage, video processing, scanning and reliable cleanup. The local storage adapter rejects production media operations.
