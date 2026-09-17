import { assertHamaPoint, asService, getAuthenticatedUser, getUserProfile } from "./jarbou3-supabase";

export type CustomerLocationInput = { latitude: number; longitude: number; accuracy?: number | null };

export async function recordCustomerLocation(accessToken: string, location: CustomerLocationInput) {
  if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude) || (location.accuracy != null && (!Number.isFinite(location.accuracy) || location.accuracy < 0 || location.accuracy > 80))) {
    throw new Error("INVALID_LOCATION_INPUT");
  }
  const authUser = await getAuthenticatedUser(accessToken);
  const profile = await getUserProfile(authUser.id);
  if (!profile.is_active || profile.role !== "customer") throw new Error("JARBOU3_FORBIDDEN");
  assertHamaPoint(location.latitude, location.longitude);

  const { data, error } = await asService()
    .from("users")
    .update({
      last_location_lat: location.latitude,
      last_location_lng: location.longitude,
      last_location_at: new Date().toISOString(),
    })
    .eq("id", authUser.id)
    .eq("role", "customer")
    .is("deleted_at", null)
    .select("id,last_location_lat,last_location_lng,last_location_at")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("CUSTOMER_LOCATION_NOT_SAVED");
  return { id: data.id, latitude: Number(data.last_location_lat), longitude: Number(data.last_location_lng), lastLocationAt: data.last_location_at };
}

export async function clearCustomerLocation(accessToken: string) {
  const authUser = await getAuthenticatedUser(accessToken);
  const profile = await getUserProfile(authUser.id);
  if (!profile.is_active || profile.role !== "customer") throw new Error("JARBOU3_FORBIDDEN");

  const { error } = await asService()
    .from("users")
    .update({ last_location_lat: null, last_location_lng: null, last_location_at: null })
    .eq("id", authUser.id)
    .eq("role", "customer")
    .is("deleted_at", null);
  if (error) throw new Error(error.message);
  return { cleared: true };
}
