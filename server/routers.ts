import { COOKIE_NAME } from "../shared/const.js";
import { HAMA_BOUNDS, distanceMeters, isInsideHama } from "../shared/jarbou3";
import { isSameJarbou3Phone, normalizeJarbou3Otp, normalizeJarbou3Phone } from "../shared/jarbou3-phone";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { asPublic, asService, asUser, assertHamaPoint, createOtpHash, decodeDataUrl, getAuthenticatedUser, getUserProfile } from "./jarbou3-supabase";
import { recordDriverLocation } from "./jarbou3-driver-location";

const tokenInput = z.object({ accessToken: z.string().min(20) });
const pointInput = z.object({ latitude: z.number(), longitude: z.number() });
const imageInput = z.string().min(50).max(7_000_000);
const otpCodeInput = z.string().transform((value) => normalizeJarbou3Otp(value)).refine((value) => value.length === 6, { message: "INVALID_OR_EXPIRED_CODE" });
type HamaSearchFilter = "all" | "shops" | "streets";
type HamaSearchResult = { label: string; latitude: number; longitude: number; kind: "shop" | "street" | "place" };
const hamaSearchCache = new Map<string, HamaSearchResult[]>();
let lastHamaSearchAt = 0;
const onboardingWindows = new Map<string, { count: number; startedAt: number }>();
const ONBOARDING_WINDOW_MS = 15 * 60 * 1000;
const ONBOARDING_MAX_ATTEMPTS = 4;
const CODE_MAX_ATTEMPTS = 3;
const CODE_RETRY_DELAY_MS = 3 * 60 * 1000;
const RECOVERY_CODE_MS = 10 * 60 * 1000;
const MAX_ONBOARDING_IMAGE_BYTES = 3 * 1024 * 1024;
type DriverOfferAssignment = { driver_id: string | null; offer_expires_at: string | null; offer_round: number };

function assertOnboardingRateLimit(key: string) {
  const current = onboardingWindows.get(key);
  const now = Date.now();
  if (!current || now - current.startedAt > ONBOARDING_WINDOW_MS) {
    onboardingWindows.set(key, { count: 1, startedAt: now });
    return;
  }
  if (current.count >= ONBOARDING_MAX_ATTEMPTS) throw new Error("ONBOARDING_RATE_LIMITED");
  current.count += 1;
}

function generatedAuthPassword() {
  return randomBytes(32).toString("base64url");
}

function retryAfterIso() {
  return new Date(Date.now() + CODE_RETRY_DELAY_MS).toISOString();
}

function decodeSmallPrivateImage(value: string) {
  const image = decodeDataUrl(value);
  if (image.buffer.byteLength === 0 || image.buffer.byteLength > MAX_ONBOARDING_IMAGE_BYTES) {
    throw new Error("IMAGE_TOO_LARGE");
  }
  return image;
}

async function resolveActiveDiscount(code: string | undefined, preDiscountPrice: number) {
  if (!code?.trim()) return { discountCodeId: null, discountAmount: 0, finalPrice: preDiscountPrice };
  const normalized = code.trim().toUpperCase();
  const { data, error } = await asService().from("discount_codes").select("id,discount_type,discount_value,starts_at,ends_at,is_active").eq("code", normalized).maybeSingle();
  if (error) throw new Error(error.message);
  const now = Date.now();
  if (!data || !data.is_active || (data.starts_at && new Date(data.starts_at).getTime() > now) || (data.ends_at && new Date(data.ends_at).getTime() <= now)) throw new Error("DISCOUNT_CODE_INVALID");
  const rawAmount = data.discount_type === "percentage" ? Math.floor(preDiscountPrice * Number(data.discount_value) / 100) : Math.floor(Number(data.discount_value));
  const discountAmount = Math.max(0, Math.min(preDiscountPrice, rawAmount));
  return { discountCodeId: data.id, discountAmount, finalPrice: Math.max(0, preDiscountPrice - discountAmount) };
}

async function searchHamaAddresses(query: string, filter: HamaSearchFilter): Promise<HamaSearchResult[]> {
  const normalized = `${filter}:${query.trim().toLowerCase()}`;
  const cached = hamaSearchCache.get(normalized);
  if (cached) return cached;
  const delay = Math.max(0, 1_050 - (Date.now() - lastHamaSearchAt));
  if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
  lastHamaSearchAt = Date.now();
  const url = new URL("https://nominatim.openstreetmap.org/search");
  const params = new URLSearchParams({
    q: `${query}, حماة، سوريا`, format: "jsonv2", limit: "5", countrycodes: "sy", accept_language: "ar",
    viewbox: `${HAMA_BOUNDS.minLongitude},${HAMA_BOUNDS.maxLatitude},${HAMA_BOUNDS.maxLongitude},${HAMA_BOUNDS.minLatitude}`, bounded: "1",
  });
  if (filter === "shops") params.set("layer", "poi");
  if (filter === "streets") params.set("layer", "address");
  url.search = params.toString();
  const response = await fetch(url, { headers: { "User-Agent": "Jarbou3Delivery/1.0 (Hama address search; support@jarbou3.local)", "Accept-Language": "ar" } });
  if (!response.ok) throw new Error("HAMA_SEARCH_UNAVAILABLE");
  const rows = await response.json() as Array<{ display_name: string; lat: string; lon: string; category?: string; type?: string }>;
  const results = rows.map((row) => {
    const kind: HamaSearchResult["kind"] = row.category === "shop" || row.category === "amenity" ? "shop" : row.category === "highway" || row.type === "road" ? "street" : "place";
    return { label: row.display_name, latitude: Number(row.lat), longitude: Number(row.lon), kind };
  })
    .filter((row) => filter === "all" || row.kind === (filter === "shops" ? "shop" : "street"))
    .filter((row) => Number.isFinite(row.latitude) && Number.isFinite(row.longitude) && isInsideHama(row.latitude, row.longitude));
  if (hamaSearchCache.size > 100) hamaSearchCache.clear();
  hamaSearchCache.set(normalized, results);
  return results;
}

