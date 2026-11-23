import { ok, parseQuery, route } from "@/lib/http";
import { searchSchema, searchTherapists } from "@/services/therapists";

export const dynamic = "force-dynamic";

/** GET /api/therapists?city=lahore&area=dha&condition=back-pain&mode=home_visit&budget=3000&sort=recommended&page=1 */
export const GET = route(async (req) => ok(await searchTherapists(parseQuery(req, searchSchema))));
