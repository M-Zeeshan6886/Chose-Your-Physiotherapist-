import Link from "next/link";
import type { TherapistCard as T } from "@/services/therapists";
import { MODE_LABEL, feeText, responseText } from "@/lib/labels";
import ContactButtons from "./ContactButtons";

export function VerifiedBadges({ t }: { t: Pick<T, "registrationVerified" | "experienceVerified"> }) {
  return (
    <span className="row" style={{ gap: 6 }}>
      {t.registrationVerified ? <span className="badge">✓ Registration verified</span> : <span className="badge warn">Registration not verified</span>}
      {t.experienceVerified ? <span className="badge">✓ Experience verified</span> : <span className="badge warn">Experience self-reported</span>}
    </span>
  );
}

export default function TherapistCard({ t }: { t: T }) {
  return (
    <article className="panel card">
      <div className="top">
        <div>
          <h3><Link href={`/therapists/${t.id}`}>{t.fullName}</Link></h3>
          <div className="muted">{t.qualification}{t.headline ? ` · ${t.headline}` : ""}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <b>{feeText(t.feeMin, t.feeMax)}</b>
          <div className="muted small">{t.avgRating ? `★ ${t.avgRating.toFixed(1)} (${t.reviewCount} reviews)` : "No reviews yet"}</div>
        </div>
      </div>
      <VerifiedBadges t={t} />
      <div className="meta">
        <span><b>{t.experienceYears ?? "?"}</b> years experience</span>
        <span>{t.serviceModes.map((m) => MODE_LABEL[m] ?? m).join(" · ")}</span>
        <span>{responseText(t.avgResponseMinutes)}</span>
      </div>
      <div className="muted small">Covers: {t.areas.slice(0, 5).join(", ")}{t.areas.length > 5 ? ` +${t.areas.length - 5} more` : ""}</div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <ContactButtons therapistId={t.id} compact />
        <Link className="btn secondary small" href={`/therapists/${t.id}`}>View profile</Link>
      </div>
    </article>
  );
}
