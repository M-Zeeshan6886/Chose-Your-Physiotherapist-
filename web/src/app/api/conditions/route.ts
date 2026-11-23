import { ok, route } from "@/lib/http";
import { getConditions } from "@/services/locations";

export const dynamic = "force-dynamic";

/** GET /api/conditions: patient filters grouped by category (Pain, Rehab, Neuro Rehab...). */
export const GET = route(async () => ok(await getConditions()));
