export type DeliveryOrderStatus = "requested" | "accepted" | "arriving" | "started" | "awaiting_otp" | "delivered" | "cancelled";

export type DeliveryOrder = {
  id: string;
  customerId: string;
  driverId: string | null;
  status: DeliveryOrderStatus;
  finalPrice: number | null;
};

export function isAssignedToDriver(order: DeliveryOrder, driverId: string) {
  return order.driverId === driverId && order.status !== "cancelled";
}
