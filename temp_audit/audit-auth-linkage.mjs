import { createClient } from '@supabase/supabase-js';
const service = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: users, error } = await service.from('users').select('id,name,phone,role,is_active').in('role', ['customer','driver']).limit(50);
if (error) throw error;
const rows = [];
for (const user of users ?? []) {
  const result = await service.auth.admin.getUserById(user.id);
  const auth = result.data?.user;
  rows.push({ id: user.id, role: user.role, phoneSuffix: String(user.phone ?? '').slice(-4), active: user.is_active, authFound: Boolean(auth), authEmail: auth?.email ?? null, emailConfirmed: Boolean(auth?.email_confirmed_at), authCreatedAt: auth?.created_at ?? null });
}
console.log(JSON.stringify(rows, null, 2));
