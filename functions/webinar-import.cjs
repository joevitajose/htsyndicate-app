const { google } = require('googleapis');
const { createClient } = require('@supabase/supabase-js');

const SHEET_ID = '1znrFwqkOTCQ2yWfE8PwCou-WhpTppiQ-i1QASXdontQ';
const SHEET_NAME = 'Sheet1';
const RANGE = 'A2:H1000';

exports.handler = async (event, context) => {
  console.log('🚀 Webinar Import Started');
  
  try {
    // Validate environment variables
    if (!process.env.GOOGLE_API_KEY || !process.env.SUPABASE_SERVICE_KEY || !process.env.VITE_SUPABASE_URL) {
      throw new Error('Missing environment variables');
    }

    // Use API key for reading
    const sheetsRead = google.sheets({ version: 'v4', auth: process.env.GOOGLE_API_KEY });

    // Use service account for writing
    let sheetsWrite = null;
    if (process.env.GOOGLE_CREDENTIALS) {
      const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
      const auth = new google.auth.JWT(
        credentials.client_email,
        null,
        credentials.private_key,
        ['https://www.googleapis.com/auth/spreadsheets']
      );
      sheetsWrite = google.sheets({ version: 'v4', auth });
    }

    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    // Read all data from sheet
    const response = await sheetsRead.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!${RANGE}`,
    });

    const rows = response.data.values || [];
    console.log(`📊 Found ${rows.length} rows in sheet`);

    let imported = 0;
    let skipped = 0;
    let errors = 0;

    // Process every single row
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = i + 2; // Sheet rows start at 2 (after header)

      // Skip if already imported (marked YES in column H)
      if (row[7] === 'YES') {
        console.log(`Row ${rowNumber}: Already imported, skipping`);
        skipped++;
        continue;
      }

      // Extract data from each column
      const webinarDate = row[0]?.trim() || null;           // Column A
      const registrationDate = row[1]?.trim() || null;      // Column B
      const name = row[2]?.trim();                          // Column C
      const email = row[3]?.trim() || null;                 // Column D
      let phone = row[4]?.toString().trim();                // Column E
      const profession = row[5]?.trim() || null;            // Column F
      const source = row[6]?.trim() || 'webinar';           // Column G

      // Validation: Must have name AND phone
      if (!name || !phone) {
        console.log(`Row ${rowNumber}: Missing name or phone, skipping`);
        skipped++;
        continue;
      }

      // Skip test entries
      if (name.toLowerCase().includes('test')) {
        console.log(`Row ${rowNumber}: Test entry (${name}), skipping`);
        skipped++;
        continue;
      }

      // Normalize phone: remove all non-digits
      phone = phone.replace(/\D/g, '');
      
      // Remove country code 91 if present
      if (phone.startsWith('91') && phone.length > 10) {
        phone = phone.slice(2);
      }

      // Validate phone is exactly 10 digits
      if (phone.length !== 10) {
        console.error(`Row ${rowNumber}: Invalid phone length (${phone.length} digits): ${phone}`);
        errors++;
        continue;
      }

      try {
        // Check for duplicates using phone OR email
        const { data: existing, error: checkError } = await supabase
          .from('leads')
          .select('id, name')
          .or(`phone.eq.${phone}${email ? `,email.eq.${email}` : ''}`)
          .maybeSingle();

        if (checkError && checkError.code !== 'PGRST116') {
          // PGRST116 = not found (this is OK)
          throw checkError;
        }

        if (existing) {
          console.log(`Row ${rowNumber}: Duplicate found - ${name} (matches existing lead: ${existing.name})`);
          skipped++;
          continue;
        }

        // Create the lead object with ALL fields
        const lead = {
          name,
          email,
          phone,
          source,
          webinar_date: webinarDate,
          registration_date: registrationDate,
          setter_stage: 'New Lead',
          closer_stage: null,
          value: 0,
          notes: profession ? `Profession: ${profession}` : null,
          setter: null,
          closer: null,
          product: null,
          city: null,
          industry: null,
          company: null,
          created_at: new Date().toISOString(),
          calls: 0,
          call_logs: [],
          follow_ups: [],
          setter_history: [{
            stage: 'New Lead',
            at: new Date().toISOString(),
            by: 'Webinar Import'
          }],
          closer_history: [],
          payments: [],
          token_paid_at: null,
          first_paid_at: null,
        };

        // Insert into Supabase
        const { data: inserted, error: insertError } = await supabase
          .from('leads')
          .insert(lead)
          .select('id')
          .single();

        if (insertError) {
          console.error(`Row ${rowNumber}: Failed to insert ${name} - ${insertError.message}`);
          errors++;
          continue;
        }

        console.log(`✅ Row ${rowNumber}: Successfully imported ${name} (ID: ${inserted.id})`);

        // Mark as imported in Google Sheet (column H = YES)
        if (sheetsWrite) {
          try {
            await sheetsWrite.spreadsheets.values.update({
              spreadsheetId: SHEET_ID,
              range: `${SHEET_NAME}!H${rowNumber}`,
              valueInputOption: 'RAW',
              resource: { values: [['YES']] },
            });
            console.log(`Row ${rowNumber}: Marked as imported in sheet`);
          } catch (writeError) {
            console.error(`Row ${rowNumber}: Could not mark as imported - ${writeError.message}`);
            // Don't increment errors - lead was imported successfully
          }
        }

        imported++;

      } catch (err) {
        console.error(`Row ${rowNumber}: Unexpected error for ${name} - ${err.message}`);
        errors++;
      }
    }

    // Final summary
    const result = {
      success: true,
      imported,
      skipped,
      errors,
      total: rows.length,
      message: `Processed ${rows.length} rows: ${imported} imported, ${skipped} skipped, ${errors} errors`
    };

    console.log('✅ Import complete:', result);
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    };

  } catch (error) {
    console.error('❌ FATAL ERROR:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        success: false, 
        error: error.message,
        stack: error.stack 
      }),
    };
  }
};
