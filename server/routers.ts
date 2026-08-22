import { COOKIE_NAME } from "../shared/const.js";
import { HAMA_BOUNDS, isInsideHama } from "../shared/jarbou3";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { asPublic, asService, asUser, assertHamaPoint, createOtpHash, decodeDataUrl, getAuthenticatedUser, getUserProfile } from "./jarbou3-supabase";

const tokenInput = z.object({ accessToken: z.string().min(20) });
const pointInput = z.object({ latitude: z.number(), longitude: z.number() });
const imageInput = z.string().min(50).max(7_000_000);

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
    signUpCustomer: publicProcedure
      .input(z.object({ name: z.string().trim().min(2).max(100), phone: z.string().regex(/^\+?[0-9]{8,16}$/), password: z.string().min(8).max(72) }))
      .mutation(async ({ input }) => {
        const { data, error } = await asPublic().auth.signUp({ phone: input.phone, password: input.password, options: { data: { name: input.name, phone: input.phone } } });
        if (error) throw new Error(error.message);
        return { userId: data.user?.id ?? null, requiresPhoneConfirmation: !data.session };
      }),

    signIn: publicProcedure
      .input(z.object({ phone: z.string().regex(/^\+?[0-9]{8,16}$/), password: z.string().min(8).max(72) }))
      .mutation(async ({ input }) => {
        const { data, error } = await asPublic().auth.signInWithPassword({ phone: input.phone, password: input.password });
        if (error || !data.session) throw new Error(error?.message ?? "SIGN_IN_FAILED");
        const profile = await getUserProfile(data.user.id);
        return { accessToken: data.session.access_token, refreshToken: data.session.refresh_token, user: { id: data.user.id, name: profile.name, role: profile.role } };
      }),

    submitDriverVerification: publicProcedure
      .input(tokenInput.extend({ personalPhoto: imageInput, identityPhoto: imageInput }))
      .mutation(async ({ input }) => {
        const { authUser } = await requireRole(input.accessToken, ["customer", "driver"]);
        const personal = decodeDataUrl(input.personalPhoto);
        const identity = decodeDataUrl(input.identityPhoto);
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
      .input(tokenInput.extend({ sourceAddress: z.string().trim().min(3).max(300), destinationAddress: z.string().trim().min(3).max(300), source: pointInput, destination: pointInput, estimatedPrice: z.number().int().nonnegative(), paymentMethod: z.enum(["cash", "sham_cash"]), distanceM: z.number().int().nonnegative() }))
      .mutation(async ({ input }) => {
        const { authUser } = await requireRole(input.accessToken, ["customer"]);
        assertHamaPoint(input.source.latitude, input.source.longitude);
        assertHamaPoint(input.destination.latitude, input.destination.longitude);
        if (!isInsideHama(input.destination.latitude, input.destination.longitude)) throw new Error("OUTSIDE_HAMA");
        const { hash } = await createOtpHash();
        const { data, error } = await asUser(input.accessToken).from("orders").insert({ customer_id: authUser.id, source_address: input.sourceAddress, source_lat: input.source.latitude, source_lng: input.source.longitude, destination_address: input.destinationAddress, destination_lat: input.destination.latitude, destination_lng: input.destination.longitude, estimated_price: input.estimatedPrice, payment_method: input.paymentMethod, distance_m: input.distanceM, status: "requested", delivery_otp_hash: hash }).select("id,status,created_at").single();
        if (error) throw new Error(error.message);
        return data;
      }),

    acceptOrder: publicProcedure
      .input(tokenInput.extend({ orderId: z.string().uuid() }))
      .mutation(async ({ input }) => {
        await requireRole(input.accessToken, ["driver"]);
        const { data, error } = await asUser(input.accessToken).rpc("accept_order", { p_order_id: input.orderId });
        if (error) throw new Error(error.message);
        return data;
      }),

    availableDriverOrders: publicProcedure
      .input(tokenInput)
      .query(async ({ input }) => {
        await requireRole(input.accessToken, ["driver"]);
        const { data, error } = await asUser(input.accessToken)
          .from("orders")
          .select("id,source_address,source_lat,source_lng,destination_address,destination_lat,destination_lng,estimated_price,payment_method,distance_m,created_at")
          .eq("status", "requested")
          .is("driver_id", null)
          .order("created_at", { ascending: true })
          .limit(20);
        if (error) throw new Error(error.message);
        return data;
      }),

    updateDriverLocation: publicProcedure
      .input(tokenInput.extend({ location: pointInput }))
      .mutation(async ({ input }) => {
        await requireRole(input.accessToken, ["driver"]);
        assertHamaPoint(input.location.latitude, input.location.longitude);
        const { data, error } = await asUser(input.accessToken).rpc("update_own_driver_location", {
          p_lat: input.location.latitude,
          p_lng: input.location.longitude,
        });
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
          .not("driver_id", "is", null)
          .in("status", ["accepted", "arriving", "awaiting_otp"])
          .order("accepted_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw new Error(error.message);
        return data;
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
