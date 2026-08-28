import { describe, expect, it } from "vitest";
import { discountIsAvailableForCustomer } from "../server/routers";

describe("discount recipient policy", () => {
  it("يبقي الرمز بلا مستحقين متاحاً لكل العملاء", () => {
    expect(discountIsAvailableForCustomer([], "customer-a")).toBe(true);
  });

  it("يقصر الرمز المخصص على العميل المحدد", () => {
    expect(discountIsAvailableForCustomer(["customer-a", "customer-b"], "customer-a")).toBe(true);
    expect(discountIsAvailableForCustomer(["customer-a", "customer-b"], "customer-c")).toBe(false);
    expect(discountIsAvailableForCustomer(["customer-a"], null)).toBe(false);
  });
});
