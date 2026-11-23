-- =====================================================================
-- 03_demo_data.sql : FAKE therapists, reviews and a tiny plan, for TESTING ONLY.
-- All demo therapists have metadata {"demo": true}.
-- BEFORE REAL LAUNCH delete this file, or run:
--   DELETE FROM reviews WHERE therapist_id IN (SELECT id FROM therapist_profiles WHERE metadata->>'demo'='true');
--   (then contact_requests, click_grants, subscriptions, therapist_* , therapist_profiles, users of those therapists)
-- Phone numbers are fake (0300 100 xxxx): WhatsApp links will open to numbers that do not exist.
-- =====================================================================

INSERT INTO subscription_plans (code, name, price, duration_days, included_clicks)
VALUES ('demo_3_clicks', 'Demo: only 3 clicks', 0, 30, 3);

DO $$
DECLARE r RECORD; u UUID; t UUID; s UUID; i INT := 0; k INT; cid UUID;
  comments TEXT[] := ARRAY['Very professional and always on time.','Explained every exercise clearly.','My pain improved within two weeks.'];
BEGIN
  FOR r IN SELECT * FROM (VALUES
   ('Ayesha Khan','female','DPT, MS-NMPT',9,'Orthopedic and spine physiotherapist',ARRAY['Orthopedic','Spine'],ARRAY['home_visit','online'],2500,4000,12,96,TRUE,TRUE,ARRAY['dha','gulberg','model-town'],ARRAY['back-pain','neck-pain','sciatica','hip-pain','post-op'],'approved','quarterly_standard'),
   ('Hamza Ali','male','DPT',6,'Sports injury and knee rehabilitation',ARRAY['Sports','Orthopedic'],ARRAY['home_visit','clinic_visit'],2000,3500,25,90,TRUE,TRUE,ARRAY['johar-town','wapda-town','iqbal-town'],ARRAY['knee-oa','acl-rehab','sports-injury','ankle-pain','tkr'],'approved','quarterly_standard'),
   ('Sana Malik','female','DPT, PhD',14,'Neuro rehabilitation: stroke and cerebral palsy',ARRAY['Neuro','Pediatric'],ARRAY['home_visit'],3500,5000,40,85,TRUE,TRUE,ARRAY['dha','cantt','gulberg'],ARRAY['stroke','cerebral-palsy','paralysis','paresis','gbs','multiple-sclerosis','pediatric-physio'],'approved','quarterly_standard'),
   ('Bilal Ahmed','male','DPT',3,'Back pain and posture correction',ARRAY['Orthopedic'],ARRAY['home_visit','online'],1500,2500,60,70,TRUE,FALSE,ARRAY['johar-town','faisal-town'],ARRAY['back-pain','neck-pain','frozen-shoulder','shoulder-pain'],'approved','trial_30d'),
   ('Maryam Siddiqui','female','DPT',7,'Geriatric care and balance training',ARRAY['Geriatric'],ARRAY['home_visit'],2000,3000,20,92,TRUE,TRUE,ARRAY['model-town','samanabad','iqbal-town'],ARRAY['geriatric-rehab','fall-prevention','knee-oa','hip-pain','thr'],'approved','quarterly_standard'),
   ('Usman Tariq','male','DPT',11,'Rehabilitation after knee and hip replacement',ARRAY['Orthopedic'],ARRAY['home_visit','clinic_visit','online'],3000,4500,18,94,TRUE,TRUE,ARRAY['dha','bahria-town','cantt'],ARRAY['tkr','thr','fracture-rehab','post-op','hip-pain'],'approved','quarterly_standard'),
   ('Zainab Hussain','female','DPT',5,'Pediatric physiotherapy',ARRAY['Pediatric','Neuro'],ARRAY['home_visit','clinic_visit'],2500,3500,35,88,TRUE,TRUE,ARRAY['gulberg','johar-town','wapda-town'],ARRAY['pediatric-physio','developmental-delay','cerebral-palsy','down-syndrome'],'approved','quarterly_standard'),
   ('Ali Raza','male','DPT',2,'Hand, wrist and elbow problems',ARRAY['Orthopedic'],ARRAY['clinic_visit','online'],1500,2000,NULL,NULL,FALSE,FALSE,ARRAY['faisal-town','iqbal-town'],ARRAY['tennis-elbow','golfers-elbow','carpal-tunnel','hand-numbness','elbow-pain'],'approved','trial_30d'),
   ('Faisal Mehmood','male','DPT, MS',16,'Spine and neck specialist',ARRAY['Spine','Orthopedic'],ARRAY['home_visit','online'],4000,5000,30,80,TRUE,TRUE,ARRAY['dha','gulberg','cantt','model-town'],ARRAY['back-pain','neck-pain','sciatica','shoulder-pain','frozen-shoulder'],'approved','quarterly_standard'),
   ('Hina Javed','female','DPT',8,'Post-operative recovery and back care',ARRAY['Orthopedic'],ARRAY['home_visit'],2200,3200,22,91,TRUE,FALSE,ARRAY['bahria-town','wapda-town','johar-town'],ARRAY['post-op','back-pain','hip-pain','fall-prevention'],'approved','quarterly_standard'),
   ('Test Low Clicks (Demo)','male','DPT',4,'DEMO: has only 3 clicks, use it to test running out of clicks',ARRAY['Orthopedic'],ARRAY['home_visit'],1800,2600,45,75,TRUE,TRUE,ARRAY['dha','johar-town'],ARRAY['back-pain','knee-oa'],'approved','demo_3_clicks'),
   ('Test Pending (Demo)','male','DPT',1,'DEMO: pending verification, must NOT appear anywhere',ARRAY['Orthopedic'],ARRAY['home_visit'],1500,2000,NULL,NULL,FALSE,FALSE,ARRAY['dha'],ARRAY['back-pain'],'pending',NULL)
  ) AS v(name,gender,qual,exp,headline,spec,modes,fmin,fmax,resp,rate,regv,expv,areas,conds,ver,plan)
  LOOP
    i := i + 1;
    INSERT INTO users (role, phone, is_phone_verified) VALUES ('therapist', '03001000' || lpad(i::text, 3, '0'), TRUE)
      RETURNING id INTO u;
    INSERT INTO therapist_profiles (user_id, full_name, gender, city_id, qualification, experience_years, active_phone,
        whatsapp_number, headline, portfolio, specialties, service_modes, clinic_address, fee_min, fee_max,
        availability, registration_number, registration_verified, experience_verified, verification_status,
        avg_response_minutes, response_rate_pct, metadata)
    VALUES (u, r.name, r.gender, (SELECT id FROM cities WHERE slug='lahore'), r.qual, r.exp,
        '03001000' || lpad(i::text, 3, '0'), '92300100' || lpad(i::text, 4, '0'), r.headline,
        'Experienced physiotherapist. I assess every patient first, explain the plan clearly and teach exercises you can continue at home.',
        r.spec, r.modes,
        CASE WHEN 'clinic_visit' = ANY(r.modes) THEN 'Demo Clinic, Lahore' END,
        r.fmin, r.fmax,
        '{"mon":["10:00-14:00","17:00-20:00"],"tue":["10:00-14:00"],"wed":["10:00-14:00","17:00-20:00"],"thu":["10:00-14:00"],"fri":["17:00-20:00"]}'::jsonb,
        CASE WHEN r.regv THEN 'REG-DEMO-' || i END, r.regv, r.expv, r.ver, r.resp, r.rate, '{"demo": true}'::jsonb)
    RETURNING id INTO t;
    INSERT INTO therapist_service_areas (therapist_id, area_id)
      SELECT t, a.id FROM areas a JOIN cities c ON c.id = a.city_id WHERE c.slug = 'lahore' AND a.slug = ANY(r.areas);
    INSERT INTO therapist_conditions (therapist_id, condition_id)
      SELECT t, c.id FROM conditions c WHERE c.slug = ANY(r.conds);
    IF r.plan IS NOT NULL THEN
      INSERT INTO subscriptions (therapist_id, plan_id, source)
        SELECT t, id, CASE WHEN r.plan = 'trial_30d' THEN 'trial' ELSE 'purchase' END
          FROM subscription_plans WHERE code = r.plan RETURNING id INTO s;
      PERFORM activate_subscription(s);
    END IF;
    IF i <= 6 THEN  -- demo reviews (tied to completed demo contacts, not billed)
      FOR k IN 1..3 LOOP
        INSERT INTO contact_requests (therapist_id, status, is_billable, non_billable_reason, responded_at, created_at)
        VALUES (t, 'completed', FALSE, 'demo', now() - interval '5 days' + interval '20 minutes', now() - interval '5 days')
        RETURNING id INTO cid;
        INSERT INTO reviews (contact_request_id, therapist_id, rating, comment)
        VALUES (cid, t, 4 + ((i + k) % 2), comments[k]);
      END LOOP;
    END IF;
  END LOOP;
END $$;
