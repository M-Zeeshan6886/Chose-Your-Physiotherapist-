import { z } from "zod";
import { query } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { AppError, notFound } from "@/lib/http";
import { normalizePkPhone } from "@/lib/phone";

export const contactSchema = z.object({
  therapistId: z.string().uuid(),
  inquiryId: z.string().uuid().optional(),
  channel: z.enum(["whatsapp", "call"]).default("whatsapp"),
});
export type ContactInput = z.infer<typeof contactSchema>;
export type Who = { deviceId: string; ipHash: string | null; verifiedPhone: string | null };

/**
 * The patient taps WhatsApp / Call. Order of rules:
 *  1. 5 contacts per 24h (device OR ip OR phone)   -> 429 daily_limit
 *  2. phone OTP needed from the 3rd contact        -> 403 otp_required
 *  3. SQL function register_contact_click does the billing (click used, duplicates, delisting)
 * The therapist's number is revealed ONLY after this succeeds.
 */
export async function contactTherapist(input: ContactInput, who: Who) {
  const c = getConfig();
  const [cnt] = await query<{ n: number }>("SELECT recent_contact_count($1, $2, $3) AS n", [
    who.deviceId, who.ipHash, who.verifiedPhone,
  ]);
  const used = cnt?.n ?? 0;

  if (used < c.CONTACT_DAILY_LIMIT && used >= c.OTP_REQUIRED_FROM_CONTACT - 1 && !who.verifiedPhone) {
    throw new AppError(403, "otp_required", "Please verify your phone number to continue.", {
      contactsToday: used, dailyLimit: c.CONTACT_DAILY_LIMIT,
    });
  }

  const [res] = await query<{ o_contact_id: string; o_allowed: boolean; o_reason: string | null }>(
    "SELECT * FROM register_contact_click($1, $2, $3, $4, $5, $6, $7)",
    [input.therapistId, input.inquiryId ?? null, input.channel, who.deviceId, who.ipHash, who.verifiedPhone, c.CONTACT_DAILY_LIMIT],
  );
  if (!res) throw new AppError(500, "internal_error", "Something went wrong");
  if (!res.o_allowed) {
    throw new AppError(429, "daily_limit", `You can contact up to ${c.CONTACT_DAILY_LIMIT} physiotherapists per day. Please try again tomorrow.`, {
      contactsToday: used, dailyLimit: c.CONTACT_DAILY_LIMIT,
    });
  }

  const [t] = await query<{ full_name: string; whatsapp_number: string | null; active_phone: string }>(
    "SELECT full_name, whatsapp_number, active_phone FROM therapist_profiles WHERE id = $1",
    [input.therapistId],
  );
  if (!t) throw notFound("Therapist");

  let condition: string | null = null;
  if (input.inquiryId) {
    const [q] = await query<{ name: string | null }>(
      "SELECT d.name FROM patient_inquiries i LEFT JOIN conditions d ON d.id = i.condition_id WHERE i.id = $1",
      [input.inquiryId],
    );
    condition = q?.name ?? null;
  }

  let url: string;
  if (input.channel === "call") {
    const phone = normalizePkPhone(t.active_phone) ?? t.active_phone.replace(/\D/g, "");
    url = `tel:+${phone}`;
  } else {
    const number = normalizePkPhone(t.whatsapp_number ?? t.active_phone) ?? (t.whatsapp_number ?? t.active_phone).replace(/\D/g, "");
    const msg = `Hello ${t.full_name}, I found your profile on ${c.APP_NAME}.${condition ? ` I need physiotherapy for ${condition}.` : ""} Are you available?`;
    url = `https://wa.me/${number}?text=${encodeURIComponent(msg)}`;
  }
  return { contactId: res.o_contact_id, channel: input.channel, url, contactsToday: used + 1, dailyLimit: c.CONTACT_DAILY_LIMIT };
}
