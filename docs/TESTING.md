# Team Test Guide (Choose Your Dr)

## Start
1. `docker compose down -v` (only if you ran an older version), then `docker compose up -d --build`
2. Wait until http://localhost:3000/api/health shows `"ok":true`, `"tables":19`.
3. Website: http://localhost:3000 . Database viewer: http://localhost:8080 (see README for login).

Demo data: 12 fake therapists with fake phone numbers (WhatsApp links open to numbers that do not exist: expected).
In test mode the OTP code is shown on the screen.

## Test cases
| # | What to do | Expected |
|---|---|---|
| 1 | Open the home page in a fresh browser | City and area popup appears. After choosing, you land on results for that area. |
| 2 | Filter: condition Back Pain, service Online, max fee 2000 | Only matching therapists; counts change; no error. |
| 3 | Try every sort button | Order changes; page does not break. |
| 4 | Search for DHA + Neuro conditions (Stroke) | Dr Sana Malik appears. |
| 5 | Look for "Test Pending (Demo)" anywhere | Never visible (pending verification). |
| 6 | Open a profile | Verified badges, fee, reply time, rating, reviews, availability, areas. No phone number visible anywhere in the page. |
| 7 | Tap WhatsApp on therapist 1 and 2 | New tab opens a wa.me link (fake number). Message "You have contacted N of 5 today". |
| 8 | Tap WhatsApp on a 3rd therapist | Phone check popup. Enter 0300 5551234, then the code shown on screen. Contact then works. |
| 9 | Enter a wrong code | "Wrong code. N attempts left." After 5 wrong: locked, request a new code. |
| 10 | Contact 5 therapists in total, then a 6th | Friendly "daily limit" message. |
| 11 | Same IP/phone in a private window | Still limited (phone verified in that window counts the same person). |
| 12 | Tap WhatsApp twice on the SAME therapist | Both open; therapist is billed once (check in the database: `contact_requests.is_billable`). |
| 13 | "Test Low Clicks (Demo)": contact it from 3 different people/devices | After the 3rd it disappears from search; its profile page says not found. |
| 14 | Open `/therapists/00000000-0000-0000-0000-000000000000` | Friendly "not found" page. |
| 15 | Phone screen (or browser mobile view) | No sideways scrolling; buttons easy to tap. |
| 16 | Header button: press it 3 times (Auto, Light, Dark). Reload the page in Dark | Colours switch each time; Dark stays after reload with no white flash. Check text is readable and the WhatsApp, Call and search buttons look right in both themes. |
| 17 | Phone/computer set to dark mode, theme on Auto | Site opens dark. Switching the phone setting switches the site. |
| 18 | Stop the database (`docker compose stop db`) and open the site | Health check says database unavailable; pages must not show raw errors. |

## Checking billing in the database (Adminer or psql)
    SELECT full_name, total_clicks_left FROM v_therapist_click_balance b JOIN therapist_profiles t ON t.id=b.therapist_id;
    SELECT therapist_id, is_billable, non_billable_reason, status, created_at FROM contact_requests ORDER BY created_at DESC LIMIT 20;

## Resetting the limit while testing
    docker exec -it juudo-db psql -U juudo juudo -c "DELETE FROM contact_requests WHERE created_at > now() - interval '1 day' AND status <> 'completed';"
(Used clicks are not given back by this. For a clean slate use the full reset.)

## Reporting a bug
Write: page or API, steps, what you expected, what happened, screenshot, and the output of `docker compose logs web --tail 50`.
