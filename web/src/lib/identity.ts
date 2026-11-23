import crypto from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { getConfig } from "./config";

/**
 * Who is this visitor? Three signals, any ONE match counts as the same person:
 *   device  : long-lived random id in an httpOnly cookie
 *   ip      : stored only as a keyed hash (and ignored when unknown, so unknown never matches everyone)
 *   phone   : set only after a successful OTP (signed cookie)
 */
export const DEVICE_COOKIE = "cyd_device";
export const PHONE_COOKIE = "cyd_pv";
const ONE_YEAR = 60 * 60 * 24 * 365;
const PHONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function hmac(data: string): string {
  return crypto.createHmac("sha256", getConfig().SESSION_SECRET).update(data).digest("hex");
}

export function hashIp(ip: string): string {
  return hmac("ip:" + ip);
}

export function hashOtp(phone: string, code: string): string {
  return hmac(`otp:${phone}:${code}`);
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** Returns the client IP only when a proxy told us; otherwise null (never a shared "unknown" value). */
export function getClientIp(req: NextRequest): string | null {
  const xff = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return xff || req.headers.get("x-real-ip") || null;
}

export function getDevice(req: NextRequest): { id: string; isNew: boolean } {
  const existing = req.cookies.get(DEVICE_COOKIE)?.value;
  if (existing && /^[0-9a-f-]{36}$/.test(existing)) return { id: existing, isNew: false };
  return { id: crypto.randomUUID(), isNew: true };
}

export function setDeviceCookie(res: NextResponse, id: string): void {
  res.cookies.set(DEVICE_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: getConfig().APP_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR,
  });
}

export function signPhoneToken(phone: string, now = Date.now()): string {
  const payload = `${phone}.${now + PHONE_TTL_MS}`;
  return `${payload}.${hmac("pv:" + payload)}`;
}

/** Returns the verified phone from the cookie value, or null if missing, tampered or expired. */
export function readVerifiedPhone(token: string | undefined, now = Date.now()): string | null {
  if (!token) return null;
  const [phone, exp, sig] = token.split(".");
  if (!phone || !exp || !sig) return null;
  if (!safeEqual(sig, hmac(`pv:${phone}.${exp}`))) return null;
  if (Number(exp) < now) return null;
  return phone;
}

export function setPhoneCookie(res: NextResponse, phone: string): void {
  res.cookies.set(PHONE_COOKIE, signPhoneToken(phone), {
    httpOnly: true,
    sameSite: "lax",
    secure: getConfig().APP_ENV === "production",
    path: "/",
    maxAge: PHONE_TTL_MS / 1000,
  });
}
