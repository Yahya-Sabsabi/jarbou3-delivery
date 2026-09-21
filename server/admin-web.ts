import type { Express, Request, Response } from "express";
import { parse as parseCookie } from "cookie";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { createHash, createHmac, randomInt, timingSafeEqual } from "node:crypto";

import { asService } from "./jarbou3-supabase";
import { generateManualArchive, listManualArchives, prepareManualArchiveDownload, purgeManualArchive } from "./jarbou3-manual-archive";
import { calculateTripFinance } from "./jarbou3-finance";
import { buildAdminNotifications, normalizeReportMonth, type AdminNotification } from "./admin-web-utils";

const SITE_COOKIE = "jarbou3_admin_access";
const SITE_SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;
const loginAttempts = new Map<string, { count: number; startedAt: number }>();
const VERIFICATION_CODE_MS = 10 * 60 * 1000;
const ADMIN_PUBLIC_ORIGIN = "https://jarbou-deliv-xoohmte2.manus.space";

type SiteSession = { issuedAt: number; expiresAt: number };

function getProtocol(req: Request) {
  const forwarded = req.headers["x-forwarded-proto"];
  const fromProxy = typeof forwarded === "string" ? forwarded.split(",")[0].trim() : undefined;
  return fromProxy || req.protocol || "https";
}

function cookieOptions(req: Request) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: getProtocol(req) === "https",
    maxAge: SITE_SESSION_MS,
    path: "/admin",
  };
}

function requestToken(req: Request) {
  return parseCookie(req.headers.cookie ?? "")[SITE_COOKIE] ?? null;
}

function requestKey(req: Request) {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function currentAttempt(key: string) {
  const current = loginAttempts.get(key);
  if (!current || Date.now() - current.startedAt > LOGIN_WINDOW_MS) {
    const next = { count: 0, startedAt: Date.now() };
    loginAttempts.set(key, next);
    return next;
  }
  return current;
}

function sessionSigningSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.ADMIN_SITE_PASSWORD;
  if (!secret || secret.length < 16) throw new Error("ADMIN_SESSION_SECRET_NOT_CONFIGURED");
  return secret;
}

function sign(value: string) {
  return createHmac("sha256", sessionSigningSecret()).update(value).digest("base64url");
}

function createSiteSession() {
  const now = Date.now();
  const payload: SiteSession = { issuedAt: now, expiresAt: now + SITE_SESSION_MS };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

function requireSiteSession(req: Request): SiteSession {
  const token = requestToken(req);
  if (!token) throw new Error("SITE_SESSION_REQUIRED");
  const [encoded, receivedSignature, ...rest] = token.split(".");
  if (!encoded || !receivedSignature || rest.length) throw new Error("SITE_SESSION_REQUIRED");
  const expectedBuffer = Buffer.from(sign(encoded));
  const receivedBuffer = Buffer.from(receivedSignature);
  if (expectedBuffer.length !== receivedBuffer.length || !timingSafeEqual(expectedBuffer, receivedBuffer)) throw new Error("SITE_SESSION_REQUIRED");
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SiteSession;
    if (!Number.isFinite(payload.issuedAt) || !Number.isFinite(payload.expiresAt) || payload.expiresAt <= Date.now()) throw new Error("SITE_SESSION_REQUIRED");
    return payload;
  } catch {
    throw new Error("SITE_SESSION_REQUIRED");
  }
}

function passwordMatches(value: string) {
  return asService().from("admin_site_settings").select("password_hash").eq("singleton", true).single().then(async ({ data, error }) => {
    if (error) throw new Error(error.message);
    return Boolean(data?.password_hash) && bcrypt.compare(value, data.password_hash);
  });
}

function recoveryTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function recoveryPageHtml() {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>استرداد دخول الإدارة</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f5f5f5;color:#171717;font-family:Arial,sans-serif}.card{max-width:420px;margin:24px;background:#fff;border:1px solid #ddd;border-radius:18px;padding:32px;text-align:center;box-shadow:0 12px 28px #0001}h1{font-size:22px;margin:0 0 12px}p{line-height:1.7;color:#555;margin:0}</style></head><body><main class="card"><h1>جارٍ فتح بوابة الإدارة</h1><p id="status">يُتحقق من رابط الاسترداد الآمن…</p></main><script>const token=location.hash.slice(1);const status=document.getElementById('status');if(!/^[a-f0-9]{64}$/.test(token)){status.textContent='رابط الاسترداد غير صالح أو انتهت صلاحيته.'}else{fetch('/admin/api/recover',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({token})}).then(async r=>{if(!r.ok)throw new Error();history.replaceState(null,'','/admin');location.replace('/admin')}).catch(()=>{status.textContent='رابط الاسترداد غير صالح أو تم استخدامه أو انتهت صلاحيته.'})}</script></body></html>`;
}

