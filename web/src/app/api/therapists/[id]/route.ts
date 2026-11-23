import { notFound, ok, route } from "@/lib/http";
import { getTherapistProfile } from "@/services/therapists";

export const dynamic = "force-dynamic";

/** GET /api/therapists/:id : public profile (no phone, no CNIC). 404 if not listed. */
export const GET = route(async (_req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const profile = await getTherapistProfile(id);
  if (!profile) throw notFound("Therapist");
  return ok(profile);
});
