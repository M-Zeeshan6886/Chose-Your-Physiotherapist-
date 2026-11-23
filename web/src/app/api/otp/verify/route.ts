import { ok, parseJson, route } from "@/lib/http";
import { setPhoneCookie } from "@/lib/identity";
import { otpVerifySchema, verifyOtp } from "@/services/otp";

export const dynamic = "force-dynamic";

/** POST /api/otp/verify {phone, code} : on success the browser keeps a signed "phone verified" cookie for 30 days. */
export const POST = route(async (req) => {
  const { phone, code } = await parseJson(req, otpVerifySchema);
  const verified = await verifyOtp(phone, code);
  const res = ok({ verified: true, phone: verified });
  setPhoneCookie(res, verified);
  return res;
});
