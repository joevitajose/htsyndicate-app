import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';

const SHEET_ID = '1znrFwqkOTCQ2yWfE8PwCou-WhpTppiQ-i1QASXdontQ';

export default async function handler(req, res) {
  console.log('🚀 Complete Multi-Tab Import Started');
  
  try {
    const sheets = google.sheets({ version: 'v4', auth: process.env.GOOGLE_API_KEY });
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    const { data: existingLeads } = await supabase
      .from('leads')
      .select('phone, id')
      .not('phone', 'is', null);

    const existingPhones = new Map();
    existingLeads?.forEach(lead => existingPhones.set(lead.phone, lead.id));

    // Helper function to get or create lead
    async function getOrCreateLead(phone, name, email, paymentAmount) {
      let leadId = existingPhones.get(phone);
      
      if (!leadId) {
        // Create new lead from payment data
        const { data } = await supabase
          .from('leads')
          .insert({
            name: name || 'Unknown',
            email: email || null,
            phone,
            source: 'webinar',
            pipeline: 'Webinar',
            setter_stage: 'New Lead',
            value: paymentAmount,
            created_at: new Date().toISOString(),
            calls: 0,
            payments: []
          })
          .select('id')
          .single();
        
        leadId = data?.id;
        if (leadId) existingPhones.set(phone, leadId);
      }
      
      return leadId;
    }

    // Import L-1 Sheet (Silver-7999)
    const l1Response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'L-1 Sheet!A2:H1000',
    });

    const l1Rows = l1Response.data.values || [];
    let silver7999Processed = 0;
    let silver7999Created = 0;
    const silver7999Skipped = [];

    for (const row of l1Rows) {
      const rawPhone = row[3]?.toString().trim();
      const name = row[1]?.trim();
      const email = row[2]?.trim();
      
      if (!rawPhone) {
        silver7999Skipped.push({ reason: 'No phone', name });
        continue;
      }

      let phone = rawPhone.replace(/\D/g, '');
      if (phone.startsWith('91') && phone.length > 10) phone = phone.slice(2);
      
      if (phone.length !== 10) {
        silver7999Skipped.push({ reason: 'Invalid phone', phone: rawPhone, name });
        continue;
      }

      const wasNew = !existingPhones.has(phone);
      const leadId = await getOrCreateLead(phone, name, email, 7999);
      
      if (!leadId) {
        silver7999Skipped.push({ reason: 'Failed to create lead', phone, name });
        continue;
      }

      if (wasNew) silver7999Created++;

      const payment = {
        date: row[0]?.trim() || new Date().toISOString(),
        amount: 7999,
        service: row[7]?.trim() || 'Silver-7999',
        type: 'Silver-7999'
      };

      const { data: lead } = await supabase
        .from('leads')
        .select('payments, value')
        .eq('id', leadId)
        .single();

      if (lead) {
        const existing = lead.payments || [];
        const isDuplicate = existing.some(p => p.date === payment.date && p.amount === payment.amount);

        if (!isDuplicate) {
          await supabase
            .from('leads')
            .update({ 
              payments: [...existing, payment],
              value: (lead.value || 0) + 7999,
              first_paid_at: payment.date
            })
            .eq('id', leadId);
          silver7999Processed++;
        } else {
          silver7999Skipped.push({ reason: 'Duplicate', phone, name });
        }
      }
    }

    // Import OTO Sheet (OTO-499)
    const otoResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'OTO Sheet!A2:H1000',
    });

    const otoRows = otoResponse.data.values || [];
    let oto499Processed = 0;
    let oto499Created = 0;
    const oto499Skipped = [];

    for (const row of otoRows) {
      const rawPhone = row[3]?.toString().trim();
      const name = row[1]?.trim();
      const email = row[2]?.trim();
      
      if (!rawPhone) {
        oto499Skipped.push({ reason: 'No phone', name });
        continue;
      }

      let phone = rawPhone.replace(/\D/g, '');
      if (phone.startsWith('91') && phone.length > 10) phone = phone.slice(2);
      
      if (phone.length !== 10) {
        oto499Skipped.push({ reason: 'Invalid phone', phone: rawPhone, name });
        continue;
      }

      const wasNew = !existingPhones.has(phone);
      const leadId = await getOrCreateLead(phone, name, email, 499);
      
      if (!leadId) {
        oto499Skipped.push({ reason: 'Failed to create lead', phone, name });
        continue;
      }

      if (wasNew) oto499Created++;

      const payment = {
        date: row[0]?.trim() || new Date().toISOString(),
        amount: 499,
        service: row[7]?.trim() || 'OTO-499',
        type: 'OTO-499'
      };

      const { data: lead } = await supabase
        .from('leads')
        .select('payments, value')
        .eq('id', leadId)
        .single();

      if (lead) {
        const existing = lead.payments || [];
        const isDuplicate = existing.some(p => p.date === payment.date && p.amount === payment.amount);

        if (!isDuplicate) {
          await supabase
            .from('leads')
            .update({ 
              payments: [...existing, payment],
              value: (lead.value || 0) + 499,
              token_paid_at: payment.date
            })
            .eq('id', leadId);
          oto499Processed++;
        } else {
          oto499Skipped.push({ reason: 'Duplicate', phone, name });
        }
      }
    }

    return res.status(200).json({
      success: true,
      payments: {
        oto499: { 
          processed: oto499Processed, 
          created: oto499Created,
          skipped: oto499Skipped 
        },
        silver7999: { 
          processed: silver7999Processed,
          created: silver7999Created, 
          skipped: silver7999Skipped 
        },
        total: oto499Processed + silver7999Processed
      }
    });

  } catch (error) {
    console.error('ERROR:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
