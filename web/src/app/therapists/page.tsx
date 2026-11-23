import type { Metadata } from "next";
import Link from "next/link";
import SearchForm from "@/components/SearchForm";
import TherapistCard from "@/components/TherapistCard";
import { getConditions, getLocations } from "@/services/locations";
import { SORTS, searchSchema, searchTherapists } from "@/services/therapists";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Find a physiotherapist" };

type SP = Promise<Record<string, string | string[] | undefined>>;
const SORT_LABEL: Record<(typeof SORTS)[number], string> = {
  recommended: "Recommended", experience: "Most experienced", fee_low: "Lowest fee", response: "Fastest reply", rating: "Best rated",
};

export default async function Therapists({ searchParams }: { searchParams: SP }) {
  const raw = await searchParams;
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) { const s = Array.isArray(v) ? v[0] : v; if (s) flat[k] = s; }
  const parsed = searchSchema.safeParse(flat);
  const params = parsed.success ? parsed.data : searchSchema.parse({});

  const [cities, groups, result] = await Promise.all([getLocations(), getConditions(), searchTherapists(params)]);

  const link = (over: Record<string, string | number | undefined>) => {
    const q = new URLSearchParams();
    const base = { city: params.city, area: params.area, condition: params.condition, mode: params.mode, budget: params.budget, sort: params.sort, page: params.page, ...over };
    for (const [k, v] of Object.entries(base)) if (v !== undefined && v !== "") q.set(k, String(v));
    return `/therapists?${q.toString()}`;
  };

  return (
    <>
      <h1 style={{ fontSize: "1.8rem", marginTop: 24 }}>Physiotherapists</h1>
      <SearchForm
        cities={cities}
        groups={groups}
        initial={{ city: params.city, area: params.area, condition: params.condition, mode: params.mode, budget: params.budget?.toString() }}
      />
      <div className="toolbar">
        <span className="muted">{result.total} physiotherapist{result.total === 1 ? "" : "s"} found</span>
        <span className="row small">
          Sort:
          {SORTS.map((s) => (
            <Link key={s} href={link({ sort: s, page: 1 })} className="chip" style={s === params.sort ? undefined : { background: "transparent", border: "1px solid var(--line)" }}>
              {SORT_LABEL[s]}
            </Link>
          ))}
        </span>
      </div>
      <p className="muted small">Order never depends on payment. “Recommended” favours verified credentials, quick replies and experience.</p>

      {result.items.length === 0 ? (
        <div className="panel empty">
          <h3>No physiotherapists match yet</h3>
          <p className="muted">Try another area, remove the fee limit, or choose “Any condition”.</p>
          <Link className="btn" href="/therapists">Clear all filters</Link>
        </div>
      ) : (
        <div className="list">{result.items.map((t) => <TherapistCard key={t.id} t={t} />)}</div>
      )}

      {result.pages > 1 && (
        <div className="pager">
          {params.page > 1 ? <Link className="btn secondary" href={link({ page: params.page - 1 })}>← Previous</Link> : <span />}
          <span className="muted">Page {result.page} of {result.pages}</span>
          {params.page < result.pages ? <Link className="btn secondary" href={link({ page: params.page + 1 })}>Next →</Link> : <span />}
        </div>
      )}
    </>
  );
}
