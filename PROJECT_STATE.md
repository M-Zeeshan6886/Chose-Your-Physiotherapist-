# CHOOSE YOUR DR: PROJECT STATE (read this first in every new session)

Business name: "Choose Your Dr" (chosen by the owner). Keep it in ONE setting: APP_NAME. Technical names (folder `juudo`, database `juudo`) are internal and unchanged.

## What we are building
Pakistan physiotherapy marketplace. Patients search free and contact a therapist directly on WhatsApp.
Therapists buy a plan (days + clicks). One billable contact (lead) = one click.
Full concept and rules: Juudo_Master_Reference_Document_v3.docx

## Locked decisions
- Stack: Next.js (App Router) + TypeScript, Node 20, PostgreSQL 16, Docker Compose.
- DB access: plain SQL with the `pg` library (NO ORM). Business logic already lives in Postgres functions.
- Validation: zod. Sessions: signed JWT in httpOnly cookie. Tests: vitest. Money: integer PKR.
- Response time: therapist taps "I replied" -> mark_contact_replied().
- Abuse control: max 5 contacts/24h per device OR IP OR phone. Phone OTP required before the 3rd contact.
- Phase 1 only: no bidding, no payment gateway (manual payment + screenshot), no mobile app.
- Schema v3 is FINAL (01_schema.sql, 18 tables). Changes go in NEW files: 02_public_api.sql (adds otp_codes = 19 tables, fixes), 03_demo_data.sql (FAKE data, delete before launch).

## Design
Colours only via CSS tokens in web/src/app/globals.css (see docs/DESIGN.md). Light and Dark must both be checked for every screen.

## Rules for writing code
1. API routes stay thin. Billing/abuse rules are NEVER re-implemented in TypeScript: call the SQL functions
   register_contact_click, activate_subscription, grant_bonus_clicks, claim_promotion, refund_click,
   mark_contact_replied, refresh_therapist_listing.
2. Every endpoint: zod-validate input, return {ok:true,data} or {ok:false,error:{code,message}}.
3. Never expose cnic, password_hash, ip_hash, device_id in any public response.
4. OTP/SMS/WhatsApp sending goes through one provider interface; "console" provider for development.
5. Each session ends with: it runs in Docker, tests pass, Master Document updated, this file updated.

## Planned structure
juudo/
  docker-compose.yml          db + adminer + web
  db/init/                    SQL files (01_schema.sql is final)
  web/                        Next.js app: src/app (pages + api), src/lib (db, auth, otp, errors), src/services
  docs/BACKEND.md             backend guide (update every session)

## Roadmap (tick when done)
### Backend
- [x] Schema v3, SQL functions, seed data (tested on PostgreSQL 16)
- [x] Docker for database, README
- [x] B1  Scaffold: Next.js 16 + TS, web service in Docker, db connection, config, error format, /api/health, /api/meta, 15 tests passing (see docs/BACKEND.md)
- [x] B2  Public read API: locations, conditions, therapist search, profile, inquiries (db/init/02, services/, tested)
- [x] B3  Contact API: register_contact_click wrapper, device cookie, IP hash, OTP service + gate at 3rd contact, OTP limits
- [ ] B4  Auth + therapist API: phone-OTP login, registration, profile edit, document upload, dashboard (balance), "I replied"
- [ ] B5  Admin API: approve/reject therapist + documents, confirm payment -> activate, bonus clicks, refund, reports, audit log
- [ ] B6  Subscriptions/payments API, promotion claim, nightly job, review-link flow, API docs, test pass
### Frontend (after backend)
- [x] F1b Teal + slate theme from the owner's logo sample, Light/Dark/Auto toggle, placeholder logo (docs/DESIGN.md)
- [x] F1 Patient pages: popup, search, results, profile, contact + OTP modal, test guide (not yet checked in a real browser by Claude)
- [ ] F2 Therapist dashboard and registration
- [ ] F3 Admin panel
- [ ] F4 Launch prep (terms/privacy, backups, deployment)

## Open items (need the owner's answer)
- OTP/SMS/WhatsApp provider (decide in B3; development uses console provider)
- Final plan price, days, clicks per plan (currently placeholders: Rs 3,000 / 90 days / 30 clicks; trial 10 clicks)
- Review confirmation method after a WhatsApp conversation

## How to continue in a new session
Upload Choose_Your_Dr_Project.zip and write: "Continue Choose Your Dr. Do session B4." (next undone item above) Claude has no memory between
sessions, so THIS FILE and the zip are the memory. Always upload the latest zip.

## Testing status
43 automated tests: unit, database contract, full API flow, and UI components talking to the real API (tests/ui.integration.test.tsx). The UI test fails if a component calls an API URL or shape that the backend does not have. Still NOT verified: a real Docker run and real browser rendering (no Docker/browser in the build environment).

## Technical notes (learned in B1)
- npm needs `legacy-peer-deps=true` (web/.npmrc) because of an npm dependency-resolution bug; Dockerfile copies .npmrc.
- Versions are pinned exactly in web/package.json (Next 16.4.2, React 19.1.10, zod 4.6.7, pg 8.23.1, TypeScript 5.9.3, vitest 4.1.12).
- Docker was not available in the build environment: the image was verified by running the same `next build` standalone output
  (`node server.js`) against PostgreSQL 16. First `docker compose up -d --build` on the owner's machine is the real Docker test.
- Run tests with the database: `DATABASE_URL=... npm test` (integration tests are skipped without it).

## Review findings fixed in session B2/B3 (so they are not repeated)
- Pool had no error handler (idle drop would crash the process); tx() could hide the original error. Fixed in db.ts.
- activate_subscription could run twice (double clicks): now requires status pending.
- register_contact_click: accepted unlisted therapists and was beatable by double-clicks: now checks listed + advisory locks.
- Unknown client IP must be NULL, never a shared value (it would block everyone).
- OTP: stored hashed, per phone/device/IP hourly limits, 5-attempt lock.
- Config must not be read at build time (Docker build has no env): use getAppName() in layout/pages.
- Test database must be rebuilt from db/init after any SQL change.
- Local verification of web: `cd web && npm ci && npm test` needs DATABASE_URL pointing at a database loaded from db/init/01,02,03.
