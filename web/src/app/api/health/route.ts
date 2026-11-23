import { getConfig } from "@/lib/config";
import { query } from "@/lib/db";
import { ok, route, AppError } from "@/lib/http";

export const dynamic = "force-dynamic";

/** GET /api/health: is the app up, and can it reach the database with the v3 schema? */
export const GET = route(async () => {
  let tables = 0;
  try {
    const rows = await query<{ n: string }>(
      "SELECT count(*)::text AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
    );
    tables = Number(rows[0]?.n ?? 0);
  } catch (e) {
    console.error("[health] database check failed", e);
    throw new AppError(503, "db_unavailable", "Database is not reachable");
  }
  const c = getConfig();
  return ok({
    status: "ok",
    app: c.APP_NAME,
    env: c.APP_ENV,
    database: { connected: true, tables },
    time: new Date().toISOString(),
  });
});
