const { google } = require('googleapis');
const { createClient } = require('@supabase/supabase-js');

const SHEET_ID = '1znrFwqkOTCQ2yWfE8PwCou-WhpTppiQ-i1QASXdontQ';
const SHEET_NAME = 'Sheet1';
const RANGE = 'A2:H1000';

exports.handler = async (event, context) => {
  console.log('🚀 Import ALL Leads');
  
  try {
    const sheets = google.sheets({ version: 'v4', auth: process.env.GOOGLE_API_KEY });
    const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!${RANGE}`,
    });

    const rows = response.data.values || [];
    console.log(`📊 Found ${rows.length} rows`);

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

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
        console.log(`Row ${rowNumber}: No phone, skipping`);
        skipped++;
        continue;
      }
      
      if (finalPhone.startsWith('91') && finalPhone.length > 10) {
        finalPhone = finalPhone.slice(2);
      }
      
      if (finalPhone.length < 10) {
        finalPhone = finalPhone.padEnd(10, '0');
      }

      try {
        // Check if exists
        const { data: existing } = await supabase
          .from('leads')
          .select('id')
          .eq('phone', finalPhone)
          .maybeSingle();

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
          notes: profession ? `Profession: ${profession}` : `Row ${rowNumber}`,
          calls: 0,
          call_logs: [],
          follow_ups: [],
          payments: []
        };

        if (existing) {
          // Update existing
          const { error } = await supabase
            .from('leads')
            .update(leadData)
            .eq('id', existing.id);
          
          if (error) {
            console.error(`Row ${rowNumber}: Update failed - ${error.message}`);
            errors++;
          } else {
            console.log(`Row ${rowNumber}: Updated ${finalName}`);
            updated++;
          }
        } else {
          // Insert new
          leadData.created_at = new Date().toISOString();
          leadData.setter_history = [{ stage: 'New Lead', at: new Date().toISOString(), by: 'Bulk Import' }];
          leadData.closer_history = [];
          
          const { error } = await supabase
            .from('leads')
            .insert(leadData);
          
          if (error) {
            console.error(`Row ${rowNumber}: Insert failed - ${error.message}`);
            errors++;
          } else {
            console.log(`Row ${rowNumber}: Imported ${finalName}`);
            imported++;
          }
        }
      } catch (err) {
        console.error(`Row ${rowNumber}: Error - ${err.message}`);
        errors++;
      }
    }

    const result = {
      success: true,
      total: rows.length,
      imported,
      updated,
      skipped,
      errors
    };

    console.log('✅ Complete:', result);

    return {
      statusCode: 200,
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
