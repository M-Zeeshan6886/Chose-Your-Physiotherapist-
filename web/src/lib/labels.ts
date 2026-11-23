export const MODE_LABEL: Record<string, string> = {
  home_visit: "Home visit",
  clinic_visit: "Clinic visit",
  online: "Online",
};

export function feeText(min: number | null, max: number | null): string {
  const f = (n: number) => n.toLocaleString("en-PK");
  if (min == null && max == null) return "Fee: ask therapist";
  if (min != null && max != null && min !== max) return `Rs ${f(min)} – ${f(max)} per session`;
  return `Rs ${f((min ?? max) as number)} per session`;
}

export function responseText(avg: number | null): string {
  if (avg == null) return "New: no reply data yet";
  if (avg < 60) return `Usually replies in about ${avg} min`;
  return `Usually replies in about ${Math.round(avg / 60)} h`;
}
