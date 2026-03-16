require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function audit() {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const startDate = ninetyDaysAgo.toISOString().split('T')[0];
  
  console.log('90-day range: ' + startDate + ' to today\n');
  
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
  
  console.log('=== SUPABASE 90-DAY TOTALS ===');
  console.log('Spend: $' + (totals.spend / 1000).toFixed(1) + 'K');
  console.log('Bookings: ' + totals.bookings.toLocaleString());
  console.log('CPB: $' + (totals.bookings > 0 ? Math.round(totals.spend / totals.bookings) : 0));
  console.log('GMV: $' + (totals.gmv / 1000000).toFixed(1) + 'M');
  console.log('ROAS: ' + (totals.spend > 0 ? Math.round(totals.gmv / totals.spend) + 'x' : '-'));
  console.log('Account Creations: ' + totals.accountCreations.toLocaleString());
  
  console.log('\n=== DASHBOARD SHOWS ===');
  console.log('Spend: $366.9K');
  console.log('Bookings: 5,542');
  console.log('CPB: $66');
  console.log('GMV: $17.8M');
  console.log('ROAS: 49x');
  console.log('Account Creations: 61,040');
}

audit();
