const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
if (!url || !key || !process.env.ADMIN_SITE_PASSWORD) throw new Error('required environment values are unavailable');
(async () => {
  const client = createClient(url, key);
  const { data, error } = await client.from('admin_site_settings').select('password_hash,password_set_at,updated_at').eq('singleton', true).single();
  if (error) throw error;
  console.log(JSON.stringify({ hasHash: Boolean(data?.password_hash), updatedAt: data?.updated_at, envMatchesDatabaseHash: Boolean(data?.password_hash && await bcrypt.compare(process.env.ADMIN_SITE_PASSWORD, data.password_hash)) }));
})();
