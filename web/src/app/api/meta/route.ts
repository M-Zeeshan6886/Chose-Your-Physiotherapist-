import { getConfig } from "@/lib/config";
import { ok, route } from "@/lib/http";

export const dynamic = "force-dynamic";

/** GET /api/meta: public settings the website needs (business name, limits shown to users). */
export const GET = route(async () => {
  const c = getConfig();
  return ok({
    appName: c.APP_NAME,
    contactDailyLimit: c.CONTACT_DAILY_LIMIT,
    otpRequiredFromContact: c.OTP_REQUIRED_FROM_CONTACT,
  });
});
