# Choose Your Dr: test version (read this first)

This is a test version for the team. Everything runs on YOUR computer. No real patient data. The therapists you see are demo data with fake phone numbers.

## 1. One-time: install Docker
- Windows or Mac: install **Docker Desktop** from docker.com, open it, and wait until it says it is running.
- Linux: install Docker Engine and the Compose plugin.

## 2. Start
1. Unzip the folder anywhere (for example your Desktop).
2. Windows: double-click **start.bat**.  Mac/Linux: open a terminal in the folder and run `sh start.sh`.
3. The first time takes about 3 to 10 minutes (it downloads and builds everything). Wait. Your browser opens by itself at http://localhost:3000 when it is ready.

## 3. What to test
Open http://localhost:3000/test-guide (a short checklist) or `docs/TESTING.md` (full list of 18 test cases).
Main things: the city and area popup, search and filters, therapist profiles, WhatsApp and Call buttons, the phone check on the 3rd contact (the code is shown on the screen in this test version), the limit of 5 contacts per day, and the Light / Dark / Auto button in the top bar. Try it on your phone too if you are on the same WiFi: open `http://YOUR-COMPUTER-IP:3000`.

## 4. Useful addresses
| What | Address |
|---|---|
| The website | http://localhost:3000 |
| Health check (should say ok and tables 19) | http://localhost:3000/api/health |
| Database viewer (Adminer) | http://localhost:8080  (System PostgreSQL, Server `db`, User `juudo`, Password `juudo_dev_password`, Database `juudo`) |

## 5. Stop, restart, reset
- Stop: **stop.bat** (or `sh stop.sh`). Your data is kept.
- Start again: **start.bat** (or `sh start.sh`). Fast after the first time.
- Start fresh (deletes test data, brings back the demo data and resets the daily limit): **reset.bat** (or `sh reset.sh`).

## 6. If something goes wrong
| Problem | What to do |
|---|---|
| "docker is not recognized" / cannot connect | Docker Desktop is not installed or not open. Open it and wait for "running". |
| "port is already allocated" | Another program uses port 3000, 8080 or 5432. Close it, or ask the team lead. |
| The website does not open | Wait 1 more minute, then open http://localhost:3000/api/health. If it shows an error, run `docker compose logs web --tail 50` and send the output. |
| You ran an older version before | Run reset.bat (or `sh reset.sh`) once. |

## 7. Reporting a problem
Send: what page you were on, what you did, what you expected, what happened, and a screenshot. For a technical error also send the output of `docker compose logs web --tail 50`.

## What is NOT in this version yet
Therapist registration and login, therapist dashboard, admin panel, payments and review links. Those are built in the next sessions.
