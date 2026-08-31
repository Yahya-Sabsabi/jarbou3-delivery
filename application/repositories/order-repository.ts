import type { DeliveryOrder } from "../../domain/entities/delivery-order";

export interface OrderRepository {
  acceptRequestedOrder(orderId: string): Promise<DeliveryOrder>;
}
