require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  // Get date range
  const { data: minMax } = await supabase
    .from('channel_snapshots')
    .select('date')
    .order('date', { ascending: true })
    .limit(1);
  
  const { data: maxDate } = await supabase
    .from('channel_snapshots')
    .select('date')
    .order('date', { ascending: false })
    .limit(1);
  
  console.log('Earliest date in DB: ' + (minMax?.[0]?.date || 'none'));
  console.log('Latest date in DB: ' + (maxDate?.[0]?.date || 'none'));
  
  // Get ALL data totals
  const { data, count } = await supabase
    .from('channel_snapshots')
    .select('spend, bookings, gmv', { count: 'exact' });
  
  let totals = { spend: 0, bookings: 0, gmv: 0 };
  for (const row of data) {
    totals.spend += row.spend || 0;
    totals.bookings += row.bookings || 0;
    totals.gmv += row.gmv || 0;
  }
  
  console.log('\n=== ALL DATA IN SUPABASE ===');
  console.log('Total rows: ' + data.length);
  console.log('Spend: $' + (totals.spend / 1000000).toFixed(2) + 'M');
  console.log('Bookings: ' + totals.bookings.toLocaleString());
  console.log('GMV: $' + (totals.gmv / 1000000).toFixed(2) + 'M');
}

check();
