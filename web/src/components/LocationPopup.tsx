"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { captureUtm, readSavedLocation, recordInquiry, saveLocation } from "@/lib/client";
import type { City } from "@/services/locations";

/** The city and area popup shown to patients who arrive from an ad. Remembered after the first choice. */
export default function LocationPopup({ cities }: { cities: City[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [city, setCity] = useState(cities[0]?.slug ?? "");
  const [area, setArea] = useState("");
  const areas = cities.find((c) => c.slug === city)?.areas ?? [];

  useEffect(() => {
    captureUtm();
    const saved = readSavedLocation();
    if (!saved && !sessionStorage.getItem("cyd_skip")) setOpen(true);
  }, []);

  if (!open) return null;

  async function go() {
    saveLocation(city, area);
    await recordInquiry({ city, area });
    setOpen(false);
    router.push(`/therapists?city=${city}${area ? `&area=${area}` : ""}`);
  }
  function skip() {
    sessionStorage.setItem("cyd_skip", "1");
    setOpen(false);
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="loc-title">
      <div className="modal">
        <h2 id="loc-title">Where do you need a physiotherapist?</h2>
        <p className="muted">We will show physiotherapists who cover your area.</p>
        <label htmlFor="pc">City</label>
        <select id="pc" value={city} onChange={(e) => { setCity(e.target.value); setArea(""); }}>
          {cities.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </select>
        <div style={{ height: 10 }} />
        <label htmlFor="pa">Area</label>
        <select id="pa" value={area} onChange={(e) => setArea(e.target.value)}>
          <option value="">Select your area</option>
          {areas.map((a) => <option key={a.slug} value={a.slug}>{a.name}</option>)}
        </select>
        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn" onClick={go} disabled={!area}>Show physiotherapists</button>
          <button className="btn secondary" onClick={skip}>Skip</button>
        </div>
      </div>
    </div>
  );
}
