"use client";
/** Small browser helpers: remember the visitor's search and ad source, and save the inquiry. */

export type SearchState = { city?: string; area?: string; condition?: string; mode?: string; budget?: string };

export function captureUtm(): void {
  try {
    const q = new URLSearchParams(window.location.search);
    const source = q.get("utm_source");
    const campaign = q.get("utm_campaign");
    if (source || campaign) sessionStorage.setItem("cyd_utm", JSON.stringify({ source, campaign }));
  } catch {}
}

export function readSavedLocation(): { city: string; area: string } | null {
  try {
    const raw = localStorage.getItem("cyd_loc");
    return raw ? (JSON.parse(raw) as { city: string; area: string }) : null;
  } catch {
    return null;
  }
}

export function saveLocation(city: string, area: string): void {
  try {
    localStorage.setItem("cyd_loc", JSON.stringify({ city, area }));
  } catch {}
}

export function getInquiryId(): string | undefined {
  try {
    return sessionStorage.getItem("cyd_inq") ?? undefined;
  } catch {
    return undefined;
  }
}

/** Best effort: never blocks the patient if it fails. */
export async function recordInquiry(s: SearchState): Promise<void> {
  if (!s.city) return;
  try {
    const utm = JSON.parse(sessionStorage.getItem("cyd_utm") ?? "{}") as { source?: string; campaign?: string };
    const res = await fetch("/api/inquiries", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        city: s.city,
        area: s.area || undefined,
        condition: s.condition || undefined,
        mode: s.mode || undefined,
        budgetMax: s.budget ? Number(s.budget) : undefined,
        utmSource: utm.source || undefined,
        utmCampaign: utm.campaign || undefined,
      }),
    });
    const j = (await res.json()) as { ok: boolean; data?: { inquiryId: string } };
    if (j.ok && j.data) sessionStorage.setItem("cyd_inq", j.data.inquiryId);
  } catch {}
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string; details?: unknown } };

export async function postJson<T>(url: string, body: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return (await res.json()) as ApiResult<T>;
  } catch {
    return { ok: false, error: { code: "network", message: "Network problem. Please check your connection and try again." } };
  }
}
