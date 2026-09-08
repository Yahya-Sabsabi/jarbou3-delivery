import type { DeliveryOrder, DeliveryOrderStatus } from "../../domain/entities/delivery-order";
import type { OrderRepository } from "../../application/repositories/order-repository";

export type RpcClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

const STATUSES = new Set<DeliveryOrderStatus>(["requested", "accepted", "arriving", "started", "awaiting_otp", "delivered", "cancelled"]);

function toDeliveryOrder(value: unknown): DeliveryOrder {
  if (!value || typeof value !== "object") throw new Error("ORDER_RESPONSE_INVALID");
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.customer_id !== "string") throw new Error("ORDER_RESPONSE_INVALID");
  if (row.driver_id !== null && typeof row.driver_id !== "string") throw new Error("ORDER_RESPONSE_INVALID");
  if (typeof row.status !== "string" || !STATUSES.has(row.status as DeliveryOrderStatus)) throw new Error("ORDER_RESPONSE_INVALID");
  if (row.final_price !== null && typeof row.final_price !== "number") throw new Error("ORDER_RESPONSE_INVALID");
  return {
    id: row.id,
    customerId: row.customer_id,
    driverId: row.driver_id as string | null,
    status: row.status as DeliveryOrderStatus,
    finalPrice: row.final_price as number | null,
  };
}

export class SupabaseOrderRepository implements OrderRepository {
  constructor(private readonly client: RpcClient) {}

  async acceptRequestedOrder(orderId: string): Promise<DeliveryOrder> {
    const { data, error } = await this.client.rpc("accept_order", { p_order_id: orderId });
    if (error) throw new Error(error.message);
    return toDeliveryOrder(data);
  }

  async startAcceptedTrip(orderId: string): Promise<DeliveryOrder> {
    const { data, error } = await this.client.rpc("start_trip", { p_order_id: orderId });
    if (error) throw new Error(error.message);
    return toDeliveryOrder(data);
  }
}
