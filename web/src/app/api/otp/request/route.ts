import type { NextRequest } from "next/server";
import { ok, parseJson, route, toErrorResponse } from "@/lib/http";
import { getClientIp, getDevice, hashIp, setDeviceCookie } from "@/lib/identity";
import { otpRequestSchema, requestOtp } from "@/services/otp";

export const dynamic = "force-dynamic";

/** POST /api/otp/request {phone} : sends a 6 digit code. In local development the code is also returned as devCode. */
export const POST = route(async (req: NextRequest) => {
  const device = getDevice(req);
  const ip = getClientIp(req);
  let res;
  try {
    const { phone } = await parseJson(req, otpRequestSchema);
    res = ok(await requestOtp(phone, { deviceId: device.id, ipHash: ip ? hashIp(ip) : null }));
  } catch (e) {
    res = toErrorResponse(e);
  }
  if (device.isNew) setDeviceCookie(res, device.id);
  return res;
});
