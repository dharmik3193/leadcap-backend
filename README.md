# LeadCap Backend

## Structure

routes -> controllers -> services -> database/external APIs

- `services/authService.js`
- `services/companyService.js`
- `services/leadService.js`
- `services/metaService.js`

## Meta CRM Conversion Flow

Meta Instant Form -> webhook -> `meta_leads` -> CRM status change -> Meta Conversions API.

Status mapping:
- unallocated -> no event
- allocated -> AllocatedLead
- contacted -> ContactedLead
- qualified -> QualifiedLead
- converted -> ConvertedLead
- lost -> LostLead

Event names must remain stable after production learning starts.

For Instant Form leads, the original `meta_lead_id` is sent as `user_data.lead_id`; email and phone are SHA-256 hashed.

## Migration

Run:

`mysql -u USER -p DATABASE < database/migrations/001_meta_capi_events.sql`

Ensure `meta_leads.meta_lead_id` has a UNIQUE index for webhook idempotency.

Recommended indexes are included in the migration comments.

## Environment

Copy `.env.example` to `.env`. Never commit `.env`.
