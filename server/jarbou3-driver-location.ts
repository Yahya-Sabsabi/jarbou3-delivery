import { distanceMeters } from "../shared/jarbou3";
import { asService, asUser, assertHamaPoint, getAuthenticatedUser, getUserProfile } from "./jarbou3-supabase";

export type DriverLocationInput = { latitude: number; longitude: number; accuracy?: number | null };

async function notifyCustomer(userId: string, title: string, body: string, data: Record<string, string>) {
  const { data: tokens, error } = await asService().from("push_tokens").select("expo_push_token").eq("user_id", userId).limit(10);
  if (error || !tokens?.length) return;
  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(tokens.map((token) => ({ to: token.expo_push_token, sound: "default", title, body, data, channelId: "jarbou3-orders" }))),
  });
}

export async function recordDriverLocation(accessToken: string, location: DriverLocationInput) {
  if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude) || (location.accuracy != null && (!Number.isFinite(location.accuracy) || location.accuracy < 0 || location.accuracy > 80))) {
    throw new Error("INVALID_LOCATION_INPUT");
  }
  const authUser = await getAuthenticatedUser(accessToken);
  const profile = await getUserProfile(authUser.id);
  if (!profile.is_active || profile.role !== "driver") throw new Error("JARBOU3_FORBIDDEN");
  assertHamaPoint(location.latitude, location.longitude);

  const { data, error } = await asUser(accessToken).rpc("record_own_driver_live_location", {
    p_lat: location.latitude,
    p_lng: location.longitude,
    p_accuracy: location.accuracy ?? null,
  });
  if (error) throw new Error(error.message);

  const service = asService();
  const { data: activeOrder } = await service.from("orders").select("id,customer_id,source_lat,source_lng,driver_near_notified_at").eq("driver_id", authUser.id).in("status", ["accepted", "arriving"]).is("driver_near_notified_at", null).order("accepted_at", { ascending: true }).limit(1).maybeSingle();
  if (activeOrder && distanceMeters(location, { latitude: Number(activeOrder.source_lat), longitude: Number(activeOrder.source_lng) }) <= 500) {
    const { data: marked } = await service.from("orders").update({ driver_near_notified_at: new Date().toISOString(), status: "arriving" }).eq("id", activeOrder.id).is("driver_near_notified_at", null).select("id").maybeSingle();
    if (marked) await notifyCustomer(activeOrder.customer_id, "السفير قريب منك", "سفير جربوع أصبح قريباً من نقطة الاستلام.", { orderId: activeOrder.id, status: "arriving" });
  }
  const { data: tripMetrics, error: metricsError } = await asUser(accessToken)
    .rpc("get_own_active_trip_metrics")
    .maybeSingle();
  if (metricsError) throw new Error(metricsError.message);

  return { location: data, tripMetrics };
}
