const fs = require('fs');
for (const path of ['/home/ubuntu/jarbou3-delivery/admin-site/app.js', '/home/ubuntu/jarbou3-delivery/admin-site/app.20260917-12.js']) {
  let source = fs.readFileSync(path, 'utf8');
  const old = 'function handleApiError(error) { if (error.status === 401 || error.status === 403) { logout(); return; } notify("تعذر تنفيذ الطلب الآن. تحقق من الاتصال أو من حالة الخدمة.", true); }';
  const next = 'function handleApiError(error) { if (error.status === 401 || error.status === 403) { logout(); return; } if (error.message === "SITE_PASSWORD_CONFIGURATION_ERROR") { notify("تعذر حفظ كلمة مرور الإدارة. تأكد من وجود إعداد الموقع ثم أعد المحاولة.", true); return; } if (error.message === "SITE_DASHBOARD_UNAVAILABLE") { notify("تعذر تحميل بيانات لوحة الإدارة. أعد تحميل الصفحة بعد لحظات.", true); return; } notify("تعذر تنفيذ الطلب الآن. تحقق من الاتصال أو من حالة الخدمة.", true); }';
  if (!source.includes(old)) throw new Error(`admin error handler not found in ${path}`);
  fs.writeFileSync(path, source.replace(old, next));
}
console.log('Improved admin error feedback for password and dashboard failures.');
