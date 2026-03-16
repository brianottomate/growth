require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function audit() {
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const startDate = sixtyDaysAgo.toISOString().split('T')[0];
  const today = new Date().toISOString().split('T')[0];
  
  console.log('60-day range: ' + startDate + ' to ' + today + '\n');
  
  const { data, error } = await supabase
    .from('channel_snapshots')
    .select('channel, spend, bookings, gmv, account_creations')
    .gte('date', startDate);
  
  if (error) { console.error(error); return; }
  
  let totals = { spend: 0, bookings: 0, gmv: 0, accountCreations: 0 };
  
  for (const row of data) {
    totals.spend += row.spend || 0;
    totals.bookings += row.bookings || 0;
    totals.gmv += row.gmv || 0;
    totals.accountCreations += row.account_creations || 0;
  }
  
  console.log('=== SUPABASE 60-DAY TOTALS ===');
  console.log('Spend: $' + Math.round(totals.spend).toLocaleString());
  console.log('Bookings: ' + totals.bookings.toLocaleString());
  console.log('CPB: $' + (totals.bookings > 0 ? Math.round(totals.spend / totals.bookings) : 0));
  console.log('GMV: $' + (totals.gmv / 1000000).toFixed(1) + 'M');
  console.log('ROAS: ' + (totals.spend > 0 ? Math.round(totals.gmv / totals.spend) + 'x' : '-'));
  console.log('Account Creations: ' + totals.accountCreations.toLocaleString());
  
  console.log('\n=== DASHBOARD SHOWS ===');
  console.log('Spend: $256.6K');
  console.log('Bookings: 4,638');
  console.log('CPB: $55');
  console.log('GMV: $14.4M');
  console.log('ROAS: 56x');
  console.log('Account Creations: 48,355');
  
  console.log('\nRows returned: ' + data.length);
}

audit();
