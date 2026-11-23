import Link from "next/link";

export default function NotFound() {
  return (
    <section className="empty" style={{ marginTop: 60 }}>
      <h1 style={{ fontSize: "2rem" }}>Page not found</h1>
      <p className="muted">This page or physiotherapist is not available.</p>
      <Link className="btn" href="/therapists">Find a physiotherapist</Link>
    </section>
  );
}
