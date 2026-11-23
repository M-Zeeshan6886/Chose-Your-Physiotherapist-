-- =====================================================================
-- 02_public_api.sql  (Sessions B2 + B3 + review fixes). Runs after 01_schema.sql.
-- 1. OTP table                    2. rating view
-- 3. shared "contacts today" fn   4. FIXED register_contact_click (locks + only listed therapists)
-- 5. FIXED activate_subscription  (cannot be activated twice)
-- =====================================================================

-- 1. Phone OTP codes (codes are stored only as a keyed hash)
CREATE TABLE otp_codes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone       TEXT NOT NULL,                 -- normalised: 923001234567
    code_hash   TEXT NOT NULL,
    device_id   TEXT,                          -- who asked for it (stops code-bombing many numbers)
    ip_hash     TEXT,
    attempts    SMALLINT NOT NULL DEFAULT 0,
    expires_at  TIMESTAMPTZ NOT NULL,
    verified_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_otp_phone ON otp_codes(phone, created_at DESC);
CREATE INDEX idx_otp_device ON otp_codes(device_id, created_at DESC);

-- 2. Average rating per therapist (visible reviews only)
CREATE VIEW v_therapist_rating AS
SELECT therapist_id, round(avg(rating)::numeric, 1) AS avg_rating, count(*)::int AS review_count
FROM reviews WHERE is_visible GROUP BY therapist_id;

-- 3. ONE definition of "how many contacts did this person make in 24h".
--    Same device OR same IP OR same phone = same person. Used by the API (OTP gate) AND by the limit.
CREATE OR REPLACE FUNCTION recent_contact_count(p_device TEXT, p_ip TEXT, p_phone TEXT) RETURNS INT AS $$
  SELECT count(*)::INT FROM contact_requests c
   WHERE c.status <> 'blocked' AND c.created_at > now() - interval '24 hours'
     AND (c.device_id = p_device OR c.ip_hash = p_ip OR (p_phone IS NOT NULL AND c.phone = p_phone));
$$ LANGUAGE sql STABLE;

-- 4. Contact tap. Changes vs v1: (a) therapist must exist and be listed,
--    (b) concurrent taps from the same device/IP are serialised so the limit cannot be beaten by double-clicking,
--    (c) uses recent_contact_count().
CREATE OR REPLACE FUNCTION register_contact_click(
    p_therapist UUID, p_inquiry UUID, p_channel TEXT,
    p_device_id TEXT, p_ip_hash TEXT, p_phone TEXT DEFAULT NULL, p_daily_limit INT DEFAULT 5
) RETURNS TABLE (o_contact_id UUID, o_allowed BOOLEAN, o_reason TEXT) AS $$
DECLARE v_id UUID; v_grant UUID; v_reason TEXT; v_count INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM therapist_profiles t
                  WHERE t.id = p_therapist AND t.is_listed AND t.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'therapist is not available';
  END IF;

  IF p_device_id IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtext('d:' || p_device_id)); END IF;
  IF p_ip_hash   IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtext('i:' || p_ip_hash));   END IF;

  v_count := recent_contact_count(p_device_id, p_ip_hash, p_phone);

  IF v_count >= p_daily_limit THEN
    INSERT INTO contact_requests (inquiry_id, therapist_id, channel, status, device_id, ip_hash, phone,
                                  is_billable, non_billable_reason)
    VALUES (p_inquiry, p_therapist, p_channel, 'blocked', p_device_id, p_ip_hash, p_phone, FALSE, 'daily_limit')
    RETURNING id INTO v_id;
    RETURN QUERY SELECT v_id, FALSE, 'daily_limit'::TEXT;
    RETURN;
  END IF;

  INSERT INTO contact_requests (inquiry_id, therapist_id, channel, device_id, ip_hash, phone)
  VALUES (p_inquiry, p_therapist, p_channel, p_device_id, p_ip_hash, p_phone)
  RETURNING id INTO v_id;

  IF EXISTS (SELECT 1 FROM contact_requests c
              WHERE c.therapist_id = p_therapist AND c.is_billable AND c.id <> v_id
                AND c.created_at > now() - interval '24 hours'
                AND (c.device_id = p_device_id OR c.ip_hash = p_ip_hash
                     OR (p_phone IS NOT NULL AND c.phone = p_phone))) THEN
    v_reason := 'duplicate_24h';
  ELSE
    SELECT g.id INTO v_grant FROM click_grants g
     WHERE g.therapist_id = p_therapist AND g.used < g.quantity AND g.expires_at > now()
     ORDER BY g.expires_at ASC, (g.kind = 'bonus') DESC
     LIMIT 1 FOR UPDATE;
    IF v_grant IS NULL THEN
      v_reason := 'no_balance';
    ELSE
      UPDATE click_grants SET used = used + 1 WHERE id = v_grant;
    END IF;
  END IF;

  UPDATE contact_requests
     SET is_billable = (v_reason IS NULL), non_billable_reason = v_reason, grant_id = v_grant
   WHERE id = v_id;
  PERFORM refresh_therapist_listing(p_therapist);
  RETURN QUERY SELECT v_id, TRUE, v_reason;
END; $$ LANGUAGE plpgsql;

-- 5. Activation: must exist and be pending (prevents double activation = double clicks)
CREATE OR REPLACE FUNCTION activate_subscription(p_sub UUID) RETURNS VOID AS $$
DECLARE s subscriptions%ROWTYPE; pl subscription_plans%ROWTYPE;
BEGIN
  SELECT * INTO s FROM subscriptions WHERE id = p_sub FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscription not found'; END IF;
  IF s.status <> 'pending' THEN RAISE EXCEPTION 'subscription is not pending'; END IF;
  SELECT * INTO pl FROM subscription_plans WHERE id = s.plan_id;
  UPDATE subscriptions
     SET status='active', starts_at=now(),
         ends_at = now() + make_interval(days => pl.duration_days),
         clicks_included = pl.included_clicks,
         price_paid = COALESCE(price_paid, pl.price)
   WHERE id = p_sub;
  INSERT INTO click_grants (therapist_id, subscription_id, promotion_id, kind, quantity, expires_at)
  VALUES (s.therapist_id, p_sub, s.promotion_id, 'plan', pl.included_clicks,
          now() + make_interval(days => pl.duration_days));
  PERFORM refresh_therapist_listing(s.therapist_id);
END; $$ LANGUAGE plpgsql;
