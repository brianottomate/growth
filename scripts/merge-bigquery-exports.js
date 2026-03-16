require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Channel name normalization
const CHANNEL_MAP = {
  'Meta': 'meta',
  'Google': 'google',
  'Pinterest': 'pinterest',
  'TikTok': 'tiktok',
  'Microsoft': 'microsoft',
  'Criteo': 'criteo',
  'Mountain': 'mountain',
  'Influencer': 'influencer',
  'Organic': 'organic',
  'Customer IO': 'lifecycle',
  'Email Action': 'lifecycle',
  'Newsletter': 'lifecycle',
  'Direct Mail': 'direct_mail',
  'Benefithub': 'affiliate',
  'Airbnb': 'airbnb',
  'Vrbo': 'vrbo',
  'Booking': 'booking',
  'Manual': 'other',
  'Other': 'other',
  'null': 'other',
  '': 'other',
};

function normalizeChannel(channel) {
  if (!channel || channel === 'null') return 'other';
  return CHANNEL_MAP[channel] || channel.toLowerCase().replace(/\s+/g, '_');
}

function parseCSV(content) {
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',');
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    const row = {};
    headers.forEach((h, idx) => {
      row[h.trim()] = values[idx]?.trim() || null;
    });
    rows.push(row);
  }
  return rows;
}

async function main() {
  const desktop = '/Users/BrianSun/Desktop';

  // Read CSVs
  console.log('Reading CSV files...');
  const bookingsData = parseCSV(fs.readFileSync(path.join(desktop, 'bquxjob_12471c86_19c056bbfa5.csv'), 'utf-8'));
  const funnelData = parseCSV(fs.readFileSync(path.join(desktop, 'bquxjob_3bdb1574_19c056bf8bd.csv'), 'utf-8'));
  const spendData = parseCSV(fs.readFileSync(path.join(desktop, 'bquxjob_ed8cd9c_19c056b67e8.csv'), 'utf-8'));

  console.log(`Bookings rows: ${bookingsData.length}`);
  console.log(`Funnel rows: ${funnelData.length}`);
  console.log(`Spend rows: ${spendData.length}`);

  // Build merged data keyed by date+channel
  const merged = {};

  // Process spend data
  for (const row of spendData) {
    const date = row.date;
    const channel = normalizeChannel(row.channel);
    const key = `${date}|${channel}`;

    if (!merged[key]) {
      merged[key] = { date, channel, spend: 0, bookings: 0, gmv: 0, account_creations: 0, checkout_started: 0, clicks: 0, impressions: 0 };
    }
    merged[key].spend += parseFloat(row.spend) || 0;
    merged[key].clicks += parseInt(row.clicks) || 0;
    merged[key].impressions += parseInt(row.impressions) || 0;
  }

  // Process bookings/GMV data
  for (const row of bookingsData) {
    const date = row.date;
    const channel = normalizeChannel(row.channel);
    const key = `${date}|${channel}`;

    if (!merged[key]) {
      merged[key] = { date, channel, spend: 0, bookings: 0, gmv: 0, account_creations: 0, checkout_started: 0, clicks: 0, impressions: 0 };
    }
    merged[key].bookings += parseInt(row.bookings) || 0;
    merged[key].gmv += parseFloat(row.gmv) || 0;
  }

  // Process funnel data
  for (const row of funnelData) {
    const date = row.date;
    const channel = normalizeChannel(row.channel);
    const key = `${date}|${channel}`;

    if (!merged[key]) {
      merged[key] = { date, channel, spend: 0, bookings: 0, gmv: 0, account_creations: 0, checkout_started: 0, clicks: 0, impressions: 0 };
    }
    merged[key].account_creations += parseInt(row.account_creations) || 0;
    merged[key].checkout_started += parseInt(row.checkout_started) || 0;
  }

  const rows = Object.values(merged);
  console.log(`\nMerged rows: ${rows.length}`);

  // Show sample
  console.log('\nSample merged data:');
  rows.slice(0, 5).forEach(r => {
    console.log(`  ${r.date} | ${r.channel}: spend=$${r.spend}, bookings=${r.bookings}, gmv=$${r.gmv}`);
  });

  // Calculate totals
  const totals = rows.reduce((acc, r) => {
    acc.spend += r.spend;
    acc.bookings += r.bookings;
    acc.gmv += r.gmv;
    return acc;
  }, { spend: 0, bookings: 0, gmv: 0 });

  console.log(`\nTotals (all time):`);
  console.log(`  Spend: $${totals.spend.toLocaleString()}`);
  console.log(`  Bookings: ${totals.bookings.toLocaleString()}`);
  console.log(`  GMV: $${totals.gmv.toLocaleString()}`);

  // Clear existing data and insert new
  console.log('\nClearing existing channel_snapshots...');
  const { error: deleteError } = await supabase
    .from('channel_snapshots')
    .delete()
    .gte('date', '2000-01-01');

  if (deleteError) {
    console.error('Delete error:', deleteError);
    return;
  }

  // Insert in batches
  console.log('Inserting new data...');
  const batchSize = 500;
  let inserted = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize).map(r => ({
      date: r.date,
      channel: r.channel,
      spend: r.spend,
      bookings: r.bookings,
      gmv: r.gmv,
      account_creations: r.account_creations,
      checkout_started: r.checkout_started,
      clicks: r.clicks,
      impressions: r.impressions,
      data_source: 'bigquery',
      attribution: 'last_click',
    }));

    const { error } = await supabase.from('channel_snapshots').insert(batch);
    if (error) {
      console.error('Insert error:', error);
      return;
    }
    inserted += batch.length;
    process.stdout.write(`\r  Inserted ${inserted}/${rows.length} rows`);
  }

  console.log('\n\nDone! Data imported successfully.');
}

main().catch(console.error);
