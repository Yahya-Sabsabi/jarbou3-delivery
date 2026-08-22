import type { Express, Request, Response } from "express";
import { parse as parseCookie } from "cookie";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";

import { asPublic, asService, asUser, getAuthenticatedUser, getUserProfile } from "./jarbou3-supabase";
import { buildAdminNotifications, isSameOriginRequest, normalizeReportMonth, type AdminNotification } from "./admin-web-utils";

const ADMIN_COOKIE = "jarbou3_admin_session";
const ADMIN_SESSION_MS = 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;
const loginAttempts = new Map<string, { count: number; startedAt: number }>();
const VERIFICATION_CODE_MS = 10 * 60 * 1000;

type AdminSession = {
  token: string;
  user: { id: string; name: string; phone: string | null; role: "admin" };
};

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
    maxAge: ADMIN_SESSION_MS,
    path: "/admin",
  };
}

function requestToken(req: Request) {
  return parseCookie(req.headers.cookie ?? "")[ADMIN_COOKIE] ?? null;
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

function rejectForeignOrigin(req: Request, res: Response) {
  if (isSameOriginRequest(req.headers.origin, req.headers.host, getProtocol(req))) return false;
  res.status(403).json({ error: "REQUEST_ORIGIN_REJECTED" });
  return true;
}

async function requireAdminSession(req: Request): Promise<AdminSession> {
  const token = requestToken(req);
  if (!token) throw new Error("ADMIN_SESSION_REQUIRED");
  const authUser = await getAuthenticatedUser(token);
  const profile = await getUserProfile(authUser.id);
  if (!profile.is_active || profile.role !== "admin") throw new Error("ADMIN_ACCESS_DENIED");
  return { token, user: { id: profile.id, name: profile.name, phone: profile.phone ?? null, role: "admin" } };
}

function authErrorStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return message === "ADMIN_ACCESS_DENIED" ? 403 : 401;
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
  const { data, error } = await asService().from("account_verification_requests").select("id,full_name,phone,requested_role,vehicle_type,status,code_expires_at,created_at,updated_at").in("status", ["pending_admin", "code_sent", "locked"]).order("created_at", { ascending: true }).limit(40);
  if (error) throw new Error(error.message);
  return data ?? [];
}

const loginSchema = z.object({ phone: z.string().regex(/^\+?[0-9]{8,16}$/), password: z.string().min(8).max(72) });
const generateReportSchema = z.object({ reportMonth: z.string() });

