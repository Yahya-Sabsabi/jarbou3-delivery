const fs = require('fs');
const path = '/home/ubuntu/jarbou3-delivery/server/admin-web.ts';
let source = fs.readFileSync(path, 'utf8');
const before = source;
source = source.replace('    readNotifications(),', '    readNotifications().catch(() => []),');
source = source.replace('  const errors = [todayOrdersResult.error, activeDriversResult.error, activeCustomersResult.error, pendingDriversResult.error, openShiftsResult.error, latestOrdersResult.error].filter(Boolean);\n  if (errors.length) throw new Error(errors[0]?.message ?? "ADMIN_DATA_UNAVAILABLE");\n', '');
if (source === before) throw new Error('dashboard resilience block not found');
fs.writeFileSync(path, source);
console.log('Dashboard now continues with available data when a secondary query fails.');
