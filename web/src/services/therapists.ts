import { z } from "zod";
import { query } from "@/lib/db";

/**
 * PUBLIC therapist data. Deliberately NEVER selects: cnic, whatsapp_number, active_phone, user_id,
 * documents. The WhatsApp number is only revealed by the contact flow (which also bills the click).
 * Payment never changes ranking: sorting uses verification, response time, experience, fee or rating only.
 */
export const SORTS = ["recommended", "experience", "fee_low", "response", "rating"] as const;
const ORDER: Record<(typeof SORTS)[number], string> = {
  recommended:
    "t.registration_verified DESC, t.experience_verified DESC, t.avg_response_minutes ASC NULLS LAST, t.experience_years DESC NULLS LAST, t.id",
  experience: "t.experience_years DESC NULLS LAST, t.id",
  fee_low: "t.fee_min ASC NULLS LAST, t.id",
  response: "t.avg_response_minutes ASC NULLS LAST, t.id",
  rating: "r.avg_rating DESC NULLS LAST, r.review_count DESC NULLS LAST, t.id",
};

const slug = z.string().regex(/^[a-z0-9-]{1,60}$/);
export const searchSchema = z.object({
  city: slug.optional(),
  area: slug.optional(),
  condition: slug.optional(),
  mode: z.enum(["home_visit", "clinic_visit", "online"]).optional(),
  budget: z.coerce.number().int().min(0).max(1_000_000).optional(),
  sort: z.enum(SORTS).default("recommended"),
  page: z.coerce.number().int().min(1).max(500).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});
export type SearchParams = z.infer<typeof searchSchema>;

export type TherapistCard = {
  id: string;
  fullName: string;
  gender: string | null;
  qualification: string | null;
  experienceYears: number | null;
  headline: string | null;
  specialties: string[];
  serviceModes: string[];
  feeMin: number | null;
  feeMax: number | null;
  registrationVerified: boolean;
  experienceVerified: boolean;
  avgResponseMinutes: number | null;
  responseRatePct: number | null;
  avgRating: number | null;
  reviewCount: number;
  areas: string[];
  conditions: string[];
};

type CardRow = {
  id: string; full_name: string; gender: string | null; qualification: string | null;
  experience_years: number | null; headline: string | null; specialties: string[]; service_modes: string[];
  fee_min: number | null; fee_max: number | null; registration_verified: boolean; experience_verified: boolean;
  avg_response_minutes: number | null; response_rate_pct: number | null;
  avg_rating: string | null; review_count: number | null; areas: string[]; conditions: string[]; total?: string;
};

const CARD_COLUMNS = `
  t.id, t.full_name, t.gender, t.qualification, t.experience_years, t.headline, t.specialties, t.service_modes,
  t.fee_min, t.fee_max, t.registration_verified, t.experience_verified, t.avg_response_minutes, t.response_rate_pct,
  r.avg_rating, r.review_count,
  COALESCE((SELECT array_agg(a.name ORDER BY a.name) FROM therapist_service_areas sa
             JOIN areas a ON a.id = sa.area_id WHERE sa.therapist_id = t.id), '{}') AS areas,
  COALESCE((SELECT array_agg(c.name ORDER BY c.name) FROM therapist_conditions tc
             JOIN conditions c ON c.id = tc.condition_id WHERE tc.therapist_id = t.id), '{}') AS conditions`;

function toCard(r: CardRow): TherapistCard {
  return {
    id: r.id,
    fullName: r.full_name,
    gender: r.gender,
    qualification: r.qualification,
    experienceYears: r.experience_years,
    headline: r.headline,
    specialties: r.specialties,
    serviceModes: r.service_modes,
    feeMin: r.fee_min,
    feeMax: r.fee_max,
    registrationVerified: r.registration_verified,
    experienceVerified: r.experience_verified,
    avgResponseMinutes: r.avg_response_minutes,
    responseRatePct: r.response_rate_pct,
    avgRating: r.avg_rating === null ? null : Number(r.avg_rating),
    reviewCount: r.review_count ?? 0,
    areas: r.areas,
    conditions: r.conditions,
  };
}

export async function searchTherapists(p: SearchParams) {
  const offset = (p.page - 1) * p.limit;
  const rows = await query<CardRow>(
    `SELECT ${CARD_COLUMNS}, count(*) OVER()::text AS total
       FROM therapist_profiles t
       LEFT JOIN v_therapist_rating r ON r.therapist_id = t.id
      WHERE t.is_listed AND t.deleted_at IS NULL
        AND ($1::text IS NULL OR EXISTS (
              SELECT 1 FROM cities c WHERE c.slug = $1 AND (
                t.city_id = c.id OR EXISTS (SELECT 1 FROM therapist_service_areas sa
                  JOIN areas a ON a.id = sa.area_id WHERE sa.therapist_id = t.id AND a.city_id = c.id))))
        AND ($2::text IS NULL OR $4::text = 'online' OR EXISTS (
              SELECT 1 FROM therapist_service_areas sa JOIN areas a ON a.id = sa.area_id
               WHERE sa.therapist_id = t.id AND a.slug = $2))
        AND ($3::text IS NULL OR EXISTS (
              SELECT 1 FROM therapist_conditions tc JOIN conditions c ON c.id = tc.condition_id
               WHERE tc.therapist_id = t.id AND c.slug = $3))
        AND ($4::text IS NULL OR $4 = ANY(t.service_modes))
        AND ($5::int IS NULL OR t.fee_min IS NULL OR t.fee_min <= $5)
      ORDER BY ${ORDER[p.sort]}
      LIMIT $6 OFFSET $7`,
    [p.city ?? null, p.area ?? null, p.condition ?? null, p.mode ?? null, p.budget ?? null, p.limit, offset],
  );
  const total = rows[0]?.total ? Number(rows[0].total) : 0;
  return { total, page: p.page, limit: p.limit, pages: Math.max(1, Math.ceil(total / p.limit)), items: rows.map(toCard) };
}

export type TherapistProfile = TherapistCard & {
  portfolio: string | null;
  clinicAddress: string | null;
  availability: Record<string, string[]>;
  reviews: { rating: number; comment: string | null; createdAt: string }[];
};

export const uuidSchema = z.string().uuid();

export async function getTherapistProfile(id: string): Promise<TherapistProfile | null> {
  if (!uuidSchema.safeParse(id).success) return null;
  const rows = await query<CardRow & { portfolio: string | null; clinic_address: string | null; availability: Record<string, string[]> }>(
    `SELECT ${CARD_COLUMNS}, t.portfolio, t.clinic_address, t.availability
       FROM therapist_profiles t
       LEFT JOIN v_therapist_rating r ON r.therapist_id = t.id
      WHERE t.id = $1 AND t.is_listed AND t.deleted_at IS NULL`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  const reviews = await query<{ rating: number; comment: string | null; created_at: Date }>(
    `SELECT rating, comment, created_at FROM reviews WHERE therapist_id = $1 AND is_visible
      ORDER BY created_at DESC LIMIT 10`,
    [id],
  );
  return {
    ...toCard(row),
    portfolio: row.portfolio,
    clinicAddress: row.clinic_address,
    availability: row.availability ?? {},
    reviews: reviews.map((r) => ({ rating: r.rating, comment: r.comment, createdAt: r.created_at.toISOString() })),
  };
}
