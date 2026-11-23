# Choose Your Dr: Local Setup (Docker)

> **Team testers: read START_HERE.md first** (double-click `start.bat` on Windows, run `sh start.sh` on Mac/Linux).

Runs the database (full schema + sample data), a page to browse the tables, and the web app/API.
No other software is needed except Docker.

## 1. Install Docker (one time)
- Windows / Mac: install **Docker Desktop** from docker.com and open it until it says "running".
- Linux: install Docker Engine and the Compose plugin.
- Check: `docker --version` and `docker compose version`

## 2. Start
Open a terminal inside this `juudo` folder and run:

    docker compose up -d --build

The first start downloads the images and builds the app (a few minutes), then loads `db/init/01`, `02` and `03` automatically:
19 tables, Lahore with 10 areas, 31 conditions, plans, promotions and **12 demo therapists with reviews**.

**Already ran an older version?** Do a full reset once: `docker compose down -v && docker compose up -d --build`.

## 3. Check the web app
Open http://localhost:3000 : the website. First visit shows the city and area popup.
Open http://localhost:3000/api/health : should show `"ok":true` and `"tables":19`.
**Testers: read `docs/TESTING.md` or open http://localhost:3000/test-guide.**

## 4. Look at the data
Open http://localhost:8080 (Adminer) and log in:

| Field    | Value                  |
|----------|------------------------|
| System   | PostgreSQL             |
| Server   | db                     |
| Username | juudo                  |
| Password | juudo_dev_password     |
| Database | juudo                  |

Connection string for code: `postgres://juudo:juudo_dev_password@localhost:5432/juudo`

## 5. Everyday commands
| Task                          | Command                                      |
|-------------------------------|----------------------------------------------|
| Start (build web app)         | `docker compose up -d --build`               |
| Rebuild web after code change | `docker compose up -d --build web`           |
| Stop (keeps data)             | `docker compose down`                        |
| See logs                      | `docker compose logs -f db`                  |
| Open SQL shell                | `docker exec -it juudo-db psql -U juudo juudo` |
| FULL RESET (deletes all data) | `docker compose down -v && docker compose up -d` |

## 6. Changing the schema
Files in `db/init/` run only the FIRST time the database is created, in name order.
- Early development: edit `01_schema.sql`, then do a FULL RESET.
- Later: add new files such as `02_phase2.sql`, or use a migration tool once the backend exists.

## 7. Optional settings
Copy `.env.example` to `.env` to change the database name, user, password or the business name (`APP_NAME`).
Change the default password before any real deployment.

## 8. Quick check that everything works
    docker exec -it juudo-db psql -U juudo juudo -c "SELECT count(*) FROM conditions;"
Expected result: 31

To remove the demo therapists before a real launch, delete `db/init/03_demo_data.sql` and do a full reset.

## Folder contents
- `web/`: the Next.js website and API (see `docs/BACKEND.md`)
- `PROJECT_STATE.md`: decisions and roadmap (read first in every new session)
- `docs/BACKEND.md`: backend guide
- `START_HERE.md`, `start.bat`/`stop.bat`/`reset.bat`, `start.sh`/`stop.sh`/`reset.sh`: one-click helpers for testers
- `docs/DESIGN.md`, `docs/TESTING.md`: colours and the test checklist
- `docker-compose.yml`: database + Adminer + web
- `db/init/01_schema.sql`: the full schema, business-rule functions and seed data
- `Juudo_Master_Reference_Document_v3.docx`: business rules, flows and debugging guide
- `.env.example`: optional settings

## Troubleshooting
- "port is already allocated": something else uses 5432, 8080 or 3000. Stop it, or change the left number in `ports:` in `docker-compose.yml`.
- Changes to the schema do not appear: the init files only run on a fresh database. Do the FULL RESET.
- "docker: command not found": Docker is not installed, or Docker Desktop is not running.
