import type { DeliveryOrder } from "../../domain/entities/delivery-order";
import type { OrderRepository } from "../repositories/order-repository";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class StartAcceptedTrip {
  constructor(private readonly orders: OrderRepository) {}

  async execute(orderId: string): Promise<DeliveryOrder> {
    if (!UUID_PATTERN.test(orderId)) throw new Error("INVALID_ORDER_ID");
    return this.orders.startAcceptedTrip(orderId);
  }
}
