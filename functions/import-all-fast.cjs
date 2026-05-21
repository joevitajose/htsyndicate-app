const { google } = require('googleapis');
const { createClient } = require('@supabase/supabase-js');

const SHEET_ID = '1znrFwqkOTCQ2yWfE8PwCou-WhpTppiQ-i1QASXdontQ';
const SHEET_NAME = 'Sheet1';
const RANGE = 'A2:H1000';

exports.handler = async (event, context) => {
  console.log('🚀 Fast Bulk Import - ALL Leads');
  
  try {
    const sheets = google.sheets({ version: 'v4', auth: process.env.GOOGLE_API_KEY });
    const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    // Read sheet
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!${RANGE}`,
    });

    const rows = response.data.values || [];
    console.log(`📊 Processing ${rows.length} rows`);

    // Get ALL existing leads in ONE query
    const { data: existingLeads } = await supabase
      .from('leads')
      .select('phone, id, name')
      .not('phone', 'is', null);

    const existingByPhone = new Map();
    existingLeads?.forEach(lead => existingByPhone.set(lead.phone, lead));

    const leadsToInsert = [];
    const leadsToUpdate = [];
    let skipped = 0;

    // Process all rows
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = i + 2;

      const webinarDate = row[0]?.trim() || null;
      const registrationDate = row[1]?.trim() || null;
      const name = row[2]?.trim();
      const email = row[3]?.trim() || null;
      let phone = row[4]?.toString().trim();
      const profession = row[5]?.trim() || null;
      const source = row[6]?.trim() || 'webinar';

      if (!name && !phone) {
        skipped++;
        continue;
      }

      const finalName = name || `Lead ${rowNumber}`;
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

      const leadData = {
        name: finalName,
        email,
        phone: finalPhone,
        source,
        pipeline: 'Webinar',
        webinar_date: webinarDate,
        registration_date: registrationDate,
        setter_stage: 'New Lead',
        closer_stage: null,
        value: 0,
        notes: profession ? `Profession: ${profession}` : null,
        calls: 0,
        call_logs: [],
        follow_ups: [],
        payments: []
      };

      const existing = existingByPhone.get(finalPhone);
      
      if (existing) {
        // Update existing
        leadsToUpdate.push({
          id: existing.id,
          ...leadData
        });
      } else {
        // New lead
        leadData.created_at = new Date().toISOString();
        leadData.setter_history = [{ stage: 'New Lead', at: new Date().toISOString(), by: 'Bulk Import' }];
        leadData.closer_history = [];
        leadsToInsert.push(leadData);
      }
    }

    console.log(`Inserting ${leadsToInsert.length} new leads...`);
    console.log(`Updating ${leadsToUpdate.length} existing leads...`);

    // Batch insert (FAST)
    let inserted = 0;
    if (leadsToInsert.length > 0) {
      const { data, error } = await supabase
        .from('leads')
        .insert(leadsToInsert)
        .select('id');
      
      if (error) {
        console.error('Insert error:', error);
      } else {
        inserted = data?.length || 0;
      }
    }

    // Batch update (Process in chunks of 50)
    let updated = 0;
    for (let i = 0; i < leadsToUpdate.length; i += 50) {
      const chunk = leadsToUpdate.slice(i, i + 50);
      for (const lead of chunk) {
        const { id, ...updateData } = lead;
        const { error } = await supabase
          .from('leads')
          .update(updateData)
          .eq('id', id);
        
        if (!error) updated++;
      }
    }

    const result = {
      success: true,
      total: rows.length,
      inserted,
      updated,
      skipped
    };

    console.log('✅ Complete:', result);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    };

  } catch (error) {
    console.error('ERROR:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error.message }),
    };
  }
};
