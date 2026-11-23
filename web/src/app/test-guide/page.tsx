import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Test guide" };

export default function TestGuide() {
  return (
    <section style={{ marginTop: 24 }}>
      <h1 style={{ fontSize: "1.8rem" }}>Team test guide</h1>
      <p className="muted">This build uses demo data (fake therapists, fake phone numbers). WhatsApp links open to numbers that do not exist, which is expected.</p>
      <div className="list">
        <div className="panel"><h3>1. Search and filters</h3><ul className="tight">
          <li>Home page: the city and area popup appears on the first visit. Pick DHA.</li>
          <li>Filter by condition (Back Pain), service (Online), and a maximum fee. Try the sort buttons.</li>
          <li>Check “Test Pending (Demo)” never appears anywhere.</li>
        </ul></div>
        <div className="panel"><h3>2. Contact and the daily limit</h3><ul className="tight">
          <li>Tap WhatsApp on 2 different therapists: both open.</li>
          <li>The 3rd contact asks for a phone check. Enter any number like 0300 5551234. In test mode the code is shown on screen.</li>
          <li>You can contact 5 therapists per day. The 6th shows the daily limit message.</li>
          <li>Open a private window (new device): without the phone check you start again, but the same verified phone still counts.</li>
        </ul></div>
        <div className="panel"><h3>3. Running out of clicks</h3><ul className="tight">
          <li>Open <Link href="/therapists?area=dha&condition=knee-oa">search results</Link> and find “Test Low Clicks (Demo)”. It has only 3 clicks.</li>
          <li>After 3 different people contact it, it disappears from search and its profile shows “not found”.</li>
        </ul></div>
        <div className="panel"><h3>4. Pages and errors</h3><ul className="tight">
          <li>Open a profile, check reviews, availability and verified badges.</li>
          <li>Visit <Link href="/therapists/00000000-0000-0000-0000-000000000000">a missing profile</Link>: a friendly page appears.</li>
          <li>Check on a phone: everything should fit without sideways scrolling.</li>
        </ul></div>
        <div className="panel"><h3>Not built yet</h3><p className="muted">Therapist registration and dashboard, admin panel, payments, review links. These come in later sessions.</p></div>
      </div>
    </section>
  );
}
