import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ContactButtons from "@/components/ContactButtons";
import { VerifiedBadges } from "@/components/TherapistCard";
import { MODE_LABEL, feeText, responseText } from "@/lib/labels";
import { getTherapistProfile } from "@/services/therapists";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Ctx): Promise<Metadata> {
  const t = await getTherapistProfile((await params).id).catch(() => null);
  return { title: t ? `${t.fullName}, ${t.qualification ?? "Physiotherapist"}` : "Physiotherapist" };
}

const DAYS: [string, string][] = [["mon", "Monday"], ["tue", "Tuesday"], ["wed", "Wednesday"], ["thu", "Thursday"], ["fri", "Friday"], ["sat", "Saturday"], ["sun", "Sunday"]];

export default async function Profile({ params }: Ctx) {
  const t = await getTherapistProfile((await params).id);
  if (!t) notFound();
  const days = DAYS.filter(([k]) => t.availability[k]?.length);
  return (
    <>
      <p style={{ marginTop: 20 }}><Link href="/therapists">← Back to results</Link></p>
      <div className="profile">
        <div style={{ display: "grid", gap: 18 }}>
          <section className="panel">
            <h1 style={{ fontSize: "1.9rem" }}>{t.fullName}</h1>
            <div className="muted">{t.qualification}{t.headline ? ` · ${t.headline}` : ""}</div>
            <div style={{ marginTop: 10 }}><VerifiedBadges t={t} /></div>
            <div className="stat">
              <div><span>Experience</span><b>{t.experienceYears ?? "?"} years</b></div>
              <div><span>Fee</span><b>{feeText(t.feeMin, t.feeMax).replace(" per session", "")}</b></div>
              <div><span>Reply time</span><b>{t.avgResponseMinutes ? `~${t.avgResponseMinutes} min` : "New"}</b></div>
              <div><span>Rating</span><b>{t.avgRating ? `★ ${t.avgRating.toFixed(1)} (${t.reviewCount})` : "No reviews"}</b></div>
            </div>
            <p className="muted small">{responseText(t.avgResponseMinutes)}{t.responseRatePct != null ? ` · replies to ${t.responseRatePct}% of patients` : ""}</p>
          </section>

          {t.portfolio && <section className="panel"><h2>About</h2><p>{t.portfolio}</p></section>}

          <section className="panel">
            <h2>Treats</h2>
            <div className="chips">{t.conditions.map((c) => <span key={c} className="chip">{c}</span>)}</div>
            {t.specialties.length > 0 && <p className="muted" style={{ marginTop: 12 }}>Specialties: {t.specialties.join(", ")}</p>}
          </section>

          <section className="panel">
            <h2>Services and areas</h2>
            <p><b>{t.serviceModes.map((m) => MODE_LABEL[m] ?? m).join(" · ")}</b></p>
            <p className="muted">Visits: {t.areas.join(", ") || "not listed"}</p>
            {t.clinicAddress && <p className="muted">Clinic: {t.clinicAddress}</p>}
            {days.length > 0 && (
              <table className="av"><tbody>
                {days.map(([k, label]) => <tr key={k}><td>{label}</td><td>{t.availability[k]!.join(", ")}</td></tr>)}
              </tbody></table>
            )}
          </section>

          <section className="panel">
            <h2>Patient reviews</h2>
            {t.reviews.length === 0 && <p className="muted">No reviews yet.</p>}
            {t.reviews.map((r, i) => (
              <div key={i} className="review">
                <b>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</b>{" "}
                <span className="muted small">{new Date(r.createdAt).toLocaleDateString("en-GB")}</span>
                {r.comment && <div>{r.comment}</div>}
              </div>
            ))}
          </section>
        </div>

        <aside className="panel sticky">
          <h2>Contact {t.fullName.split(" ")[0]}</h2>
          <p className="muted small">Talk to the physiotherapist directly. Agree the visit time and fee between you. It is free for you.</p>
          <ContactButtons therapistId={t.id} />
          <p className="muted small" style={{ marginTop: 14 }}>You can contact up to 5 physiotherapists per day.</p>
        </aside>
      </div>
    </>
  );
}
