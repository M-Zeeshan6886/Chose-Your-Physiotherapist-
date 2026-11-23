import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

/**
 * Contract test against the REAL database (schema v3).
 * Runs only when DATABASE_URL is set. Everything runs inside a transaction that is rolled back,
 * so no data is left behind.
 */
const url = process.env.DATABASE_URL;
const d = url ? describe : describe.skip;

d("database contract (schema v3)", () => {
  let c: Client;
  beforeAll(async () => {
    c = new Client({ connectionString: url });
    await c.connect();
  });
  afterAll(async () => {
    await c.end();
  });

  it("has all 19 tables (18 from schema v3 + otp_codes)", async () => {
    const r = await c.query(
      "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'",
    );
    expect(r.rows[0].n).toBe(19);
  });

  it("has the business-rule functions the API will call", async () => {
    const names = [
      "register_contact_click", "activate_subscription", "grant_bonus_clicks", "claim_promotion",
      "refund_click", "mark_contact_replied", "refresh_therapist_listing", "refresh_response_stats", "recent_contact_count",
    ];
    const r = await c.query("SELECT proname FROM pg_proc WHERE proname = ANY($1)", [names]);
    expect(r.rows.map((x) => x.proname).sort()).toEqual([...names].sort());
  });

  it("has seed data", async () => {
    const cities = await c.query("SELECT count(*)::int AS n FROM cities");
    const conditions = await c.query("SELECT count(*)::int AS n FROM conditions");
    expect(cities.rows[0].n).toBeGreaterThanOrEqual(1);
    expect(conditions.rows[0].n).toBeGreaterThanOrEqual(31);
  });

  it("billing + abuse rules work end to end (rolled back)", async () => {
    await c.query("BEGIN");
    try {
      const u = await c.query(
        "INSERT INTO users(role, phone) VALUES ('therapist', '0300-test-001') RETURNING id",
      );
      const t = await c.query(
        `INSERT INTO therapist_profiles(user_id, full_name, active_phone, experience_years, verification_status, city_id)
         VALUES ($1, 'Dr Test', '0300', 6, 'approved', (SELECT id FROM cities LIMIT 1)) RETURNING id`,
        [u.rows[0].id],
      );
      const tid = t.rows[0].id;

      // not listed yet: no subscription
      let listed = await c.query("SELECT is_listed FROM therapist_profiles WHERE id=$1", [tid]);
      expect(listed.rows[0].is_listed).toBe(false);

      // first month free (5+ years) -> listed
      const promo = await c.query("SELECT id FROM promotions WHERE type='free_trial' LIMIT 1");
      await c.query("SELECT claim_promotion($1, $2)", [tid, promo.rows[0].id]);
      listed = await c.query("SELECT is_listed FROM therapist_profiles WHERE id=$1", [tid]);
      expect(listed.rows[0].is_listed).toBe(true);

      // the same promotion cannot be used twice
      await c.query("SAVEPOINT s1");
      await expect(c.query("SELECT claim_promotion($1, $2)", [tid, promo.rows[0].id])).rejects.toMatchObject({
        code: "P0001",
      });
      await c.query("ROLLBACK TO SAVEPOINT s1");

      // 5 contacts from one device are allowed (distinct therapists are not needed: dedupe is billing only)
      const results: { allowed: boolean; reason: string | null }[] = [];
      for (let i = 0; i < 6; i++) {
        const r = await c.query(
          "SELECT o_allowed, o_reason FROM register_contact_click($1, NULL, 'whatsapp', 'dev-A', 'ip-A', NULL, 5)",
          [tid],
        );
        results.push({ allowed: r.rows[0].o_allowed, reason: r.rows[0].o_reason });
      }
      expect(results.slice(0, 5).every((x) => x.allowed)).toBe(true);
      expect(results[1]?.reason).toBe("duplicate_24h"); // repeat tap on same therapist is not billed
      expect(results[5]).toEqual({ allowed: false, reason: "daily_limit" }); // 6th is blocked

      // only the first tap used a click
      const bal = await c.query("SELECT total_clicks_left FROM v_therapist_click_balance WHERE therapist_id=$1", [tid]);
      expect(Number(bal.rows[0].total_clicks_left)).toBe(9); // trial plan has 10 clicks, 1 used
    } finally {
      await c.query("ROLLBACK");
    }
  });
});