async function notifyCustomer(userId: string, title: string, body: string, data: Record<string, string>) {
  try {
    const { data: tokens, error } = await asService().from("push_tokens").select("expo_push_token").eq("user_id", userId).limit(10);
    if (error || !tokens?.length) return;
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(tokens.map((token) => ({ to: token.expo_push_token, sound: "default", title, body, data, channelId: "jarbou3-orders" }))),
    });
  } catch (error) {
    console.warn("[Jarbou3] Push notification skipped", error);
  }
}

async function notifyDriver(userId: string, title: string, body: string, data: Record<string, string>) {
  try {
    const { data: tokens, error } = await asService().from("push_tokens").select("expo_push_token").eq("user_id", userId).limit(10);
    if (error || !tokens?.length) return;
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(tokens.map((token) => ({ to: token.expo_push_token, sound: "default", title, body, data, channelId: "jarbou3-orders" }))),
    });
  } catch (error) {
    console.warn("[Jarbou3] Driver offer push skipped", error);
  }
}

async function assignNextDriverOffer(orderId: string): Promise<DriverOfferAssignment | null> {
  const { data, error } = await asService()
    .rpc("assign_next_driver_offer", { p_order_id: orderId })
    .maybeSingle();
  if (error) throw new Error(error.message);
  const offer = data as DriverOfferAssignment | null;
  if (offer?.driver_id) {
    await notifyDriver(
      offer.driver_id,
      "طلب قريب متاح",
      "لديك عرض جديد لفترة قصيرة. افتح جربوع للقبول أو الرفض.",
      { orderId, status: "offered" },
    );
  }
  return offer;
}

