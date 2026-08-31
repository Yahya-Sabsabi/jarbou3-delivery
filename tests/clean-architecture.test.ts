import { describe, expect, it, vi } from "vitest";
import { AcceptRequestedOrder } from "../application/use-cases/accept-requested-order";
import type { DeliveryOrder } from "../domain/entities/delivery-order";

const order: DeliveryOrder = {
  id: "11111111-1111-4111-8111-111111111111",
  customerId: "22222222-2222-4222-8222-222222222222",
  driverId: "33333333-3333-4333-8333-333333333333",
  status: "accepted",
  finalPrice: null,
};

describe("AcceptRequestedOrder", () => {
  it("validates the order id and delegates exactly once", async () => {
    const acceptRequestedOrder = vi.fn().mockResolvedValue(order);
    const useCase = new AcceptRequestedOrder({ acceptRequestedOrder });

    await expect(useCase.execute(order.id)).resolves.toEqual(order);
    expect(acceptRequestedOrder).toHaveBeenCalledOnce();
    expect(acceptRequestedOrder).toHaveBeenCalledWith(order.id);
  });

  it("rejects malformed ids before touching the repository", async () => {
    const acceptRequestedOrder = vi.fn();
    const useCase = new AcceptRequestedOrder({ acceptRequestedOrder });

    await expect(useCase.execute("not-an-order-id")).rejects.toThrow("INVALID_ORDER_ID");
    expect(acceptRequestedOrder).not.toHaveBeenCalled();
  });
});
