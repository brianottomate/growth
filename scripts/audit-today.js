require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function audit() {
  const today = new Date().toISOString().split('T')[0];
  
  console.log('Today: ' + today + '\n');
  
  const { data, error } = await supabase
    .from('channel_snapshots')
    .select('channel, spend, bookings, gmv, account_creations')
    .eq('date', today);
  
  if (error) { console.error(error); return; }
  
  let totals = { spend: 0, bookings: 0, gmv: 0, accountCreations: 0 };
  let byChannel = {};
  
  for (const row of data) {
    totals.spend += row.spend || 0;
    totals.bookings += row.bookings || 0;
    totals.gmv += row.gmv || 0;
    totals.accountCreations += row.account_creations || 0;
    
    if (!byChannel[row.channel]) {
      byChannel[row.channel] = { spend: 0, bookings: 0, gmv: 0 };
    }
    byChannel[row.channel].spend += row.spend || 0;
    byChannel[row.channel].bookings += row.bookings || 0;
    byChannel[row.channel].gmv += row.gmv || 0;
  }
  
  console.log('=== SUPABASE TODAY TOTALS ===');
  console.log('Spend: $' + Math.round(totals.spend).toLocaleString());
  console.log('Bookings: ' + totals.bookings.toLocaleString());
  console.log('CPB: $' + (totals.bookings > 0 ? Math.round(totals.spend / totals.bookings) : 0));
  console.log('GMV: $' + Math.round(totals.gmv).toLocaleString());
  console.log('ROAS: ' + (totals.spend > 0 ? Math.round(totals.gmv / totals.spend) + 'x' : '-'));
  console.log('Account Creations: ' + totals.accountCreations);
  
  console.log('\n=== DASHBOARD SHOWS ===');
  console.log('Spend: $4K');
  console.log('Bookings: 113');
  console.log('CPB: $35');
  console.log('GMV: $414K');
  console.log('ROAS: 104x');
  console.log('Account Creations: 556');
  
  console.log('\n=== BY CHANNEL ===');
  const sorted = Object.entries(byChannel).sort((a,b) => b[1].spend - a[1].spend);
  for (const [ch, d] of sorted) {
    if (d.spend > 0 || d.bookings > 0) {
      const cpb = d.bookings > 0 ? Math.round(d.spend / d.bookings) : 0;
      console.log(ch + ': $' + Math.round(d.spend).toLocaleString() + ' spend, ' + d.bookings + ' bookings, $' + cpb + ' CPB, $' + Math.round(d.gmv).toLocaleString() + ' GMV');
    }
  }
}

audit();
