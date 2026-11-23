import { z } from "zod";
import { query } from "@/lib/db";
import { notFound } from "@/lib/http";

const slug = z.string().regex(/^[a-z0-9-]{1,60}$/);
const text = (max: number) => z.string().trim().max(max);

export const inquirySchema = z.object({
  city: slug,
  area: slug.optional(),
  condition: slug.optional(),
  mode: z.enum(["home_visit", "clinic_visit", "online"]).optional(),
  budgetMax: z.number().int().min(0).max(1_000_000).optional(),
  utmSource: text(100).optional(),
  utmCampaign: text(100).optional(),
});
export type InquiryInput = z.infer<typeof inquirySchema>;

/** Saves what a visitor searched for (guests allowed). Returns the inquiry id. */
export async function createInquiry(input: InquiryInput): Promise<string> {
  const rows = await query<{ id: string }>(
    `INSERT INTO patient_inquiries (city_id, area_id, condition_id, service_mode, budget_max, utm_source, utm_campaign)
     SELECT c.id,
            (SELECT a.id FROM areas a WHERE a.city_id = c.id AND a.slug = $2),
            (SELECT d.id FROM conditions d WHERE d.slug = $3),
            $4, $5, $6, $7
       FROM cities c WHERE c.slug = $1 AND c.is_active
     RETURNING id`,
    [input.city, input.area ?? null, input.condition ?? null, input.mode ?? null,
     input.budgetMax ?? null, input.utmSource ?? null, input.utmCampaign ?? null],
  );
  const id = rows[0]?.id;
  if (!id) throw notFound("City");
  return id;
}
