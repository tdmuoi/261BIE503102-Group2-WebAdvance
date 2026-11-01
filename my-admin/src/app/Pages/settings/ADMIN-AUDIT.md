# Admin logic audit

No live MongoDB documents, roles, indexes, passwords or payment configuration are modified by the audit tests.

## Shared changes approved and applied

1. The user approved Buyback registration in `my-server/index.js`: import `./routes/admin-buybacks`, add `/api/admin/buybacks` to the early `adminAuth.cors` path array, and mount `app.use('/api/admin/buybacks', adminBuybackRoutes(() => database))`. The route checks `liquidation.view/approve/reject` and cookie/CSRF. No data is created on startup.
2. The user approved changing the `withSession` error handler in `admin-auth-service.ts` to clear user state only on a 401. A resource-level 403 remains an error but does not clear the login state. `checkSession` still clears state on all session-check failures, including 403. Regression tests cover all three cases.

## Critical findings outside the owned scope

Unauthenticated GET requests returned 200 on `/api/admin/books`, `/api/admin/orders`, `/api/admin/dashboard`, and `/api/admin/returns` during the audit. No unauthenticated write was attempted.

Do not apply a blanket login guard in index.js alone: it would break member services that currently omit cookies. The coordinated minimum change is:

- Add each affected admin prefix to the early CORS handling before the general cors middleware.
- In each affected router, use the existing `createAdminAuth(getDb)`, `auth.cors`, `auth.requireAdmin` and the actual module/action-specific `auth.requirePermission(...)`.
- In the corresponding member HttpClient services, add `withCredentials: true` and the existing session/CSRF wrapper to writes.
- Leave public book/catalog routes public. Verify account lock/session revocation and read-only roles with isolated tests before deployment.

These member routes/services have not been changed without approval.

## Follow-up logic review

- News Editor converts persisted plain-text content to escaped HTML paragraphs before editing, preserving literal markup and line breaks. HTML articles still use Angular sanitization.
- Explicit cover changes/removal update the existing legacy img alias too; omitted covers preserve both original image fields.
- Public and admin News APIs share read-time publication rules in news-policy.js. Future publications stay private; invalid/null schedule dates are never treated as due. No article status is rewritten in MongoDB to implement scheduling.
- Schedule inputs require an actual ISO date/time with timezone and valid calendar components. Invalid field types are rejected rather than silently converted to empty content.
- Admin account edits/lock/unlock carry the loaded revision (ISO updatedAt or null for legacy accounts). Stale forms return 409; the transaction also compares the original database timestamp. A stale edit cannot reactivate an account that another Admin locked.
- Buyback detail cancels the old view subscription when the request ID changes, so a late mutation response cannot replace another request's screen. The estimated resale price is optional and remains unsaved; the existing offerPrice can be edited without re-entering an estimate.

The mutation checks above run against isolated fixtures. MongoDB follow-up checks use only reads and $documents aggregation pipelines.

## Remaining limitations (unchanged)

- Existing database roles contain no `vouchers` module permission. SUPER_ADMIN can manage vouchers through the existing bypass; other roles need a group-approved permission grant. The audit does not invent or write role grants.
- Read-only metadata inspection confirmed existing unique indexes on accounts.email and vouchers.code. Voucher API writes normalize codes to uppercase and also serialize duplicate operations within the single Node process used by Admin sessions. The existing indexes were not created or modified by this work. Cross-process Admin sessions and case-insensitive policies for external writers still require a coordinated group design.
- Voucher management does not implement checkout redemption or per-customer redemption counters.
- Buyback moves pending to reviewing, records the existing offerPrice during reviewing and rejects pending/reviewing requests with a reason appended to the existing note field. The customer's original description is preserved. Resale price is an estimate only, not persisted to a new schema field. It does not delete history, issue payment, create inventory, send email or mark requests paid.
- Admin invitations, password reset, role mutation, security policy changes, payment providers and Ebook enforcement remain unsupported where the backend currently responds 501 or declares storage-only capabilities.
- The existing route guard verifies login; resource APIs enforce module/action permissions. Per-page menu/route authorization across other members' pages requires a coordinated shared change.
