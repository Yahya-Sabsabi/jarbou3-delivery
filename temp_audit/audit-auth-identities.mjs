import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const url = process.env.SUPABASE_URL.replace(/\/rest\/v1\/$/, '');
const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const normalize = (value) => {
  let digits = String(value ?? '').replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[^0-9]/g, '');
  if (digits.startsWith('00963')) digits = digits.slice(2);
  if (/^09\d{8}$/.test(digits)) digits = `963${digits.slice(1)}`;
  if (/^9\d{8}$/.test(digits)) digits = `963${digits}`;
  return digits.length >= 8 && digits.length <= 16 ? `+${digits}` : '';
};
const emailFor = phone => `u-${crypto.createHash('sha256').update(normalize(phone)).digest('hex')}@jarbou3.local`;
const { data: profiles, error: profileError } = await service.from('users').select('id,phone,role,is_active').in('role', ['customer', 'driver']).is('deleted_at', null).limit(1000);
if (profileError) throw profileError;
const { data: authPage, error: authError } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (authError) throw authError;
const authById = new Map(authPage.users.map(user => [user.id, user]));
const rows = profiles.map(profile => {
  const auth = authById.get(profile.id);
  const expected = emailFor(profile.phone);
  return { id: profile.id, role: profile.role, active: profile.is_active, phoneSuffix: String(profile.phone).slice(-4), authExists: Boolean(auth), emailMatches: auth?.email === expected, authConfirmed: Boolean(auth?.email_confirmed_at), expectedSuffix: expected.slice(0, 10), actualSuffix: auth?.email?.slice(0, 10) ?? null };
});
console.log(JSON.stringify({ count: rows.length, mismatches: rows.filter(row => !row.authExists || !row.emailMatches || !row.authConfirmed), sample: rows.slice(0, 10) }, null, 2));
