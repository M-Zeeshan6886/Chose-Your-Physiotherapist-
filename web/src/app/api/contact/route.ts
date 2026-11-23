import type { NextRequest } from "next/server";
import { ok, parseJson, route, toErrorResponse } from "@/lib/http";
import { PHONE_COOKIE, getClientIp, getDevice, hashIp, readVerifiedPhone, setDeviceCookie } from "@/lib/identity";
import { contactSchema, contactTherapist } from "@/services/contact";

export const dynamic = "force-dynamic";

/** POST /api/contact : patient taps WhatsApp or Call. Applies the daily limit, the OTP gate and billing. */
export const POST = route(async (req: NextRequest) => {
  const device = getDevice(req);
  const ip = getClientIp(req);
  let res;
  try {
    const input = await parseJson(req, contactSchema);
    const data = await contactTherapist(input, {
      deviceId: device.id,
      ipHash: ip ? hashIp(ip) : null,
      verifiedPhone: readVerifiedPhone(req.cookies.get(PHONE_COOKIE)?.value),
    });
    res = ok(data);
  } catch (e) {
    res = toErrorResponse(e);
  }
  if (device.isNew) setDeviceCookie(res, device.id); // set even on errors, so the limit cannot be dodged by a missing cookie
  return res;
});
