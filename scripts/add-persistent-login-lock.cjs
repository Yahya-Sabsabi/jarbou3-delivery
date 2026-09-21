const fs = require('fs');
const routerPath = '/home/ubuntu/jarbou3-delivery/server/routers.ts';
const appPath = '/home/ubuntu/jarbou3-delivery/components/jarbou3-app.tsx';
const adminPath = '/home/ubuntu/jarbou3-delivery/server/admin-web.ts';

let router = fs.readFileSync(routerPath, 'utf8');
const helperMarker = 'function clearLoginFailures(ip: string, phone: string) {\n  loginWindows.delete(`ip:${ip}`);\n  loginWindows.delete(`phone:${phone}`);\n  loginWindows.delete(`combined:${ip}:${phone}`);\n}\n';
const helperAddition = helperMarker + 'async function assertPersistentLoginAllowed(phone: string) {\n  const { data, error } = await asService().from("account_login_security").select("failed_attempts,locked_at").eq("phone", phone).maybeSingle();\n  if (error) throw new Error("LOGIN_SECURITY_UNAVAILABLE");\n  if (data?.locked_at) throw new Error("LOGIN_ACCOUNT_LOCKED");\n}\nasync function recordPersistentLoginFailure(phone: string) {\n  const service = asService();\n  const { data: current, error: readError } = await service.from("account_login_security").select("failed_attempts,locked_at").eq("phone", phone).maybeSingle();\n  if (readError) throw new Error("LOGIN_SECURITY_UNAVAILABLE");\n  const failedAttempts = Math.min(5, Number(current?.failed_attempts ?? 0) + 1);\n  const lockedAt = failedAttempts >= 5 ? current?.locked_at ?? new Date().toISOString() : null;\n  const { error } = await service.from("account_login_security").upsert({ phone, failed_attempts: failedAttempts, locked_at: lockedAt, updated_at: new Date().toISOString() }, { onConflict: "phone" });\n  if (error) throw new Error("LOGIN_SECURITY_UNAVAILABLE");\n}\nasync function clearPersistentLoginLock(phone: string) {\n  const { error } = await asService().from("account_login_security").delete().eq("phone", phone);\n  if (error) throw new Error("LOGIN_SECURITY_UNAVAILABLE");\n}\n';
if (!router.includes(helperMarker)) throw new Error('login helper marker not found');
router = router.replace(helperMarker, helperAddition);
router = router.replace('        assertLoginRateLimit(requestIp, phone);\n        const canonicalEmail', '        assertLoginRateLimit(requestIp, phone);\n        await assertPersistentLoginAllowed(phone);\n        const canonicalEmail');
router = router.replace('if (!profile) { recordLoginFailure(requestIp, phone); throw new Error("SIGN_IN_ACCOUNT_NOT_FOUND"); }', 'if (!profile) { recordLoginFailure(requestIp, phone); await recordPersistentLoginFailure(phone); throw new Error("SIGN_IN_ACCOUNT_NOT_FOUND"); }');
router = router.replace('if (error?.code === "invalid_credentials") recordLoginFailure(requestIp, phone);\n          throw new Error(error?.code === "invalid_credentials" ? "SIGN_IN_PASSWORD_INVALID" : "SIGN_IN_FAILED");', 'if (error?.code === "invalid_credentials") { recordLoginFailure(requestIp, phone); await recordPersistentLoginFailure(phone); }\n          throw new Error(error?.code === "invalid_credentials" ? "SIGN_IN_PASSWORD_INVALID" : "SIGN_IN_FAILED");');
router = router.replace('        clearLoginFailures(requestIp, phone);\n        const activeProfile', '        clearLoginFailures(requestIp, phone);\n        await clearPersistentLoginLock(phone);\n        const activeProfile');
router = router.replace('const { error: closeError } = await service.from("account_recovery_requests").update({ status: "completed", reset_token_hash: null, reset_token_expires_at: null }).eq("id", request.id);', 'const { error: closeError } = await service.from("account_recovery_requests").update({ status: "completed", reset_token_hash: null, reset_token_expires_at: null }).eq("id", request.id);');
router = router.replace('        if (closeError) throw new Error("RECOVERY_COMPLETE_FAILED");\n        const { error: onboardingSyncError }', '        if (closeError) throw new Error("RECOVERY_COMPLETE_FAILED");\n        await clearPersistentLoginLock(input.phone);\n        const { error: onboardingSyncError }');
fs.writeFileSync(routerPath, router);

let app = fs.readFileSync(appPath, 'utf8');
app = app.replace('    "LOGIN_RATE_LIMITED",', '    "LOGIN_RATE_LIMITED",\n    "LOGIN_ACCOUNT_LOCKED",');
app = app.replace('        : code === "LOGIN_RATE_LIMITED"\n          ? "تم إيقاف محاولات تسجيل الدخول مؤقتاً بعد خمس محاولات غير صحيحة. انتظر 15 دقيقة ثم حاول مجدداً، أو استخدم «نسيت كلمة المرور؟»."', '        : code === "LOGIN_ACCOUNT_LOCKED"\n          ? "تم حظر تسجيل الدخول لهذا الحساب بعد خمس محاولات غير صحيحة. استخدم «نسيت كلمة المرور؟» لإعادة تعيين كلمة المرور وفتح الحساب."\n        : code === "LOGIN_RATE_LIMITED"\n          ? "تم إيقاف محاولات تسجيل الدخول مؤقتاً بعد خمس محاولات غير صحيحة. انتظر 15 دقيقة ثم حاول مجدداً، أو استخدم «نسيت كلمة المرور؟»."');
fs.writeFileSync(appPath, app);

let admin = fs.readFileSync(adminPath, 'utf8');
const oldAdminUpdate = 'const { error } = await asService().from("admin_site_settings").update({ password_hash: passwordHash, password_set_at: now, updated_at: now }).eq("singleton", true);\n      if (error) throw new Error(error.message);';
const newAdminUpdate = 'const { data: updatedSettings, error } = await asService().from("admin_site_settings").update({ password_hash: passwordHash, password_set_at: now, updated_at: now }).eq("singleton", true).select("singleton").maybeSingle();\n      if (error) throw new Error(error.message);\n      if (!updatedSettings) throw new Error("SITE_PASSWORD_CONFIGURATION_ERROR");';
if (!admin.includes(oldAdminUpdate)) throw new Error('admin password update block not found');
admin = admin.replace(oldAdminUpdate, newAdminUpdate);
fs.writeFileSync(adminPath, admin);
console.log('Added persistent account lockout and verified admin password updates.');
