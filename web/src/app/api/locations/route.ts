import { ok, route } from "@/lib/http";
import { getLocations } from "@/services/locations";

export const dynamic = "force-dynamic";

/** GET /api/locations: active cities with their areas (for the city and area popup). */
export const GET = route(async () => ok(await getLocations()));
