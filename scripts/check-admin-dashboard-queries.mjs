import * as supabaseModule from '../server/jarbou3-supabase.ts';
const { asService } = supabaseModule.default ?? supabaseModule;
const service = asService();
const start = new Date();
start.setHours(0, 0, 0, 0);
const checks = [
  ['todayOrders', service.from('orders').select('id,status,estimated_price,final_price,company_commission_amount,driver_net_amount,commission_calculated_at,created_at,updated_at,driver_id,source_address,destination_address').gte('created_at', start.toISOString()).order('updated_at', { ascending: false })],
  ['activeDrivers', service.from('users').select('id,name,last_location_lat,last_location_lng,last_location_at').eq('role', 'driver').eq('is_active', true).limit(12)],
  ['activeCustomers', service.from('users').select('id,name,last_location_lat,last_location_lng,last_location_at').eq('role', 'customer').eq('is_active', true).is('deleted_at', null).limit(50)],
  ['pendingDrivers', service.from('drivers_verification').select('id').eq('status', 'pending')],
  ['openShifts', service.from('driver_shifts').select('id').eq('is_closed', false)],
  ['latestOrders', service.from('orders').select('id,status,estimated_price,final_price,company_commission_amount,driver_net_amount,commission_calculated_at,created_at,updated_at,driver_id,source_address,destination_address').order('updated_at', { ascending: false }).limit(8)],
  ['notificationsOrders', service.from('orders').select('id,status,driver_id,created_at,updated_at').order('updated_at', { ascending: false }).limit(8)],
  ['notificationsVerifications', service.from('drivers_verification').select('user_id,status,created_at,updated_at').order('updated_at', { ascending: false }).limit(8)],
];
for (const [name, query] of checks) {
  const result = await query;
  console.log(name, result.error ? JSON.stringify({ code: result.error.code, message: result.error.message }) : 'OK');
}
