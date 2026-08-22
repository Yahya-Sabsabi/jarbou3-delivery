import type { IncomingMessage, Server as HttpServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";

import { asService, getAuthenticatedUser, getUserProfile } from "./jarbou3-supabase";

type SubscriptionMessage = { type: "subscribe"; accessToken: string; orderId: string; events: Array<"order" | "location"> };

function send(socket: WebSocket, payload: Record<string, unknown>) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
}

async function assertOrderSubscription(accessToken: string, orderId: string) {
  const user = await getAuthenticatedUser(accessToken);
  const profile = await getUserProfile(user.id);
  if (!profile.is_active || (profile.role !== "customer" && profile.role !== "driver")) throw new Error("REALTIME_FORBIDDEN");
  const { data: order, error } = await asService().from("orders").select("id,customer_id,driver_id").eq("id", orderId).maybeSingle();
  if (error || !order || (order.customer_id !== user.id && order.driver_id !== user.id)) throw new Error("REALTIME_FORBIDDEN");
}

function parseSubscription(raw: WebSocket.RawData): SubscriptionMessage | null {
  try {
    const value = JSON.parse(raw.toString()) as Partial<SubscriptionMessage>;
    if (value.type !== "subscribe" || typeof value.accessToken !== "string" || !/^[0-9a-f-]{36}$/i.test(value.orderId ?? "") || !Array.isArray(value.events) || value.events.some((event) => event !== "order" && event !== "location")) return null;
    return value as SubscriptionMessage;
  } catch {
    return null;
  }
}

export function registerJarbou3RealtimeBridge(server: HttpServer, isAllowedOrigin: (request: IncomingMessage) => boolean) {
  const bridge = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const path = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`).pathname;
    if (path !== "/api/jarbou3/realtime" || (request.headers.origin && !isAllowedOrigin(request))) {
      socket.destroy();
      return;
    }
    bridge.handleUpgrade(request, socket, head, (webSocket) => bridge.emit("connection", webSocket));
  });

  bridge.on("connection", (socket) => {
    let channel: ReturnType<ReturnType<typeof asService>["channel"]> | null = null;
    let supabaseClient: ReturnType<typeof asService> | null = null;
    const timeout = setTimeout(() => socket.close(1008, "SUBSCRIPTION_REQUIRED"), 10_000);
    const close = async () => {
      clearTimeout(timeout);
      if (channel && supabaseClient) await supabaseClient.removeChannel(channel);
      channel = null;
      supabaseClient = null;
    };
    socket.once("message", async (raw) => {
      const message = parseSubscription(raw);
      if (!message) {
        send(socket, { type: "error", code: "INVALID_SUBSCRIPTION" });
        socket.close(1008, "INVALID_SUBSCRIPTION");
        return;
      }
      try {
        await assertOrderSubscription(message.accessToken, message.orderId);
        clearTimeout(timeout);
        supabaseClient = asService();
        channel = supabaseClient.channel(`jarbou3-server-order-${message.orderId}-${Math.random().toString(36).slice(2)}`);
        if (message.events.includes("order")) {
          channel.on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${message.orderId}` }, (payload) => send(socket, { type: "order", data: payload.new }));
        }
        if (message.events.includes("location")) {
          const eventFilter = { schema: "public", table: "order_live_locations", filter: `order_id=eq.${message.orderId}` } as const;
          channel.on("postgres_changes", { event: "INSERT", ...eventFilter }, (payload) => send(socket, { type: "location", data: payload.new }));
          channel.on("postgres_changes", { event: "UPDATE", ...eventFilter }, (payload) => send(socket, { type: "location", data: payload.new }));
        }
        channel.subscribe((status, error) => {
          if (error || status === "CHANNEL_ERROR") send(socket, { type: "error", code: "REALTIME_UNAVAILABLE" });
          if (status === "SUBSCRIBED") send(socket, { type: "ready" });
        });
      } catch {
        send(socket, { type: "error", code: "REALTIME_FORBIDDEN" });
        socket.close(1008, "REALTIME_FORBIDDEN");
      }
    });
    socket.once("close", () => { void close(); });
    socket.once("error", () => { void close(); });
  });
}
