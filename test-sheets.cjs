const { google } = require('googleapis');
const fs = require('fs');

async function test() {
  try {
    const creds = JSON.parse(fs.readFileSync('./google-credentials.json', 'utf8'));
    console.log('✓ Credentials loaded');
    console.log('Email:', creds.client_email);
    
    const auth = new google.auth.GoogleAuth({
      credentials: creds,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    
    const sheets = google.sheets({ version: 'v4', auth });
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: '1znrFwqkOTCQ2yWfE8PwCou-WhpTppiQ-i1QASXdontQ',
      range: 'Sheet1!A1:H5'
    });
    
    console.log('✅ SUCCESS! Rows:', response.data.values?.length);
    console.log('Headers:', response.data.values?.[0]);
    console.log('First data row:', response.data.values?.[1]);
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.error('Code:', error.code);
    if (error.code === 403) {
      console.log('\n🔧 FIX: Share the sheet with:');
      console.log('htsyndicate-sheets-bot@htsyndicate-dashboard.iam.gserviceaccount.com');
    }
  }
}

test();
