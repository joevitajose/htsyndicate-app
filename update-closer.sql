-- HTSyndicate: Closer re-match updates
-- Generated: 2026-05-13T12:45:35.811Z
-- Updating 22 leads with closer stage / revenue data
-- Paste into: Supabase → SQL Editor → New Query → Run

-- [fuzzy name (93% substring)] "Mayank" → lead_t2v2uja ("undefined")
UPDATE leads SET
  closer_stage = 'lost',
  closer = 'Suraj',
  notes = COALESCE(notes || ' | ', '') || 'No Money'

WHERE id = 'lead_t2v2uja';

-- [fuzzy name (93% substring)] "Misty" → lead_d1j6gvl ("undefined")
UPDATE leads SET
  closer_stage = 'qualified',
  closer = 'Vikram',
  value = GREATEST(COALESCE(value, 0), 30000),
  payments = COALESCE(payments, '[]'::jsonb) || '[{"type":"cash_collected","amount":2000,"at":"2026-05-13T12:45:35.811Z"},{"type":"revenue","amount":30000,"at":"2026-05-13T12:45:35.811Z"}]'::jsonb,
  notes = COALESCE(notes || ' | ', '') || 'Cash Collected: ₹2000 | Revenue: ₹30000'

WHERE id = 'lead_d1j6gvl';

-- [fuzzy name (93% substring)] "Rashad" → lead_7ht3ghu ("undefined")
UPDATE leads SET
  closer_stage = 'new',
  closer = 'Vikram'

WHERE id = 'lead_7ht3ghu';

-- [fuzzy name (93% substring)] "Mitali" → lead_lun3r4b ("undefined")
UPDATE leads SET
  closer_stage = 'lost',
  closer = 'Suraj',
  notes = COALESCE(notes || ' | ', '') || 'Mindset Issue'

WHERE id = 'lead_lun3r4b';

-- [fuzzy name (93% substring)] "Momin" → lead_cbu6xwu ("undefined")
UPDATE leads SET
  closer_stage = 'no_showup',
  closer = 'Vikram'

WHERE id = 'lead_cbu6xwu';

-- [fuzzy name (93% substring)] "Janani" → lead_v4a1whk ("undefined")
UPDATE leads SET
  closer_stage = 'new',
  closer = 'Vikram'

WHERE id = 'lead_v4a1whk';

-- [fuzzy name (93% substring)] "Rashad" → lead_7ht3ghu ("undefined")
UPDATE leads SET
  closer_stage = 'lost',
  closer = 'Vikram',
  notes = COALESCE(notes || ' | ', '') || 'No Money'

WHERE id = 'lead_7ht3ghu';

-- [fuzzy name (93% substring)] "Janani" → lead_v4a1whk ("undefined")
UPDATE leads SET
  closer_stage = 'new',
  closer = 'Vikram'

WHERE id = 'lead_v4a1whk';

-- [fuzzy name (93% substring)] "Faizan" → lead_d3fd941 ("undefined")
UPDATE leads SET
  closer_stage = 'lost',
  closer = 'Suraj',
  notes = COALESCE(notes || ' | ', '') || 'Mindset Issue'

WHERE id = 'lead_d3fd941';

-- [fuzzy name (93% substring)] "Shravan" → lead_hnm2w2j ("undefined")
UPDATE leads SET
  closer_stage = 'no_showup',
  closer = 'Vikram'

WHERE id = 'lead_hnm2w2j';

-- [fuzzy name (93% substring)] "Vama" → lead_8zt9blb ("undefined")
UPDATE leads SET
  closer_stage = 'lost',
  closer = 'Suraj',
  notes = COALESCE(notes || ' | ', '') || 'No Show'

WHERE id = 'lead_8zt9blb';

-- [fuzzy name (93% substring)] "Anas" → lead_4xkgdn2 ("undefined")
UPDATE leads SET
  closer_stage = 'no_showup',
  closer = 'Vikram'

WHERE id = 'lead_4xkgdn2';

-- [fuzzy name (93% substring)] "Aprajita" → lead_jtvq44f ("undefined")
UPDATE leads SET
  closer_stage = 'lost',
  closer = 'Suraj',
  notes = COALESCE(notes || ' | ', '') || 'Not now'

WHERE id = 'lead_jtvq44f';

-- [fuzzy name (93% substring)] "Shridhar" → lead_h8ogkr3 ("undefined")
UPDATE leads SET
  closer_stage = 'no_showup',
  closer = 'Vikram'

WHERE id = 'lead_h8ogkr3';

-- [fuzzy name (93% substring)] "Sparsh" → lead_abwgq0y ("undefined")
UPDATE leads SET
  closer_stage = 'no_showup',
  closer = 'Vikram'

WHERE id = 'lead_abwgq0y';

-- [fuzzy name (93% substring)] "Sharad" → lead_uromcwa ("undefined")
UPDATE leads SET
  closer_stage = 'no_showup',
  closer = 'Vikram'

WHERE id = 'lead_uromcwa';

-- [fuzzy name (93% substring)] "Puneet" → lead_hksphjf ("undefined")
UPDATE leads SET
  closer_stage = 'lost',
  closer = 'Vikram',
  notes = COALESCE(notes || ' | ', '') || 'No Money'

WHERE id = 'lead_hksphjf';

-- [fuzzy name (93% substring)] "Shravan" → lead_hnm2w2j ("undefined")
UPDATE leads SET
  closer_stage = 'lost',
  closer = 'Vikram',
  notes = COALESCE(notes || ' | ', '') || 'No Money'

WHERE id = 'lead_hnm2w2j';

-- [fuzzy name (93% substring)] "Anmol" → lead_8auj2x2 ("undefined")
UPDATE leads SET
  closer_stage = 'not_qualified',
  closer = 'Vikram'

WHERE id = 'lead_8auj2x2';

-- [fuzzy name (93% substring)] "Mukesh" → lead_14lymok ("undefined")
UPDATE leads SET
  closer_stage = 'new',
  closer = 'Suraj'

WHERE id = 'lead_14lymok';

-- [fuzzy name (93% substring)] "Misty" → lead_d1j6gvl ("undefined")
UPDATE leads SET
  closer_stage = 'new'

WHERE id = 'lead_d1j6gvl';

-- [fuzzy name (93% substring)] "Subhodeep" → lead_qbmqs1f ("undefined")
UPDATE leads SET
  closer_stage = 'new'

WHERE id = 'lead_qbmqs1f';
