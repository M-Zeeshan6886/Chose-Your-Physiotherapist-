import { z } from "zod";
import { query } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { AppError } from "@/lib/http";
import { normalizePkPhone } from "@/lib/phone";
import { hashOtp, safeEqual } from "@/lib/identity";
import { sendOtp } from "@/lib/otp-provider";
import crypto from "node:crypto";

export const otpRequestSchema = z.object({ phone: z.string().min(8).max(20) });
export const otpVerifySchema = z.object({ phone: z.string().min(8).max(20), code: z.string().regex(/^\d{6}$/, "Code must be 6 digits") });

const OTP_TTL_MIN = 5;
const MAX_ATTEMPTS = 5;
const PER_PHONE_PER_HOUR = 3;
const PER_DEVICE_PER_HOUR = 5;
const PER_IP_PER_HOUR = 10;

function phoneOrThrow(raw: string): string {
  const phone = normalizePkPhone(raw);
  if (!phone) throw new AppError(400, "invalid_phone", "Enter a valid Pakistani mobile number, for example 0300 1234567");
  return phone;
}

export async function requestOtp(rawPhone: string, who: { deviceId: string; ipHash: string | null }) {
  const phone = phoneOrThrow(rawPhone);
  const [counts] = await query<{ p: number; d: number; i: number }>(
    `SELECT count(*) FILTER (WHERE phone = $1)::int AS p,
            count(*) FILTER (WHERE device_id = $2)::int AS d,
            count(*) FILTER (WHERE $3::text IS NOT NULL AND ip_hash = $3)::int AS i
       FROM otp_codes WHERE created_at > now() - interval '1 hour'`,
    [phone, who.deviceId, who.ipHash],
  );
  if (counts && (counts.p >= PER_PHONE_PER_HOUR || counts.d >= PER_DEVICE_PER_HOUR || counts.i >= PER_IP_PER_HOUR)) {
    throw new AppError(429, "otp_rate_limited", "Too many codes requested. Please try again in an hour.");
  }
  const code = String(crypto.randomInt(100000, 1000000));
  await query(
    `INSERT INTO otp_codes (phone, code_hash, device_id, ip_hash, expires_at)
     VALUES ($1, $2, $3, $4, now() + make_interval(mins => $5))`,
    [phone, hashOtp(phone, code), who.deviceId, who.ipHash, OTP_TTL_MIN],
  );
  await sendOtp(phone, code);
  const c = getConfig();
  return {
    phone,
    expiresInSeconds: OTP_TTL_MIN * 60,
    // ONLY for local testing with the console provider; never sent in production
    ...(c.APP_ENV === "local" && c.OTP_PROVIDER === "console" ? { devCode: code } : {}),
  };
}

/** Returns the normalised phone when the code is right. */
export async function verifyOtp(rawPhone: string, code: string): Promise<string> {
  const phone = phoneOrThrow(rawPhone);
  const rows = await query<{ id: string; code_hash: string; attempts: number }>(
    `SELECT id, code_hash, attempts FROM otp_codes
      WHERE phone = $1 AND verified_at IS NULL AND expires_at > now()
      ORDER BY created_at DESC LIMIT 1`,
    [phone],
  );
  const row = rows[0];
  if (!row) throw new AppError(400, "otp_invalid", "Code expired or not requested. Please request a new code.");
  if (row.attempts >= MAX_ATTEMPTS) {
    throw new AppError(429, "otp_locked", "Too many wrong attempts. Please request a new code.");
  }
  if (!safeEqual(row.code_hash, hashOtp(phone, code))) {
    await query("UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1", [row.id]);
    const left = MAX_ATTEMPTS - row.attempts - 1;
    throw new AppError(400, "otp_invalid", `Wrong code. ${left} attempt${left === 1 ? "" : "s"} left.`);
  }
  await query("UPDATE otp_codes SET verified_at = now() WHERE id = $1", [row.id]);
  return phone;
}
