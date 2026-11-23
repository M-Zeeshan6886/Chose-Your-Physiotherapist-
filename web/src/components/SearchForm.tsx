"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { recordInquiry, saveLocation } from "@/lib/client";
import type { City, ConditionGroup } from "@/services/locations";

type Props = {
  cities: City[];
  groups: ConditionGroup[];
  initial?: { city?: string; area?: string; condition?: string; mode?: string; budget?: string };
};

export default function SearchForm({ cities, groups, initial = {} }: Props) {
  const router = useRouter();
  const [city, setCity] = useState(initial.city ?? cities[0]?.slug ?? "");
  const [area, setArea] = useState(initial.area ?? "");
  const [condition, setCondition] = useState(initial.condition ?? "");
  const [mode, setMode] = useState(initial.mode ?? "");
  const [budget, setBudget] = useState(initial.budget ?? "");
  const [busy, setBusy] = useState(false);
  const areas = cities.find((c) => c.slug === city)?.areas ?? [];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const state = { city, area, condition, mode, budget };
    saveLocation(city, area);
    await recordInquiry(state);
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(state)) if (v) q.set(k, v);
    router.push(`/therapists?${q.toString()}`);
  }

  return (
    <form className="panel" onSubmit={submit} aria-label="Find a physiotherapist">
      <div className="form-grid">
        <div>
          <label htmlFor="city">City</label>
          <select id="city" value={city} onChange={(e) => { setCity(e.target.value); setArea(""); }} required>
            {cities.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="area">Area</label>
          <select id="area" value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="">Any area</option>
            {areas.map((a) => <option key={a.slug} value={a.slug}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="condition">Condition</label>
          <select id="condition" value={condition} onChange={(e) => setCondition(e.target.value)}>
            <option value="">Any condition</option>
            {groups.map((g) => (
              <optgroup key={g.category} label={g.category}>
                {g.items.map((i) => <option key={i.slug} value={i.slug}>{i.name}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="mode">Service</label>
          <select id="mode" value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="">Any service</option>
            <option value="home_visit">Home visit</option>
            <option value="clinic_visit">Clinic visit</option>
            <option value="online">Online consultation</option>
          </select>
        </div>
        <div>
          <label htmlFor="budget">Max fee per session (Rs)</label>
          <input id="budget" type="number" inputMode="numeric" min={0} step={100} placeholder="e.g. 3000" value={budget} onChange={(e) => setBudget(e.target.value)} />
        </div>
        <button className="btn" type="submit" disabled={busy}>{busy ? "Searching…" : "Find physiotherapists"}</button>
      </div>
    </form>
  );
}
