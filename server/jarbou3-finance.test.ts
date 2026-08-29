import { describe, expect, it } from "vitest";

import { calculateDriverCompanyBalance, calculateTripFinance } from "./jarbou3-finance";

describe("حساب عمولة شركة جربوع", () => {
  it("يقتطع 10% من إجمالي رحلة مكتملة ويحدد صافي السفير", () => {
    expect(calculateTripFinance(100_000)).toEqual({
      grossAmount: 100_000,
      companyCommissionAmount: 10_000,
      driverNetAmount: 90_000,
    });
  });

  it("يحسب العمولة من السعر النهائي بعد الخصم وليس السعر قبل الخصم", () => {
    const preDiscountPrice = 100_000;
    const discountAmount = 15_000;
    const finalPrice = preDiscountPrice - discountAmount;

    expect(calculateTripFinance(finalPrice)).toEqual({
      grossAmount: 85_000,
      companyCommissionAmount: 8_500,
      driverNetAmount: 76_500,
    });
  });

  it("يقرب كسور الليرة إلى الأسفل ويحافظ على تطابق الإجمالي", () => {
    const result = calculateTripFinance(999);

    expect(result.companyCommissionAmount).toBe(99);
    expect(result.driverNetAmount).toBe(900);
    expect(result.companyCommissionAmount + result.driverNetAmount).toBe(result.grossAmount);
  });

  it("يرفض أسعاراً غير صحيحة بدلاً من إنتاج تسوية مالية مضللة", () => {
    expect(() => calculateTripFinance(-1)).toThrow("INVALID_FINAL_PRICE");
    expect(() => calculateTripFinance(12.5)).toThrow("INVALID_FINAL_PRICE");
  });

  it("يتراكم رصيد الشركة من عمولات الرحلات ويصبح صفراً بعد دفع كامل الرصيد", () => {
    expect(calculateDriverCompanyBalance([10_000, 8_500, 450], [18_950])).toEqual({
      totalCommissionAmount: 18_950,
      paidAmount: 18_950,
      outstandingAmount: 0,
    });
  });

  it("يبقي المتبقي ظاهراً عند تسوية جزئية ويرفض إدخال دفعة تتجاوز المستحق", () => {
    expect(calculateDriverCompanyBalance([10_000, 8_500], [2_000])).toEqual({
      totalCommissionAmount: 18_500,
      paidAmount: 2_000,
      outstandingAmount: 16_500,
    });
    expect(() => calculateDriverCompanyBalance([10_000], [10_001])).toThrow("PAYMENT_EXCEEDS_OUTSTANDING_BALANCE");
  });
});
