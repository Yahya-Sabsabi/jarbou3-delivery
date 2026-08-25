import type { Express, Request, Response } from "express";
import { parse as parseCookie } from "cookie";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

import { asService } from "./jarbou3-supabase";
import { generateManualArchive, listManualArchives, prepareManualArchiveDownload, purgeManualArchive } from "./jarbou3-manual-archive";
import { buildAdminNotifications, isSameOriginRequest, normalizeReportMonth, type AdminNotification } from "./admin-web-utils";

const SITE_COOKIE = "jarbou3_admin_access";
const SITE_SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;
const loginAttempts = new Map<string, { count: number; startedAt: number }>();
const VERIFICATION_CODE_MS = 10 * 60 * 1000;

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

function adminPassword() {
  const password = process.env.ADMIN_SITE_PASSWORD;
  if (!password || password.length < 16) throw new Error("ADMIN_SITE_PASSWORD_NOT_CONFIGURED");
  return password;
}

function sign(value: string) {
  return createHmac("sha256", adminPassword()).update(value).digest("base64url");
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
  const expected = Buffer.from(adminPassword());
  const received = Buffer.from(value);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

function rejectForeignOrigin(req: Request, res: Response) {
  if (isSameOriginRequest(req.headers.origin, req.headers.host, getProtocol(req))) return false;
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

async function readDashboard() {
  const service = asService();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const [todayOrdersResult, activeDriversResult, pendingDriversResult, openShiftsResult, latestOrdersResult, notifications] = await Promise.all([
    service.from("orders").select("id,status,estimated_price,final_price,created_at,updated_at,driver_id,source_address,destination_address").gte("created_at", startOfDay.toISOString()).order("updated_at", { ascending: false }),
    service.from("users").select("id,name,last_location_lat,last_location_lng,last_location_at").eq("role", "driver").eq("is_active", true).limit(12),
    service.from("drivers_verification").select("id").eq("status", "pending"),
    service.from("driver_shifts").select("id").eq("is_closed", false),
    service.from("orders").select("id,status,estimated_price,final_price,created_at,updated_at,driver_id,source_address,destination_address").order("updated_at", { ascending: false }).limit(8),
    readNotifications(),
  ]);

  const errors = [todayOrdersResult.error, activeDriversResult.error, pendingDriversResult.error, openShiftsResult.error, latestOrdersResult.error].filter(Boolean);
  if (errors.length) throw new Error(errors[0]?.message ?? "ADMIN_DATA_UNAVAILABLE");
  const todayOrders = todayOrdersResult.data ?? [];
  const completed = todayOrders.filter((order) => order.status === "delivered");
  const revenue = completed.reduce((sum, order) => sum + Number(order.final_price ?? order.estimated_price ?? 0), 0);
  return {
    metrics: {
      todayOrders: todayOrders.length,
      activeDrivers: (activeDriversResult.data ?? []).length,
      pendingDrivers: (pendingDriversResult.data ?? []).length,
      openShifts: (openShiftsResult.data ?? []).length,
      revenue,
    },
    orders: latestOrdersResult.data ?? [],
    drivers: activeDriversResult.data ?? [],
    notifications,
  };
}

async function listReports() {
  const { data, error } = await asService().from("monthly_reports").select("id,report_month,status,generated_at,downloaded_at,storage_path,error_message").order("report_month", { ascending: false }).limit(18);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function listAccountVerifications() {
  const { data, error } = await asService().from("account_verification_requests").select("id,full_name,phone,requested_role,vehicle_type,status,personal_photo_path,identity_photo_path,code_expires_at,created_at,updated_at").in("status", ["pending_admin", "code_sent", "locked"]).order("created_at", { ascending: true }).limit(40);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function listRecoveryRequests() {
  const { data, error } = await asService().from("account_recovery_requests").select("id,full_name,phone,requested_role,status,code_expires_at,retry_after,created_at,updated_at").in("status", ["pending_admin", "code_sent", "locked"]).order("created_at", { ascending: true }).limit(40);
  if (error) throw new Error(error.message);
  return data ?? [];
}

const loginSchema = z.object({ password: z.string().min(16).max(512) });
const generateReportSchema = z.object({ reportMonth: z.string() });
const discountSchema = z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,32}$/), discountType: z.enum(["fixed", "percentage"]), discountValue: z.number().positive(), startsAt: z.string().datetime().nullable().optional(), endsAt: z.string().datetime().nullable().optional() }).superRefine((value, context) => {
  if (value.discountType === "percentage" && value.discountValue > 100) context.addIssue({ code: "custom", message: "PERCENTAGE_TOO_HIGH" });
  if (value.endsAt && value.startsAt && new Date(value.endsAt).getTime() <= new Date(value.startsAt).getTime()) context.addIssue({ code: "custom", message: "INVALID_DISCOUNT_WINDOW" });
});
const archiveSchema = z.object({ archiveKind: z.enum(["weekly_documents", "monthly_text"]), periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
const releaseSchema = z.object({ minVersion: z.string().regex(/^\d+\.\d+\.\d+$/).nullable(), forceUpdate: z.boolean(), updateUrl: z.string().url().nullable() }).superRefine((value, context) => {
  if (value.forceUpdate && (!value.minVersion || !value.updateUrl)) context.addIssue({ code: "custom", message: "FORCED_RELEASE_REQUIRES_VERSION_AND_URL" });
});

async function listManagedAccounts() {
  const service = asService();
  const [usersResult, onboardingResult, driverVerificationResult] = await Promise.all([
    service.from("users").select("id,name,phone,role,is_active,created_at").in("role", ["customer", "driver"]).order("created_at", { ascending: false }).limit(250),
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

export function registerAdminWebRoutes(app: Express) {
  app.use("/admin/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
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
      if (!parsed.success || !passwordMatches(parsed.data.password)) {
        attempt.count += 1;
        res.status(401).json({ error: "INVALID_SITE_PASSWORD" });
        return;
      }
    } catch (error) {
      res.status(error instanceof Error && error.message === "ADMIN_SITE_PASSWORD_NOT_CONFIGURED" ? 503 : 500).json({ error: "SITE_PASSWORD_CONFIGURATION_ERROR" });
      return;
    }
    loginAttempts.delete(key);
    res.cookie(SITE_COOKIE, createSiteSession(), cookieOptions(req));
    res.json({ user: { name: "مالك الموقع", role: "owner" } });
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
      res.json({ requestId: request.id, whatsappUrl: `https://wa.me/${phone}?text=${encodeURIComponent(text)}`, expiresAt: expiresAt.toISOString() });
    } catch (error) {
      res.status(siteErrorStatus(error)).json({ error: error instanceof Error ? error.message : "VERIFICATION_CODE_SEND_FAILED" });
    }
  });

  app.get("/admin/api/verifications/:requestId/document/:kind", async (req, res) => {
    try {
      requireSiteSession(req);
      const requestId = z.string().uuid().safeParse(req.params.requestId);
      const kind = z.enum(["personal", "identity"]).safeParse(req.params.kind);
      if (!requestId.success || !kind.success) return res.status(400).json({ error: "INVALID_DOCUMENT_REQUEST" });
      const service = asService();
      const { data: request, error } = await service.from("account_verification_requests").select("personal_photo_path,identity_photo_path").eq("id", requestId.data).single();
      const path = kind.data === "personal" ? request?.personal_photo_path : request?.identity_photo_path;
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
      const text = `مرحباً ${request.full_name}، رمز جربوع لإعادة تعيين كلمة المرور: ${code}. الرمز صالح لمدة 10 دقائق. لا تشاركه مع أي شخص.`;
      res.json({ requestId: request.id, whatsappUrl: `https://wa.me/${phone}?text=${encodeURIComponent(text)}`, expiresAt: expiresAt.toISOString() });
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

  app.get("/admin/api/accounts/:userId/document/:kind", async (req, res) => {
    try {
      requireSiteSession(req);
      const userId = z.string().uuid().safeParse(req.params.userId);
      const kind = z.enum(["personal", "identity"]).safeParse(req.params.kind);
      if (!userId.success || !kind.success) return res.status(400).json({ error: "INVALID_DOCUMENT_REQUEST" });
      const service = asService();
      const [driverResult, onboardingResult] = await Promise.all([
        service.from("drivers_verification").select("personal_photo_path,id_photo_path").eq("user_id", userId.data).maybeSingle(),
        service.from("account_verification_requests").select("personal_photo_path,identity_photo_path").eq("auth_user_id", userId.data).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      const path = kind.data === "personal" ? driverResult.data?.personal_photo_path ?? onboardingResult.data?.personal_photo_path : driverResult.data?.id_photo_path ?? onboardingResult.data?.identity_photo_path;
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
      const { data, error } = await asService().from("discount_codes").select("id,code,discount_type,discount_value,starts_at,ends_at,is_active,deactivated_at,created_at").order("created_at", { ascending: false }).limit(100);
      if (error) throw new Error(error.message);
      res.json({ codes: data ?? [] });
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
      const { data, error } = await asService().from("discount_codes").insert({ code: parsed.data.code, discount_type: parsed.data.discountType, discount_value: parsed.data.discountValue, starts_at: parsed.data.startsAt ?? null, ends_at: parsed.data.endsAt ?? null, is_active: true }).select("id,code,discount_type,discount_value,starts_at,ends_at,is_active,deactivated_at,created_at").single();
      if (error || !data) throw new Error(error?.message ?? "DISCOUNT_CREATE_FAILED");
      res.json({ code: data });
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
      res.json({ reports: await listReports() });
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
