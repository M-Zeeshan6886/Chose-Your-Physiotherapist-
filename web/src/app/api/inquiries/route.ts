import { ok, parseJson, route } from "@/lib/http";
import { createInquiry, inquirySchema } from "@/services/inquiries";

export const dynamic = "force-dynamic";

/** POST /api/inquiries : save what the visitor searched (guests allowed). */
export const POST = route(async (req) => {
  const inquiryId = await createInquiry(await parseJson(req, inquirySchema));
  return ok({ inquiryId }, { status: 201 });
});
