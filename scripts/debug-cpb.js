require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const OTA_CHANNELS = ['airbnb', 'vrbo', 'booking'];
const CPB_EXCLUDED_CHANNELS = ['airbnb', 'vrbo', 'booking', 'organic', 'other'];

async function debugLast30Days() {
  console.log('=== LAST 30 DAYS ===\n');

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const startDate = thirtyDaysAgo.toISOString().split('T')[0];

  console.log('Date range:', startDate, 'to today\n');

  const { data } = await supabase
    .from('channel_snapshots')
    .select('channel, spend, bookings, gmv')
    .gte('date', startDate);

  const byChannel = {};
  for (const r of data || []) {
    if (!byChannel[r.channel]) {
      byChannel[r.channel] = { spend: 0, bookings: 0, gmv: 0 };
    }
    byChannel[r.channel].spend += r.spend || 0;
    byChannel[r.channel].bookings += r.bookings || 0;
    byChannel[r.channel].gmv += r.gmv || 0;
  }

  let paidBookings = 0;  // For CPB calculation (excludes OTA, organic, other)
  let otaBookings = 0;
  let organicBookings = 0;
  let otherBookings = 0;
  let totalSpend = 0;
  let totalBookings = 0;

  console.log('Channel breakdown:');
  Object.entries(byChannel)
    .sort((a, b) => b[1].spend - a[1].spend)
    .forEach(([ch, s]) => {
      let label = '';
      if (OTA_CHANNELS.includes(ch)) label = ' (OTA - excluded)';
      else if (ch === 'organic') label = ' (Organic - excluded)';
      else if (ch === 'other') label = ' (Other - excluded)';
      else label = ' (PAID)';

      console.log('  ' + ch + label + ': $' + s.spend.toFixed(0) + ' spend, ' + s.bookings + ' bookings');
      totalSpend += s.spend;
      totalBookings += s.bookings;

      if (OTA_CHANNELS.includes(ch)) {
        otaBookings += s.bookings;
      } else if (ch === 'organic') {
        organicBookings += s.bookings;
      } else if (ch === 'other') {
        otherBookings += s.bookings;
      } else {
        paidBookings += s.bookings;
      }
    });

  console.log('\n--- Summary (Last 30 Days) ---');
  console.log('Total Spend (BigQuery only): $' + totalSpend.toLocaleString());
  console.log('Total Bookings:', totalBookings);
  console.log('  PAID (for CPB):', paidBookings, '(' + Math.round(paidBookings/totalBookings*100) + '%)');
  console.log('  OTA (excluded):', otaBookings, '(' + Math.round(otaBookings/totalBookings*100) + '%)');
  console.log('  Organic (excluded):', organicBookings, '(' + Math.round(organicBookings/totalBookings*100) + '%)');
  console.log('  Other (excluded):', otherBookings, '(' + Math.round(otherBookings/totalBookings*100) + '%)');

  console.log('\nCPB WITHOUT fixed costs:');
  console.log('  Blended CPB (all): $' + (totalSpend / totalBookings).toFixed(2));
  console.log('  Direct CPB (paid only): $' + (totalSpend / paidBookings).toFixed(2));

  // Add fixed costs (30 days = 1 month)
  const fixedMonthly = 114725;
  const withFixed = totalSpend + fixedMonthly;
  console.log('\nCPB WITH fixed costs ($' + fixedMonthly.toLocaleString() + '/month):');
  console.log('  Total Spend: $' + withFixed.toLocaleString());
  console.log('  Blended CPB (all): $' + (withFixed / totalBookings).toFixed(2));
  console.log('  Direct CPB (paid only): $' + (withFixed / paidBookings).toFixed(2));
}

