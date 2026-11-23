# Backend Guide (Choose Your Dr)

How the backend works and where things are. Updated at the end of every backend session.
Status: **B1, B2, B3 done** (scaffold, public API, contact + OTP) and **F1 done** (patient website). Next: B4 (therapist login and dashboard API).

## 1. Big picture
```
Browser / website  --->  Next.js app (web/)  --->  PostgreSQL (db/)
                         pages + /api routes       tables + business-rule SQL functions
```
- One Next.js app serves the website pages AND the API (`/api/...`).
- **All business rules live in PostgreSQL functions** (billing, clicks, daily limit, promotions, refunds, response time).
  The API only validates input, calls the function, and returns the result. Never copy those rules into TypeScript.

## 2. Folder map (web/)
| Path | What it is |
|---|---|
| `src/lib/config.ts` | Reads and validates all environment settings. The business name is `APP_NAME`, set only here. |
| `src/lib/db.ts` | The database connection: `query(sql, params)` and `tx(fn)` for transactions. |
| `src/lib/http.ts` | Standard responses, `route()` wrapper, `AppError`, `parseJson`, `parseQuery`, error mapping. |
| `src/app/api/health/route.ts` | `GET /api/health` |
| `src/app/api/meta/route.ts` | `GET /api/meta` |
| `src/lib/identity.ts` | Who is this visitor: device cookie, hashed IP, signed phone cookie. |
| `src/lib/phone.ts`, `otp-provider.ts` | Pakistani phone normalising; the ONE place that sends OTP codes. |
| `src/services/*` | Business functions the routes call: locations, therapists (search/profile), inquiries, otp, contact. |
| `src/app/**/page.tsx` | Website pages: home, results, profile, test guide. |
| `src/components/*` | SearchForm, LocationPopup, ContactButtons (OTP flow), TherapistCard. |
| `tests/` | Unit tests plus a database contract test against the real schema. |

## 3. API rules (every endpoint follows these)
1. Wrap the handler in `route(...)`. Errors then always use the standard shape.
2. Validate input with zod (`parseJson` for bodies, `parseQuery` for URL parameters).
3. Success: `{ "ok": true, "data": ... }`. Failure: `{ "ok": false, "error": { "code", "message", "details?" } }`.
4. SQL always uses `$1, $2` parameters. Never put user input into the SQL text.
5. Never return `cnic`, `password_hash`, `ip_hash` or `device_id` in a public response.

### Error codes and what they mean
| HTTP | code | When |
|---|---|---|
| 400 | `validation_error` | A field is missing or wrong (lists the fields) |
| 400 | `bad_request` / `bad_reference` / `invalid_value` | Bad JSON, unknown id, value not allowed |
| 401 / 403 | `unauthorized` / `forbidden` | Not logged in / not allowed |
| 404 | `not_found` | Record does not exist |
| 409 | `already_exists` | Duplicate (for example a phone already registered) |
| 422 | `rule_violation` | A SQL business rule refused (for example "promotion already used"). The message is safe to show. |
| 503 | `db_unavailable` | Database not reachable |
| 500 | `internal_error` | Unexpected. Details only in the server log. |

## 4. Endpoints built so far
| Method | Path | Returns |
|---|---|---|
| GET | `/api/health` | `{status, app, env, database:{connected, tables}, time}`. Tables should be 19. |
| GET | `/api/meta` | `{appName, contactDailyLimit, otpRequiredFromContact}` for the website. |
| GET | `/api/locations` | Active cities with their areas (city and area popup). |
| GET | `/api/conditions` | Filters grouped by category. |
| GET | `/api/therapists` | Search. Query: `city, area, condition, mode, budget, sort, page, limit`. Only listed therapists. Online mode ignores area. Sorts: recommended, experience, fee_low, response, rating. Payment never affects order. |
| GET | `/api/therapists/:id` | Public profile + reviews. 404 if not listed. Never includes phone, WhatsApp number or CNIC. |
| POST | `/api/inquiries` | Saves a search (guests allowed). Body: `city, area?, condition?, mode?, budgetMax?, utmSource?, utmCampaign?`. |
| POST | `/api/contact` | WhatsApp/Call tap. Body: `therapistId, inquiryId?, channel`. Applies: 5 per 24h (device OR IP OR phone) then 429 `daily_limit`; phone check from the 3rd contact then 403 `otp_required`; then billing via SQL. Returns the WhatsApp or tel link only on success. |
| POST | `/api/otp/request` | Body `{phone}`. Limits: 3 per phone, 5 per device, 10 per IP per hour. In local mode also returns `devCode`. |
| POST | `/api/otp/verify` | Body `{phone, code}`. Locks after 5 wrong tries. Sets a signed 30-day cookie. |

## 5. Settings (environment variables)
| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | required | PostgreSQL connection string |
| `APP_NAME` | Choose Your Dr | Business name shown everywhere |
| `APP_ENV` | local | `production` refuses the development `SESSION_SECRET` |
| `SESSION_SECRET` | dev value | Signs login cookies. Change for real deployment. |
| `CONTACT_DAILY_LIMIT` | 5 | Contacts per person per 24h |
| `OTP_REQUIRED_FROM_CONTACT` | 3 | Phone OTP needed from this contact number |
| `OTP_PROVIDER` | console | Prints OTP in the log (development only) |

## 6. Running and testing
- **Everything in Docker:** `docker compose up -d --build`, then open http://localhost:3000/api/health
- **Developing the web app on your machine:** `docker compose up -d db adminer`, then
  `cd web`, copy `.env.example` to `.env.local`, `npm install`, `npm run dev`.
- **Tests:** `cd web && npm test`. With `DATABASE_URL` set, the database contract test also runs
  (checks 19 tables, the SQL functions, seed data and the billing rules; the API test runs the whole contact flow: search, privacy, OTP, the 5-per-day limit, running out of clicks).
- **Type check:** `npm run typecheck`.
- `web/.npmrc` sets `legacy-peer-deps=true` (needed because of a dependency resolution problem in npm). Keep it.

## 7. Debugging the backend
- `/api/health` fails with `db_unavailable`: the database is down or `DATABASE_URL` is wrong. Run `docker compose logs db`.
- `tables` is not 19: the schema did not load. Do the FULL RESET in README.md.
- "Invalid configuration" at startup: the message lists the missing or wrong setting.
- A rule error like "promotion already used" is NOT a bug: it came from a SQL function and shows as `422 rule_violation`.

## 8. Security notes (read before going live)
- **IP address:** only used when a proxy sends `X-Forwarded-For`. Put the app behind a trusted proxy (Nginx, Cloudflare) that sets it, and make sure users cannot send their own header directly to the app. Locally there is no IP, so only device and phone are matched.
- OTP codes are stored as keyed hashes. The development provider prints codes to the server log: replace it before launch.
- `SESSION_SECRET` signs cookies and hashes: set a long random value and `APP_ENV=production`.
- Not built yet: general rate limiting on `/api/inquiries`, CAPTCHA, HTTPS (use the proxy), backups.

## 9. Next sessions
B4 auth + therapist API, B5 admin API, B6 subscriptions and wrap-up, then F2 therapist dashboard UI and F3 admin UI.
