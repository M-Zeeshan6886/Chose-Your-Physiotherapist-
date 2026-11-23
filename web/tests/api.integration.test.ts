import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { Client } from "pg";
import { randomUUID } from "node:crypto";

/**
 * End-to-end API test against the REAL database (needs DATABASE_URL).
 * Creates its own test therapists (phone starting "T-") and deletes everything it created at the end.
 */
const url = process.env.DATABASE_URL;
const d = url ? describe : describe.skip;

type J = { ok: boolean; data?: any; error?: { code: string; message: string; details?: any } };

async function call(handler: any, path: string, opts: { method?: string; body?: unknown; cookies?: Record<string, string>; ip?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.cookies) headers.cookie = Object.entries(opts.cookies).map(([k, v]) => `${k}=${v}`).join("; ");
  if (opts.ip) headers["x-forwarded-for"] = opts.ip;
  const req = new NextRequest("http://localhost" + path, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const id = path.split("?")[0]!.split("/").pop(); // mimics Next.js giving the [id] segment
  const res: Response = await handler(req, { params: Promise.resolve({ id }) });
  const json = (await res.json()) as J;
  const setCookie = res.headers.get("set-cookie") ?? "";
  return { status: res.status, json, setCookie };
}

d("public API + contact flow", () => {
  let db: Client;
  let routes: Record<string, any>;
  const therapists: string[] = [];
  let lowClicks = "";
  const devices: string[] = [];
  const dev = () => { const id = randomUUID(); devices.push(id); return id; };

  async function makeTherapist(name: string, plan: string, fee = 2000, modes = "{home_visit}") {
    const u = await db.query("INSERT INTO users(role, phone) VALUES ('therapist', $1) RETURNING id", ["T-" + randomUUID().slice(0, 8)]);
    const t = await db.query(
      `INSERT INTO therapist_profiles(user_id, full_name, city_id, qualification, experience_years, active_phone, whatsapp_number,
         service_modes, fee_min, fee_max, verification_status, registration_verified, metadata)
       VALUES ($1, $2, (SELECT id FROM cities WHERE slug='lahore'), 'DPT', 5, '03001234567', '923001234567', $3::text[], $4, $4 + 1000,
         'approved', true, '{"apitest": true}') RETURNING id`,
      [u.rows[0].id, name, modes, fee],
    );
    const id = t.rows[0].id as string;
    await db.query(
      "INSERT INTO therapist_service_areas SELECT $1, id FROM areas WHERE slug='dha'", [id]);
    await db.query(
      "INSERT INTO therapist_conditions SELECT $1, id FROM conditions WHERE slug='back-pain'", [id]);
    const s = await db.query(
      "INSERT INTO subscriptions(therapist_id, plan_id) SELECT $1, id FROM subscription_plans WHERE code=$2 RETURNING id", [id, plan]);
    await db.query("SELECT activate_subscription($1)", [s.rows[0].id]);
    return id;
  }

  beforeAll(async () => {
    process.env.APP_ENV = "local";
    db = new Client({ connectionString: url });
    await db.connect();
    routes = {
      locations: (await import("@/app/api/locations/route")).GET,
      conditions: (await import("@/app/api/conditions/route")).GET,
      list: (await import("@/app/api/therapists/route")).GET,
      one: (await import("@/app/api/therapists/[id]/route")).GET,
      inquiry: (await import("@/app/api/inquiries/route")).POST,
      contact: (await import("@/app/api/contact/route")).POST,
      otpReq: (await import("@/app/api/otp/request/route")).POST,
      otpVer: (await import("@/app/api/otp/verify/route")).POST,
    };
    for (let i = 1; i <= 6; i++) therapists.push(await makeTherapist(`ApiTest Doc ${i}`, "quarterly_standard", 1000 + i * 100));
    lowClicks = await makeTherapist("ApiTest LowClicks", "demo_3_clicks", 900);
    await db.query("UPDATE therapist_profiles SET service_modes='{online}' WHERE id=$1", [therapists[5]]);
  });

  afterAll(async () => {
    const ids = (await db.query("SELECT id FROM therapist_profiles WHERE metadata->>'apitest'='true'")).rows.map((r) => r.id);
    await db.query("DELETE FROM contact_requests WHERE therapist_id = ANY($1) OR device_id = ANY($2)", [ids, devices]);
    await db.query("DELETE FROM click_grants WHERE therapist_id = ANY($1)", [ids]);
    await db.query("DELETE FROM subscriptions WHERE therapist_id = ANY($1)", [ids]);
    await db.query("DELETE FROM therapist_service_areas WHERE therapist_id = ANY($1)", [ids]);
    await db.query("DELETE FROM therapist_conditions WHERE therapist_id = ANY($1)", [ids]);
    await db.query("DELETE FROM patient_inquiries WHERE utm_campaign = 'apitest'");
    await db.query("DELETE FROM therapist_profiles WHERE id = ANY($1)", [ids]);
    await db.query("DELETE FROM users WHERE phone LIKE 'T-%'");
    await db.query("DELETE FROM otp_codes WHERE phone LIKE '92300555%'");
    await db.end();
  });

  it("returns locations and grouped conditions", async () => {
    const l = await call(routes.locations, "/api/locations");
    expect(l.json.data[0]).toMatchObject({ slug: "lahore" });
    expect(l.json.data[0].areas.length).toBeGreaterThanOrEqual(10);
    const c = await call(routes.conditions, "/api/conditions");
    expect(c.json.data.map((g: any) => g.category)).toContain("Neuro Rehab");
  });

  it("searches with filters, sorting and paging", async () => {
    const all = await call(routes.list, "/api/therapists?city=lahore&limit=50");
    expect(all.status).toBe(200);
    const names: string[] = all.json.data.items.map((i: any) => i.fullName);
    expect(names).not.toContain("Test Pending (Demo)"); // pending therapists are never public
    expect(names).toContain("ApiTest Doc 1");

    const cheap = await call(routes.list, "/api/therapists?city=lahore&area=dha&condition=back-pain&mode=home_visit&budget=1250&sort=fee_low&limit=50");
    const apitest = cheap.json.data.items.filter((i: any) => i.fullName.startsWith("ApiTest"));
    expect(apitest.map((i: any) => i.fullName)).toEqual(["ApiTest LowClicks", "ApiTest Doc 1", "ApiTest Doc 2"]);

    const online = await call(routes.list, "/api/therapists?mode=online&area=dha&limit=50"); // online ignores area
    expect(online.json.data.items.some((i: any) => i.fullName === "ApiTest Doc 6")).toBe(true);

    const p1 = await call(routes.list, "/api/therapists?limit=3&page=1");
    expect(p1.json.data.items).toHaveLength(3);
    expect(p1.json.data.pages).toBeGreaterThan(1);

    const bad = await call(routes.list, "/api/therapists?sort=drop_table");
    expect(bad.status).toBe(400);
    expect(bad.json.error?.code).toBe("validation_error");
  });

  it("public profile never leaks private fields; unknown and unlisted are 404", async () => {
    const one = await call(routes.one, `/api/therapists/${therapists[0]}`);
    expect(one.status).toBe(200);
    const text = JSON.stringify(one.json);
    for (const secret of ["cnic", "whatsapp", "923001234567", "03001234567", "active_phone", "user_id"]) expect(text).not.toContain(secret);
    const pending = (await db.query("SELECT id FROM therapist_profiles WHERE full_name='Test Pending (Demo)'")).rows[0]?.id;
    if (pending) expect((await call(routes.one, `/api/therapists/${pending}`)).status).toBe(404);
    expect((await call(routes.one, "/api/therapists/not-a-uuid")).status).toBe(404);
    expect((await call(routes.one, `/api/therapists/${randomUUID()}`)).status).toBe(404);
  });

  it("saves inquiries and validates them", async () => {
    const ok = await call(routes.inquiry, "/api/inquiries", { method: "POST", body: { city: "lahore", area: "dha", condition: "back-pain", mode: "home_visit", budgetMax: 3000, utmCampaign: "apitest" } });
    expect(ok.status).toBe(201);
    expect(ok.json.data.inquiryId).toMatch(/^[0-9a-f-]{36}$/);
    expect((await call(routes.inquiry, "/api/inquiries", { method: "POST", body: { city: "nowhere" } })).status).toBe(404);
    expect((await call(routes.inquiry, "/api/inquiries", { method: "POST", body: { city: "lahore", budgetMax: -5 } })).status).toBe(400);
  });

  it("contact flow: 2 free, OTP before the 3rd, limit of 5 per day", async () => {
    const device = dev();
    const ip = "10.20.30." + Math.floor(Math.random() * 200 + 10);
    const c = (i: number, cookies: Record<string, string> = {}) =>
      call(routes.contact, "/api/contact", { method: "POST", body: { therapistId: therapists[i], channel: "whatsapp" }, cookies: { cyd_device: device, ...cookies }, ip });

    const r1 = await c(0);
    expect(r1.status).toBe(200);
    expect(r1.json.data.url).toContain("https://wa.me/923001234567");
    expect(r1.json.data.contactsToday).toBe(1);
    expect((await c(1)).status).toBe(200);

    const r3 = await c(2);
    expect(r3.status).toBe(403);
    expect(r3.json.error?.code).toBe("otp_required");

    // OTP: bad phone, then good phone, wrong code, right code
    expect((await call(routes.otpReq, "/api/otp/request", { method: "POST", body: { phone: "123" }, cookies: { cyd_device: device } })).status).toBe(400);
    const phone = "0300555" + String(Math.floor(1000 + Math.random() * 8999));
    const req = await call(routes.otpReq, "/api/otp/request", { method: "POST", body: { phone }, cookies: { cyd_device: device }, ip });
    expect(req.status).toBe(200);
    const code: string = req.json.data.devCode;
    expect(code).toMatch(/^\d{6}$/);
    const wrong = await call(routes.otpVer, "/api/otp/verify", { method: "POST", body: { phone, code: code === "000000" ? "111111" : "000000" } });
    expect(wrong.status).toBe(400);
    const right = await call(routes.otpVer, "/api/otp/verify", { method: "POST", body: { phone, code } });
    expect(right.status).toBe(200);
    const pv = /cyd_pv=([^;]+)/.exec(right.setCookie)?.[1];
    expect(pv).toBeTruthy();
    const cookies = { cyd_pv: decodeURIComponent(pv!) };

    expect((await c(2, cookies)).status).toBe(200); // 3rd
    expect((await c(3, cookies)).status).toBe(200); // 4th
    expect((await c(4, cookies)).status).toBe(200); // 5th
    const r6 = await c(5, cookies);
    expect(r6.status).toBe(429);
    expect(r6.json.error?.code).toBe("daily_limit");

    // a NEW device on the SAME IP is the same person: already at the limit
    const other = await call(routes.contact, "/api/contact", { method: "POST", body: { therapistId: therapists[0] }, cookies: { cyd_device: dev() }, ip });
    expect(other.status).toBe(429);
  });

  it("a replayed or tampered OTP cookie does not bypass the gate", async () => {
    const device = dev();
    const ip = "10.99." + Math.floor(Math.random() * 200 + 10) + ".1";
    const c = (i: number, cookies: Record<string, string> = {}) =>
      call(routes.contact, "/api/contact", { method: "POST", body: { therapistId: therapists[i] }, cookies: { cyd_device: device, ...cookies }, ip });
    await c(0); await c(1);
    const fake = await c(2, { cyd_pv: "923001234567.9999999999999.deadbeef" });
    expect(fake.status).toBe(403);
  });

  it("OTP locks after 5 wrong attempts", async () => {
    const device = dev();
    const phone = "0300555" + String(Math.floor(1000 + Math.random() * 8999));
    const req = await call(routes.otpReq, "/api/otp/request", { method: "POST", body: { phone }, cookies: { cyd_device: device } });
    const code: string = req.json.data.devCode;
    const wrongCode = code === "123456" ? "654321" : "123456";
    for (let i = 0; i < 5; i++) await call(routes.otpVer, "/api/otp/verify", { method: "POST", body: { phone, code: wrongCode } });
    const locked = await call(routes.otpVer, "/api/otp/verify", { method: "POST", body: { phone, code } });
    expect(locked.status).toBe(429);
    expect(locked.json.error?.code).toBe("otp_locked");
  });

  it("a therapist who runs out of clicks disappears and cannot be contacted", async () => {
    for (let i = 0; i < 3; i++) {
      const r = await call(routes.contact, "/api/contact", { method: "POST", body: { therapistId: lowClicks }, cookies: { cyd_device: dev() }, ip: `10.77.${i}.1` });
      expect(r.status).toBe(200);
    }
    const listed = (await db.query("SELECT is_listed FROM therapist_profiles WHERE id=$1", [lowClicks])).rows[0].is_listed;
    expect(listed).toBe(false);
    const again = await call(routes.contact, "/api/contact", { method: "POST", body: { therapistId: lowClicks }, cookies: { cyd_device: dev() }, ip: "10.77.9.1" });
    expect(again.status).toBe(422);
    expect(again.json.error?.message).toBe("therapist is not available");
    expect((await call(routes.one, `/api/therapists/${lowClicks}`)).status).toBe(404);
  });

  it("repeat tap on the same therapist is saved but not billed", async () => {
    const device = dev();
    const before = Number((await db.query("SELECT used FROM click_grants WHERE therapist_id=$1", [therapists[3]])).rows[0].used);
    for (let i = 0; i < 2; i++) await call(routes.contact, "/api/contact", { method: "POST", body: { therapistId: therapists[3] }, cookies: { cyd_device: device }, ip: "10.55.1.1" });
    const after = Number((await db.query("SELECT used FROM click_grants WHERE therapist_id=$1", [therapists[3]])).rows[0].used);
    expect(after - before).toBe(1);
  });

  it("every response has the standard shape", async () => {
    const r = await call(routes.contact, "/api/contact", { method: "POST", body: { therapistId: "nope" } });
    expect(r.status).toBe(400);
    expect(r.json).toMatchObject({ ok: false, error: { code: "validation_error" } });
  });
});
