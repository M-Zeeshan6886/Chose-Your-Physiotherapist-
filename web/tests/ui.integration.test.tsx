// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * FRONTEND + BACKEND together, against the real database.
 * React components run in a simulated browser; every fetch() goes to the REAL route handlers
 * through a cookie jar that behaves like a browser. Needs DATABASE_URL.
 */
const url = process.env.DATABASE_URL;
const d = url ? describe : describe.skip;

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));

d("website components talking to the real API", () => {
  let db: Client;
  const ids: string[] = [];
  const jar = new Map<string, string>();
  const handlers: Record<string, any> = {};
  const openSpy = vi.fn();
  let lastBodies: Record<string, any> = {};

  // A browser-like fetch: sends stored cookies, stores Set-Cookie, calls the real route handler.
  async function browserFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const { NextRequest } = await import("next/server");
    const u = new URL(typeof input === "string" ? input : input.toString(), "http://localhost");
    const headers = new Headers(init?.headers);
    if (jar.size) headers.set("cookie", [...jar].map(([k, v]) => `${k}=${v}`).join("; "));
    headers.set("x-forwarded-for", "10.200.0.1");
    const body = init?.body ? String(init.body) : undefined;
    if (body) lastBodies[u.pathname] = JSON.parse(body);
    const req = new NextRequest(u, { method: init?.method ?? "GET", headers, body });
    const handler = handlers[u.pathname];
    if (!handler) throw new Error("No API route for " + u.pathname + " (frontend calls a URL that does not exist)");
    const res: Response = await handler(req, { params: Promise.resolve({}) });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const [k, ...v] = pair!.split("=");
      jar.set(k!, v.join("="));
    }
    return res;
  }

  async function makeTherapist(name: string) {
    const u = await db.query("INSERT INTO users(role, phone) VALUES ('therapist', $1) RETURNING id", ["U-" + randomUUID().slice(0, 8)]);
    const t = await db.query(
      `INSERT INTO therapist_profiles(user_id, full_name, city_id, qualification, experience_years, active_phone, whatsapp_number,
         service_modes, fee_min, fee_max, verification_status, registration_verified, metadata)
       VALUES ($1, $2, (SELECT id FROM cities WHERE slug='lahore'), 'DPT', 5, '03001230000', '923001230000', '{home_visit}', 1500, 2500,
         'approved', true, '{"uitest": true}') RETURNING id`,
      [u.rows[0].id, name],
    );
    const id = t.rows[0].id as string;
    await db.query("INSERT INTO therapist_service_areas SELECT $1, id FROM areas WHERE slug='dha'", [id]);
    await db.query("INSERT INTO therapist_conditions SELECT $1, id FROM conditions WHERE slug='back-pain'", [id]);
    const s = await db.query("INSERT INTO subscriptions(therapist_id, plan_id) SELECT $1, id FROM subscription_plans WHERE code='quarterly_standard' RETURNING id", [id]);
    await db.query("SELECT activate_subscription($1)", [s.rows[0].id]);
    ids.push(id);
    return id;
  }

  beforeAll(async () => {
    process.env.APP_ENV = "local";
    db = new Client({ connectionString: url });
    await db.connect();
    handlers["/api/contact"] = (await import("@/app/api/contact/route")).POST;
    handlers["/api/otp/request"] = (await import("@/app/api/otp/request/route")).POST;
    handlers["/api/otp/verify"] = (await import("@/app/api/otp/verify/route")).POST;
    handlers["/api/inquiries"] = (await import("@/app/api/inquiries/route")).POST;
    vi.stubGlobal("fetch", browserFetch);
    vi.stubGlobal("open", openSpy);
    window.open = openSpy as any;
  });

  afterEach(() => cleanup());

  afterAll(async () => {
    await db.query("DELETE FROM contact_requests WHERE therapist_id = ANY($1) OR ip_hash IS NOT NULL AND device_id = ANY($2)", [ids, [jar.get("cyd_device") ?? ""]]);
    await db.query("DELETE FROM click_grants WHERE therapist_id = ANY($1)", [ids]);
    await db.query("DELETE FROM subscriptions WHERE therapist_id = ANY($1)", [ids]);
    await db.query("DELETE FROM therapist_service_areas WHERE therapist_id = ANY($1)", [ids]);
    await db.query("DELETE FROM therapist_conditions WHERE therapist_id = ANY($1)", [ids]);
    await db.query("DELETE FROM patient_inquiries WHERE utm_campaign = 'uitest'");
    await db.query("DELETE FROM therapist_profiles WHERE id = ANY($1)", [ids]);
    await db.query("DELETE FROM users WHERE phone LIKE 'U-%'");
    await db.query("DELETE FROM otp_codes WHERE phone LIKE '92300777%'");
    await db.end();
  });

  it("search form saves the inquiry through the API and navigates with the right filters", async () => {
    const { default: SearchForm } = await import("@/components/SearchForm");
    const { getLocations, getConditions } = await import("@/services/locations");
    const [cities, groups] = await Promise.all([getLocations(), getConditions()]);
    sessionStorage.setItem("cyd_utm", JSON.stringify({ source: "facebook", campaign: "uitest" }));
    const user = userEvent.setup();
    render(<SearchForm cities={cities} groups={groups} />);

    await user.selectOptions(screen.getByLabelText("Area"), "dha");
    await user.selectOptions(screen.getByLabelText("Condition"), "back-pain");
    await user.selectOptions(screen.getByLabelText("Service"), "home_visit");
    await user.type(screen.getByLabelText(/Max fee/), "3000");
    await user.click(screen.getByRole("button", { name: /find physiotherapists/i }));

    await waitFor(() => expect(push).toHaveBeenCalled());
    const target = new URL("http://x" + push.mock.calls.at(-1)![0]);
    expect(target.pathname).toBe("/therapists");
    expect(Object.fromEntries(target.searchParams)).toEqual({ city: "lahore", area: "dha", condition: "back-pain", mode: "home_visit", budget: "3000" });
    expect(lastBodies["/api/inquiries"]).toMatchObject({ city: "lahore", area: "dha", condition: "back-pain", mode: "home_visit", budgetMax: 3000, utmSource: "facebook", utmCampaign: "uitest" });
    const saved = await db.query("SELECT * FROM patient_inquiries WHERE utm_campaign='uitest'");
    expect(saved.rows).toHaveLength(1);
    expect(sessionStorage.getItem("cyd_inq")).toBe(saved.rows[0].id);
  });

  it("contact buttons: 2 contacts, phone check on the 3rd, 5 allowed, 6th refused", async () => {
    const { default: ContactButtons } = await import("@/components/ContactButtons");
    const t = [];
    for (let i = 1; i <= 6; i++) t.push(await makeTherapist(`UiTest Doc ${i}`));
    const user = userEvent.setup();

    // 1st and 2nd contact: WhatsApp opens, counter shown
    for (let i = 0; i < 2; i++) {
      render(<ContactButtons therapistId={t[i]!} />);
      await user.click(screen.getByRole("button", { name: "WhatsApp" }));
      await screen.findByText(new RegExp(`contacted ${i + 1} of 5`));
      expect(openSpy.mock.calls.at(-1)![0]).toContain("https://wa.me/923001230000");
      cleanup();
    }
    // the inquiry id saved by the search form travels with the contact
    const withInquiry = await db.query("SELECT inquiry_id FROM contact_requests WHERE therapist_id = $1", [t[0]]);
    expect(withInquiry.rows[0].inquiry_id).toBe(sessionStorage.getItem("cyd_inq"));

    // 3rd contact: phone check dialog
    const opened = openSpy.mock.calls.length;
    render(<ContactButtons therapistId={t[2]!} />);
    await user.click(screen.getByRole("button", { name: "WhatsApp" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Verify your phone number")).toBeTruthy();
    expect(openSpy.mock.calls.length).toBe(opened); // number NOT revealed yet

    await user.type(within(dialog).getByLabelText("Mobile number"), "0300 7771234");
    await user.click(within(dialog).getByRole("button", { name: "Send code" }));
    const hint = await within(dialog).findByText(/your code is/i);
    const code = /\d{6}/.exec(hint.parentElement!.textContent!)![0];

    await user.type(within(dialog).getByLabelText("6 digit code"), code === "000000" ? "111111" : "000000");
    await user.click(within(dialog).getByRole("button", { name: /verify and continue/i }));
    await within(dialog).findByText(/Wrong code/);

    await user.clear(within(dialog).getByLabelText("6 digit code"));
    await user.type(within(dialog).getByLabelText("6 digit code"), code);
    await user.click(within(dialog).getByRole("button", { name: /verify and continue/i }));
    await screen.findByText(/contacted 3 of 5/);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(openSpy.mock.calls.length).toBe(opened + 1);
    cleanup();

    // 4th and 5th now go straight through (verified phone cookie)
    for (const [i, n] of [[3, 4], [4, 5]] as const) {
      render(<ContactButtons therapistId={t[i]!} />);
      await user.click(screen.getByRole("button", { name: "WhatsApp" }));
      await screen.findByText(new RegExp(`contacted ${n} of 5`));
      cleanup();
    }
    // 6th: friendly refusal, nothing opens
    const before = openSpy.mock.calls.length;
    render(<ContactButtons therapistId={t[5]!} />);
    await user.click(screen.getByRole("button", { name: "WhatsApp" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/up to 5 physiotherapists per day/);
    expect(openSpy.mock.calls.length).toBe(before);
  });

  it("server-rendered pages show real data and never leak private fields", async () => {
    const { default: Home } = await import("@/app/page");
    const { default: List } = await import("@/app/therapists/page");
    const { default: Profile } = await import("@/app/therapists/[id]/page");

    const home = renderToStaticMarkup(await Home());
    expect(home).toContain("Your care. Your choice.");
    expect(home).toContain("Johar Town"); // locations come from the database

    const list = renderToStaticMarkup(await List({ searchParams: Promise.resolve({ area: "dha", condition: "back-pain", sort: "fee_low" }) }));
    expect(list).toContain("UiTest Doc 1");
    expect(list).toMatch(/\d+ physiotherapists? found/);
    expect(list).not.toContain("Test Pending");
    for (const secret of ["923001230000", "03001230000", "cnic"]) expect(list).not.toContain(secret);

    const empty = renderToStaticMarkup(await List({ searchParams: Promise.resolve({ condition: "stroke", area: "samanabad", budget: "1" }) }));
    expect(empty).toContain("No physiotherapists match yet");

    const weird = renderToStaticMarkup(await List({ searchParams: Promise.resolve({ sort: "bogus", page: "-4" }) })); // invalid input must not crash
    expect(weird).toContain("Physiotherapists");

    const profile = renderToStaticMarkup(await Profile({ params: Promise.resolve({ id: ids[0]! }) }));
    expect(profile).toContain("UiTest Doc 1");
    expect(profile).toContain("Registration verified");
    for (const secret of ["923001230000", "03001230000"]) expect(profile).not.toContain(secret);
    await expect(Profile({ params: Promise.resolve({ id: randomUUID() }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
