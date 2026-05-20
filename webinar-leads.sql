-- HTSyndicate: Webinar leads import
-- Generated: 2026-05-13T12:51:13.679Z
-- Total new leads: 37
-- Paste into: Supabase → SQL Editor → New Query → Run
-- WARNING: Do not run twice — no unique constraint on phone

-- ─── Step 1: Add Webinar pipeline (safe if already exists) ──────────
INSERT INTO pipelines (id, name, sources, color, icon, sort_order) VALUES
  ('webinar', 'Webinar', '["webinar"]', '#f59e0b', 'video', 14)
ON CONFLICT (id) DO NOTHING;

-- ─── Step 2: Insert webinar leads ───────────────────────────────────
INSERT INTO leads
  (id, name, email, phone, source, setter_stage, closer_stage, notes, value, setter, closer, created_at, payments)
VALUES
  ('lead_ef0017b', 'Rajveer Singh', 'rajveer@sabhidigital.com', '9413126846', 'webinar', 'new', NULL, 'Registered: 01/05/2026, Webinar: 07 May 2026 | Tags: from-webinar, whop-access', 0, NULL, NULL, '2026-05-13T12:51:13.671Z', '[]'),
  ('lead_799f9b2', 'Palash Gupta', 'palash1234@gmail.com', '8800987029', 'webinar', 'new', NULL, 'Registered: 11/05/2026, Webinar: 14 May 2026 | Tags: from-webinar, whop-access', 0, NULL, NULL, '2026-05-13T12:51:13.677Z', '[]'),
  ('lead_570d6f1', 'Amit', 'amitshanawad@gmail.com', '8904748134', 'webinar', 'new', NULL, 'Registered: 12/05/2026, Webinar: 14 May 2026 | Tags: from-webinar, whop-access', 0, NULL, NULL, '2026-05-13T12:51:13.677Z', '[]'),
  ('lead_621df19', 'Himanshu Gupta', 'santa29555@gmail.com', '7974371568', 'webinar', 'new', NULL, 'Registered: 12/05/2026, Webinar: 14 May 2026 | Tags: from-webinar, whop-access', 0, NULL, NULL, '2026-05-13T12:51:13.677Z', '[]'),
  ('lead_c711d4b', 'MUDIT GUPTA', 'mudit870@gmail.com', '8713036999', 'webinar', 'new', NULL, 'Registered: 12/05/2026, Webinar: 14 May 2026 | Tags: from-webinar, whop-access', 0, NULL, NULL, '2026-05-13T12:51:13.677Z', '[]'),
  ('lead_dca4ee3', 'Neeta', 'neeta.khuranadps@gmail.com', '8892098122', 'webinar', 'new', NULL, 'Registered: 12/05/2026, Webinar: 14 May 2026 | Tags: from-webinar, whop-access', 0, NULL, NULL, '2026-05-13T12:51:13.677Z', '[]'),
  ('lead_0164423', 'Aditya Khanvilkar', 'adityakhanvilkar7890@gmail.com', '9819977509', 'webinar', 'new', NULL, 'Registered: 12/05/2026, Webinar: 14 May 2026 | Tags: from-webinar, whop-access', 0, NULL, NULL, '2026-05-13T12:51:13.677Z', '[]'),
  ('lead_e994e6b', 'Ruma Kuila', 'kuilaruma036@gmail.com', '8670646124', 'webinar', 'new', NULL, 'Registered: 12/05/2026, Webinar: 14 May 2026 | Tags: from-webinar, whop-access', 0, NULL, NULL, '2026-05-13T12:51:13.677Z', '[]'),
  ('lead_2058c84', 'Nilesh', 'nsorte28@gmail.com', '9892319193', 'webinar', 'new', NULL, 'Registered: 12/05/2026, Webinar: 14 May 2026 | Tags: from-webinar, whop-access', 0, NULL, NULL, '2026-05-13T12:51:13.677Z', '[]'),
  ('lead_e915699', 'Bhupander Sharma', 'bhupandersharma292@gmail.com', '9416072517', 'webinar', 'new', NULL, 'Registered: 12/05/2026, Webinar: 14 May 2026 | Tags: from-webinar, whop-access', 0, NULL, NULL, '2026-05-13T12:51:13.677Z', '[]'),
  ('lead_aa54bcf', 'Anoop Aravind', 'anooparavind115@gmail.com', '9746043999', 'webinar', 'new', NULL, 'Registered: 12/05/2026, Webinar: 14 May 2026 | Tags: from-webinar, whop-access', 0, NULL, NULL, '2026-05-13T12:51:13.677Z', '[]'),
  ('lead_c56a553', 'Aryan', 'rm1music11m@gmail.com', '8920112808', 'webinar', 'new', NULL, 'Registered: 12/05/2026, Webinar: 14 May 2026 | Tags: from-webinar, whop-access', 0, NULL, NULL, '2026-05-13T12:51:13.677Z', '[]'),
  ('lead_06d6dfb', 'Sumit Singh', 'ssumit653@gmail.com', '7903685364', 'webinar', 'new', NULL, 'Registered: 12/05/2026, Webinar: 14 May 2026 | Tags: from-webinar, whop-access', 0, NULL, NULL, '2026-05-13T12:51:13.677Z', '[]'),
  ('lead_6e19e70', 'MD samar', 'csesamar056@gmail.com', '8433405878', 'webinar', 'new', NULL, 'Registered: 12/05/2026, Webinar: 14 May 2026 | Tags: from-webinar, whop-access', 0, NULL, NULL, '2026-05-13T12:51:13.677Z', '[]'),
  ('lead_b9a3e70', 'Kishore', 'kishorekarkera@yahoo.com', '9930266711', 'webinar', 'new', NULL, 'Registered: 12/05/2026, Webinar: 14 May 2026 | Tags: from-webinar, whop-access', 0, NULL, NULL, '2026-05-13T12:51:13.677Z', '[]'),
  ('lead_ed9e9ab', 'Rekha sachdev', 'rekhadadu@gmail.com', '9730768996', 'webinar', 'new', NULL, 'Registered: 13/05/2026, Webinar: 14 May 2026 | Tags: from-webinar, whop-access', 0, NULL, NULL, '2026-05-13T12:51:13.677Z', '[]'),
  ('lead_0f778a2', 'Neeraj K', 'ns21aug@gmail.com', '9300980402', 'webinar', 'new', NULL, 'Registered: 13/05/2026, Webinar: 14 May 2026 | Tags: from-webinar, whop-access', 0, NULL, NULL, '2026-05-13T12:51:13.677Z', '[]'),
  ('lead_eb05121', 'Papri Sengupta', 'senguptapari888@gmail.com', '8335859007', 'webinar', 'new', NULL, 'Registered: 13/05/2026, Webinar: 14 May 2026 | Tags: from-webinar, whop-access', 0, NULL, NULL, '2026-05-13T12:51:13.677Z', '[]'),
  ('lead_c0a5613', 'Sunishka Sathi Gaikwad', 'sunishkagem07@gmail.com', '9767408601', 'webinar', 'new', NULL, 'Registered: 13/05/2026, Webinar: 14 May 2026 | Tags: from-webinar, whop-access', 0, NULL, NULL, '2026-05-13T12:51:13.678Z', '[]'),
  ('lead_9dd4e2b', 'Suraj', 'livelove967@gmail.com', '8169655461', 'webinar', 'new', NULL, 'Registered: 13/05/2026, Webinar: 14 May 2026 | Tags: from-webinar, whop-access', 0, NULL, NULL, '2026-05-13T12:51:13.678Z', '[]'),
  ('lead_5e13a3b', 'sahanawaz parvez', 'digitalsahanawaz@gmail.com', '7978043433', 'webinar', 'new', NULL, 'Registered: 13/05/2026, Webinar: 14 May 2026 | Tags: from-webinar, whop-access', 0, NULL, NULL, '2026-05-13T12:51:13.678Z', '[]'),
  ('lead_5384ac3', 'Ankit Shah', 'ankits2588@gmail.com', '9833725088', 'webinar', 'new', NULL, 'Registered: 13/05/2026, Webinar: 14 May 2026 | Tags: from-webinar, whop-access', 0, NULL, NULL, '2026-05-13T12:51:13.678Z', '[]'),
  ('lead_8725ffd', 'Jitesh', 'jitesh@live.in', '9354315919', 'webinar', 'new', NULL, 'Registered: 13/05/2026, Webinar: 14 May 2026 | Tags: from-webinar, whop-access', 0, NULL, NULL, '2026-05-13T12:51:13.678Z', '[]'),
  ('lead_fdd7205', 'Ashutosh kumar', 'ashutosh.0817@gmail.com', '9999813703', 'webinar', 'new', NULL, 'Registered: 13/05/2026, Webinar: 14 May 2026 | Tags: from-webinar, whop-access', 0, NULL, NULL, '2026-05-13T12:51:13.678Z', '[]'),
  ('lead_5f13481', 'Prakhar Golechha', 'prakhar.golechha@rajat-group.com', '9926193300', 'webinar', 'new', NULL, 'Registered: 13/05/2026, Webinar: 14 May 2026 | Tags: from-webinar, whop-access', 0, NULL, NULL, '2026-05-13T12:51:13.678Z', '[]'),
  ('lead_ffb4259', 'Deepak N', 'deepakwaves@gmail.com', '9886797919', 'webinar', 'new', NULL, 'Registered: 13/05/2026, Webinar: 14 May 2026 | Tags: from-webinar, whop-access', 0, NULL, NULL, '2026-05-13T12:51:13.678Z', '[]'),
  ('lead_bb574b9', 'Pawan Test', 'pawansabhidigital@gmail.com', '8209166753', 'webinar', 'new', NULL, 'Registered: 13/05/2026, Webinar: 14 May 2026 | Tags: from-webinar, whop-access', 0, NULL, NULL, '2026-05-13T12:51:13.678Z', '[]'),
  ('lead_4f59aed', 'Manisha A', 'mangolkar25@gmail.com', '9867236716', 'webinar', 'new', NULL, 'Registered: 13/05/2026, Webinar: 14 May 2026 | Tags: from-webinar, whop-access', 0, NULL, NULL, '2026-05-13T12:51:13.678Z', '[]'),
  ('lead_3516ea9', 'Jaydip Patel', 'dhartigroup.gp@gmail.com', '8141654650', 'webinar', 'new', NULL, 'Registered: 13/05/2026, Webinar: 14 May 2026 | Tags: from-webinar, whop-access', 0, NULL, NULL, '2026-05-13T12:51:13.678Z', '[]'),
  ('lead_4d375ba', 'Srinath Sethuraman', 'srinathsethuraman2@gmail.com', '9902072954', 'webinar', 'new', NULL, 'Registered: 13/05/2026, Webinar: 14 May 2026 | Tags: from-webinar, whop-access', 0, NULL, NULL, '2026-05-13T12:51:13.678Z', '[]'),
  ('lead_7715f26', 'Suraj More', 'surajmr134@gmail.com', '9619747574', 'webinar', 'new', NULL, 'Registered: 13/05/2026, Webinar: 14 May 2026 | Tags: from-webinar, whop-access', 0, NULL, NULL, '2026-05-13T12:51:13.678Z', '[]'),
  ('lead_e26fffc', 'Anupam Ghosal', 'aghosal04@gmail.com', '9830222006', 'webinar', 'new', NULL, 'Registered: 13/05/2026, Webinar: 14 May 2026 | Tags: from-webinar, whop-access', 0, NULL, NULL, '2026-05-13T12:51:13.678Z', '[]'),
  ('lead_8b8a0c5', 'Abhishek Singh', 'maoyosoft@gmail.com', '9833899087', 'webinar', 'new', NULL, 'Registered: 13/05/2026, Webinar: 14 May 2026 | Tags: from-webinar, whop-access', 0, NULL, NULL, '2026-05-13T12:51:13.678Z', '[]'),
  ('lead_ec5d349', 'Nishant', 'nishantkashyapediting@gmail.com', '3157675757', 'webinar', 'new', NULL, 'Registered: 13/05/2026, Webinar: 14 May 2026 | Tags: from-webinar, whop-access', 0, NULL, NULL, '2026-05-13T12:51:13.678Z', '[]'),
  ('lead_fc993cd', 'Hussain', 'hussdum@gmail.com', '9738015153', 'webinar', 'new', NULL, 'Registered: 13/05/2026, Webinar: 14 May 2026 | Tags: from-webinar, whop-access', 0, NULL, NULL, '2026-05-13T12:51:13.678Z', '[]'),
  ('lead_28ee4f7', 'Nikhil Mistry', 'mistrynik.111988@gmail.com', '7567538237', 'webinar', 'new', NULL, 'Registered: 13/05/2026, Webinar: 14 May 2026 | Tags: from-webinar, whop-access', 0, NULL, NULL, '2026-05-13T12:51:13.678Z', '[]'),
  ('lead_c43d18b', 'K Muni', 'muniswamy1608@gmail.com', '9738782231', 'webinar', 'new', NULL, 'Registered: 13/05/2026, Webinar: 14 May 2026 | Tags: from-webinar, whop-access', 0, NULL, NULL, '2026-05-13T12:51:13.678Z', '[]')
ON CONFLICT (id) DO NOTHING;
