import { createClient, type RealtimeChannel } from "@supabase/supabase-js";

import type { MapPoint } from "@/shared/jarbou3";

const projectUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const realtimeClient = projectUrl && publishableKey ? createClient(projectUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } }) : null;

export function subscribeToDriverLocation(driverId: string, onLocation: (point: MapPoint) => void): RealtimeChannel | null {
  if (!realtimeClient) return null;
  const channel = realtimeClient.channel(`jarbou3-driver-${driverId}`)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "users", filter: `id=eq.${driverId}` }, (payload) => {
      const next = payload.new as { last_location_lat?: number | string | null; last_location_lng?: number | string | null };
      if (next.last_location_lat == null || next.last_location_lng == null) return;
      onLocation({ latitude: Number(next.last_location_lat), longitude: Number(next.last_location_lng) });
    })
    .subscribe();
  return channel;
}

export async function unsubscribeFromDriverLocation(channel: RealtimeChannel | null) {
  if (channel && realtimeClient) await realtimeClient.removeChannel(channel);
}