function setupPageHtml() {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>جربوع | تهيئة بوابة الإدارة</title><style>:root{font-family:Arial,Tahoma,sans-serif;color:#18212a;background:#f4f7f8}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px}.card{width:min(100%,460px);background:#fff;border:1px solid #dbe3e7;border-radius:22px;padding:36px;box-shadow:0 18px 45px #0c18221a}.mark{width:42px;height:42px;display:grid;place-items:center;border-radius:14px;background:#1c6d77;color:#fff;font-size:21px;font-weight:700}.eyebrow{margin:24px 0 8px;color:#1c6d77;font-weight:700;font-size:13px}.muted{color:#66737c;line-height:1.8;margin:0 0 24px}h1{font-size:27px;margin:0 0 10px}label{display:block;font-weight:700;margin:18px 0 8px}input{width:100%;border:1px solid #cbd6db;border-radius:12px;padding:13px;font:inherit;direction:ltr;text-align:left}button,.button{width:100%;display:block;border:0;border-radius:12px;background:#1c6d77;color:#fff;padding:14px;margin-top:24px;font:700 16px Arial;text-align:center;text-decoration:none;cursor:pointer}button:disabled{opacity:.65;cursor:wait}.note{line-height:1.8;color:#66737c}.error{color:#b42318;font-weight:700;line-height:1.6;margin:16px 0 0}</style></head><body><main class="card"><div class="mark">ج</div><p class="eyebrow">تهيئة أولى لمرة واحدة</p><h1>اختر كلمة مرور الإدارة</h1><p class="muted">بعد الحفظ يُقفل الموقع فوراً، ولن يتمكن أي شخص من الدخول إلا بكلمة المرور التي تختارها الآن.</p><form id="setup-form" hidden><label for="password">كلمة المرور الجديدة</label><input id="password" type="password" autocomplete="new-password" minlength="16" placeholder="16 حرفاً على الأقل" required><label for="confirmation">تأكيد كلمة المرور</label><input id="confirmation" type="password" autocomplete="new-password" minlength="16" placeholder="أعد كتابة كلمة المرور" required><p id="error" class="error" hidden role="alert"></p><button id="submit" type="submit">حفظ كلمة المرور وفتح الموقع</button></form><div id="configured" hidden><p class="note">تم إعداد كلمة مرور الموقع بالفعل.</p><a class="button" href="/admin">فتح بوابة الإدارة</a></div><p id="loading" class="note">جارٍ فتح التهيئة…</p></main><script>const form=document.getElementById('setup-form'),configured=document.getElementById('configured'),loading=document.getElementById('loading'),errorBox=document.getElementById('error'),submit=document.getElementById('submit');const fail=t=>{errorBox.textContent=t;errorBox.hidden=false};async function request(url,options={}){const r=await fetch(url,{credentials:'same-origin',headers:{'Content-Type':'application/json'},...options});const p=await r.json().catch(()=>({}));if(!r.ok){const e=new Error(p.error||'REQUEST_FAILED');e.status=r.status;throw e}return p}(async()=>{try{const state=await request('/admin/api/setup-status');loading.hidden=true;if(state.setupRequired)form.hidden=false;else configured.hidden=false}catch{loading.textContent='تعذر فتح التهيئة. أعد تحميل الصفحة.'}})();form.addEventListener('submit',async e=>{e.preventDefault();const password=document.getElementById('password').value,confirmation=document.getElementById('confirmation').value;errorBox.hidden=true;if(password.length<16)return fail('استخدم كلمة مرور بطول 16 حرفاً على الأقل.');if(password!==confirmation)return fail('كلمتا المرور غير متطابقتين.');submit.disabled=true;submit.textContent='جارٍ حفظ القفل…';try{await request('/admin/api/setup',{method:'POST',body:JSON.stringify({password,confirmation})});location.replace('/admin')}catch(e){fail(e.status===409?'تم إعداد الموقع بالفعل. افتح بوابة الإدارة.':'تعذر حفظ كلمة المرور. أعد المحاولة.');submit.disabled=false;submit.textContent='حفظ كلمة المرور وفتح الموقع'}})</script></body></html>`;
}

function safeSetupPageHtml() {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>جربوع | تهيئة بوابة الإدارة</title><style>:root{font-family:Arial,Tahoma,sans-serif;color:#18212a;background:#f4f7f8}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px}.card{width:min(100%,460px);background:#fff;border:1px solid #dbe3e7;border-radius:22px;padding:36px;box-shadow:0 18px 45px #0c18221a}.mark{width:42px;height:42px;display:grid;place-items:center;border-radius:14px;background:#1c6d77;color:#fff;font-size:21px;font-weight:700}.eyebrow{margin:24px 0 8px;color:#1c6d77;font-weight:700;font-size:13px}.muted{color:#66737c;line-height:1.8;margin:0 0 24px}h1{font-size:27px;margin:0 0 10px}label{display:block;font-weight:700;margin:18px 0 8px}input{width:100%;border:1px solid #cbd6db;border-radius:12px;padding:13px;font:inherit;direction:ltr;text-align:left}button,.button{width:100%;display:block;border:0;border-radius:12px;background:#1c6d77;color:#fff;padding:14px;margin-top:24px;font:700 16px Arial;text-align:center;text-decoration:none;cursor:pointer}button:disabled{opacity:.65;cursor:wait}.note{line-height:1.8;color:#66737c}.error{color:#b42318;font-weight:700;line-height:1.6;margin:16px 0 0}</style></head><body><main class="card"><div class="mark">ج</div><p class="eyebrow">تهيئة أولى لمرة واحدة</p><h1>اختر كلمة مرور الإدارة</h1><p class="muted">بعد الحفظ يُقفل الموقع فوراً، ولن يتمكن أي شخص من الدخول إلا بكلمة المرور التي تختارها الآن.</p><form id="setup-form" hidden><label for="password">كلمة المرور الجديدة</label><input id="password" type="password" autocomplete="new-password" minlength="16" placeholder="16 حرفاً على الأقل" required><label for="confirmation">تأكيد كلمة المرور</label><input id="confirmation" type="password" autocomplete="new-password" minlength="16" placeholder="أعد كتابة كلمة المرور" required><p id="error" class="error" hidden role="alert"></p><button id="save-button" type="submit">حفظ كلمة المرور وفتح الموقع</button></form><div id="configured" hidden><p class="note">تم إعداد كلمة مرور الموقع بالفعل.</p><a class="button" href="/admin">فتح بوابة الإدارة</a></div><p id="loading" class="note">جارٍ فتح التهيئة…</p></main><script>(()=>{const form=document.getElementById('setup-form');const configured=document.getElementById('configured');const loading=document.getElementById('loading');const errorBox=document.getElementById('error');const saveButton=document.getElementById('save-button');const showError=(text)=>{errorBox.textContent=text;errorBox.hidden=false};const call=async(url,options={})=>{const response=await fetch(url,{credentials:'same-origin',...options});const data=await response.json().catch(()=>({}));if(!response.ok){const error=new Error(data.error||'REQUEST_FAILED');error.status=response.status;throw error}return data};call('/admin/api/setup-status').then(state=>{loading.hidden=true;if(state.setupRequired)form.hidden=false;else configured.hidden=false}).catch(()=>{loading.textContent='تعذر فتح التهيئة. أعد تحميل الصفحة.'});form.addEventListener('submit',async(event)=>{event.preventDefault();const password=document.getElementById('password').value;const confirmation=document.getElementById('confirmation').value;errorBox.hidden=true;if(password.length<16)return showError('استخدم كلمة مرور بطول 16 حرفاً على الأقل.');if(password!==confirmation)return showError('كلمتا المرور غير متطابقتين.');saveButton.disabled=true;saveButton.textContent='جارٍ حفظ القفل…';try{await call('/admin/api/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password,confirmation})});location.replace('/admin')}catch(error){showError(error.status===409?'تم إعداد الموقع بالفعل. افتح بوابة الإدارة.':'تعذر حفظ كلمة المرور. أعد المحاولة.');saveButton.disabled=false;saveButton.textContent='حفظ كلمة المرور وفتح الموقع'}})})()</script></body></html>`;
}

function canonicalSetupPageHtml() {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>جربوع | تهيئة بوابة الإدارة</title><link rel="stylesheet" href="/admin/styles.css"></head><body><main class="login-layout"><section class="login-aside" aria-hidden="true"><div class="brand-lockup"><span class="brand-mark">ج</span><span>جربوع</span></div><div class="aside-copy"><p class="eyebrow">تهيئة أولى لمرة واحدة</p><h1>قفل بوابة الإدارة بكلمة مرورك.</h1><p>بعد الحفظ يصبح هذا الرابط نفسه محمياً، ولا يمكن فتحه لاحقاً إلا بكلمة المرور التي تختارها الآن.</p></div></section><section class="login-panel"><div class="login-card"><div class="mobile-brand"><span class="brand-mark small">ج</span><span>جربوع</span></div><p class="eyebrow">الخطوة الأخيرة</p><h2>اختر كلمة مرور الإدارة</h2><p class="muted">استخدم 16 حرفاً على الأقل، واحفظها في مكان آمن.</p><form id="canonical-setup-form" novalidate><label for="canonical-setup-password">كلمة المرور الجديدة</label><input id="canonical-setup-password" autocomplete="new-password" type="password" placeholder="16 حرفاً على الأقل" minlength="16" required><label for="canonical-setup-confirmation">تأكيد كلمة المرور</label><input id="canonical-setup-confirmation" autocomplete="new-password" type="password" placeholder="أعد كتابة كلمة المرور" minlength="16" required><p id="canonical-setup-error" class="form-error" role="alert" hidden></p><button id="canonical-setup-button" class="primary-button" type="submit">حفظ كلمة المرور وفتح الموقع</button></form><p class="security-note">هذه التهيئة متاحة مرة واحدة فقط.</p></div></section></main><script src="/admin/setup-page.js?v=canonical-setup-1" defer></script></body></html>`;
}

function rejectForeignOrigin(req: Request, res: Response) {
  const origin = req.headers.origin;
  if (!origin) return false;
  try {
    // The public gateway can terminate HTTPS before forwarding to this server.
    // The production host is therefore checked explicitly in addition to the local host.
    const normalizedOrigin = new URL(origin).origin;
    if (normalizedOrigin === ADMIN_PUBLIC_ORIGIN) return false;
    if (req.headers.host && new URL(origin).host === req.headers.host) return false;
  } catch {
    // Fall through to the rejection below for malformed Origin headers.
  }
  res.status(403).json({ error: "REQUEST_ORIGIN_REJECTED" });
  return true;
}

function siteErrorStatus(error: unknown) {
  return error instanceof Error && error.message === "SITE_SESSION_REQUIRED" ? 401 : 503;
}

async function readNotifications(): Promise<AdminNotification[]> {
  const service = asService();
  const [ordersResult, verificationResult] = await Promise.all([
    service.from("orders").select("id,status,driver_id,created_at,updated_at").order("updated_at", { ascending: false }).limit(8),
    service.from("drivers_verification").select("user_id,status,created_at,updated_at").order("updated_at", { ascending: false }).limit(8),
  ]);
  if (ordersResult.error) throw new Error(ordersResult.error.message);
  if (verificationResult.error) throw new Error(verificationResult.error.message);
  return buildAdminNotifications(ordersResult.data ?? [], verificationResult.data ?? []);
}

type FinancialOrder = {
  status: string;
  estimated_price: number | null;
  final_price: number | null;
  company_commission_amount: number | null;
  driver_net_amount: number | null;
  commission_calculated_at: string | null;
};

function financialSnapshot(order: FinancialOrder) {
  const grossAmount = Number(order.final_price ?? order.estimated_price ?? 0);
  if (order.commission_calculated_at) {
    return {
      grossAmount,
      companyCommissionAmount: Number(order.company_commission_amount ?? 0),
      driverNetAmount: Number(order.driver_net_amount ?? 0),
    };
  }
  return calculateTripFinance(grossAmount);
}

function summarizeCompletedOrders(orders: FinancialOrder[]) {
  return orders
    .filter((order) => order.status === "delivered")
    .reduce(
      (summary, order) => {
        const snapshot = financialSnapshot(order);
        summary.completedTrips += 1;
        summary.grossRevenue += snapshot.grossAmount;
        summary.companyCommission += snapshot.companyCommissionAmount;
        summary.driverNetAmount += snapshot.driverNetAmount;
        return summary;
      },
      { completedTrips: 0, grossRevenue: 0, companyCommission: 0, driverNetAmount: 0 },
    );
}

function reportMonthWindow(reportMonth: string) {
  const start = new Date(`${reportMonth}T00:00:00+03:00`);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

async function readFinancialSummary(reportMonth: string) {
  const { start, end } = reportMonthWindow(reportMonth);
  const { data, error } = await asService()
    .from("orders")
    .select("status,estimated_price,final_price,company_commission_amount,driver_net_amount,commission_calculated_at")
    .eq("status", "delivered")
    .gte("delivered_at", start)
    .lt("delivered_at", end)
    .limit(10_000);
  if (error) throw new Error(error.message);
  return { reportMonth, ...summarizeCompletedOrders((data ?? []) as FinancialOrder[]) };
}

async function readDashboard() {
  const service = asService();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const [todayOrdersResult, activeDriversResult, activeCustomersResult, pendingDriversResult, openShiftsResult, latestOrdersResult, notifications] = await Promise.all([
    service.from("orders").select("id,status,estimated_price,final_price,company_commission_amount,driver_net_amount,commission_calculated_at,created_at,updated_at,driver_id,source_address,destination_address").gte("created_at", startOfDay.toISOString()).order("updated_at", { ascending: false }),
    service.from("users").select("id,name,last_location_lat,last_location_lng,last_location_at").eq("role", "driver").eq("is_active", true).limit(12),
    service.from("users").select("id,name,last_location_lat,last_location_lng,last_location_at").eq("role", "customer").eq("is_active", true).is("deleted_at", null).limit(50),
    service.from("drivers_verification").select("id").eq("status", "pending"),
    service.from("driver_shifts").select("id").eq("is_closed", false),
    service.from("orders").select("id,status,estimated_price,final_price,company_commission_amount,driver_net_amount,commission_calculated_at,created_at,updated_at,driver_id,source_address,destination_address").order("updated_at", { ascending: false }).limit(8),
    readNotifications().catch(() => []),
  ]);

  const todayOrders = todayOrdersResult.data ?? [];
  const finance = summarizeCompletedOrders(todayOrders as FinancialOrder[]);
  return {
    metrics: {
      todayOrders: todayOrders.length,
      activeDrivers: (activeDriversResult.data ?? []).length,
      pendingDrivers: (pendingDriversResult.data ?? []).length,
      openShifts: (openShiftsResult.data ?? []).length,
      ...finance,
    },
    orders: latestOrdersResult.data ?? [],
    drivers: activeDriversResult.data ?? [],
    customers: activeCustomersResult.data ?? [],
    notifications,
  };
}

async function listReports() {
  const { data, error } = await asService().from("monthly_reports").select("id,report_month,status,generated_at,downloaded_at,storage_path,error_message").order("report_month", { ascending: false }).limit(18);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function listAccountVerifications() {
  const { data, error } = await asService().from("account_verification_requests").select("id,full_name,phone,requested_role,vehicle_type,status,personal_photo_path,identity_photo_path,code_expires_at,created_at,updated_at").in("status", ["pending_admin", "code_sent", "locked", "expired"]).order("updated_at", { ascending: false }).limit(100);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function listRecoveryRequests() {
  const { data, error } = await asService().from("account_recovery_requests").select("id,full_name,phone,requested_role,status,code_expires_at,retry_after,created_at,updated_at").in("status", ["pending_admin", "code_sent", "locked"]).order("created_at", { ascending: true }).limit(40);
  if (error) throw new Error(error.message);
  return data ?? [];
}

const loginSchema = z.object({ password: z.string().min(16).max(512) });
const siteSetupSchema = z.object({ password: z.string().min(16).max(512), confirmation: z.string().min(16).max(512) }).refine((value) => value.password === value.confirmation, { message: "PASSWORD_CONFIRMATION_MISMATCH" });
const generateReportSchema = z.object({ reportMonth: z.string() });
const discountSchema = z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,32}$/), discountType: z.enum(["fixed", "percentage"]), discountValue: z.number().positive(), startsAt: z.string().datetime().nullable().optional(), endsAt: z.string().datetime().nullable().optional(), maxUsesPerCustomer: z.number().int().positive().max(1_000_000).nullable().optional(), maxTotalUses: z.number().int().positive().max(10_000_000).nullable().optional(), audience: z.enum(["public", "selected"]).default("public"), customerIds: z.array(z.string().uuid()).max(50).default([]) }).superRefine((value, context) => {
  if (value.discountType === "percentage" && value.discountValue > 100) context.addIssue({ code: "custom", message: "PERCENTAGE_TOO_HIGH" });
  if (value.endsAt && value.startsAt && new Date(value.endsAt).getTime() <= new Date(value.startsAt).getTime()) context.addIssue({ code: "custom", message: "INVALID_DISCOUNT_WINDOW" });
  if (value.audience === "selected" && value.customerIds.length === 0) context.addIssue({ code: "custom", message: "DISCOUNT_RECIPIENTS_REQUIRED" });
});
const archiveSchema = z.object({ archiveKind: z.enum(["weekly_documents", "monthly_text"]), periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
const driverCompanyPaymentSchema = z.object({ amount: z.number().int().positive().max(100_000_000), paymentMethod: z.literal("cash"), paymentReference: z.string().trim().max(120).nullable().optional(), note: z.string().trim().max(500).nullable().optional() });
const driverInviteSchema = z.object({ fullName: z.string().trim().min(2).max(100), phone: z.string().trim().min(8).max(24), vehicleType: z.enum(["motorcycle", "electric_scooter"]).nullable().optional(), note: z.string().trim().max(500).nullable().optional() });
const problemReportStatusSchema = z.object({ status: z.enum(["open", "reviewed", "resolved"]), adminNote: z.string().trim().max(1000).nullable().optional() });
const pricingSettingsSchema = z.object({ minimumFare: z.number().int().positive().max(1_000_000_000), perKm: z.number().int().positive().max(1_000_000_000), perMinute: z.number().int().nonnegative().max(1_000_000_000) });
const releaseSchema = z.object({ minVersion: z.string().regex(/^\d+\.\d+\.\d+$/).nullable(), forceUpdate: z.boolean(), updateUrl: z.string().url().nullable() }).superRefine((value, context) => {
  if (value.forceUpdate && (!value.minVersion || !value.updateUrl)) context.addIssue({ code: "custom", message: "FORCED_RELEASE_REQUIRES_VERSION_AND_URL" });
});

async function listManagedAccounts() {
  const service = asService();
  const [usersResult, onboardingResult, driverVerificationResult] = await Promise.all([
    service.from("users").select("id,name,phone,role,is_active,created_at").in("role", ["customer", "driver"]).is("deleted_at", null).order("created_at", { ascending: false }).limit(250),
    service.from("account_verification_requests").select("auth_user_id,phone,personal_photo_path,identity_photo_path,status,created_at").not("auth_user_id", "is", null).order("created_at", { ascending: false }).limit(300),
    service.from("drivers_verification").select("user_id,personal_photo_path,id_photo_path,status,updated_at").limit(300),
  ]);
  if (usersResult.error || onboardingResult.error || driverVerificationResult.error) throw new Error(usersResult.error?.message ?? onboardingResult.error?.message ?? driverVerificationResult.error?.message ?? "ACCOUNTS_UNAVAILABLE");
  const onboardingByUser = new Map((onboardingResult.data ?? []).map((row) => [row.auth_user_id, row]));
  const driverByUser = new Map((driverVerificationResult.data ?? []).map((row) => [row.user_id, row]));
  return (usersResult.data ?? []).map((user) => {
    const onboarding = onboardingByUser.get(user.id);
    const driver = driverByUser.get(user.id);
    return { ...user, verificationStatus: driver?.status ?? onboarding?.status ?? null, personalPhotoPath: driver?.personal_photo_path ?? onboarding?.personal_photo_path ?? null, identityPhotoPath: driver?.id_photo_path ?? onboarding?.identity_photo_path ?? null };
  });
}

function normalizeJarbou3Phone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 16) throw new Error("INVALID_PHONE");
  return `+${digits}`;
}

async function listFleetMap() {
  const service = asService();
  const driverLocationCutoff = Date.now() - 30_000;
  const customerLocationCutoff = Date.now() - 30_000;
  const [{ data: driverRows, error: driverError }, { data: customerRows, error: customerError }] = await Promise.all([
    service.from("users").select("id,name,last_location_lat,last_location_lng,last_location_at").eq("role", "driver").eq("is_active", true).order("last_location_at", { ascending: false, nullsFirst: false }).limit(100),
    service.from("users").select("id,name,last_location_lat,last_location_lng,last_location_at").eq("role", "customer").eq("is_active", true).is("deleted_at", null).order("last_location_at", { ascending: false, nullsFirst: false }).limit(250),
  ]);
  if (driverError || customerError) throw new Error(driverError?.message ?? customerError?.message ?? "FLEET_MAP_UNAVAILABLE");
  const drivers = driverRows ?? [];
  const driverIds = drivers.map((driver) => driver.id);
  if (!driverIds.length) return { generatedAt: new Date().toISOString(), drivers: [], customers: (customerRows ?? []).map((customer) => {
    const lastLocationMs = customer.last_location_at ? new Date(customer.last_location_at).getTime() : 0;
    const isFresh = Number.isFinite(lastLocationMs) && lastLocationMs >= customerLocationCutoff;
    return { id: customer.id, name: customer.name, latitude: isFresh && customer.last_location_lat != null ? Number(customer.last_location_lat) : null, longitude: isFresh && customer.last_location_lng != null ? Number(customer.last_location_lng) : null, lastLocationAt: isFresh ? customer.last_location_at : null };
  }) };

  const [ordersResult, metricsResult] = await Promise.all([
    service.from("orders").select("id,driver_id,status,source_address,source_lat,source_lng,destination_address,destination_lat,destination_lng,estimated_price,final_price,accepted_at,updated_at").in("driver_id", driverIds).in("status", ["accepted", "arriving", "awaiting_otp"]).order("updated_at", { ascending: false }).limit(200),
    service.from("order_trip_metrics").select("order_id,started_at,actual_distance_m,moving_seconds,last_recorded_at").in("driver_id", driverIds).limit(200),
  ]);
  if (ordersResult.error || metricsResult.error) throw new Error(ordersResult.error?.message ?? metricsResult.error?.message ?? "FLEET_MAP_UNAVAILABLE");
  const activeOrderByDriver = new Map<string, any>();
  for (const order of ordersResult.data ?? []) if (!activeOrderByDriver.has(order.driver_id)) activeOrderByDriver.set(order.driver_id, order);
  const activeOrderIds = Array.from(activeOrderByDriver.values()).map((order) => order.id);
  const { data: points, error: pointsError } = activeOrderIds.length ? await service.from("order_trip_points").select("order_id,latitude,longitude,recorded_at").in("order_id", activeOrderIds).order("recorded_at", { ascending: true }).limit(1_200) : { data: [], error: null };
  if (pointsError) throw new Error(pointsError.message);
  const metricsByOrder = new Map((metricsResult.data ?? []).map((metric) => [metric.order_id, metric]));
  const pointsByOrder = new Map<string, Array<{ latitude: number; longitude: number; recordedAt: string }>>();
  for (const point of points ?? []) {
    const route = pointsByOrder.get(point.order_id) ?? [];
    route.push({ latitude: Number(point.latitude), longitude: Number(point.longitude), recordedAt: point.recorded_at });
    pointsByOrder.set(point.order_id, route);
  }
  return { generatedAt: new Date().toISOString(), drivers: drivers.map((driver) => {
    const order = activeOrderByDriver.get(driver.id);
    const metrics = order ? metricsByOrder.get(order.id) : null;
    const lastLocationMs = driver.last_location_at ? new Date(driver.last_location_at).getTime() : 0;
    const isFresh = Number.isFinite(lastLocationMs) && lastLocationMs >= driverLocationCutoff;
    return { id: driver.id, name: driver.name, latitude: isFresh && driver.last_location_lat != null ? Number(driver.last_location_lat) : null, longitude: isFresh && driver.last_location_lng != null ? Number(driver.last_location_lng) : null, lastLocationAt: isFresh ? driver.last_location_at : null, activeOrder: order ? { id: order.id, status: order.status, sourceAddress: order.source_address, source: { latitude: Number(order.source_lat), longitude: Number(order.source_lng) }, destinationAddress: order.destination_address, destination: { latitude: Number(order.destination_lat), longitude: Number(order.destination_lng) }, estimatedPrice: Number(order.final_price ?? order.estimated_price ?? 0), acceptedAt: order.accepted_at, actualDistanceM: Number(metrics?.actual_distance_m ?? 0), movingSeconds: Number(metrics?.moving_seconds ?? 0), startedAt: metrics?.started_at ?? order.accepted_at, route: pointsByOrder.get(order.id) ?? [] } : null };
  }) , customers: (customerRows ?? []).map((customer) => {
    const lastLocationMs = customer.last_location_at ? new Date(customer.last_location_at).getTime() : 0;
    const isFresh = Number.isFinite(lastLocationMs) && lastLocationMs >= customerLocationCutoff;
    return { id: customer.id, name: customer.name, latitude: isFresh && customer.last_location_lat != null ? Number(customer.last_location_lat) : null, longitude: isFresh && customer.last_location_lng != null ? Number(customer.last_location_lng) : null, lastLocationAt: isFresh ? customer.last_location_at : null };
  }) };
}

export function registerAdminWebRoutes(app: Express) {
  app.get("/admin", async (_req, res, next) => {
    try {
      const { data, error } = await asService().from("admin_site_settings").select("password_hash").eq("singleton", true).single();
      if (error) throw new Error(error.message);
      if (data?.password_hash) {
        next();
        return;
      }
      res.setHeader("Referrer-Policy", "no-referrer");
      res.setHeader("X-Frame-Options", "DENY");
      res.status(200).type("html").send(canonicalSetupPageHtml());
    } catch {
      res.status(503).type("html").send("<!doctype html><html lang=\"ar\" dir=\"rtl\"><meta charset=\"utf-8\"><title>تعذر فتح الإدارة</title><body><p>تعذر فتح إعداد بوابة الإدارة. أعد المحاولة لاحقاً.</p></body></html>");
    }
  });
  app.use("/admin/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.get("/admin/api/setup-page", (_req, res) => {
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    res.status(200).type("html").send(safeSetupPageHtml());
  });
  app.get("/admin/api/setup-status", async (_req, res) => {
    try {
      const { data, error } = await asService().from("admin_site_settings").select("password_hash").eq("singleton", true).single();
      if (error) throw new Error(error.message);
      const setupRequired = !data?.password_hash;
      if (_req.headers.accept?.includes("text/html")) {
        res.setHeader("Referrer-Policy", "no-referrer");
        res.setHeader("X-Frame-Options", "DENY");
        res.status(200).type("html").send(safeSetupPageHtml());
        return;
      }
      res.json({ setupRequired });
    } catch {
      res.status(503).json({ error: "SITE_SETUP_UNAVAILABLE" });
    }
  });
  app.post("/admin/api/setup", async (req, res) => {
    if (rejectForeignOrigin(req, res)) return;
    const parsed = siteSetupSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "INVALID_SETUP_PASSWORD" });
    try {
      const passwordHash = await bcrypt.hash(parsed.data.password, 12);
      const now = new Date().toISOString();
      const { data, error } = await asService().from("admin_site_settings").update({ password_hash: passwordHash, password_set_at: now, updated_at: now }).eq("singleton", true).is("password_hash", null).select("singleton").maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return res.status(409).json({ error: "SITE_ALREADY_CONFIGURED" });
      loginAttempts.clear();
      res.cookie(SITE_COOKIE, createSiteSession(), cookieOptions(req));
      res.json({ user: { name: "مالك الموقع", role: "owner" } });
    } catch {
      res.status(503).json({ error: "SITE_SETUP_UNAVAILABLE" });
    }
  });
  app.post("/admin/api/password", async (req, res) => {
    if (rejectForeignOrigin(req, res)) return;
    const parsed = siteSetupSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "INVALID_NEW_SITE_PASSWORD" });
    try {
      requireSiteSession(req);
      const now = new Date().toISOString();
      const passwordHash = await bcrypt.hash(parsed.data.password, 12);
      const { data: updatedSettings, error } = await asService().from("admin_site_settings").upsert({ singleton: true, password_hash: passwordHash, password_set_at: now, updated_at: now }, { onConflict: "singleton" }).select("singleton").single();
      if (error) throw new Error(error.message);
      if (!updatedSettings?.singleton) throw new Error("SITE_PASSWORD_CONFIGURATION_ERROR");
      loginAttempts.clear();
      res.cookie(SITE_COOKIE, createSiteSession(), cookieOptions(req));
      res.json({ changed: true });
    } catch (error) {
      res.status(siteErrorStatus(error)).json({ error: error instanceof Error ? error.message : "SITE_PASSWORD_CHANGE_FAILED" });
    }
  });
  app.post("/admin/api/login", async (req, res) => {
    if (rejectForeignOrigin(req, res)) return;
    const key = requestKey(req);
    const attempt = currentAttempt(key);
    if (attempt.count >= LOGIN_MAX_ATTEMPTS) {
      res.status(429).json({ error: "LOGIN_RATE_LIMITED" });
      return;
    }
    const parsed = loginSchema.safeParse(req.body);
    try {
      if (!parsed.success || !(await passwordMatches(parsed.data.password))) {
        attempt.count += 1;
        res.status(401).json({ error: "INVALID_SITE_PASSWORD" });
        return;
      }
    } catch (error) {
      res.status(error instanceof Error && error.message === "ADMIN_SESSION_SECRET_NOT_CONFIGURED" ? 503 : 500).json({ error: "SITE_PASSWORD_CONFIGURATION_ERROR" });
      return;
    }
    loginAttempts.delete(key);
    res.cookie(SITE_COOKIE, createSiteSession(), cookieOptions(req));
    res.json({ user: { name: "مالك الموقع", role: "owner" } });
  });

  app.get("/admin/recover", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.status(200).type("html").send(recoveryPageHtml());
  });

  app.post("/admin/api/recover", async (req, res) => {
    if (rejectForeignOrigin(req, res)) return;
    const token = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).safeParse(req.body);
    if (!token.success) return res.status(400).json({ error: "RECOVERY_LINK_INVALID" });
    try {
      const service = asService();
      const now = new Date().toISOString();
      const { data: link, error } = await service.from("admin_access_recovery_links").select("id").eq("token_hash", recoveryTokenHash(token.data.token)).is("used_at", null).gt("expires_at", now).maybeSingle();
      if (error || !link) return res.status(400).json({ error: "RECOVERY_LINK_INVALID" });
      const { data: consumed, error: consumeError } = await service.from("admin_access_recovery_links").update({ used_at: now }).eq("id", link.id).is("used_at", null).select("id").maybeSingle();
      if (consumeError || !consumed) return res.status(400).json({ error: "RECOVERY_LINK_INVALID" });
      res.cookie(SITE_COOKIE, createSiteSession(), cookieOptions(req));
      res.json({ recovered: true });
    } catch {
      res.status(503).json({ error: "RECOVERY_LINK_UNAVAILABLE" });
    }
  });

  app.post("/admin/api/logout", async (req, res) => {
    if (rejectForeignOrigin(req, res)) return;
    res.clearCookie(SITE_COOKIE, { ...cookieOptions(req), maxAge: -1 });
    res.json({ success: true });
  });

  app.get("/admin/api/session", async (req, res) => {
    try {
      requireSiteSession(req);
      res.json({ user: { name: "مالك الموقع", role: "owner" } });
    } catch {
      res.status(401).json({ error: "SITE_SESSION_REQUIRED" });
    }
  });

  app.get("/admin/api/access-check", (req, res) => {
    try {
      requireSiteSession(req);
      res.status(204).end();
    } catch {
      res.status(401).end();
    }
  });

  app.get("/admin/api/dashboard", async (req, res) => {
    try {
      requireSiteSession(req);
      res.json(await readDashboard());
    } catch (error) {
      res.status(siteErrorStatus(error)).json({ error: "SITE_DASHBOARD_UNAVAILABLE" });
    }
  });

  app.get("/admin/api/notifications", async (req, res) => {
    try {
      requireSiteSession(req);
      res.json({ notifications: await readNotifications() });
    } catch (error) {
      res.status(siteErrorStatus(error)).json({ error: "SITE_NOTIFICATIONS_UNAVAILABLE" });
    }
  });

  app.get("/admin/api/notifications/stream", async (req, res) => {
    try {
      requireSiteSession(req);
    } catch {
      res.status(401).end();
      return;
    }
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    let previous = "";
    let stopped = false;
    const publish = async () => {
      if (stopped) return;
      try {
        const notifications = await readNotifications();
        const payload = JSON.stringify(notifications);
        if (payload !== previous) {
          previous = payload;
          res.write(`event: notifications\ndata: ${payload}\n\n`);
        } else {
          res.write(`event: keepalive\ndata: {}\n\n`);
        }
      } catch {
        res.write(`event: error\ndata: {"message":"notifications_unavailable"}\n\n`);
      }
    };
    await publish();
    const interval = setInterval(publish, 5_000);
    const timeout = setTimeout(() => res.end(), 150_000);
    req.on("close", () => {
      stopped = true;
      clearInterval(interval);
      clearTimeout(timeout);
    });
  });

  app.get("/admin/api/verifications", async (req, res) => {
    try {
      requireSiteSession(req);
      res.json({ requests: await listAccountVerifications() });
    } catch (error) {
      res.status(siteErrorStatus(error)).json({ error: "SITE_VERIFICATIONS_UNAVAILABLE" });
    }
  });

  app.post("/admin/api/verifications/:requestId/send-code", async (req, res) => {
    if (rejectForeignOrigin(req, res)) return;
    try {
      requireSiteSession(req);
      const requestId = z.string().uuid().safeParse(req.params.requestId);
      if (!requestId.success) {
        res.status(400).json({ error: "INVALID_VERIFICATION_REQUEST" });
        return;
      }
      const service = asService();
      const { data: request, error: requestError } = await service.from("account_verification_requests").select("id,full_name,phone,requested_role,status").eq("id", requestId.data).single();
      if (requestError || !request || !["pending_admin", "code_sent"].includes(request.status)) {
        res.status(409).json({ error: "VERIFICATION_NOT_AVAILABLE" });
        return;
      }
      const code = String(randomInt(100000, 1000000));
      const now = new Date();
      const expiresAt = new Date(now.getTime() + VERIFICATION_CODE_MS);
      const { error: updateError } = await service.from("account_verification_requests").update({ status: "code_sent", verification_code_hash: await bcrypt.hash(code, 12), code_expires_at: expiresAt.toISOString(), code_attempts: 0, code_sent_at: now.toISOString(), reviewed_at: now.toISOString() }).eq("id", request.id);
      if (updateError) throw new Error(updateError.message);
      const phone = request.phone.replace(/[^0-9]/g, "");
      const roleLabel = request.requested_role === "driver" ? "سفير" : "عميل";
      const text = `مرحباً ${request.full_name}، رمز تحقق جربوع لحساب ${roleLabel}: ${code}. الرمز صالح لمدة 10 دقائق. لا تشاركه مع أي شخص.`;
      // يُعاد الرمز إلى جلسة المدير الحالية فقط ليتمكن من نسخه حرفياً. قاعدة
      // البيانات تحتفظ بالتجزئة فقط ولا يُسجل الرمز في أي سجل أو جدول.
      res.json({ requestId: request.id, verificationCode: code, whatsappUrl: `https://wa.me/${phone}?text=${encodeURIComponent(text)}`, expiresAt: expiresAt.toISOString() });
    } catch (error) {
      res.status(siteErrorStatus(error)).json({ error: error instanceof Error ? error.message : "VERIFICATION_CODE_SEND_FAILED" });
    }
  });

  app.delete("/admin/api/verifications/:requestId", async (req, res) => {
    if (rejectForeignOrigin(req, res)) return;
    try {
      requireSiteSession(req);
      const requestId = z.string().uuid().safeParse(req.params.requestId);
      if (!requestId.success) return res.status(400).json({ error: "INVALID_VERIFICATION_REQUEST" });
      const service = asService();
      const { data: request, error: requestError } = await service
        .from("account_verification_requests")
        .select("id,status,code_expires_at,personal_photo_path,identity_photo_path")
        .eq("id", requestId.data)
        .maybeSingle();
      if (requestError || !request) return res.status(404).json({ error: "VERIFICATION_NOT_FOUND" });
      const isExpired = request.status === "expired" || (request.code_expires_at && new Date(request.code_expires_at).getTime() <= Date.now());
      if (!isExpired) return res.status(409).json({ error: "ONLY_EXPIRED_VERIFICATION_CAN_BE_DELETED" });
      const documentPaths = [request.personal_photo_path, request.identity_photo_path].filter((value): value is string => Boolean(value));
      if (documentPaths.length) {
        const { error: storageError } = await service.storage.from("jarbou3-private").remove(documentPaths);
        if (storageError) throw new Error(storageError.message);
      }
      const { error: deleteError } = await service.from("account_verification_requests").delete().eq("id", request.id);
      if (deleteError) throw new Error(deleteError.message);
      res.json({ deleted: true });
    } catch (error) {
      res.status(siteErrorStatus(error)).json({ error: error instanceof Error ? error.message : "VERIFICATION_DELETE_FAILED" });
    }
  });

  app.get("/admin/api/verifications/:requestId/document/:kind", async (req, res) => {
    try {
      requireSiteSession(req);
      const requestId = z.string().uuid().safeParse(req.params.requestId);
      const kind = z.enum(["personal", "identity", "vehicle"]).safeParse(req.params.kind);
      if (!requestId.success || !kind.success) return res.status(400).json({ error: "INVALID_DOCUMENT_REQUEST" });
      const service = asService();
      const { data: request, error } = await service.from("account_verification_requests").select("personal_photo_path,identity_photo_path,vehicle_photo_path").eq("id", requestId.data).single();
      const path = kind.data === "personal" ? request?.personal_photo_path : kind.data === "identity" ? request?.identity_photo_path : request?.vehicle_photo_path;
      if (error || !path) return res.status(404).json({ error: "DOCUMENT_NOT_AVAILABLE" });
      const { data, error: signedError } = await service.storage.from("jarbou3-private").createSignedUrl(path, 90);
      if (signedError || !data?.signedUrl) throw new Error(signedError?.message ?? "DOCUMENT_URL_UNAVAILABLE");
      res.json({ url: data.signedUrl });
    } catch (error) {
      res.status(siteErrorStatus(error)).json({ error: error instanceof Error ? error.message : "DOCUMENT_PREVIEW_FAILED" });
    }
  });

  app.get("/admin/api/recovery-requests", async (req, res) => {
    try {
      requireSiteSession(req);
      res.json({ requests: await listRecoveryRequests() });
    } catch (error) {
      res.status(siteErrorStatus(error)).json({ error: "SITE_RECOVERY_REQUESTS_UNAVAILABLE" });
    }
  });

  app.post("/admin/api/recovery-requests/:requestId/send-code", async (req, res) => {
    if (rejectForeignOrigin(req, res)) return;
    try {
      requireSiteSession(req);
      const requestId = z.string().uuid().safeParse(req.params.requestId);
      if (!requestId.success) {
        res.status(400).json({ error: "INVALID_RECOVERY_REQUEST" });
        return;
      }
      const service = asService();
      const { data: request, error: requestError } = await service.from("account_recovery_requests").select("id,full_name,phone,requested_role,status,retry_after").eq("id", requestId.data).single();
      if (requestError || !request || !["pending_admin", "code_sent", "locked"].includes(request.status) || (request.status === "locked" && request.retry_after && new Date(request.retry_after).getTime() > Date.now())) {
        res.status(409).json({ error: "RECOVERY_NOT_AVAILABLE" });
        return;
      }
      const code = String(randomInt(100000, 1000000));
      const now = new Date();
      const expiresAt = new Date(now.getTime() + VERIFICATION_CODE_MS);
      const { error: updateError } = await service.from("account_recovery_requests").update({ status: "code_sent", verification_code_hash: await bcrypt.hash(code, 12), code_expires_at: expiresAt.toISOString(), code_attempts: 0, retry_after: null, code_sent_at: now.toISOString() }).eq("id", request.id);
      if (updateError) throw new Error(updateError.message);
      const phone = request.phone.replace(/[^0-9]/g, "");
      const text = `مرحباً ${request.full_name}، رمز استرجاع كلمة مرور جربوع: ${code}. الرمز صالح لمدة 10 دقائق. لا تشاركه مع أي شخص.`;
      res.json({ requestId: request.id, verificationCode: code, whatsappUrl: `https://wa.me/${phone}?text=${encodeURIComponent(text)}`, expiresAt: expiresAt.toISOString() });
    } catch (error) {
      res.status(siteErrorStatus(error)).json({ error: error instanceof Error ? error.message : "RECOVERY_CODE_SEND_FAILED" });
    }
  });

  app.get("/admin/api/accounts", async (req, res) => {
    try {
      requireSiteSession(req);
      res.json({ accounts: await listManagedAccounts() });
    } catch (error) {
      res.status(siteErrorStatus(error)).json({ error: "SITE_ACCOUNTS_UNAVAILABLE" });
    }
  });

  app.get("/admin/api/accounts/search", async (req, res) => {
    try {
      requireSiteSession(req);
      const rawQuery = typeof req.query.q === "string" ? req.query.q : "";
      const query = rawQuery.trim().replace(/[^\u0600-\u06FFa-zA-Z0-9+\s-]/g, "");
      if (query.length < 2) return res.status(400).json({ error: "SEARCH_QUERY_TOO_SHORT" });
      const service = asService();
      const [usersResult, invitesResult] = await Promise.all([
        service.from("users").select("id,name,phone,role,is_active,created_at").in("role", ["customer", "driver"]).is("deleted_at", null).or(`name.ilike.%${query}%,phone.ilike.%${query}%`).order("created_at", { ascending: false }).limit(30),
        service.from("driver_registration_invites").select("id,full_name,phone,is_active,claimed_at,created_at").or(`full_name.ilike.%${query}%,phone.ilike.%${query}%`).order("created_at", { ascending: false }).limit(30),
      ]);
      if (usersResult.error || invitesResult.error) throw new Error(usersResult.error?.message ?? invitesResult.error?.message ?? "ACCOUNT_SEARCH_FAILED");
      const users = (usersResult.data ?? []).map((account) => ({ ...account, record_type: "account" }));
      const existingPhones = new Set(users.map((account) => account.phone));
      const pendingDrivers = (invitesResult.data ?? []).filter((invite) => !existingPhones.has(invite.phone)).map((invite) => ({ id: invite.id, name: invite.full_name, phone: invite.phone, role: "driver", is_active: invite.is_active, created_at: invite.created_at, record_type: "manual_driver", claimed_at: invite.claimed_at }));
      res.json({ accounts: [...users, ...pendingDrivers] });
    } catch (error) {
      res.status(siteErrorStatus(error)).json({ error: error instanceof Error ? error.message : "ACCOUNT_SEARCH_FAILED" });
    }
  });

  app.get("/admin/api/discount-customers", async (req, res) => {
    try {
      requireSiteSession(req);
      const rawQuery = typeof req.query.q === "string" ? req.query.q : "";
      const query = rawQuery.trim().replace(/[^\u0600-\u06FFa-zA-Z0-9+\s-]/g, "");
      if (query.length < 2) return res.status(400).json({ error: "SEARCH_QUERY_TOO_SHORT" });
      const { data, error } = await asService().from("users").select("id,name,phone").eq("role", "customer").eq("is_active", true).is("deleted_at", null).or(`name.ilike.%${query}%,phone.ilike.%${query}%`).order("created_at", { ascending: false }).limit(30);
      if (error) throw new Error(error.message);
      res.json({ customers: data ?? [] });
    } catch (error) {
      res.status(siteErrorStatus(error)).json({ error: error instanceof Error ? error.message : "DISCOUNT_CUSTOMER_SEARCH_FAILED" });
    }
  });

  app.get("/admin/api/wallets", async (req, res) => {
    try {
      requireSiteSession(req);
      const { data, error } = await asService().rpc("list_driver_wallets");
      if (error) throw new Error(error.message);
      res.json({ wallets: data ?? [] });
    } catch (error) {
      res.status(siteErrorStatus(error)).json({ error: error instanceof Error ? error.message : "WALLETS_UNAVAILABLE" });
    }
  });

  app.post("/admin/api/wallets/:driverId/deposits", async (req, res) => {
    if (rejectForeignOrigin(req, res)) return;
    try {
      requireSiteSession(req);
      const driverId = z.string().uuid().safeParse(req.params.driverId);
      const parsed = z.object({ amount: z.number().int().positive().max(1_000_000_000), note: z.string().trim().max(500).optional() }).safeParse(req.body);
      if (!driverId.success || !parsed.success) return res.status(400).json({ error: "INVALID_WALLET_DEPOSIT" });
      const { data, error } = await asService().rpc("record_driver_wallet_deposit", { p_driver_id: driverId.data, p_amount: parsed.data.amount, p_note: parsed.data.note ?? null });
      if (error || !data) throw new Error(error?.message ?? "WALLET_DEPOSIT_FAILED");
      res.status(201).json({ wallet: data });
    } catch (error) {
      res.status(siteErrorStatus(error)).json({ error: error instanceof Error ? error.message : "WALLET_DEPOSIT_FAILED" });
    }
  });

  app.post("/admin/api/wallets/:driverId/adjustments", async (req, res) => {
    if (rejectForeignOrigin(req, res)) return;
    try {
      requireSiteSession(req);
      const driverId = z.string().uuid().safeParse(req.params.driverId);
      const parsed = z.object({ amountSigned: z.number().int().refine((value) => value !== 0).refine((value) => Math.abs(value) <= 1_000_000_000), note: z.string().trim().max(500).optional() }).safeParse(req.body);
      if (!driverId.success || !parsed.success) return res.status(400).json({ error: "INVALID_WALLET_ADJUSTMENT" });
      const { data, error } = await asService().rpc("record_driver_wallet_adjustment", { p_driver_id: driverId.data, p_amount_signed: parsed.data.amountSigned, p_note: parsed.data.note ?? null });
      if (error || !data) throw new Error(error?.message ?? "WALLET_ADJUSTMENT_FAILED");
      res.status(201).json({ wallet: data });
    } catch (error) {
      res.status(siteErrorStatus(error)).json({ error: error instanceof Error ? error.message : "WALLET_ADJUSTMENT_FAILED" });
    }
  });

  app.post("/admin/api/wallets/bulk-deposits", async (req, res) => {
    if (rejectForeignOrigin(req, res)) return;
    try {
      requireSiteSession(req);
      const parsed = z.object({ amount: z.number().int().positive().max(1_000_000_000), note: z.string().trim().max(500).optional() }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "INVALID_BULK_WALLET_DEPOSIT" });
      const { data: drivers, error: driversError } = await asService().from("users").select("id").eq("role", "driver").eq("is_active", true).limit(500);
      if (driversError) throw new Error(driversError.message);
      for (const driver of drivers ?? []) {
        const result = await asService().rpc("record_driver_wallet_deposit", { p_driver_id: driver.id, p_amount: parsed.data.amount, p_note: parsed.data.note ?? "إضافة جماعية للسفراء" });
        if (result.error) throw new Error(result.error.message);
      }
      res.status(201).json({ count: drivers?.length ?? 0 });
    } catch (error) {
      res.status(siteErrorStatus(error)).json({ error: error instanceof Error ? error.message : "BULK_WALLET_DEPOSIT_FAILED" });
    }
  });

  app.get("/admin/api/places", async (req, res) => {
    try {
      requireSiteSession(req);
      const { data, error } = await asService().from("jarbou3_places").select("id,name,latitude,longitude,is_active,created_at,updated_at").order("updated_at", { ascending: false }).limit(500);
      if (error) throw new Error(error.message);
      res.json({ places: data ?? [] });
    } catch (error) {
      res.status(siteErrorStatus(error)).json({ error: error instanceof Error ? error.message : "PLACES_UNAVAILABLE" });
    }
  });

  app.post("/admin/api/places", async (req, res) => {
    if (rejectForeignOrigin(req, res)) return;
    try {
      requireSiteSession(req);
      const parsed = z.object({ name: z.string().trim().min(2).max(160), latitude: z.number().finite(), longitude: z.number().finite() }).safeParse(req.body);
      if (!parsed.success || parsed.data.latitude < 35.04 || parsed.data.latitude > 35.23 || parsed.data.longitude < 36.60 || parsed.data.longitude > 36.91) return res.status(400).json({ error: "INVALID_PLACE" });
      const { data, error } = await asService().from("jarbou3_places").insert({ name: parsed.data.name, latitude: parsed.data.latitude, longitude: parsed.data.longitude, is_active: true }).select("id,name,latitude,longitude,is_active,created_at,updated_at").single();
      if (error || !data) throw new Error(error?.message ?? "PLACE_CREATE_FAILED");
      res.status(201).json({ place: data });
    } catch (error) {
      res.status(siteErrorStatus(error)).json({ error: error instanceof Error ? error.message : "PLACE_CREATE_FAILED" });
    }
  });

  app.patch("/admin/api/places/:placeId", async (req, res) => {
    if (rejectForeignOrigin(req, res)) return;
    try {
      requireSiteSession(req);
      const placeId = z.string().uuid().safeParse(req.params.placeId);
      const parsed = z.object({ isActive: z.boolean() }).safeParse(req.body);
      if (!placeId.success || !parsed.success) return res.status(400).json({ error: "INVALID_PLACE_UPDATE" });
      const { data, error } = await asService().from("jarbou3_places").update({ is_active: parsed.data.isActive, updated_at: new Date().toISOString() }).eq("id", placeId.data).select("id,is_active,updated_at").single();
      if (error || !data) throw new Error(error?.message ?? "PLACE_UPDATE_FAILED");
      res.json({ place: data });
    } catch (error) {
      res.status(siteErrorStatus(error)).json({ error: error instanceof Error ? error.message : "PLACE_UPDATE_FAILED" });
    }
  });

  app.get("/admin/api/fleet-map", async (req, res) => {
    try {
      requireSiteSession(req);
      res.json(await listFleetMap());
    } catch (error) {
      res.status(siteErrorStatus(error)).json({ error: error instanceof Error ? error.message : "FLEET_MAP_UNAVAILABLE" });
    }
  });

  app.get("/admin/api/driver-invites", async (req, res) => {
    try {
      requireSiteSession(req);
      const { data, error } = await asService().from("driver_registration_invites").select("id,full_name,phone,vehicle_type,note,is_active,claimed_at,created_at").order("created_at", { ascending: false }).limit(100);
      if (error) throw new Error(error.message);
      res.json({ invites: data ?? [] });
    } catch (error) {
      res.status(siteErrorStatus(error)).json({ error: error instanceof Error ? error.message : "DRIVER_INVITES_UNAVAILABLE" });
    }
  });

  app.post("/admin/api/driver-invites", async (req, res) => {
    if (rejectForeignOrigin(req, res)) return;
    try {
      requireSiteSession(req);
      const parsed = driverInviteSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "INVALID_DRIVER_INVITE" });
      const phone = normalizeJarbou3Phone(parsed.data.phone);
      const service = asService();
      const { data: existingUser, error: existingUserError } = await service.from("users").select("id").eq("phone", phone).maybeSingle();
      if (existingUserError) throw new Error(existingUserError.message);
      if (existingUser) return res.status(409).json({ error: "PHONE_ALREADY_REGISTERED" });
      const { data, error } = await service.from("driver_registration_invites").upsert({ full_name: parsed.data.fullName, phone, vehicle_type: parsed.data.vehicleType ?? null, note: parsed.data.note ?? null, is_active: true, updated_at: new Date().toISOString() }, { onConflict: "phone" }).select("id,full_name,phone,vehicle_type,note,is_active,claimed_at,activation_request_id,created_at").single();
      if (error || !data) throw new Error(error?.message ?? "DRIVER_INVITE_CREATE_FAILED");
      if (!data.activation_request_id) {
        const { data: existingRequest, error: existingRequestError } = await service.from("account_verification_requests").select("id").eq("phone", data.phone).maybeSingle();
        if (existingRequestError) throw new Error(existingRequestError.message);
        const { data: activationRequest, error: activationError } = existingRequest ? { data: existingRequest, error: null } : await service.from("account_verification_requests").insert({ full_name: data.full_name, phone: data.phone, requested_role: "driver", vehicle_type: data.vehicle_type, preapproved_by_admin: true }).select("id").single();
        if (activationError || !activationRequest) throw new Error(activationError?.message ?? "DRIVER_ACTIVATION_PREPARE_FAILED");
        const { error: linkError } = await service.from("driver_registration_invites").update({ activation_request_id: activationRequest.id, updated_at: new Date().toISOString() }).eq("id", data.id);
        if (linkError) throw new Error(linkError.message);
      }
      res.status(201).json({ invite: data });
    } catch (error) {
      res.status(siteErrorStatus(error)).json({ error: error instanceof Error ? error.message : "DRIVER_INVITE_CREATE_FAILED" });
    }
  });

  app.get("/admin/api/problem-reports", async (req, res) => {
    try {
      requireSiteSession(req);
      const { data, error } = await asService().from("problem_reports").select("id,reporter_id,reporter_role,message,status,admin_note,reviewed_at,created_at").order("created_at", { ascending: false }).limit(200);
      if (error) throw new Error(error.message);
      const reporterIds = Array.from(new Set((data ?? []).map((report) => report.reporter_id)));
      const { data: profiles, error: profilesError } = reporterIds.length ? await asService().from("users").select("id,name,phone").in("id", reporterIds).limit(200) : { data: [], error: null };
      if (profilesError) throw new Error(profilesError.message);
      const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
      res.json({ reports: (data ?? []).map((report) => ({ ...report, reporter: profileById.get(report.reporter_id) ?? null })) });
    } catch (error) {
      res.status(siteErrorStatus(error)).json({ error: error instanceof Error ? error.message : "PROBLEM_REPORTS_UNAVAILABLE" });
    }
  });

  app.post("/admin/api/problem-reports/:reportId", async (req, res) => {
    if (rejectForeignOrigin(req, res)) return;
    try {
      requireSiteSession(req);
      const reportId = z.string().uuid().safeParse(req.params.reportId);
      const parsed = problemReportStatusSchema.safeParse(req.body);
      if (!reportId.success || !parsed.success) return res.status(400).json({ error: "INVALID_PROBLEM_REPORT" });
      const values = { status: parsed.data.status, admin_note: parsed.data.adminNote ?? null, reviewed_at: parsed.data.status === "open" ? null : new Date().toISOString(), updated_at: new Date().toISOString() };
      const { data, error } = await asService().from("problem_reports").update(values).eq("id", reportId.data).select("id,status,admin_note,reviewed_at").maybeSingle();
      if (error || !data) return res.status(404).json({ error: "PROBLEM_REPORT_NOT_FOUND" });
      res.json({ report: data });
    } catch (error) {
      res.status(siteErrorStatus(error)).json({ error: error instanceof Error ? error.message : "PROBLEM_REPORT_UPDATE_FAILED" });
    }
  });

  app.post("/admin/api/accounts/:userId/deactivate", async (req, res) => {
    if (rejectForeignOrigin(req, res)) return;
    try {
      requireSiteSession(req);
      const userId = z.string().uuid().safeParse(req.params.userId);
      if (!userId.success) return res.status(400).json({ error: "INVALID_ACCOUNT" });
      const { error } = await asService().from("users").update({ is_active: false }).eq("id", userId.data).in("role", ["customer", "driver"]);
      if (error) throw new Error(error.message);
      res.json({ deactivated: true });
    } catch (error) {
      res.status(siteErrorStatus(error)).json({ error: error instanceof Error ? error.message : "ACCOUNT_DEACTIVATION_FAILED" });
    }
  });

  app.post("/admin/api/accounts/:userId/reactivate", async (req, res) => {
    if (rejectForeignOrigin(req, res)) return;
    try {
      requireSiteSession(req);
      const userId = z.string().uuid().safeParse(req.params.userId);
      if (!userId.success) return res.status(400).json({ error: "INVALID_ACCOUNT" });
      const { error } = await asService().from("users").update({ is_active: true }).eq("id", userId.data).in("role", ["customer", "driver"]);
      if (error) throw new Error(error.message);
      res.json({ reactivated: true });
    } catch (error) {
      res.status(siteErrorStatus(error)).json({ error: error instanceof Error ? error.message : "ACCOUNT_REACTIVATION_FAILED" });
    }
  });

  app.delete("/admin/api/accounts/:userId", async (req, res) => {
    if (rejectForeignOrigin(req, res)) return;
    try {
      requireSiteSession(req);
      const userId = z.string().uuid().safeParse(req.params.userId);
      const body = z.object({ confirmation: z.literal("DELETE_ACCOUNT") }).safeParse(req.body);
      if (!userId.success || !body.success) return res.status(400).json({ error: "ACCOUNT_DELETE_CONFIRMATION_REQUIRED" });
      const service = asService();
      const { data: account, error: accountError } = await service.from("users").select("id,phone,role").eq("id", userId.data).in("role", ["customer", "driver"]).is("deleted_at", null).maybeSingle();
      if (accountError) throw new Error(accountError.message);
      if (!account) return res.status(404).json({ error: "ACCOUNT_NOT_FOUND" });
      const [ordersResult, driverDocumentsResult, onboardingDocumentsResult] = await Promise.all([
        service.from("orders").select("id").or(`customer_id.eq.${account.id},driver_id.eq.${account.id}`).limit(500),
        service.from("drivers_verification").select("personal_photo_path,id_photo_path").eq("user_id", account.id).maybeSingle(),
        service.from("account_verification_requests").select("personal_photo_path,identity_photo_path").eq("auth_user_id", account.id).limit(50),
      ]);
      if (ordersResult.error || driverDocumentsResult.error || onboardingDocumentsResult.error) throw new Error(ordersResult.error?.message ?? driverDocumentsResult.error?.message ?? onboardingDocumentsResult.error?.message ?? "ACCOUNT_DELETE_DATA_UNAVAILABLE");
      const orderIds = (ordersResult.data ?? []).map((order) => order.id);
      const { data: orderPhotos, error: orderPhotosError } = orderIds.length ? await service.from("order_photos").select("photo_path").in("order_id", orderIds).limit(1000) : { data: [], error: null };
      if (orderPhotosError) throw new Error(orderPhotosError.message);
      const documentPaths = [
        driverDocumentsResult.data?.personal_photo_path,
        driverDocumentsResult.data?.id_photo_path,
        ...(onboardingDocumentsResult.data ?? []).flatMap((row) => [row.personal_photo_path, row.identity_photo_path]),
        ...(orderPhotos ?? []).map((row) => row.photo_path),
      ].filter((value): value is string => Boolean(value));
      if (documentPaths.length) {
        const { error: storageError } = await service.storage.from("jarbou3-private").remove([...new Set(documentPaths)]);
        if (storageError) throw new Error(storageError.message);
      }

      const identityHash = createHash("sha256").update(account.id).digest("hex");
      const { error: authIdentityError } = await service.auth.admin.updateUserById(account.id, {
        email: `deleted-${identityHash.slice(0, 32)}@deleted.jarbou3.invalid`,
        email_confirm: true,
        password: createHash("sha256").update(`${identityHash}:${Date.now()}`).digest("base64url"),
        user_metadata: { name: "حساب محذوف" },
      });
      if (authIdentityError) throw new Error("ACCOUNT_AUTH_DELETE_FAILED");
      const cleanupResults = await Promise.all([
        service.from("push_tokens").delete().eq("user_id", account.id),
        service.from("favorite_addresses").delete().eq("customer_id", account.id),
        service.from("problem_reports").delete().eq("reporter_id", account.id),
        service.from("drivers_verification").delete().eq("user_id", account.id),
        service.from("driver_registration_invites").delete().eq("phone", account.phone),
        service.from("account_recovery_requests").delete().eq("user_id", account.id),
        service.from("account_verification_requests").delete().eq("auth_user_id", account.id),
        orderIds.length ? service.from("orders").delete().in("id", orderIds) : Promise.resolve({ error: null }),
      ]);
      const cleanupError = cleanupResults.find((result) => result.error)?.error;
      if (cleanupError) throw new Error(cleanupError.message);
      const { error: userUpdateError } = await service.from("users").update({ name: "حساب محذوف", phone: null, is_active: false, deleted_at: new Date().toISOString(), last_location_lat: null, last_location_lng: null, last_location_at: null }).eq("id", account.id);
      if (userUpdateError) throw new Error(userUpdateError.message);
      const { error: authDeleteError } = await service.auth.admin.deleteUser(account.id);
      if (authDeleteError) console.warn("[Jarbou3] Deleted account profile but could not remove the detached auth record");
      res.json({ deleted: true });
    } catch (error) {
      res.status(siteErrorStatus(error)).json({ error: error instanceof Error ? error.message : "ACCOUNT_DELETE_FAILED" });
    }
  });

  app.post("/admin/api/accounts/:userId/driver-verification", async (req, res) => {
    if (rejectForeignOrigin(req, res)) return;
    try {
      requireSiteSession(req);
      const userId = z.string().uuid().safeParse(req.params.userId);
      const body = z.object({ decision: z.enum(["approved", "rejected"]) }).safeParse(req.body);
      if (!userId.success || !body.success) return res.status(400).json({ error: "INVALID_DRIVER_REVIEW" });
      const service = asService();
      const { data: verification, error: verificationError } = await service.from("drivers_verification").select("user_id").eq("user_id", userId.data).maybeSingle();
      if (verificationError) throw new Error(verificationError.message);
      if (!verification) return res.status(404).json({ error: "DRIVER_DOCUMENTS_NOT_FOUND" });
      const reviewedAt = new Date().toISOString();
      const { error: reviewError } = await service.from("drivers_verification").update({ status: body.data.decision, activated_at: body.data.decision === "approved" ? reviewedAt : null, reviewed_at: reviewedAt }).eq("user_id", userId.data);
      if (reviewError) throw new Error(reviewError.message);
      const { error: userError } = await service.from("users").update({ is_active: body.data.decision === "approved" }).eq("id", userId.data).eq("role", "driver");
      if (userError) throw new Error(userError.message);
      res.json({ reviewed: true, status: body.data.decision });
    } catch (error) {
      res.status(siteErrorStatus(error)).json({ error: error instanceof Error ? error.message : "DRIVER_REVIEW_FAILED" });
    }
  });

  app.get("/admin/api/accounts/:userId/document/:kind", async (req, res) => {
    try {
      requireSiteSession(req);
      const userId = z.string().uuid().safeParse(req.params.userId);
      const kind = z.enum(["personal", "identity", "vehicle"]).safeParse(req.params.kind);
      if (!userId.success || !kind.success) return res.status(400).json({ error: "INVALID_DOCUMENT_REQUEST" });
      const service = asService();
      const [driverResult, onboardingResult] = await Promise.all([
        service.from("drivers_verification").select("personal_photo_path,id_photo_path,vehicle_photo_path").eq("user_id", userId.data).maybeSingle(),
        service.from("account_verification_requests").select("personal_photo_path,identity_photo_path,vehicle_photo_path").eq("auth_user_id", userId.data).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      const path = kind.data === "personal" ? driverResult.data?.personal_photo_path ?? onboardingResult.data?.personal_photo_path : kind.data === "identity" ? driverResult.data?.id_photo_path ?? onboardingResult.data?.identity_photo_path : driverResult.data?.vehicle_photo_path ?? onboardingResult.data?.vehicle_photo_path;
      if (!path) return res.status(404).json({ error: "DOCUMENT_NOT_AVAILABLE" });
      const { data, error } = await service.storage.from("jarbou3-private").createSignedUrl(path, 90);
      if (error || !data?.signedUrl) throw new Error(error?.message ?? "DOCUMENT_URL_UNAVAILABLE");
      res.json({ url: data.signedUrl });
    } catch (error) {
      res.status(siteErrorStatus(error)).json({ error: error instanceof Error ? error.message : "DOCUMENT_PREVIEW_FAILED" });
    }
  });

  app.get("/admin/api/discounts", async (req, res) => {
    try {
      requireSiteSession(req);
      const service = asService();
      const [codesResult, recipientResult] = await Promise.all([
        service.from("discount_codes").select("id,code,discount_type,discount_value,starts_at,ends_at,max_uses_per_customer,max_total_uses,is_active,deactivated_at,created_at").order("created_at", { ascending: false }).limit(100),
        service.from("discount_code_recipients").select("discount_code_id,customer_id").limit(500),
      ]);
      if (codesResult.error || recipientResult.error) throw new Error(codesResult.error?.message ?? recipientResult.error?.message ?? "DISCOUNTS_UNAVAILABLE");
      const customerIds = [...new Set((recipientResult.data ?? []).map((row) => row.customer_id))];
      const customerResult = customerIds.length ? await service.from("users").select("id,name,phone").in("id", customerIds).limit(500) : { data: [], error: null };
      if (customerResult.error) throw new Error(customerResult.error.message);
      const customers = new Map((customerResult.data ?? []).map((customer) => [customer.id, customer]));
      const recipientsByCode = new Map<string, Array<{ id: string; name: string; phone: string | null }>>();
      for (const recipient of recipientResult.data ?? []) {
        const customer = customers.get(recipient.customer_id);
        if (!customer) continue;
        const recipients = recipientsByCode.get(recipient.discount_code_id) ?? [];
        recipients.push(customer);
        recipientsByCode.set(recipient.discount_code_id, recipients);
      }
      res.json({ codes: (codesResult.data ?? []).map((code) => ({ ...code, audience: recipientsByCode.has(code.id) ? "selected" : "public", recipients: recipientsByCode.get(code.id) ?? [] })) });
    } catch (error) {
      res.status(siteErrorStatus(error)).json({ error: "DISCOUNTS_UNAVAILABLE" });
    }
  });

  app.post("/admin/api/discounts", async (req, res) => {
    if (rejectForeignOrigin(req, res)) return;
    try {
      requireSiteSession(req);
      const parsed = discountSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "INVALID_DISCOUNT" });
      const service = asService();
      const recipientCustomerIds = parsed.data.audience === "selected" ? [...new Set(parsed.data.customerIds)] : [];
      if (recipientCustomerIds.length) {
        const { data: customers, error: customerError } = await service.from("users").select("id").in("id", recipientCustomerIds).eq("role", "customer").eq("is_active", true).is("deleted_at", null).limit(50);
        if (customerError) throw new Error(customerError.message);
        if ((customers ?? []).length !== recipientCustomerIds.length) return res.status(400).json({ error: "DISCOUNT_RECIPIENT_NOT_AVAILABLE" });
      }
      const { data, error } = await service.from("discount_codes").insert({ code: parsed.data.code, discount_type: parsed.data.discountType, discount_value: parsed.data.discountValue, starts_at: parsed.data.startsAt ?? null, ends_at: parsed.data.endsAt ?? null, max_uses_per_customer: parsed.data.maxUsesPerCustomer ?? null, max_total_uses: parsed.data.maxTotalUses ?? null, is_active: true }).select("id,code,discount_type,discount_value,starts_at,ends_at,max_uses_per_customer,max_total_uses,is_active,deactivated_at,created_at").single();
      if (error || !data) throw new Error(error?.message ?? "DISCOUNT_CREATE_FAILED");
      if (recipientCustomerIds.length) {
        const { error: recipientError } = await service.from("discount_code_recipients").insert(recipientCustomerIds.map((customerId) => ({ discount_code_id: data.id, customer_id: customerId })));
        if (recipientError) {
          await service.from("discount_codes").delete().eq("id", data.id);
          throw new Error("DISCOUNT_RECIPIENT_CREATE_FAILED");
        }
      }
      res.json({ code: { ...data, audience: recipientCustomerIds.length ? "selected" : "public", recipientCount: recipientCustomerIds.length } });
    } catch (error) {
      res.status(siteErrorStatus(error)).json({ error: error instanceof Error ? error.message : "DISCOUNT_CREATE_FAILED" });
    }
  });

  app.post("/admin/api/discounts/:codeId/toggle", async (req, res) => {
    if (rejectForeignOrigin(req, res)) return;
    try {
      requireSiteSession(req);
      const codeId = z.string().uuid().safeParse(req.params.codeId);
      const active = z.object({ isActive: z.boolean() }).safeParse(req.body);
      if (!codeId.success || !active.success) return res.status(400).json({ error: "INVALID_DISCOUNT" });
      const { error } = await asService().from("discount_codes").update({ is_active: active.data.isActive, deactivated_at: active.data.isActive ? null : new Date().toISOString() }).eq("id", codeId.data);
      if (error) throw new Error(error.message);
      res.json({ updated: true });
    } catch (error) {
      res.status(siteErrorStatus(error)).json({ error: error instanceof Error ? error.message : "DISCOUNT_UPDATE_FAILED" });
    }
  });

  app.get("/admin/api/driver-company-balances", async (req, res) => {
    try {
      requireSiteSession(req);
      const { data, error } = await asService().rpc("list_driver_company_balances");
      if (error) throw new Error(error.message);
      res.json({ balances: data ?? [] });
    } catch (error) {
      res.status(siteErrorStatus(error)).json({ error: "DRIVER_COMPANY_BALANCES_UNAVAILABLE" });
    }
  });

  app.post("/admin/api/driver-company-balances/:driverId/payments", async (req, res) => {
    if (rejectForeignOrigin(req, res)) return;
    try {
      requireSiteSession(req);
      const driverId = z.string().uuid().safeParse(req.params.driverId);
      const payment = driverCompanyPaymentSchema.safeParse(req.body);
      if (!driverId.success || !payment.success) return res.status(400).json({ error: "INVALID_DRIVER_COMPANY_PAYMENT" });
      const { data, error } = await asService().rpc("record_driver_company_payment", {
        p_driver_id: driverId.data,
        p_amount: payment.data.amount,
        p_payment_method: payment.data.paymentMethod,
        p_payment_reference: payment.data.paymentReference ?? null,
        p_note: payment.data.note ?? null,
      });
      if (error) {
        if (error.message.includes("PAYMENT_EXCEEDS_OUTSTANDING_BALANCE")) return res.status(409).json({ error: "PAYMENT_EXCEEDS_OUTSTANDING_BALANCE" });
        if (error.message.includes("DRIVER_NOT_FOUND")) return res.status(404).json({ error: "DRIVER_NOT_FOUND" });
        throw new Error(error.message);
      }
      res.json({ payment: data });
    } catch (error) {
      res.status(siteErrorStatus(error)).json({ error: error instanceof Error ? error.message : "DRIVER_COMPANY_PAYMENT_FAILED" });
    }
  });

  app.get("/admin/api/pricing-settings", async (req, res) => {
    try {
      requireSiteSession(req);
      const { data, error } = await asService().rpc("get_delivery_pricing_settings");
      if (error) throw new Error(error.message);
      const row = Array.isArray(data) ? data[0] : data;
      res.json({ settings: { minimumFare: Number(row?.minimum_fare ?? 60), perKm: Number(row?.per_km ?? 25), perMinute: Number(row?.per_minute ?? 1), currencyCode: row?.currency_code ?? "SYP_NEW", updatedAt: row?.updated_at ?? null } });
    } catch (error) {
      res.status(siteErrorStatus(error)).json({ error: "PRICING_SETTINGS_UNAVAILABLE" });
    }
  });

  app.put("/admin/api/pricing-settings", async (req, res) => {
    if (rejectForeignOrigin(req, res)) return;
    try {
      requireSiteSession(req);
      const parsed = pricingSettingsSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "INVALID_PRICING_SETTINGS" });
      const { data, error } = await asService().rpc("update_delivery_pricing_settings", { p_minimum_fare: parsed.data.minimumFare, p_per_km: parsed.data.perKm, p_per_minute: parsed.data.perMinute });
      if (error) throw new Error(error.message);
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return res.status(500).json({ error: "PRICING_SETTINGS_NOT_UPDATED" });
      res.json({ updated: true, settings: { minimumFare: Number(row.minimum_fare), perKm: Number(row.per_km), perMinute: Number(row.per_minute), currencyCode: row.currency_code, updatedAt: row.updated_at } });
    } catch (error) {
      res.status(siteErrorStatus(error)).json({ error: error instanceof Error ? error.message : "PRICING_SETTINGS_UPDATE_FAILED" });
    }
  });

  app.get("/admin/api/release-settings", async (req, res) => {
    try {
      requireSiteSession(req);
      const { data, error } = await asService().from("app_release_settings").select("min_version,force_update,update_url,updated_at").eq("singleton", true).single();
      if (error) throw new Error(error.message);
      res.json({ settings: { minVersion: data.min_version, forceUpdate: data.force_update, updateUrl: data.update_url, updatedAt: data.updated_at } });
    } catch (error) {
      res.status(siteErrorStatus(error)).json({ error: "RELEASE_SETTINGS_UNAVAILABLE" });
    }
  });

  app.put("/admin/api/release-settings", async (req, res) => {
    if (rejectForeignOrigin(req, res)) return;
    try {
      requireSiteSession(req);
      const parsed = releaseSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "INVALID_RELEASE_SETTINGS" });
      const { error } = await asService().from("app_release_settings").update({ min_version: parsed.data.minVersion, force_update: parsed.data.forceUpdate, update_url: parsed.data.updateUrl }).eq("singleton", true);
      if (error) throw new Error(error.message);
      res.json({ updated: true });
    } catch (error) {
      res.status(siteErrorStatus(error)).json({ error: error instanceof Error ? error.message : "RELEASE_SETTINGS_UPDATE_FAILED" });
    }
  });

  app.get("/admin/api/manual-archives", async (req, res) => {
    try {
      requireSiteSession(req);
      res.json({ archives: await listManualArchives() });
    } catch (error) {
      res.status(siteErrorStatus(error)).json({ error: "MANUAL_ARCHIVES_UNAVAILABLE" });
    }
  });

  app.post("/admin/api/manual-archives/generate", async (req, res) => {
    if (rejectForeignOrigin(req, res)) return;
    try {
      requireSiteSession(req);
      const parsed = archiveSchema.safeParse(req.body);
      if (!parsed.success || parsed.data.periodEnd < parsed.data.periodStart) return res.status(400).json({ error: "INVALID_ARCHIVE_PERIOD" });
      res.json(await generateManualArchive(parsed.data.archiveKind, parsed.data.periodStart, parsed.data.periodEnd));
    } catch (error) {
      res.status(siteErrorStatus(error)).json({ error: error instanceof Error ? error.message : "MANUAL_ARCHIVE_GENERATION_FAILED" });
    }
  });

  app.post("/admin/api/manual-archives/:archiveId/download", async (req, res) => {
    if (rejectForeignOrigin(req, res)) return;
    try {
      requireSiteSession(req);
      const archiveId = z.string().uuid().safeParse(req.params.archiveId);
      if (!archiveId.success) return res.status(400).json({ error: "INVALID_ARCHIVE" });
      res.json(await prepareManualArchiveDownload(archiveId.data));
    } catch (error) {
      res.status(siteErrorStatus(error)).json({ error: error instanceof Error ? error.message : "MANUAL_ARCHIVE_DOWNLOAD_FAILED" });
    }
  });

  app.post("/admin/api/manual-archives/:archiveId/purge", async (req, res) => {
    if (rejectForeignOrigin(req, res)) return;
    try {
      requireSiteSession(req);
      const archiveId = z.string().uuid().safeParse(req.params.archiveId);
      const confirmation = z.object({ confirmation: z.string() }).safeParse(req.body);
      if (!archiveId.success || !confirmation.success) return res.status(400).json({ error: "INVALID_ARCHIVE_PURGE" });
      res.json(await purgeManualArchive(archiveId.data, confirmation.data.confirmation));
    } catch (error) {
      res.status(siteErrorStatus(error)).json({ error: error instanceof Error ? error.message : "MANUAL_ARCHIVE_PURGE_FAILED" });
    }
  });

  app.get("/admin/api/reports", async (req, res) => {
    try {
      requireSiteSession(req);
      const requestedMonth = typeof req.query.reportMonth === "string" ? normalizeReportMonth(req.query.reportMonth) : null;
      const currentMonth = new Date().toISOString().slice(0, 7);
      const reportMonth = requestedMonth ?? `${currentMonth}-01`;
      const [reports, financialSummary] = await Promise.all([listReports(), readFinancialSummary(reportMonth)]);
      res.json({ reports, financialSummary });
    } catch (error) {
      res.status(siteErrorStatus(error)).json({ error: "SITE_REPORTS_UNAVAILABLE" });
    }
  });

  app.post("/admin/api/reports/generate", async (req, res) => {
    if (rejectForeignOrigin(req, res)) return;
    try {
      requireSiteSession(req);
      const parsed = generateReportSchema.safeParse(req.body);
      const reportMonth = parsed.success ? normalizeReportMonth(parsed.data.reportMonth) : null;
      if (!reportMonth) {
        res.status(400).json({ error: "INVALID_REPORT_MONTH" });
        return;
      }
      const { data, error } = await asService().functions.invoke("monthly-archive", { body: { mode: "generate", reportMonth } });
      if (error) throw new Error(error.message);
      res.json({ result: data ?? null, reports: await listReports() });
    } catch (error) {
      res.status(siteErrorStatus(error)).json({ error: error instanceof Error ? error.message : "REPORT_GENERATION_FAILED" });
    }
  });

  app.post("/admin/api/reports/:reportId/download", async (req, res) => {
    if (rejectForeignOrigin(req, res)) return;
    try {
      requireSiteSession(req);
      const reportId = z.string().uuid().safeParse(req.params.reportId);
      if (!reportId.success) {
        res.status(400).json({ error: "INVALID_REPORT_ID" });
        return;
      }
      const service = asService();
      const { data: report, error: reportError } = await service.from("monthly_reports").select("id,status,storage_path").eq("id", reportId.data).single();
      if (reportError || !report?.storage_path || !["ready", "download_confirmed"].includes(report.status)) {
        res.status(409).json({ error: "REPORT_NOT_READY" });
        return;
      }
      if (report.status === "ready") {
        const { error: confirmError } = await service.from("monthly_reports").update({ status: "download_confirmed", downloaded_at: new Date().toISOString() }).eq("id", report.id).eq("status", "ready");
        if (confirmError) throw new Error(confirmError.message);
      }
      const { data: signed, error: signedError } = await service.storage.from("jarbou3-private").createSignedUrl(report.storage_path, 90);
      if (signedError || !signed?.signedUrl) throw new Error(signedError?.message ?? "REPORT_URL_UNAVAILABLE");
      res.json({ url: signed.signedUrl });
    } catch (error) {
      res.status(siteErrorStatus(error)).json({ error: error instanceof Error ? error.message : "REPORT_DOWNLOAD_FAILED" });
    }
  });
}
