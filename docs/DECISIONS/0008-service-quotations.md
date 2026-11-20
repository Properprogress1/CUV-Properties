# 0008 Service quotations and projects

Accepted for Phase 6.

Requests attach to a published professional service. Customers record the project scope, location, timeline and optional budget. Staff can assign the request, ask for information or close it. Request messages and milestone evidence are text visible to the customer. Private file attachments require a document storage and scanning workflow and remain deferred.

Staff issue an immutable set of line items per quotation revision. Creating a revision supersedes any current quote. Triage that moves a quoted request into review or closes it also supersedes the current quote. The server calculates totals in exact minor units and rejects decisions on expired or superseded revisions.

Customer acceptance locks the request and creates one order and project. The accepted quotation snapshots into commerce order items. The order can exist with sandbox disabled and can begin payment through the existing commerce endpoint when sandbox is enabled. Staff may plan milestones while payment is outstanding. Starting or completing a milestone requires a paid or partially refunded order. Completion requires evidence and is visible in the customer’s account.

Reuse the existing in-app notification and email outbox. Production payments, private uploads and scheduled reminders remain separate follow-up work.
