require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const startDate = thirtyDaysAgo.toISOString().split('T')[0];

  console.log('Querying from:', startDate, 'to today\n');

  const { data } = await supabase
    .from('channel_snapshots')
    .select('channel, gmv')
    .gte('date', startDate);

  const byChannel = {};
  let total = 0;
  for (const r of data || []) {
    const ch = r.channel;
    const gmv = r.gmv || 0;
    if (!byChannel[ch]) byChannel[ch] = 0;
    byChannel[ch] += gmv;
    total += gmv;
  }

  console.log('GMV by channel (last 30 days):');
  Object.entries(byChannel)
    .sort((a, b) => b[1] - a[1])
    .forEach(([ch, gmv]) => {
      console.log('  ' + ch + ': $' + (gmv/1000000).toFixed(2) + 'M');
    });

  console.log('\nTotal GMV: $' + (total/1000000).toFixed(2) + 'M');
  console.log('Drayton says it should be: $2.8M');
}

check().catch(console.error);
