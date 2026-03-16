require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const OTA_CHANNELS = ['airbnb', 'vrbo', 'booking'];

async function check() {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const startDate = ninetyDaysAgo.toISOString().split('T')[0];
  
  const { data } = await supabase
    .from('channel_snapshots')
    .select('channel, spend, bookings')
    .gte('date', startDate);
  
  let totals = { spend: 0, bookings: 0, directBookings: 0 };
  
  for (const row of data) {
    totals.spend += row.spend || 0;
    totals.bookings += row.bookings || 0;
    if (!OTA_CHANNELS.includes(row.channel)) {
      totals.directBookings += row.bookings || 0;
    }
  }
  
  const blendedCpb = totals.bookings > 0 ? totals.spend / totals.bookings : 0;
  const directCpb = totals.directBookings > 0 ? totals.spend / totals.directBookings : 0;
  
  console.log('=== 90-DAY CPB COMPARISON ===');
  console.log('Total Spend: $' + (totals.spend / 1000).toFixed(1) + 'K');
  console.log('Total Bookings: ' + totals.bookings.toLocaleString());
  console.log('Direct Bookings: ' + totals.directBookings.toLocaleString());
  console.log('OTA Bookings: ' + (totals.bookings - totals.directBookings).toLocaleString());
  console.log('');
  console.log('Blended CPB: $' + Math.round(blendedCpb));
  console.log('Direct CPB: $' + Math.round(directCpb));
  console.log('Difference: +' + Math.round((directCpb - blendedCpb) / blendedCpb * 100) + '%');
}

check();
