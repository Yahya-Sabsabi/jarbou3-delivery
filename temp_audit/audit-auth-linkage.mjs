import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
const projectUrl = process.env.SUPABASE_URL.replace(/\/rest\/v1\/?$/, '');
const service = createClient(projectUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const normalizePhone = (value) => {
  let digits = String(value ?? '').replace(/[^0-9]/g, '');
  if (digits.startsWith('00963')) digits = digits.slice(2);
  if (/^09\\d{8}$/.test(digits)) digits = `963${digits.slice(1)}`;
  if (/^9\\d{8}$/.test(digits)) digits = `963${digits}`;
  return digits.length >= 8 && digits.length <= 16 ? `+${digits}` : '';
};
const authEmailForPhone = (phone) => `u-${createHash('sha256').update(phone).digest('hex')}@jarbou3.local`;
const { data: users, error } = await service.from('users').select('id,name,phone,role,is_active').in('role', ['customer','driver']).limit(50);
if (error) throw error;
const rows = [];
for (const user of users ?? []) {
  const result = await service.auth.admin.getUserById(user.id);
  const auth = result.data?.user;
  const normalizedPhone = normalizePhone(user.phone);
rows.push({ id: user.id, role: user.role, phoneSuffix: String(user.phone ?? '').slice(-4), normalizedSuffix: normalizedPhone.slice(-4), phoneCanonical: Boolean(normalizedPhone && normalizedPhone === user.phone), active: user.is_active, authFound: Boolean(auth), authEmailMatchesExpected: auth?.email === authEmailForPhone(normalizedPhone), emailConfirmed: Boolean(auth?.email_confirmed_at), authCreatedAt: auth?.created_at ?? null });
}
console.log(JSON.stringify(rows, null, 2));