async function debug() {
  console.log('=== CPB Debug ===\n');

  await debugLast30Days();

  console.log('\n\n=== ALL TIME ===\n');

  // Get unique channels
  const { data: channelData } = await supabase
    .from('channel_snapshots')
    .select('channel')
    .limit(5000);

  const uniqueChannels = [...new Set(channelData.map(c => c.channel))];
  console.log('Channels in DB:', uniqueChannels.sort().join(', '));

  // Get all data
  let allData = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data } = await supabase
      .from('channel_snapshots')
      .select('channel, spend, bookings, gmv')
      .range(offset, offset + pageSize - 1);

    allData = allData.concat(data || []);
    if (!data || data.length < pageSize) break;
    offset += pageSize;
  }

  console.log('\nTotal rows:', allData.length);

  // Calculate totals
  let totalSpend = 0;
  let totalBookings = 0;
  let directBookings = 0;
  let otaBookings = 0;
  let totalGmv = 0;

  const channelStats = {};

  for (const row of allData) {
    const spend = row.spend || 0;
    const bookings = row.bookings || 0;
    const gmv = row.gmv || 0;

    totalSpend += spend;
    totalBookings += bookings;
    totalGmv += gmv;

    if (!channelStats[row.channel]) {
      channelStats[row.channel] = { spend: 0, bookings: 0, gmv: 0 };
    }
    channelStats[row.channel].spend += spend;
    channelStats[row.channel].bookings += bookings;
    channelStats[row.channel].gmv += gmv;

    if (OTA_CHANNELS.includes(row.channel)) {
      otaBookings += bookings;
    } else {
      directBookings += bookings;
    }
  }

  console.log('\n=== Totals (All Time) ===');
  console.log('Total Spend: $' + totalSpend.toLocaleString());
  console.log('Total GMV: $' + totalGmv.toLocaleString());
  console.log('Total Bookings:', totalBookings.toLocaleString());
  console.log('  - Direct Bookings:', directBookings.toLocaleString());
  console.log('  - OTA Bookings:', otaBookings.toLocaleString());

  console.log('\n=== CPB Calculations ===');
  console.log('Blended CPB (all bookings): $' + (totalSpend / totalBookings).toFixed(2));
  console.log('Direct CPB (excl OTA): $' + (totalSpend / directBookings).toFixed(2));

  // Get fixed costs
  const { data: fcData } = await supabase
    .from('fixed_costs')
    .select('category, monthly_amount');

  const monthlyFixed = (fcData || []).reduce((s, r) => s + Number(r.monthly_amount || 0), 0);

  console.log('\n=== Fixed Costs ===');
  console.log('Monthly Fixed Costs: $' + monthlyFixed.toLocaleString());
  if (fcData) {
    for (const fc of fcData) {
      console.log('  -', fc.category + ':', '$' + Number(fc.monthly_amount).toLocaleString());
    }
  }

  // Calculate with fixed costs (all time = ~48 months of data roughly)
  const months = 48; // approximate
  const totalWithFixed = totalSpend + (monthlyFixed * months);
  console.log('\n=== With Fixed Costs (approx ' + months + ' months) ===');
  console.log('Total Spend + Fixed: $' + totalWithFixed.toLocaleString());
  console.log('Blended CPB with fixed: $' + (totalWithFixed / totalBookings).toFixed(2));
  console.log('Direct CPB with fixed: $' + (totalWithFixed / directBookings).toFixed(2));

  console.log('\n=== Channel Breakdown (top 10 by spend) ===');
  const sorted = Object.entries(channelStats)
    .sort((a, b) => b[1].spend - a[1].spend)
    .slice(0, 10);

  for (const [channel, stats] of sorted) {
    const cpb = stats.bookings > 0 ? stats.spend / stats.bookings : 0;
    const isOta = OTA_CHANNELS.includes(channel) ? ' (OTA)' : '';
    console.log(`  ${channel}${isOta}: $${stats.spend.toLocaleString()} spend, ${stats.bookings} bookings, CPB: $${cpb.toFixed(2)}`);
  }
}

debug().catch(console.error);
