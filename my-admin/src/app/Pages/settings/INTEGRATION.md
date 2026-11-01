# Settings Phase 3

Settings UI and `my-server/routes/admin-settings.js` are registered in the shared server entry point. The user explicitly approved the import, API registration and CORS path in this phase.

Approved changes applied to `my-server/index.js`:

```js
// Next to the existing admin route imports:
const adminSettingsRoutes = require('./routes/admin-settings');

// Add '/api/admin/settings' to the EXISTING adminAuth.cors path array.
// Keep this before the general cors() middleware.

// Next to the existing admin route registrations:
app.use(
  '/api/admin/settings',
  adminSettingsRoutes(() => database),
);
```

Then restart the backend. Admin must use `http://localhost:4201`.

## API and schema

- `GET /api/admin/settings`: reads the existing singleton from `settings` with an explicit field projection. Returns a 409 when there is no document or more than one; never creates one automatically.
- `PATCH /api/admin/settings`: `{ revision, changes }`. Requires Admin session, Origin, `X-Admin-CSRF`, and `settings.update`. GET requires `settings.view`. SUPER_ADMIN uses the existing auth policy.
- `revision` is the stored `updatedAt` in ISO format, or null when missing. Updates also compare the original database value atomically.
- Editable fields: storeName, slogan, supportEmail, hotline, logoUrl, language, currency, timezone; `shipping.standardFee/freeShippingThreshold/processingDays/carriers`; `ebook.formats/deviceLimit/maxPerOrder`; existing root `freePreviewLimit`.
- Missing values remain empty or null in the UI. Figma values are not seeded into the database.
- Only changed, allowlisted fields are updated. Existing roles, aboutUsContent, encryptionLevel, watermarkText, payment credentials and connection flags are preserved.
- These are stored settings. Checkout, customer website and Ebook reader have not been modified to consume them. The UI states this before and after saving.
- Payment connection flags indicate saved configuration only; no provider connection test is implemented. Payment changes, email delivery, security policy, DRM, watermark, automatic shelf insertion and file uploads are unsupported and cannot report successful saves.

## Verification

```powershell
# From my-admin:
npm.cmd run build
npm.cmd test -- --watch=false --include='src/app/Pages/news/**/*.spec.ts' --include='src/app/Pages/settings/**/*.spec.ts'

# From my-server:
node --test routes/admin-news.test.js routes/admin-settings.test.js
node --check routes/admin-settings.js
```

Backend mutation tests use memory fixtures only. Live MongoDB checks are read-only. No production/shared settings or article statuses are changed for testing.
