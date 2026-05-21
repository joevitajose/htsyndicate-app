const { google } = require('googleapis');
const { createClient } = require('@supabase/supabase-js');

const SHEET_ID = '1znrFwqkOTCQ2yWfE8PwCou-WhpTppiQ-i1QASXdontQ';
const SHEET_NAME = 'Sheet1';
const RANGE = 'A2:H1000';

module.exports = async (req, res) => {
  console.log('🚀 Webinar Import Started');
  
  try {
    const sheets = google.sheets({ 
      version: 'v4', 
      auth: process.env.GOOGLE_API_KEY 
    });
    
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL, 
      process.env.SUPABASE_SERVICE_KEY
    );

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!${RANGE}`,
    });

    const rows = response.data.values || [];
    
    const { data: existingLeads } = await supabase
      .from('leads')
      .select('phone')
      .not('phone', 'is', null);

    const existingPhones = new Set(existingLeads?.map(l => l.phone) || []);
    const seenPhones = new Set();
    const leadsToInsert = [];
    let skipped = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const name = row[2]?.trim();
      const email = row[3]?.trim() || null;
      let phone = row[4]?.toString().trim();

      if (!name && !phone) {
        skipped++;
        continue;
      }

      const finalName = name || `Lead ${i + 2}`;
      let finalPhone = phone ? phone.replace(/\D/g, '') : null;
      
      if (!finalPhone) {
        skipped++;
        continue;
      }
      
      if (finalPhone.startsWith('91') && finalPhone.length > 10) {
        finalPhone = finalPhone.slice(2);
      }
      
      if (finalPhone.length < 10) {
        finalPhone = finalPhone.padEnd(10, '0');
      }

      if (existingPhones.has(finalPhone) || seenPhones.has(finalPhone)) {
        skipped++;
        continue;
      }

      seenPhones.add(finalPhone);

      leadsToInsert.push({
        name: finalName,
        email,
        phone: finalPhone,
        source: row[6]?.trim() || 'webinar',
        pipeline: 'Webinar',
        webinar_date: row[0]?.trim() || null,
        registration_date: row[1]?.trim() || null,
        setter_stage: 'New Lead',
        closer_stage: null,
        value: 0,
        notes: row[5]?.trim() ? `Profession: ${row[5].trim()}` : null,
        created_at: new Date().toISOString(),
        calls: 0,
        call_logs: [],
        follow_ups: [],
        setter_history: [{
          stage: 'New Lead',
          at: new Date().toISOString(),
          by: 'Auto Import'
        }],
        closer_history: [],
        payments: []
      });
    }

    let inserted = 0;
    if (leadsToInsert.length > 0) {
      const { data, error } = await supabase
        .from('leads')
        .insert(leadsToInsert)
        .select('id');
      
      if (error) {
        console.error('Insert error:', error);
        return res.status(500).json({ 
          success: false, 
          error: error.message 
        });
      }
      
      inserted = data?.length || 0;
    }

    return res.status(200).json({
      success: true,
      total: rows.length,
      inserted,
      skipped,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('ERROR:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};