async function requireRole(accessToken: string, allowedRoles: Array<"customer" | "driver" | "admin">) {
  const authUser = await getAuthenticatedUser(accessToken);
  const profile = await getUserProfile(authUser.id);
  if (!profile.is_active || !allowedRoles.includes(profile.role)) throw new Error("JARBOU3_FORBIDDEN");
  return { authUser, profile };
}

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  jarbou3: router({
    releaseSettings: publicProcedure.query(async () => {
      const { data, error } = await asService().from("app_release_settings").select("min_version,force_update,update_url,updated_at").eq("singleton", true).maybeSingle();
      if (error) throw new Error(error.message);
      return { minVersion: data?.min_version ?? null, forceUpdate: Boolean(data?.force_update), updateUrl: data?.update_url ?? null, updatedAt: data?.updated_at ?? null };
    }),

    previewDiscount: publicProcedure
      .input(z.object({ code: z.string().trim().min(3).max(32), preDiscountPrice: z.number().int().nonnegative() }))
      .query(async ({ input }) => resolveActiveDiscount(input.code, input.preDiscountPrice)),

    searchHamaAddresses: publicProcedure
      .input(z.object({ query: z.string().trim().min(2).max(80), filter: z.enum(["all", "shops", "streets"]).default("all") }))
      .query(async ({ input }) => searchHamaAddresses(input.query, input.filter)),

    listFavoriteAddresses: publicProcedure
      .input(tokenInput)
      .query(async ({ input }) => {
        const { authUser } = await requireRole(input.accessToken, ["customer"]);
        const { data, error } = await asUser(input.accessToken).from("favorite_addresses").select("id,label,address,latitude,longitude,created_at").eq("customer_id", authUser.id).order("created_at", { ascending: false }).limit(12);
        if (error) throw new Error(error.message);
        return data;
      }),

    saveFavoriteAddress: publicProcedure
      .input(tokenInput.extend({ label: z.string().trim().min(2).max(80), address: z.string().trim().min(3).max(300), point: pointInput }))
      .mutation(async ({ input }) => {
        const { authUser } = await requireRole(input.accessToken, ["customer"]);
        assertHamaPoint(input.point.latitude, input.point.longitude);
        const { data, error } = await asUser(input.accessToken).from("favorite_addresses").insert({ customer_id: authUser.id, label: input.label, address: input.address, latitude: input.point.latitude, longitude: input.point.longitude }).select("id,label,address,latitude,longitude").single();
        if (error) throw new Error(error.message);
        return data;
      }),

    deleteFavoriteAddress: publicProcedure
      .input(tokenInput.extend({ favoriteId: z.string().uuid() }))
      .mutation(async ({ input }) => {
        await requireRole(input.accessToken, ["customer"]);
        const { error } = await asUser(input.accessToken).from("favorite_addresses").delete().eq("id", input.favoriteId);
        if (error) throw new Error(error.message);
        return { deleted: true };
      }),

    registerPushToken: publicProcedure
      .input(tokenInput.extend({ expoPushToken: z.string().min(20).max(255), platform: z.enum(["ios", "android"]) }))
      .mutation(async ({ input }) => {
        const { authUser } = await requireRole(input.accessToken, ["customer", "driver", "admin"]);
        const { error } = await asUser(input.accessToken).from("push_tokens").upsert({ user_id: authUser.id, expo_push_token: input.expoPushToken, platform: input.platform, last_seen_at: new Date().toISOString() }, { onConflict: "expo_push_token" });
        if (error) throw new Error(error.message);
        return { registered: true };
      }),

    submitProblemReport: publicProcedure
      .input(tokenInput.extend({ message: z.string().trim().min(10).max(1500) }))
      .mutation(async ({ input }) => {
        const { authUser, profile } = await requireRole(input.accessToken, ["customer", "driver"]);
        const { data, error } = await asService().from("problem_reports").insert({ reporter_id: authUser.id, reporter_role: profile.role, message: input.message, status: "open" }).select("id,status,created_at").single();
        if (error || !data) throw new Error(error?.message ?? "PROBLEM_REPORT_CREATE_FAILED");
        return data;
      }),

    signUpCustomer: publicProcedure
      .input(z.object({ name: z.string().trim().min(2).max(100), phone: z.string().trim().min(8).max(24), password: z.string().min(8).max(72) }))
      .mutation(async ({ input }) => {
        const phone = normalizeJarbou3Phone(input.phone);
        const { data: existing, error: existingError } = await asService().from("users").select("id").eq("phone", phone).maybeSingle();
        if (existingError) throw new Error(existingError.message);
        if (existing) throw new Error("PHONE_ALREADY_REGISTERED");
        const { data, error } = await asPublic().auth.signUp({ phone, password: input.password, options: { data: { name: input.name, phone } } });
        if (error) throw new Error(error.message);
        return { userId: data.user?.id ?? null, requiresPhoneConfirmation: !data.session };
      }),

    signIn: publicProcedure
      .input(z.object({ phone: z.string().trim().min(8).max(24), password: z.string().min(8).max(72) }))
      .mutation(async ({ input }) => {
        const phone = normalizeJarbou3Phone(input.phone);
        if (!phone) throw new Error("INVALID_PHONE");
        const { data, error } = await asPublic().auth.signInWithPassword({ phone, password: input.password });
        if (error || !data.session) throw new Error(error?.message ?? "SIGN_IN_FAILED");
        const profile = await getUserProfile(data.user.id);
        return { accessToken: data.session.access_token, refreshToken: data.session.refresh_token, user: { id: data.user.id, name: profile.name, role: profile.role } };
      }),

    requestAccountRecovery: publicProcedure
      .input(z.object({ fullName: z.string().trim().min(2).max(100), phone: z.string().regex(/^\+?[0-9]{8,16}$/), requestedRole: z.enum(["customer", "driver"]) }))
      .mutation(async ({ input, ctx }) => {
        assertOnboardingRateLimit(`recovery:${ctx.req.ip ?? "unknown"}:${input.phone}`);
        const service = asService();
        const { data: profile, error: profileError } = await service.from("users").select("id,name,phone,role").eq("phone", input.phone).eq("role", input.requestedRole).maybeSingle();
        if (profileError) throw new Error(profileError.message);
        if (!profile || profile.name.trim() !== input.fullName.trim()) throw new Error("RECOVERY_ACCOUNT_NOT_FOUND");
        const { data: active, error: activeError } = await service.from("account_recovery_requests").select("id,status,code_expires_at,retry_after").eq("phone", input.phone).in("status", ["pending_admin", "code_sent", "verified", "locked"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (activeError) throw new Error(activeError.message);
        if (active?.status === "locked" && active.retry_after && new Date(active.retry_after).getTime() > Date.now()) return { requestId: active.id, status: "locked" as const, retryAfter: active.retry_after, codeExpiresAt: null };
        if (active?.status === "code_sent" && active.code_expires_at && new Date(active.code_expires_at).getTime() > Date.now()) return { requestId: active.id, status: "code_sent" as const, retryAfter: null, codeExpiresAt: active.code_expires_at };
        const { data, error } = await service.from("account_recovery_requests").insert({ full_name: input.fullName, phone: input.phone, requested_role: input.requestedRole, user_id: profile.id }).select("id,status,code_expires_at,retry_after").single();
        if (error || !data) throw new Error(error?.message ?? "RECOVERY_REQUEST_FAILED");
        return { requestId: data.id, status: data.status, retryAfter: data.retry_after, codeExpiresAt: data.code_expires_at };
      }),

    recoveryStatus: publicProcedure
      .input(z.object({ requestId: z.string().uuid(), phone: z.string().regex(/^\+?[0-9]{8,16}$/) }))
      .query(async ({ input }) => {
        const { data, error } = await asService().from("account_recovery_requests").select("status,code_expires_at,retry_after").eq("id", input.requestId).eq("phone", input.phone).maybeSingle();
        if (error || !data) throw new Error("RECOVERY_REQUEST_NOT_FOUND");
        return { status: data.status, codeExpiresAt: data.code_expires_at, retryAfter: data.retry_after };
      }),

    verifyRecoveryCode: publicProcedure
      .input(z.object({ requestId: z.string().uuid(), phone: z.string().regex(/^\+?[0-9]{8,16}$/), code: z.string().regex(/^\d{6}$/) }))
      .mutation(async ({ input, ctx }) => {
        assertOnboardingRateLimit(`recovery-verify:${ctx.req.ip ?? "unknown"}:${input.requestId}`);
        const service = asService();
        const { data: request, error } = await service.from("account_recovery_requests").select("id,user_id,status,verification_code_hash,code_expires_at,code_attempts,retry_after").eq("id", input.requestId).eq("phone", input.phone).maybeSingle();
        if (error || !request || request.status !== "code_sent" || !request.verification_code_hash || !request.code_expires_at) throw new Error("INVALID_OR_EXPIRED_CODE");
        if (new Date(request.code_expires_at).getTime() <= Date.now()) throw new Error("INVALID_OR_EXPIRED_CODE");
        const valid = await bcrypt.compare(input.code, request.verification_code_hash);
        if (!valid) {
          const attempts = Number(request.code_attempts) + 1;
          const locked = attempts >= CODE_MAX_ATTEMPTS;
          const retryAfter = locked ? retryAfterIso() : null;
          await service.from("account_recovery_requests").update({ code_attempts: attempts, status: locked ? "locked" : "code_sent", verification_code_hash: locked ? null : request.verification_code_hash, retry_after: retryAfter }).eq("id", request.id);
          if (locked) throw new Error("RECOVERY_CODE_LOCKED");
          throw new Error("INVALID_OR_EXPIRED_CODE");
        }
        const resetToken = randomBytes(32).toString("base64url");
        const resetTokenExpiresAt = new Date(Date.now() + RECOVERY_CODE_MS).toISOString();
        const { error: updateError } = await service.from("account_recovery_requests").update({ status: "verified", verified_at: new Date().toISOString(), verification_code_hash: null, code_attempts: 0, reset_token_hash: await bcrypt.hash(resetToken, 12), reset_token_expires_at: resetTokenExpiresAt }).eq("id", request.id);
        if (updateError) throw new Error(updateError.message);
        return { resetToken, resetTokenExpiresAt };
      }),

    completeAccountRecovery: publicProcedure
      .input(z.object({ requestId: z.string().uuid(), phone: z.string().regex(/^\+?[0-9]{8,16}$/), resetToken: z.string().min(20), password: z.string().min(8).max(72) }))
      .mutation(async ({ input }) => {
        const service = asService();
        const { data: request, error } = await service.from("account_recovery_requests").select("id,user_id,status,reset_token_hash,reset_token_expires_at").eq("id", input.requestId).eq("phone", input.phone).maybeSingle();
        if (error || !request || request.status !== "verified" || !request.user_id || !request.reset_token_hash || !request.reset_token_expires_at || new Date(request.reset_token_expires_at).getTime() <= Date.now()) throw new Error("RECOVERY_NOT_VERIFIED");
        if (!await bcrypt.compare(input.resetToken, request.reset_token_hash)) throw new Error("RECOVERY_NOT_VERIFIED");
        const { error: updateAuthError } = await service.auth.admin.updateUserById(request.user_id, { password: input.password, phone_confirm: true });
        if (updateAuthError) throw new Error(updateAuthError.message);
        const { error: closeError } = await service.from("account_recovery_requests").update({ status: "completed", reset_token_hash: null, reset_token_expires_at: null }).eq("id", request.id);
        if (closeError) throw new Error(closeError.message);
        const { data: session, error: signInError } = await asPublic().auth.signInWithPassword({ phone: input.phone, password: input.password });
        if (signInError || !session.session || !session.user) throw new Error(signInError?.message ?? "SIGN_IN_FAILED");
        const profile = await getUserProfile(session.user.id);
        return { accessToken: session.session.access_token, refreshToken: session.session.refresh_token, user: { id: session.user.id, name: profile.name, role: profile.role } };
      }),

    sessionProfile: publicProcedure
      .input(tokenInput)
      .query(async ({ input }) => {
        const authUser = await getAuthenticatedUser(input.accessToken);
        const profile = await getUserProfile(authUser.id);
        const { data: pendingRequest, error } = await asService()
          .from("account_verification_requests")
          .select("id")
          .eq("auth_user_id", authUser.id)
          .eq("status", "password_pending")
          .limit(1)
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (!profile.is_active && !pendingRequest) throw new Error("JARBOU3_FORBIDDEN");
        return { id: authUser.id, name: profile.name, role: profile.role, pendingPassword: Boolean(pendingRequest) };
      }),

    lookupPreapprovedTeamDriver: publicProcedure
      .input(z.object({ phone: z.string().trim().min(8).max(24), fullName: z.string().trim().min(2).max(100) }))
      .query(async ({ input }) => {
        const phone = normalizeJarbou3Phone(input.phone);
        const { data, error } = await asService().from("driver_registration_invites").select("id,full_name,claimed_at,is_active").eq("phone", phone).eq("is_active", true).maybeSingle();
        if (error) throw new Error(error.message);
        return { found: Boolean(data && !data.claimed_at && data.full_name.trim() === input.fullName.trim()) };
      }),

    submitOnboarding: publicProcedure
      .input(z.object({ fullName: z.string().trim().min(2).max(100), phone: z.string().trim().min(8).max(24), requestedRole: z.enum(["customer", "driver"]), vehicleType: z.enum(["motorcycle", "electric_scooter"]).optional(), personalPhoto: imageInput.optional(), identityPhoto: imageInput.optional() }))
      .mutation(async ({ input, ctx }) => {
        const phone = normalizeJarbou3Phone(input.phone);
        if (!phone) throw new Error("INVALID_PHONE");
        assertOnboardingRateLimit(`submit:${ctx.req.ip ?? "unknown"}:${phone}`);
        if (input.requestedRole === "driver" && !input.vehicleType) throw new Error("VEHICLE_TYPE_REQUIRED");
        if (input.requestedRole === "customer" && (input.personalPhoto || input.identityPhoto)) throw new Error("CUSTOMER_DOCUMENTS_NOT_ALLOWED");
        const service = asService();
        const { data: teamInvite, error: teamInviteError } = input.requestedRole === "driver" ? await service.from("driver_registration_invites").select("id,full_name,is_active,claimed_at").eq("phone", phone).maybeSingle() : { data: null, error: null };
        if (teamInviteError) throw new Error(teamInviteError.message);
        const isPreapprovedTeamDriver = Boolean(teamInvite && teamInvite.is_active && !teamInvite.claimed_at && teamInvite.full_name.trim() === input.fullName.trim());
        if (input.requestedRole === "driver" && !isPreapprovedTeamDriver && (!input.personalPhoto || !input.identityPhoto)) throw new Error("DRIVER_DOCUMENTS_REQUIRED");
        const { data: registeredUser, error: registeredUserError } = await service.from("users").select("id").eq("phone", phone).maybeSingle();
        if (registeredUserError) throw new Error(registeredUserError.message);
        if (registeredUser) throw new Error("PHONE_ALREADY_REGISTERED");
        const { data: existing, error: existingError } = await service.from("account_verification_requests").select("id,full_name,status,requested_role,code_expires_at,retry_after,personal_photo_path,identity_photo_path").eq("phone", phone).maybeSingle();
        if (existingError) throw new Error(existingError.message);
        if (existing && (existing.full_name.trim() !== input.fullName.trim() || existing.requested_role !== input.requestedRole)) throw new Error("PHONE_ALREADY_REGISTERED");
        if (existing?.status === "verified") throw new Error("ACCOUNT_ALREADY_VERIFIED");
        if (existing?.status === "password_pending") throw new Error("PASSWORD_SETUP_PENDING");
        if (existing?.status === "locked" && existing.retry_after && new Date(existing.retry_after).getTime() <= Date.now()) {
          const { data: reopened, error: reopenError } = await service.from("account_verification_requests").update({ status: "pending_admin", retry_after: null, verification_code_hash: null, code_attempts: 0, code_expires_at: null }).eq("id", existing.id).select("id,status,requested_role,code_expires_at,retry_after").single();
          if (reopenError || !reopened) throw new Error(reopenError?.message ?? "ONBOARDING_REQUEST_FAILED");
          return { requestId: reopened.id, status: reopened.status, requestedRole: reopened.requested_role, codeExpiresAt: reopened.code_expires_at, retryAfter: reopened.retry_after };
        }
        if (existing) {
          if (isPreapprovedTeamDriver && teamInvite && !teamInvite.claimed_at) {
            const { error: claimError } = await service.from("driver_registration_invites").update({ claimed_at: new Date().toISOString(), activation_request_id: existing.id, updated_at: new Date().toISOString() }).eq("id", teamInvite.id);
            if (claimError) throw new Error(claimError.message);
          }
          if (input.requestedRole === "driver" && input.personalPhoto && input.identityPhoto && (!existing.personal_photo_path || !existing.identity_photo_path)) {
            const personal = decodeSmallPrivateImage(input.personalPhoto);
            const identity = decodeSmallPrivateImage(input.identityPhoto);
            const prefix = `onboarding-documents/${existing.id}`;
            const personalPath = `${prefix}/personal-${Date.now()}.${personal.contentType.endsWith("png") ? "png" : "jpg"}`;
            const identityPath = `${prefix}/identity-${Date.now()}.${identity.contentType.endsWith("png") ? "png" : "jpg"}`;
            const [personalUpload, identityUpload] = await Promise.all([
              service.storage.from("jarbou3-private").upload(personalPath, personal.buffer, { contentType: personal.contentType, upsert: false }),
              service.storage.from("jarbou3-private").upload(identityPath, identity.buffer, { contentType: identity.contentType, upsert: false }),
            ]);
            if (personalUpload.error || identityUpload.error) throw new Error(personalUpload.error?.message ?? identityUpload.error?.message ?? "DOCUMENT_UPLOAD_FAILED");
            const { error: documentUpdateError } = await service.from("account_verification_requests").update({ personal_photo_path: personalPath, identity_photo_path: identityPath }).eq("id", existing.id);
            if (documentUpdateError) throw new Error(documentUpdateError.message);
          }
          return { requestId: existing.id, status: existing.status, requestedRole: existing.requested_role, codeExpiresAt: existing.code_expires_at, retryAfter: existing.retry_after };
        }
        const { data, error } = await service.from("account_verification_requests").insert({ full_name: input.fullName, phone, requested_role: input.requestedRole, vehicle_type: input.requestedRole === "driver" ? input.vehicleType : null, preapproved_by_admin: isPreapprovedTeamDriver }).select("id,status,requested_role,code_expires_at,retry_after").single();
        if (error || !data) throw new Error(error?.message ?? "ONBOARDING_REQUEST_FAILED");
        if (input.requestedRole === "driver" && isPreapprovedTeamDriver) await service.from("driver_registration_invites").update({ claimed_at: new Date().toISOString(), activation_request_id: data.id, updated_at: new Date().toISOString() }).eq("id", teamInvite!.id);
        if (input.requestedRole === "driver" && input.personalPhoto && input.identityPhoto) {
          const personal = decodeSmallPrivateImage(input.personalPhoto);
          const identity = decodeSmallPrivateImage(input.identityPhoto);
          const prefix = `onboarding-documents/${data.id}`;
          const personalPath = `${prefix}/personal-${Date.now()}.${personal.contentType.endsWith("png") ? "png" : "jpg"}`;
          const identityPath = `${prefix}/identity-${Date.now()}.${identity.contentType.endsWith("png") ? "png" : "jpg"}`;
          const [personalUpload, identityUpload] = await Promise.all([
            service.storage.from("jarbou3-private").upload(personalPath, personal.buffer, { contentType: personal.contentType, upsert: false }),
            service.storage.from("jarbou3-private").upload(identityPath, identity.buffer, { contentType: identity.contentType, upsert: false }),
          ]);
          if (personalUpload.error || identityUpload.error) throw new Error(personalUpload.error?.message ?? identityUpload.error?.message ?? "DOCUMENT_UPLOAD_FAILED");
          const { error: documentUpdateError } = await service.from("account_verification_requests").update({ personal_photo_path: personalPath, identity_photo_path: identityPath }).eq("id", data.id);
          if (documentUpdateError) throw new Error(documentUpdateError.message);
        }
        return { requestId: data.id, status: data.status, requestedRole: data.requested_role, codeExpiresAt: data.code_expires_at, retryAfter: data.retry_after };
      }),

    onboardingStatus: publicProcedure
      .input(z.object({ requestId: z.string().uuid(), phone: z.string().regex(/^\+?[0-9]{8,16}$/) }))
      .query(async ({ input }) => {
        const { data, error } = await asService().from("account_verification_requests").select("phone,status,code_expires_at,retry_after").eq("id", input.requestId).maybeSingle();
        if (error || !data || !isSameJarbou3Phone(input.phone, data.phone)) throw new Error("ONBOARDING_REQUEST_NOT_FOUND");
        return { status: data.status, codeExpiresAt: data.code_expires_at, retryAfter: data.retry_after };
      }),

    verifyOnboardingCode: publicProcedure
      .input(z.object({ requestId: z.string().uuid(), phone: z.string().regex(/^\+?[0-9]{8,16}$/), code: otpCodeInput }))
      .mutation(async ({ input, ctx }) => {
        assertOnboardingRateLimit(`verify:${ctx.req.ip ?? "unknown"}:${input.requestId}`);
        const service = asService();
        const { data: request, error: requestError } = await service.from("account_verification_requests").select("id,full_name,phone,requested_role,status,verification_code_hash,code_expires_at,code_attempts,retry_after,auth_user_id").eq("id", input.requestId).maybeSingle();
        if (requestError || !request || !isSameJarbou3Phone(input.phone, request.phone)) throw new Error("ONBOARDING_REQUEST_NOT_FOUND");
        if (request.status === "locked" && request.retry_after && new Date(request.retry_after).getTime() > Date.now()) throw new Error("ONBOARDING_CODE_LOCKED");
        if (request.status !== "code_sent" || !request.verification_code_hash || !request.code_expires_at) throw new Error("INVALID_OR_EXPIRED_CODE");
        if (new Date(request.code_expires_at).getTime() <= Date.now()) {
          await service.from("account_verification_requests").update({ status: "expired" }).eq("id", request.id);
          throw new Error("INVALID_OR_EXPIRED_CODE");
        }
        if (request.code_attempts >= CODE_MAX_ATTEMPTS) {
          await service.from("account_verification_requests").update({ status: "locked", retry_after: retryAfterIso(), verification_code_hash: null }).eq("id", request.id);
          throw new Error("ONBOARDING_CODE_LOCKED");
        }
        const valid = await bcrypt.compare(input.code, request.verification_code_hash);
        if (!valid) {
          const attempts = request.code_attempts + 1;
          const locked = attempts >= CODE_MAX_ATTEMPTS;
          await service.from("account_verification_requests").update({ code_attempts: attempts, status: locked ? "locked" : "code_sent", retry_after: locked ? retryAfterIso() : null, verification_code_hash: locked ? null : request.verification_code_hash }).eq("id", request.id);
          throw new Error(locked ? "ONBOARDING_CODE_LOCKED" : "INVALID_OR_EXPIRED_CODE");
        }
        let userId = request.auth_user_id;
        const authPassword = generatedAuthPassword();
        if (!userId) {
          const { data: existingProfile, error: profileError } = await service.from("users").select("id,role").eq("phone", request.phone).maybeSingle();
          if (profileError) throw new Error(profileError.message);
          if (existingProfile?.role === "admin") throw new Error("ACCOUNT_CONFLICT");
          if (existingProfile) {
            userId = existingProfile.id;
            const { error: updateAuthError } = await service.auth.admin.updateUserById(userId, { password: authPassword, phone_confirm: true, user_metadata: { name: request.full_name, phone: request.phone } });
            if (updateAuthError) throw new Error(updateAuthError.message);
          } else {
            const { data: created, error: createError } = await service.auth.admin.createUser({ phone: request.phone, password: authPassword, phone_confirm: true, user_metadata: { name: request.full_name, phone: request.phone } });
            if (createError || !created.user) throw new Error(createError?.message ?? "AUTH_ACCOUNT_CREATE_FAILED");
            userId = created.user.id;
          }
        } else {
          const { error: updateAuthError } = await service.auth.admin.updateUserById(userId, { password: authPassword, phone_confirm: true, user_metadata: { name: request.full_name, phone: request.phone } });
          if (updateAuthError) throw new Error(updateAuthError.message);
        }
        const { error: profileUpdateError } = await service.from("users").update({ name: request.full_name, phone: request.phone, role: request.requested_role, is_active: false }).eq("id", userId);
        if (profileUpdateError) throw new Error(profileUpdateError.message);
        const { error: verificationUpdateError } = await service.from("account_verification_requests").update({ status: "password_pending", auth_user_id: userId, verification_code_hash: null, code_attempts: 0, retry_after: null }).eq("id", request.id);
        if (verificationUpdateError) throw new Error(verificationUpdateError.message);
        const { data: sessionResult, error: sessionError } = await asPublic().auth.signInWithPassword({ phone: request.phone, password: authPassword });
        if (sessionError || !sessionResult.session || !sessionResult.user) throw new Error(sessionError?.message ?? "SESSION_CREATE_FAILED");
        return { accessToken: sessionResult.session.access_token, refreshToken: sessionResult.session.refresh_token, user: { id: sessionResult.user.id, name: request.full_name, role: request.requested_role } };
      }),

    completeOnboardingPassword: publicProcedure
      .input(tokenInput.extend({ password: z.string().min(8).max(72) }))
      .mutation(async ({ input }) => {
        const authUser = await getAuthenticatedUser(input.accessToken);
        const service = asService();
        const { data: request, error } = await service.from("account_verification_requests")
          .select("id,full_name,requested_role")
          .eq("auth_user_id", authUser.id)
          .eq("status", "password_pending")
          .maybeSingle();
        if (error || !request) throw new Error("PASSWORD_SETUP_NOT_AVAILABLE");
        const { error: passwordError } = await service.auth.admin.updateUserById(authUser.id, { password: input.password, phone_confirm: true });
        if (passwordError) throw new Error(passwordError.message);
        const { error: profileError } = await service.from("users").update({ is_active: true, role: request.requested_role, name: request.full_name }).eq("id", authUser.id);
        if (profileError) throw new Error(profileError.message);
        const { error: requestError } = await service.from("account_verification_requests").update({ status: "verified" }).eq("id", request.id);
        if (requestError) throw new Error(requestError.message);
        return { user: { id: authUser.id, name: request.full_name, role: request.requested_role } };
      }),

    submitDriverVerification: publicProcedure
      .input(tokenInput.extend({ personalPhoto: imageInput, identityPhoto: imageInput }))
      .mutation(async ({ input }) => {
        const { authUser } = await requireRole(input.accessToken, ["customer", "driver"]);
        const personal = decodeSmallPrivateImage(input.personalPhoto);
        const identity = decodeSmallPrivateImage(input.identityPhoto);
        const service = asService();
        const prefix = `driver-verification/${authUser.id}`;
        const personalPath = `${prefix}/personal-${Date.now()}.${personal.contentType.endsWith("png") ? "png" : "jpg"}`;
        const identityPath = `${prefix}/identity-${Date.now()}.${identity.contentType.endsWith("png") ? "png" : "jpg"}`;
        const [personalUpload, identityUpload] = await Promise.all([
          service.storage.from("jarbou3-private").upload(personalPath, personal.buffer, { contentType: personal.contentType, upsert: false }),
          service.storage.from("jarbou3-private").upload(identityPath, identity.buffer, { contentType: identity.contentType, upsert: false }),
        ]);
        if (personalUpload.error || identityUpload.error) throw new Error(personalUpload.error?.message ?? identityUpload.error?.message ?? "DOCUMENT_UPLOAD_FAILED");
        const { error: roleError } = await service.from("users").update({ role: "driver" }).eq("id", authUser.id);
        if (roleError) throw new Error(roleError.message);
        const { error } = await service.from("drivers_verification").upsert({ user_id: authUser.id, personal_photo_path: personalPath, id_photo_path: identityPath, status: "pending", activation_code_hash: null, activated_at: null }, { onConflict: "user_id" });
        if (error) throw new Error(error.message);
        return { submitted: true };
      }),

    createOrder: publicProcedure
      .input(tokenInput.extend({ sourceAddress: z.string().trim().min(3).max(300), destinationAddress: z.string().trim().min(3).max(300), source: pointInput, destination: pointInput, estimatedPrice: z.number().int().nonnegative(), paymentMethod: z.enum(["cash", "sham_cash"]), distanceM: z.number().int().nonnegative(), discountCode: z.string().trim().max(32).optional() }))
      .mutation(async ({ input }) => {
        const { authUser } = await requireRole(input.accessToken, ["customer"]);
        assertHamaPoint(input.source.latitude, input.source.longitude);
        assertHamaPoint(input.destination.latitude, input.destination.longitude);
        if (!isInsideHama(input.destination.latitude, input.destination.longitude)) throw new Error("OUTSIDE_HAMA");
        const discount = await resolveActiveDiscount(input.discountCode, input.estimatedPrice);
        const { hash } = await createOtpHash();
        const { data, error } = await asUser(input.accessToken).from("orders").insert({ customer_id: authUser.id, source_address: input.sourceAddress, source_lat: input.source.latitude, source_lng: input.source.longitude, destination_address: input.destinationAddress, destination_lat: input.destination.latitude, destination_lng: input.destination.longitude, estimated_price: input.estimatedPrice, pre_discount_price: input.estimatedPrice, discount_amount: discount.discountAmount, discount_code_id: discount.discountCodeId, final_price: discount.finalPrice, payment_method: input.paymentMethod, distance_m: input.distanceM, status: "requested", delivery_otp_hash: hash }).select("id,status,created_at,final_price,discount_amount").single();
        if (error) throw new Error(error.message);
        try {
          const offer = await assignNextDriverOffer(data.id);
          return { ...data, offerExpiresAt: offer?.offer_expires_at ?? null };
        } catch (offerError) {
          console.warn("[Jarbou3] Order created but first offer was not dispatched", offerError);
          return { ...data, offerExpiresAt: null };
        }
      }),

    acceptOrder: publicProcedure
      .input(tokenInput.extend({ orderId: z.string().uuid() }))
      .mutation(async ({ input }) => {
        await requireRole(input.accessToken, ["driver"]);
        const { data, error } = await asUser(input.accessToken).rpc("accept_order", { p_order_id: input.orderId });
        if (error) throw new Error(error.message);
        if (data?.customer_id) await notifyCustomer(data.customer_id, "تم قبول طلبك", "تم تعيين سائق جربوع لطلبك وهو في طريقه إلى نقطة الاستلام.", { orderId: data.id, status: "accepted" });
        return data;
      }),

    declineOrder: publicProcedure
      .input(tokenInput.extend({ orderId: z.string().uuid() }))
      .mutation(async ({ input }) => {
        await requireRole(input.accessToken, ["driver"]);
        const { error } = await asUser(input.accessToken).rpc("decline_order_offer", { p_order_id: input.orderId });
        if (error) throw new Error(error.message);
        const offer = await assignNextDriverOffer(input.orderId);
        return { declined: true, orderId: input.orderId, nextDriverNotified: Boolean(offer?.driver_id) };
      }),

    availableDriverOrders: publicProcedure
      .input(tokenInput)
      .query(async ({ input }) => {
        await requireRole(input.accessToken, ["driver"]);
        const { data, error } = await asUser(input.accessToken).rpc("list_driver_order_offers");
        if (error) throw new Error(error.message);
        return data ?? [];
      }),

    updateDriverLocation: publicProcedure
      .input(tokenInput.extend({ location: pointInput.extend({ accuracy: z.number().min(0).max(80).nullable().optional() }) }))
      .mutation(async ({ input }) => {
        return recordDriverLocation(input.accessToken, input.location);
      }),

    activeDriverTripMetrics: publicProcedure
      .input(tokenInput)
      .query(async ({ input }) => {
        await requireRole(input.accessToken, ["driver"]);
        const { data, error } = await asUser(input.accessToken).rpc("get_own_active_trip_metrics").maybeSingle();
        if (error) throw new Error(error.message);
        return data;
      }),

    ownCompanyBalance: publicProcedure
      .input(tokenInput)
      .query(async ({ input }) => {
        await requireRole(input.accessToken, ["driver"]);
        const { data, error } = await asUser(input.accessToken).rpc("get_own_company_balance").maybeSingle();
        if (error) throw new Error(error.message);
        return data;
      }),

    currentCustomerTracking: publicProcedure
      .input(tokenInput)
      .query(async ({ input }) => {
        const { authUser } = await requireRole(input.accessToken, ["customer"]);
        const { data, error } = await asUser(input.accessToken)
          .from("orders")
          .select("id,driver_id,status,source_lat,source_lng,destination_lat,destination_lng")
          .eq("customer_id", authUser.id)
          .in("status", ["requested", "accepted", "arriving", "awaiting_otp"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw new Error(error.message);
        return data;
      }),

    currentCustomerTripPath: publicProcedure
      .input(tokenInput.extend({ orderId: z.string().uuid() }))
      .query(async ({ input }) => {
        await requireRole(input.accessToken, ["customer"]);
        const { data, error } = await asUser(input.accessToken)
          .rpc("get_customer_order_trip_path", { p_order_id: input.orderId });
        if (error) throw new Error(error.message);
        return data ?? [];
      }),

    currentDriverLocation: publicProcedure
      .input(tokenInput.extend({ driverId: z.string().uuid() }))
      .query(async ({ input }) => {
        const { authUser } = await requireRole(input.accessToken, ["customer"]);
        const client = asUser(input.accessToken);
        const { data: assignment, error: assignmentError } = await client
          .from("orders")
          .select("id")
          .eq("customer_id", authUser.id)
          .eq("driver_id", input.driverId)
          .in("status", ["accepted", "arriving", "awaiting_otp"])
          .limit(1)
          .maybeSingle();
        if (assignmentError) throw new Error(assignmentError.message);
        if (!assignment) throw new Error("DRIVER_NOT_ASSIGNED_TO_ACTIVE_ORDER");
        const { data, error } = await client
          .from("users")
          .select("last_location_lat,last_location_lng,last_location_at")
          .eq("id", input.driverId)
          .maybeSingle();
        if (error) throw new Error(error.message);
        return data;
      }),

    verifyDeliveryOtp: publicProcedure
      .input(tokenInput.extend({ orderId: z.string().uuid(), otp: z.string().regex(/^\d{4}$/) }))
      .mutation(async ({ input }) => {
        await requireRole(input.accessToken, ["driver"]);
        const { data, error } = await asUser(input.accessToken).rpc("verify_delivery_otp", { p_order_id: input.orderId, p_otp: input.otp });
        if (error) throw new Error(error.message);
        if (data) {
          const { data: order } = await asService().from("orders").select("id,customer_id").eq("id", input.orderId).maybeSingle();
          if (order) await notifyCustomer(order.customer_id, "تم تسليم الطلب", "أُكد تسليم طلبك بنجاح. شكراً لاستخدام جربوع.", { orderId: order.id, status: "delivered" });
        }
        return { verified: Boolean(data) };
      }),

    uploadDeliveryProof: publicProcedure
      .input(tokenInput.extend({ orderId: z.string().uuid(), photo: imageInput }))
      .mutation(async ({ input }) => {
        const { authUser } = await requireRole(input.accessToken, ["driver"]);
        const userDb = asUser(input.accessToken);
        const { data: order, error: orderError } = await userDb.from("orders").select("id,status,driver_id").eq("id", input.orderId).single();
        if (orderError || order?.driver_id !== authUser.id || order.status !== "delivered") throw new Error("DELIVERY_PROOF_NOT_ALLOWED");
        const image = decodeDataUrl(input.photo);
        const path = `order-proofs/${input.orderId}/${Date.now()}.${image.contentType.endsWith("png") ? "png" : "jpg"}`;
        const service = asService();
        const { error: storageError } = await service.storage.from("jarbou3-private").upload(path, image.buffer, { contentType: image.contentType, upsert: false });
        if (storageError) throw new Error(storageError.message);
        const { error: rowError } = await userDb.from("order_photos").insert({ order_id: input.orderId, uploaded_by: authUser.id, photo_path: path });
        if (rowError) throw new Error(rowError.message);
        return { uploaded: true };
      }),

    confirmMonthlyReportDownload: publicProcedure
      .input(tokenInput.extend({ reportId: z.string().uuid() }))
      .mutation(async ({ input }) => {
        await requireRole(input.accessToken, ["admin"]);
        const { data, error } = await asUser(input.accessToken).rpc("confirm_monthly_report_download", { p_report_id: input.reportId });
        if (error) throw new Error(error.message);
        return data;
      }),

    hamaBoundary: publicProcedure.query(() => ({ ...HAMA_BOUNDS })),
  }),

  // TODO: add feature routers here, e.g.
  // todo: router({
  //   list: protectedProcedure.query(({ ctx }) =>
  //     db.getUserTodos(ctx.user.id)
  //   ),
  // }),
});

export type AppRouter = typeof appRouter;
