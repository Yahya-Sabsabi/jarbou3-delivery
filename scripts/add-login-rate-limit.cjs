const fs = require('fs');
const routerPath = '/home/ubuntu/jarbou3-delivery/server/routers.ts';
const appPath = '/home/ubuntu/jarbou3-delivery/components/jarbou3-app.tsx';

let router = fs.readFileSync(routerPath, 'utf8');
router = router.replace(
  'const onboardingWindows = new Map<string, { count: number; startedAt: number }>();\nconst ONBOARDING_WINDOW_MS = 15 * 60 * 1000;',
  'const onboardingWindows = new Map<string, { count: number; startedAt: number }>();\nconst loginWindows = new Map<string, { count: number; startedAt: number }>();\nconst LOGIN_WINDOW_MS = 15 * 60 * 1000;\nconst LOGIN_MAX_ATTEMPTS = 5;\nconst ONBOARDING_WINDOW_MS = 15 * 60 * 1000;'
);
router = router.replace(
  'function failOnboardingVerification(stage: "PROFILE_LOOKUP_FAILED" | "AUTH_ACCOUNT_UPDATE_FAILED" | "AUTH_ACCOUNT_CREATE_FAILED" | "PROFILE_UPDATE_FAILED" | "VERIFICATION_UPDATE_FAILED" | "SESSION_CREATE_FAILED"): never {',
  'function assertLoginRateLimit(ip: string, phone: string) {\n  const now = Date.now();\n  const keys = [`ip:${ip}`, `phone:${phone}`, `combined:${ip}:${phone}`];\n  for (const key of keys) {\n    const current = loginWindows.get(key);\n    if (current && now - current.startedAt <= LOGIN_WINDOW_MS && current.count >= LOGIN_MAX_ATTEMPTS) throw new Error("LOGIN_RATE_LIMITED");\n  }\n}\nfunction recordLoginFailure(ip: string, phone: string) {\n  const now = Date.now();\n  for (const key of [`ip:${ip}`, `phone:${phone}`, `combined:${ip}:${phone}`]) {\n    const current = loginWindows.get(key);\n    if (!current || now - current.startedAt > LOGIN_WINDOW_MS) loginWindows.set(key, { count: 1, startedAt: now });\n    else current.count += 1;\n  }\n}\nfunction clearLoginFailures(ip: string, phone: string) {\n  loginWindows.delete(`ip:${ip}`);\n  loginWindows.delete(`phone:${phone}`);\n  loginWindows.delete(`combined:${ip}:${phone}`);\n}\nfunction failOnboardingVerification(stage: "PROFILE_LOOKUP_FAILED" | "AUTH_ACCOUNT_UPDATE_FAILED" | "AUTH_ACCOUNT_CREATE_FAILED" | "PROFILE_UPDATE_FAILED" | "VERIFICATION_UPDATE_FAILED" | "SESSION_CREATE_FAILED"): never {'
);
router = router.replace(
  '      .mutation(async ({ input }) => {\n        const phone = normalizeJarbou3Phone(input.phone);\n        if (!phone) throw new Error("INVALID_PHONE");\n        const canonicalEmail = authEmailForPhone(phone);',
  '      .mutation(async ({ input, ctx }) => {\n        const phone = normalizeJarbou3Phone(input.phone);\n        if (!phone) throw new Error("INVALID_PHONE");\n        const requestIp = ctx.req.ip ?? "unknown";\n        assertLoginRateLimit(requestIp, phone);\n        const canonicalEmail = authEmailForPhone(phone);'
);
router = router.replace(
  '          if (!profile) throw new Error("SIGN_IN_ACCOUNT_NOT_FOUND");',
  '          if (!profile) { recordLoginFailure(requestIp, phone); throw new Error("SIGN_IN_ACCOUNT_NOT_FOUND"); }'
);
router = router.replace(
  '          authResult = await publicAuth.auth.signInWithPassword({ email: canonicalEmail, password: input.password });\n        }\n        const { data, error } = authResult;\n        if (error || !data.session) {',
  '          authResult = await publicAuth.auth.signInWithPassword({ email: canonicalEmail, password: input.password });\n        }\n        const { data, error } = authResult;\n        if (error || !data.session) {\n          if (error?.code === "invalid_credentials") recordLoginFailure(requestIp, phone);'
);
router = router.replace(
  '        const activeProfile = await getUserProfile(data.user.id);\n        return { accessToken:',
  '        clearLoginFailures(requestIp, phone);\n        const activeProfile = await getUserProfile(data.user.id);\n        return { accessToken:'
);
fs.writeFileSync(routerPath, router);

let app = fs.readFileSync(appPath, 'utf8');
app = app.replace('    "SIGN_IN_PASSWORD_INVALID",', '    "SIGN_IN_PASSWORD_INVALID",\n    "LOGIN_RATE_LIMITED",');
app = app.replace(
  '        : code === "SIGN_IN_PASSWORD_INVALID"\n          ? "كلمة المرور غير مطابقة لهذا الحساب. استخدم «نسيت كلمة المرور؟» لإعادة تعيينها."',
  '        : code === "LOGIN_RATE_LIMITED"\n          ? "تم إيقاف محاولات تسجيل الدخول مؤقتاً بعد خمس محاولات غير صحيحة. انتظر 15 دقيقة ثم حاول مجدداً، أو استخدم «نسيت كلمة المرور؟»."\n        : code === "SIGN_IN_PASSWORD_INVALID"\n          ? "كلمة المرور غير مطابقة لهذا الحساب. استخدم «نسيت كلمة المرور؟» لإعادة تعيينها."'
);
fs.writeFileSync(appPath, app);
console.log('Added bounded login-attempt protection.');
