import { getApiBaseUrl } from "@/constants/oauth";
import type { MapPoint } from "@/shared/jarbou3";

export type CustomerTrackingUpdate = { id: string; driver_id: string | null; status: string };
export type LiveLocationSubscription = { socket: WebSocket };

let sessionAccessToken: string | null = null;

export function configureJarbou3Realtime(accessToken: string) {
  sessionAccessToken = accessToken;
}

function bridgeUrl() {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) return null;
  return `${apiBaseUrl.replace(/^http:/, "ws:").replace(/^https:/, "wss:")}/api/jarbou3/realtime`;
}

function subscribe(orderId: string, events: Array<"order" | "location">, onEvent: (type: string, data: Record<string, unknown>) => void, onStatus?: (status: string) => void): LiveLocationSubscription | null {
  const url = bridgeUrl();
  if (!url || !sessionAccessToken) return null;
  const socket = new WebSocket(url);
  onStatus?.("CONNECTING");
  socket.onopen = () => socket.send(JSON.stringify({ type: "subscribe", accessToken: sessionAccessToken, orderId, events }));
  socket.onmessage = (event) => {
    try {
      const payload = JSON.parse(String(event.data)) as { type?: string; data?: Record<string, unknown>; code?: string };
      if (payload.type === "ready") onStatus?.("SUBSCRIBED");
      else if (payload.type === "error") onStatus?.(payload.code ?? "CHANNEL_ERROR");
      else if (payload.type && payload.data) onEvent(payload.type, payload.data);
    } catch {
      onStatus?.("CHANNEL_ERROR");
    }
  };
  socket.onerror = () => onStatus?.("CHANNEL_ERROR");
  socket.onclose = () => onStatus?.("CLOSED");
  return { socket };
}

export function subscribeToCustomerOrder(orderId: string, onUpdate: (update: CustomerTrackingUpdate) => void, onStatus?: (status: string) => void): LiveLocationSubscription | null {
  return subscribe(orderId, ["order"], (_type, data) => onUpdate(data as CustomerTrackingUpdate), onStatus);
}

export function subscribeToOrderLiveLocation(orderId: string, onLocation: (point: MapPoint) => void, onStatus?: (status: string) => void): LiveLocationSubscription | null {
  return subscribe(orderId, ["location"], (_type, data) => {
    const latitude = data.latitude;
    const longitude = data.longitude;
    if (latitude == null || longitude == null) return;
    onLocation({ latitude: Number(latitude), longitude: Number(longitude) });
  }, onStatus);
}

export async function unsubscribeRealtime(subscription: LiveLocationSubscription | null) {
  if (subscription && subscription.socket.readyState === WebSocket.OPEN) subscription.socket.close(1000, "UNSUBSCRIBE");
}
