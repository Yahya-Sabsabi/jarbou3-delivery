import { describe, expect, it } from "vitest";

import { calculateTripFinance } from "./jarbou3-finance";

describe("حساب عمولة شركة جربوع", () => {
  it("يقتطع 3% من إجمالي رحلة مكتملة ويحدد صافي السفير", () => {
    expect(calculateTripFinance(100_000)).toEqual({
      grossAmount: 100_000,
      companyCommissionAmount: 3_000,
      driverNetAmount: 97_000,
    });
  });

  it("يحسب العمولة من السعر النهائي بعد الخصم وليس السعر قبل الخصم", () => {
    const preDiscountPrice = 100_000;
    const discountAmount = 15_000;
    const finalPrice = preDiscountPrice - discountAmount;

    expect(calculateTripFinance(finalPrice)).toEqual({
      grossAmount: 85_000,
      companyCommissionAmount: 2_550,
      driverNetAmount: 82_450,
    });
  });

  it("يقرب كسور الليرة إلى الأسفل ويحافظ على تطابق الإجمالي", () => {
    const result = calculateTripFinance(999);

    expect(result.companyCommissionAmount).toBe(29);
    expect(result.driverNetAmount).toBe(970);
    expect(result.companyCommissionAmount + result.driverNetAmount).toBe(result.grossAmount);
  });

  it("يرفض أسعاراً غير صحيحة بدلاً من إنتاج تسوية مالية مضللة", () => {
    expect(() => calculateTripFinance(-1)).toThrow("INVALID_FINAL_PRICE");
    expect(() => calculateTripFinance(12.5)).toThrow("INVALID_FINAL_PRICE");
  });
});
