-- =====================================================================
-- JUUDO : Database Schema v3 (PostgreSQL)  -- SINGLE consolidated file
-- Sized for: ~100 therapists in 6-12 months, ~1000 visitors in 3 months.
-- Rule: normalise only what is searched/filtered/billed. Everything else
--       is a plain column, array or JSONB. 18 tables total.
-- Core idea: contact_requests = LEADS. 1 billable contact = 1 click.
-- A subscription ends when days run out OR clicks run out (first wins).
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

-- ============================ 1. LOCATION ============================
CREATE TABLE cities (
    id            SERIAL PRIMARY KEY,
    name          TEXT NOT NULL,
    slug          TEXT NOT NULL UNIQUE,
    country_code  CHAR(2) NOT NULL DEFAULT 'PK',
    is_active     BOOLEAN NOT NULL DEFAULT TRUE        -- launch city by city
);

CREATE TABLE areas (
    id         SERIAL PRIMARY KEY,
    city_id    INT NOT NULL REFERENCES cities(id),
    name       TEXT NOT NULL,
    slug       TEXT NOT NULL,
    is_active  BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (city_id, slug)
);

-- ============================ 2. USERS ===============================
CREATE TABLE users (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role               TEXT NOT NULL CHECK (role IN ('admin','therapist','patient')),
    phone              TEXT UNIQUE,
    email              CITEXT UNIQUE,
    password_hash      TEXT,
    is_phone_verified  BOOLEAN NOT NULL DEFAULT FALSE,
    status             TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','banned')),
    terms_version      TEXT,                           -- consent: which terms they accepted
    terms_accepted_at  TIMESTAMPTZ,
    last_login_at      TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at         TIMESTAMPTZ,
    CHECK (phone IS NOT NULL OR email IS NOT NULL)
);
CREATE TRIGGER trg_users_upd BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ====================== 3. CONDITIONS (patient filters) ==============
CREATE TABLE conditions (
    id          SERIAL PRIMARY KEY,
    category    TEXT NOT NULL,                         -- Pain, Rehab, Neuro Rehab, ...
    name        TEXT NOT NULL,
    slug        TEXT NOT NULL UNIQUE,
    sort_order  INT NOT NULL DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

-- ====================== 4. THERAPIST ==================================
CREATE TABLE therapist_profiles (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id               UUID NOT NULL UNIQUE REFERENCES users(id),

    -- registration form
    full_name             TEXT NOT NULL,
    father_name           TEXT,
    gender                TEXT CHECK (gender IN ('male','female','other')),
    address               TEXT,
    city_id               INT REFERENCES cities(id),
    qualification         TEXT,                        -- 'DPT', 'MS-NMPT'
    experience_years      SMALLINT CHECK (experience_years >= 0),
    active_phone          TEXT NOT NULL,
    whatsapp_number       TEXT,                        -- shown to patients
    cnic                  TEXT UNIQUE,                 -- PRIVATE, never public
    profile_photo_url     TEXT,

    -- public home page
    headline              TEXT,
    portfolio             TEXT,                        -- about / bio
    specialties           TEXT[] NOT NULL DEFAULT '{}',-- free tags, no extra table
    service_modes         TEXT[] NOT NULL DEFAULT '{home_visit}',  -- home_visit, clinic_visit, online
    clinic_address        TEXT,
    fee_min               INT CHECK (fee_min >= 0),    -- PKR per session
    fee_max               INT CHECK (fee_max >= fee_min),
    availability          JSONB NOT NULL DEFAULT '{}', -- {"mon":["10:00-14:00"],...}

    -- verification (what is checked vs self-reported)
    registration_number   TEXT,
    registration_verified BOOLEAN NOT NULL DEFAULT FALSE,
    experience_verified   BOOLEAN NOT NULL DEFAULT FALSE,
    verification_status   TEXT NOT NULL DEFAULT 'pending'
                          CHECK (verification_status IN ('pending','approved','rejected')),
    verified_at           TIMESTAMPTZ,
    verified_by           UUID REFERENCES users(id),
    rejection_reason      TEXT,

    -- computed / cached (do not edit by hand)
    is_listed             BOOLEAN NOT NULL DEFAULT FALSE,   -- verified + subscribed + clicks left
    avg_response_minutes  INT,                              -- shown to patients
    response_rate_pct     SMALLINT,

    metadata              JSONB NOT NULL DEFAULT '{}',
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at            TIMESTAMPTZ
);
CREATE INDEX idx_tp_city_listed ON therapist_profiles(city_id) WHERE is_listed;
CREATE TRIGGER trg_tp_upd BEFORE UPDATE ON therapist_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE therapist_documents (                 -- degree, license, CNIC scans
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    therapist_id  UUID NOT NULL REFERENCES therapist_profiles(id) ON DELETE CASCADE,
    doc_type      TEXT NOT NULL CHECK (doc_type IN ('degree','certificate','license','cnic_front','cnic_back','other')),
    file_url      TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_td_therapist ON therapist_documents(therapist_id);

CREATE TABLE therapist_service_areas (             -- areas the therapist visits
    therapist_id  UUID NOT NULL REFERENCES therapist_profiles(id) ON DELETE CASCADE,
    area_id       INT  NOT NULL REFERENCES areas(id),
    PRIMARY KEY (therapist_id, area_id)
);
CREATE INDEX idx_tsa_area ON therapist_service_areas(area_id);

CREATE TABLE therapist_conditions (                -- conditions the therapist treats
    therapist_id  UUID NOT NULL REFERENCES therapist_profiles(id) ON DELETE CASCADE,
    condition_id  INT  NOT NULL REFERENCES conditions(id),
    PRIMARY KEY (therapist_id, condition_id)
);
CREATE INDEX idx_tc_condition ON therapist_conditions(condition_id);

-- ====================== 5. BILLING ====================================
CREATE TABLE subscription_plans (
    id              SERIAL PRIMARY KEY,
    code            TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    price           INT NOT NULL CHECK (price >= 0),
    currency        CHAR(3) NOT NULL DEFAULT 'PKR',
    duration_days   INT NOT NULL CHECK (duration_days > 0),
    included_clicks INT NOT NULL CHECK (included_clicks > 0),   -- plan ends at days OR clicks
    features        JSONB NOT NULL DEFAULT '{}',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE promotions (                          -- extra connects, first month free
    id                   SERIAL PRIMARY KEY,
    code                 TEXT UNIQUE,              -- coupon code; NULL = automatic
    name                 TEXT NOT NULL,
    type                 TEXT NOT NULL CHECK (type IN ('bonus_clicks','free_trial')),
    bonus_clicks         INT CHECK (bonus_clicks > 0),
    bonus_valid_days     INT NOT NULL DEFAULT 90,
    trial_plan_id        INT REFERENCES subscription_plans(id),
    min_experience_years SMALLINT,                 -- e.g. 5
    requires_verified    BOOLEAN NOT NULL DEFAULT TRUE,
    valid_from           TIMESTAMPTZ NOT NULL DEFAULT now(),
    valid_to             TIMESTAMPTZ,
    max_redemptions      INT,
    per_therapist_limit  SMALLINT NOT NULL DEFAULT 1,
    is_active            BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE subscriptions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    therapist_id     UUID NOT NULL REFERENCES therapist_profiles(id),
    plan_id          INT  NOT NULL REFERENCES subscription_plans(id),
    promotion_id     INT  REFERENCES promotions(id),
    source           TEXT NOT NULL DEFAULT 'purchase' CHECK (source IN ('purchase','trial','admin')),
    status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','active','expired','exhausted','cancelled')),
                     -- expired = days finished first, exhausted = clicks finished first
    starts_at        TIMESTAMPTZ,
    ends_at          TIMESTAMPTZ,
    price_paid       INT,                          -- snapshot
    clicks_included  INT,                          -- snapshot
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sub_therapist ON subscriptions(therapist_id, status, ends_at);
CREATE TRIGGER trg_sub_upd BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE click_grants (                        -- the click BALANCE (buckets)
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    therapist_id     UUID NOT NULL REFERENCES therapist_profiles(id),
    subscription_id  UUID REFERENCES subscriptions(id),   -- NULL for stand-alone bonus
    promotion_id     INT  REFERENCES promotions(id),
    kind             TEXT NOT NULL CHECK (kind IN ('plan','bonus')),
    quantity         INT  NOT NULL CHECK (quantity > 0),
    used             INT  NOT NULL DEFAULT 0,
    expires_at       TIMESTAMPTZ NOT NULL,
    note             TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (used >= 0 AND used <= quantity)
);
CREATE INDEX idx_grants_usable ON click_grants(therapist_id, expires_at) WHERE used < quantity;

CREATE TABLE payments (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id  UUID NOT NULL REFERENCES subscriptions(id),
    therapist_id     UUID NOT NULL REFERENCES therapist_profiles(id),
    amount           INT  NOT NULL CHECK (amount >= 0),
    method           TEXT NOT NULL,                -- jazzcash, easypaisa, bank, manual
    provider_ref     TEXT,
    proof_url        TEXT,                         -- screenshot for manual payments
    status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','refunded')),
    paid_at          TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pay_therapist ON payments(therapist_id);

-- ====================== 6. PATIENT SIDE (guest-first) =================
CREATE TABLE patient_inquiries (                   -- what the visitor searched
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID REFERENCES users(id),       -- NULL for guests
    guest_name    TEXT,
    guest_phone   TEXT,
    city_id       INT NOT NULL REFERENCES cities(id),
    area_id       INT REFERENCES areas(id),
    condition_id  INT REFERENCES conditions(id),
    service_mode  TEXT CHECK (service_mode IN ('home_visit','clinic_visit','online')),
    budget_min    INT,
    budget_max    INT,
    utm_source    TEXT,                            -- which ad brought them
    utm_campaign  TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_inq_city_area ON patient_inquiries(city_id, area_id);

CREATE TABLE contact_requests (                    -- THE LEAD (one row per tap)
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inquiry_id           UUID REFERENCES patient_inquiries(id),
    therapist_id         UUID NOT NULL REFERENCES therapist_profiles(id),
    channel              TEXT NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp','call')),
    status               TEXT NOT NULL DEFAULT 'sent'
                         CHECK (status IN ('sent','replied','completed','cancelled','blocked')),
    -- abuse control: a match on ANY of these three counts as the same person
    device_id            TEXT,                     -- cookie / browser fingerprint
    ip_hash              TEXT,
    phone                TEXT,                     -- if patient gave/verified a number
    -- billing
    is_billable          BOOLEAN NOT NULL DEFAULT TRUE,
    non_billable_reason  TEXT,                     -- duplicate_24h, no_balance, daily_limit, admin_refund
    grant_id             UUID REFERENCES click_grants(id),   -- which bucket paid for it
    -- response time
    responded_at         TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cr_therapist ON contact_requests(therapist_id, created_at DESC);
CREATE INDEX idx_cr_device ON contact_requests(device_id, created_at);
CREATE INDEX idx_cr_ip     ON contact_requests(ip_hash, created_at);
CREATE INDEX idx_cr_phone  ON contact_requests(phone, created_at);

CREATE TABLE reviews (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_request_id  UUID NOT NULL UNIQUE REFERENCES contact_requests(id),
    therapist_id        UUID NOT NULL REFERENCES therapist_profiles(id),
    rating              SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment             TEXT,
    is_visible          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_reviews_therapist ON reviews(therapist_id);

-- ====================== 7. TRUST & ADMIN ==============================
CREATE TABLE reports (                             -- misleading profile / misconduct
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    therapist_id      UUID NOT NULL REFERENCES therapist_profiles(id),
    reporter_user_id  UUID REFERENCES users(id),
    reporter_contact  TEXT,
    reason            TEXT NOT NULL,               -- fake_credentials, misconduct, overcharging, other
    details           TEXT,
    status            TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','resolved','dismissed')),
    resolved_by       UUID REFERENCES users(id),
    resolved_at       TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (                          -- who did what (approvals, refunds)
    id          BIGSERIAL PRIMARY KEY,
    actor_id    UUID REFERENCES users(id),
    action      TEXT NOT NULL,                     -- therapist.approved, click.refunded
    entity      TEXT NOT NULL,
    entity_id   TEXT,
    details     JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- VIEW: what the frontend shows  ("25 plan clicks + 5 bonus connects")
-- =====================================================================
CREATE VIEW v_therapist_click_balance AS
SELECT therapist_id,
       COALESCE(SUM(quantity-used) FILTER (WHERE kind='plan'),0)  AS plan_clicks_left,
       COALESCE(SUM(quantity-used) FILTER (WHERE kind='bonus'),0) AS bonus_clicks_left,
       COALESCE(SUM(quantity-used),0)                              AS total_clicks_left,
       MIN(expires_at)                                             AS next_expiry
FROM click_grants
WHERE used < quantity AND expires_at > now()
GROUP BY therapist_id;

-- =====================================================================
-- BUSINESS-RULE FUNCTIONS  (all billing / abuse logic lives here)
-- =====================================================================

-- Recompute subscription status + is_listed. Run nightly for date expiry:
--   SELECT refresh_therapist_listing(id) FROM therapist_profiles;
CREATE OR REPLACE FUNCTION refresh_therapist_listing(p UUID) RETURNS VOID AS $$
BEGIN
  UPDATE subscriptions SET status='expired'
   WHERE therapist_id=p AND status='active' AND ends_at <= now();

  UPDATE subscriptions s SET status='exhausted'
   WHERE s.therapist_id=p AND s.status='active'
     AND NOT EXISTS (SELECT 1 FROM click_grants g WHERE g.subscription_id=s.id AND g.used < g.quantity);

  UPDATE therapist_profiles t SET is_listed = (
        t.verification_status='approved' AND t.deleted_at IS NULL
    AND EXISTS (SELECT 1 FROM subscriptions s WHERE s.therapist_id=t.id AND s.status='active'
                   AND s.starts_at <= now() AND s.ends_at > now())
    AND EXISTS (SELECT 1 FROM click_grants g WHERE g.therapist_id=t.id
                   AND g.used < g.quantity AND g.expires_at > now()))
  WHERE t.id = p;
END; $$ LANGUAGE plpgsql;

-- After payment is approved (or for a free trial)
CREATE OR REPLACE FUNCTION activate_subscription(p_sub UUID) RETURNS VOID AS $$
DECLARE s subscriptions%ROWTYPE; pl subscription_plans%ROWTYPE;
BEGIN
  SELECT * INTO s  FROM subscriptions WHERE id = p_sub FOR UPDATE;
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

-- Extra connects (promotion or admin gift)
CREATE OR REPLACE FUNCTION grant_bonus_clicks(
    p_therapist UUID, p_qty INT, p_promo INT DEFAULT NULL,
    p_valid_days INT DEFAULT 90, p_note TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO click_grants (therapist_id, promotion_id, kind, quantity, expires_at, note)
  VALUES (p_therapist, p_promo, 'bonus', p_qty, now() + make_interval(days => p_valid_days), p_note)
  RETURNING id INTO v_id;
  PERFORM refresh_therapist_listing(p_therapist);
  RETURN v_id;
END; $$ LANGUAGE plpgsql;

-- Promotion eligibility + redemption in ONE place
CREATE OR REPLACE FUNCTION claim_promotion(p_therapist UUID, p_promo INT) RETURNS VOID AS $$
DECLARE pr promotions%ROWTYPE; tp therapist_profiles%ROWTYPE; v_sub UUID;
BEGIN
  SELECT * INTO pr FROM promotions
   WHERE id = p_promo AND is_active AND valid_from <= now() AND (valid_to IS NULL OR valid_to > now());
  IF NOT FOUND THEN RAISE EXCEPTION 'promotion not available'; END IF;
  SELECT * INTO tp FROM therapist_profiles WHERE id = p_therapist;
  IF pr.requires_verified AND tp.verification_status <> 'approved' THEN
    RAISE EXCEPTION 'therapist is not verified'; END IF;
  IF pr.min_experience_years IS NOT NULL AND COALESCE(tp.experience_years,0) < pr.min_experience_years THEN
    RAISE EXCEPTION 'not enough experience for this promotion'; END IF;
  IF (SELECT count(*) FROM click_grants WHERE promotion_id=p_promo AND therapist_id=p_therapist) >= pr.per_therapist_limit THEN
    RAISE EXCEPTION 'promotion already used'; END IF;
  IF pr.max_redemptions IS NOT NULL
     AND (SELECT count(*) FROM click_grants WHERE promotion_id=p_promo) >= pr.max_redemptions THEN
    RAISE EXCEPTION 'promotion fully redeemed'; END IF;

  IF pr.type = 'bonus_clicks' THEN
    PERFORM grant_bonus_clicks(p_therapist, pr.bonus_clicks, p_promo, pr.bonus_valid_days, pr.name);
  ELSE
    INSERT INTO subscriptions (therapist_id, plan_id, promotion_id, source, price_paid)
    VALUES (p_therapist, pr.trial_plan_id, p_promo, 'trial', 0) RETURNING id INTO v_sub;
    PERFORM activate_subscription(v_sub);
  END IF;
END; $$ LANGUAGE plpgsql;

-- THE single entry point when a patient taps WhatsApp / Call.
--  1. Abuse limit: same device OR same IP OR same phone -> max p_daily_limit per 24h
--  2. Duplicate: same device/IP to same therapist within 24h -> saved but not billed
--  3. Otherwise uses 1 click (soonest-expiring bucket first, bonus before plan)
-- The patient is never blocked by BILLING problems, only by the abuse limit.
CREATE OR REPLACE FUNCTION register_contact_click(
    p_therapist UUID, p_inquiry UUID, p_channel TEXT,
    p_device_id TEXT, p_ip_hash TEXT, p_phone TEXT DEFAULT NULL, p_daily_limit INT DEFAULT 5
) RETURNS TABLE (o_contact_id UUID, o_allowed BOOLEAN, o_reason TEXT) AS $$
DECLARE v_id UUID; v_grant UUID; v_reason TEXT; v_count INT;
BEGIN
  SELECT count(*) INTO v_count FROM contact_requests c
   WHERE c.status <> 'blocked' AND c.created_at > now() - interval '24 hours'
     AND (c.device_id = p_device_id OR c.ip_hash = p_ip_hash
          OR (p_phone IS NOT NULL AND c.phone = p_phone));

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
                AND (c.device_id = p_device_id OR c.ip_hash = p_ip_hash)) THEN
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

-- Admin refunds a fake / spam lead: click goes back to its bucket
CREATE OR REPLACE FUNCTION refund_click(p_contact UUID, p_admin UUID, p_reason TEXT) RETURNS VOID AS $$
DECLARE v_grant UUID; v_th UUID;
BEGIN
  SELECT grant_id, therapist_id INTO v_grant, v_th FROM contact_requests
   WHERE id = p_contact AND is_billable AND grant_id IS NOT NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'nothing to refund'; END IF;
  UPDATE click_grants SET used = used - 1 WHERE id = v_grant AND used > 0;
  UPDATE contact_requests SET is_billable = FALSE, non_billable_reason = 'admin_refund' WHERE id = p_contact;
  INSERT INTO audit_logs (actor_id, action, entity, entity_id, details)
  VALUES (p_admin, 'click.refunded', 'contact_request', p_contact::TEXT, jsonb_build_object('reason', p_reason));
  PERFORM refresh_therapist_listing(v_th);
END; $$ LANGUAGE plpgsql;

-- Response time: avg minutes + reply rate over the last 60 days
CREATE OR REPLACE FUNCTION refresh_response_stats(p UUID) RETURNS VOID AS $$
BEGIN
  UPDATE therapist_profiles t SET
    avg_response_minutes = (SELECT round(avg(extract(epoch FROM (c.responded_at - c.created_at)) / 60))::INT
                              FROM contact_requests c
                             WHERE c.therapist_id = t.id AND c.responded_at IS NOT NULL
                               AND c.created_at > now() - interval '60 days'),
    response_rate_pct = (SELECT round(100.0 * count(c.responded_at) / NULLIF(count(*),0))::SMALLINT
                           FROM contact_requests c
                          WHERE c.therapist_id = t.id AND c.status <> 'blocked'
                            AND c.created_at > now() - interval '60 days')
  WHERE t.id = p;
END; $$ LANGUAGE plpgsql;

-- Call when therapist taps "I replied" (or patient confirms a reply)
CREATE OR REPLACE FUNCTION mark_contact_replied(p_contact UUID) RETURNS VOID AS $$
DECLARE v_th UUID;
BEGIN
  UPDATE contact_requests SET responded_at = COALESCE(responded_at, now()),
         status = CASE WHEN status = 'sent' THEN 'replied' ELSE status END
   WHERE id = p_contact RETURNING therapist_id INTO v_th;
  IF v_th IS NOT NULL THEN PERFORM refresh_response_stats(v_th); END IF;
END; $$ LANGUAGE plpgsql;

-- =====================================================================
-- SEED DATA
-- =====================================================================
INSERT INTO cities (name, slug) VALUES ('Lahore','lahore');
INSERT INTO areas (city_id, name, slug)
SELECT c.id, a.n, a.s FROM cities c,
 (VALUES ('Johar Town','johar-town'),('DHA','dha'),('Gulberg','gulberg'),('Model Town','model-town'),
         ('Bahria Town','bahria-town'),('Wapda Town','wapda-town'),('Iqbal Town','iqbal-town'),
         ('Cantt','cantt'),('Samanabad','samanabad'),('Faisal Town','faisal-town')) AS a(n,s)
WHERE c.slug='lahore';

INSERT INTO conditions (category, name, slug) VALUES
 ('Pain','Neck Pain','neck-pain'),('Pain','Shoulder Pain','shoulder-pain'),
 ('Pain','Frozen Shoulder','frozen-shoulder'),('Pain','Elbow Pain','elbow-pain'),
 ('Pain','Golfer''s Elbow','golfers-elbow'),('Pain','Tennis Elbow','tennis-elbow'),
 ('Pain','Carpal Tunnel Syndrome','carpal-tunnel'),('Pain','Hand Numbness','hand-numbness'),
 ('Pain','Back Pain','back-pain'),('Pain','Hip Pain','hip-pain'),('Pain','Sciatica','sciatica'),
 ('Pain','Knee OA','knee-oa'),('Pain','Ankle Pain','ankle-pain'),
 ('Rehab','Fracture Rehab','fracture-rehab'),('Rehab','Total Knee Replacement','tkr'),
 ('Rehab','Total Hip Replacement','thr'),
 ('Neuro Rehab','Stroke','stroke'),('Neuro Rehab','CP','cerebral-palsy'),
 ('Neuro Rehab','Down Syndrome','down-syndrome'),('Neuro Rehab','Meningitis','meningitis'),
 ('Neuro Rehab','Paralysis','paralysis'),('Neuro Rehab','Paresis (Weakness)','paresis'),
 ('Neuro Rehab','Multiple Sclerosis','multiple-sclerosis'),('Neuro Rehab','GBS','gbs'),
 ('Post-Operative','Post-operative physiotherapy','post-op'),
 ('Sports Rehab','Sports injury rehab','sports-injury'),('Sports Rehab','ACL rehab','acl-rehab'),
 ('Pediatric','Pediatric physiotherapy','pediatric-physio'),
 ('Pediatric','Developmental delay','developmental-delay'),
 ('Geriatric','Geriatric rehab','geriatric-rehab'),('Geriatric','Balance and fall prevention','fall-prevention');

-- Placeholder numbers: you decide the final clicks
INSERT INTO subscription_plans (code, name, price, duration_days, included_clicks) VALUES
 ('quarterly_standard','Quarterly Standard', 3000, 90, 30),
 ('trial_30d','First Month Free', 0, 30, 10);

INSERT INTO promotions (name, type, trial_plan_id, min_experience_years, requires_verified)
SELECT 'First month free (5+ years experience)','free_trial', id, 5, TRUE
  FROM subscription_plans WHERE code='trial_30d';
INSERT INTO promotions (code, name, type, bonus_clicks, bonus_valid_days)
VALUES ('BONUS5','5 extra connects','bonus_clicks',5,90);

-- =====================================================================
-- PHASE 2 (not created now; add as a migration when you build bidding)
--   ALTER TABLE patient_inquiries ADD COLUMN is_open_request BOOLEAN NOT NULL DEFAULT FALSE,
--     ADD COLUMN proposed_budget INT, ADD COLUMN request_status TEXT NOT NULL DEFAULT 'open',
--     ADD COLUMN expires_at TIMESTAMPTZ;
--   CREATE TABLE request_offers (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--     inquiry_id UUID NOT NULL REFERENCES patient_inquiries(id), therapist_id UUID NOT NULL
--     REFERENCES therapist_profiles(id), offer_type TEXT NOT NULL, offered_fee INT, message TEXT,
--     status TEXT NOT NULL DEFAULT 'sent', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
--     UNIQUE (inquiry_id, therapist_id));
-- =====================================================================
