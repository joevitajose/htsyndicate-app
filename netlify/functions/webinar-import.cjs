const { google } = require('googleapis');
const { createClient } = require('@supabase/supabase-js');

exports.handler = async function(event, context) {
  console.log('🚀 Webinar Import Started');
  
  try {
    if (!process.env.GOOGLE_CREDENTIALS || !process.env.SUPABASE_SERVICE_KEY || !process.env.VITE_SUPABASE_URL) {
      throw new Error('Missing environment variables');
    }
    
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = '1znrFwqkOTCQ2yWfE8PwCou-WhpTppiQ-i1QASXdontQ';
    
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Sheet1!A2:H1000'
    });
    
    const rows = response.data.values || [];
    let imported = 0, skipped = 0, errors = 0;
    
    for (let i = 0; i < rows.length; i++) {
      const rowNumber = i + 2;
      const [webinarDate, regDate, name, email, phone, profession, source, importedFlag] = rows[i];
      
      if (importedFlag === 'YES') continue;
      if (name?.toLowerCase().includes('test')) { skipped++; continue; }
      if (!name || !email) { skipped++; continue; }
      
      try {
        let cleanPhone = null;
        if (phone) {
          cleanPhone = phone.toString().replace(/\D/g, '');
          if (cleanPhone.startsWith('91') && cleanPhone.length > 10) {
            cleanPhone = cleanPhone.slice(2);
          }
          if (cleanPhone.length !== 10) cleanPhone = null;
        }
        
        if (cleanPhone || email) {
          const { data: existing } = await supabase
            .from('leads')
            .select('id')
            .or(`phone.eq.${cleanPhone},email.eq.${email}`)
            .maybeSingle();
          
          if (existing) { skipped++; continue; }
        }
        
        const leadData = {
          name: name.trim(),
          email: email.trim(),
          phone: cleanPhone,
          pipeline: 'webinar',
          stage: 'New Lead',
          source: source || 'webinar',
          tags: ['from-webinar', profession].filter(Boolean),
          notes: `Registration Date: ${regDate}\nWebinar Date: ${webinarDate}\nProfession: ${profession}\nSource: ${source}`,
          created_at: new Date().toISOString()
        };
        
        const { error: insertError } = await supabase.from('leads').insert(leadData);
        if (insertError) throw insertError;
        
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `Sheet1!H${rowNumber}`,
          valueInputOption: 'RAW',
          resource: { values: [['YES']] }
        });
        
        imported++;
      } catch (err) {
        console.error(`Row ${rowNumber}:`, err.message);
        errors++;
      }
    }
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, imported, skipped, errors, total: rows.length })
    };
    
  } catch (error) {
    console.error('Error:', error.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, error: error.message })
    };
  }
};
