import { createClient } from '@supabase/supabase-js';
const url = process.env.SUPABASE_URL.replace(/\/rest\/v1\/$/, '');
const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: users, error: usersError } = await service.from('users').select('id,name,phone,role,is_active').in('role', ['customer','driver']).limit(20);
if (usersError) throw usersError;
const { data: requests, error: requestsError } = await service.from('account_recovery_requests').select('id,full_name,phone,requested_role,user_id,status,created_at,code_expires_at,retry_after').order('created_at', { ascending: false }).limit(20);
if (requestsError) throw requestsError;
const mask = value => typeof value === 'string' ? `${value.slice(0, 2)}***${value.slice(-2)}` : value;
console.log(JSON.stringify({ users: users.map(u => ({ ...u, name: mask(u.name), phone: mask(u.phone) })), requests: requests.map(r => ({ ...r, full_name: mask(r.full_name), phone: mask(r.phone) })) }, null, 2));
