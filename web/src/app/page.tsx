import Link from "next/link";
import LocationPopup from "@/components/LocationPopup";
import SearchForm from "@/components/SearchForm";
import { getAppName } from "@/lib/config";
import { getConditions, getLocations } from "@/services/locations";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [cities, groups] = await Promise.all([getLocations(), getConditions()]);
  const popular = groups.flatMap((g) => g.items).filter((i) => ["back-pain", "neck-pain", "knee-oa", "stroke", "frozen-shoulder", "sciatica", "post-op", "pediatric-physio"].includes(i.slug));
  return (
    <>
      <LocationPopup cities={cities} />
      <section className="hero">
        <h1>Your care. Your choice.</h1>
        <p className="lead">
          Find a physiotherapist near you, check their credentials, compare experience and fees, then contact the one
          you prefer directly on WhatsApp. No call centre. No assigned therapist. Free for patients.
        </p>
        <div className="trust">
          <span>Verified credentials</span><span>Direct WhatsApp contact</span><span>No commission</span><span>Free for patients</span>
        </div>
        <div className="hero-search"><SearchForm cities={cities} groups={groups} /></div>
      </section>

      <section style={{ marginTop: 32 }}>
        <h2>Browse by condition</h2>
        <div className="chips">
          {popular.map((c) => <Link key={c.slug} className="chip" href={`/therapists?condition=${c.slug}`}>{c.name}</Link>)}
          <Link className="chip" href="/therapists">All physiotherapists</Link>
        </div>
      </section>

      <section style={{ marginTop: 32 }}>
        <h2>How {getAppName()} works</h2>
        <div className="steps">
          <div className="panel step"><b className="n">1</b><b>Search</b><p className="muted">Pick your city, area and condition.</p></div>
          <div className="panel step"><b className="n">2</b><b>Compare</b><p className="muted">See qualifications, verified badges, experience, fees and reply time.</p></div>
          <div className="panel step"><b className="n">3</b><b>Choose</b><p className="muted">Tap WhatsApp and agree the visit and fee directly with the therapist.</p></div>
        </div>
      </section>
    </>
  );
}
