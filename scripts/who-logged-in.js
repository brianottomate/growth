require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function whoLoggedIn() {
  const { data: users, error } = await supabase
    .from('users')
    .select('email, name, last_login, created_at')
    .order('last_login', { ascending: false });

  if (error) {
    console.error('Error:', error.message);
    return;
  }

  console.log('\n=== WHO CHECKED OUT THE DASHBOARD ===\n');

  if (!users || users.length === 0) {
    console.log('No logins yet.');
    return;
  }

  console.log('Email'.padEnd(35) + 'Last Login'.padEnd(25) + 'First Visit');
  console.log('-'.repeat(80));

  for (const user of users) {
    const lastLogin = user.last_login
      ? new Date(user.last_login).toLocaleString()
      : 'Never';
    const firstVisit = new Date(user.created_at).toLocaleDateString();
    console.log(
      user.email.padEnd(35) +
      lastLogin.padEnd(25) +
      firstVisit
    );
  }

  console.log('\nTotal users:', users.length);
}

whoLoggedIn();