export function registerAdminWebRoutes(app: Express) {
  app.post("/admin/api/login", async (req, res) => {
    if (rejectForeignOrigin(req, res)) return;
    const key = requestKey(req);
    const attempt = currentAttempt(key);
    if (attempt.count >= LOGIN_MAX_ATTEMPTS) {
      res.status(429).json({ error: "LOGIN_RATE_LIMITED" });
      return;
    }
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "INVALID_LOGIN_INPUT" });
      return;
    }
    const { data, error } = await asPublic().auth.signInWithPassword(parsed.data);
    if (error || !data.user || !data.session) {
      attempt.count += 1;
      res.status(401).json({ error: "INVALID_CREDENTIALS" });
      return;
    }
    const profile = await getUserProfile(data.user.id).catch(() => null);
    if (!profile || !profile.is_active || profile.role !== "admin") {
      attempt.count += 1;
      res.status(403).json({ error: "ADMIN_ACCESS_DENIED" });
      return;
    }
    loginAttempts.delete(key);
    res.cookie(ADMIN_COOKIE, data.session.access_token, cookieOptions(req));
    res.json({ user: { id: profile.id, name: profile.name, role: "admin" } });
  });

  app.post("/admin/api/logout", async (req, res) => {
    if (rejectForeignOrigin(req, res)) return;
    res.clearCookie(ADMIN_COOKIE, { ...cookieOptions(req), maxAge: -1 });
    res.json({ success: true });
  });

  app.get("/admin/api/session", async (req, res) => {
    try {
      const session = await requireAdminSession(req);
      res.json({ user: session.user });
    } catch (error) {
      res.status(authErrorStatus(error)).json({ error: "ADMIN_SESSION_REQUIRED" });
    }
  });

  app.get("/admin/api/dashboard", async (req, res) => {
    try {
      await requireAdminSession(req);
      res.json(await readDashboard());
    } catch (error) {
      res.status(authErrorStatus(error)).json({ error: "ADMIN_DASHBOARD_DENIED" });
    }
  });

  app.get("/admin/api/notifications", async (req, res) => {
    try {
      await requireAdminSession(req);
      res.json({ notifications: await readNotifications() });
    } catch (error) {
      res.status(authErrorStatus(error)).json({ error: "ADMIN_NOTIFICATIONS_DENIED" });
    }
  });

  app.get("/admin/api/notifications/stream", async (req, res) => {
    try {
      await requireAdminSession(req);
    } catch (error) {
      res.status(authErrorStatus(error)).end();
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
      await requireAdminSession(req);
      res.json({ requests: await listAccountVerifications() });
    } catch (error) {
      res.status(authErrorStatus(error)).json({ error: "ADMIN_VERIFICATIONS_DENIED" });
    }
  });

  app.post("/admin/api/verifications/:requestId/send-code", async (req, res) => {
    if (rejectForeignOrigin(req, res)) return;
    try {
      const session = await requireAdminSession(req);
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
      const { error: updateError } = await service.from("account_verification_requests").update({ status: "code_sent", verification_code_hash: await bcrypt.hash(code, 12), code_expires_at: expiresAt.toISOString(), code_attempts: 0, code_sent_at: now.toISOString(), reviewed_by: session.user.id, reviewed_at: now.toISOString() }).eq("id", request.id);
      if (updateError) throw new Error(updateError.message);
      const phone = request.phone.replace(/[^0-9]/g, "");
      const roleLabel = request.requested_role === "driver" ? "سفير" : "عميل";
      const text = `مرحباً ${request.full_name}، رمز تحقق جربوع لحساب ${roleLabel}: ${code}. الرمز صالح لمدة 10 دقائق. لا تشاركه مع أي شخص.`;
      res.json({ requestId: request.id, whatsappUrl: `https://wa.me/${phone}?text=${encodeURIComponent(text)}`, expiresAt: expiresAt.toISOString() });
    } catch (error) {
      res.status(authErrorStatus(error)).json({ error: error instanceof Error ? error.message : "VERIFICATION_CODE_SEND_FAILED" });
    }
  });

  app.get("/admin/api/reports", async (req, res) => {
    try {
      await requireAdminSession(req);
      res.json({ reports: await listReports() });
    } catch (error) {
      res.status(authErrorStatus(error)).json({ error: "ADMIN_REPORTS_DENIED" });
    }
  });

  app.post("/admin/api/reports/generate", async (req, res) => {
    if (rejectForeignOrigin(req, res)) return;
    try {
      await requireAdminSession(req);
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
      res.status(authErrorStatus(error)).json({ error: error instanceof Error ? error.message : "REPORT_GENERATION_FAILED" });
    }
  });

  app.post("/admin/api/reports/:reportId/download", async (req, res) => {
    if (rejectForeignOrigin(req, res)) return;
    try {
      const session = await requireAdminSession(req);
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
        const { error: confirmError } = await asUser(session.token).rpc("confirm_monthly_report_download", { p_report_id: report.id });
        if (confirmError) throw new Error(confirmError.message);
      }
      const { data: signed, error: signedError } = await service.storage.from("jarbou3-private").createSignedUrl(report.storage_path, 90);
      if (signedError || !signed?.signedUrl) throw new Error(signedError?.message ?? "REPORT_URL_UNAVAILABLE");
      res.json({ url: signed.signedUrl });
    } catch (error) {
      res.status(authErrorStatus(error)).json({ error: error instanceof Error ? error.message : "REPORT_DOWNLOAD_FAILED" });
    }
  });
}
