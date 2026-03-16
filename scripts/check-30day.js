require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  // Get last 30 days
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);

  const { data, error } = await supabase
    .from('channel_snapshots')
    .select('channel, spend, bookings, gmv, account_creations')
    .gte('date', startDate.toISOString().split('T')[0])
    .lte('date', endDate.toISOString().split('T')[0]);

  if (error) { console.error(error); return; }

  // Aggregate by channel
  const byChannel = {};
  let totals = { spend: 0, bookings: 0, gmv: 0, accounts: 0 };

  for (const row of data) {
    if (!byChannel[row.channel]) {
      byChannel[row.channel] = { spend: 0, bookings: 0, gmv: 0, accounts: 0 };
    }
    byChannel[row.channel].spend += row.spend || 0;
    byChannel[row.channel].bookings += row.bookings || 0;
    byChannel[row.channel].gmv += row.gmv || 0;
    byChannel[row.channel].accounts += row.account_creations || 0;

    totals.spend += row.spend || 0;
    totals.bookings += row.bookings || 0;
    totals.gmv += row.gmv || 0;
    totals.accounts += row.account_creations || 0;
  }

  // OTA channels
  const OTA = ['airbnb', 'vrbo', 'booking'];
  const EXCLUDED = ['airbnb', 'vrbo', 'booking', 'organic', 'other'];

  let directBookings = 0;
  for (const [ch, d] of Object.entries(byChannel)) {
    if (!EXCLUDED.includes(ch)) {
      directBookings += d.bookings;
    }
  }

  console.log('=== LAST 30 DAYS ===');
  console.log('Date range:', startDate.toISOString().split('T')[0], 'to', endDate.toISOString().split('T')[0]);
  console.log('Total rows:', data.length);
  console.log('');
  console.log('TOTALS:');
  console.log('  Spend: $' + totals.spend.toLocaleString());
  console.log('  Bookings:', totals.bookings);
  console.log('  Direct Bookings:', directBookings);
  console.log('  GMV: $' + totals.gmv.toLocaleString());
  console.log('  Accounts:', totals.accounts);
  console.log('  Total CPB:', totals.bookings > 0 ? '$' + (totals.spend / totals.bookings).toFixed(0) : 'N/A');
  console.log('  Direct CPB:', directBookings > 0 ? '$' + (totals.spend / directBookings).toFixed(0) : 'N/A');
  console.log('  ROAS:', totals.spend > 0 ? (totals.gmv / totals.spend).toFixed(1) + 'x' : 'N/A');
  console.log('');
  console.log('BY CHANNEL (sorted by spend):');
  Object.entries(byChannel)
    .sort((a, b) => b[1].spend - a[1].spend)
    .forEach(([ch, d]) => {
      const cpb = d.bookings > 0 ? '$' + (d.spend / d.bookings).toFixed(0) : '—';
      const roas = d.spend > 0 ? (d.gmv / d.spend).toFixed(1) + 'x' : '—';
      console.log(`  ${ch.padEnd(12)}: spend=$${d.spend.toLocaleString().padStart(8)}, bookings=${String(d.bookings).padStart(4)}, gmv=$${d.gmv.toLocaleString().padStart(10)}, cpb=${cpb}, roas=${roas}`);
    });
}

check();
