import { describe, expect, it } from "vitest";

import { calculateDriverCompanyBalance, calculateTripFinance } from "./jarbou3-finance";

describe("حساب عمولة شركة جربوع", () => {
  it("يقتطع 10% من إجمالي رحلة مكتملة ويحدد صافي السفير", () => {
    expect(calculateTripFinance(1_000)).toEqual({
      grossAmount: 1_000,
      companyCommissionAmount: 100,
      driverNetAmount: 900,
    });
  });

  it("يحسب العمولة من السعر النهائي بعد الخصم وليس السعر قبل الخصم", () => {
    const preDiscountPrice = 1_000;
    const discountAmount = 150;
    const finalPrice = preDiscountPrice - discountAmount;

    expect(calculateTripFinance(finalPrice)).toEqual({
      grossAmount: 850,
      companyCommissionAmount: 85,
      driverNetAmount: 765,
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
    expect(calculateDriverCompanyBalance([100, 85, 5], [190])).toEqual({
      totalCommissionAmount: 190,
      paidAmount: 190,
      outstandingAmount: 0,
    });
  });

  it("يبقي المتبقي ظاهراً عند تسوية جزئية ويرفض إدخال دفعة تتجاوز المستحق", () => {
    expect(calculateDriverCompanyBalance([100, 85], [20])).toEqual({
      totalCommissionAmount: 185,
      paidAmount: 20,
      outstandingAmount: 165,
    });
    expect(() => calculateDriverCompanyBalance([100], [101])).toThrow("PAYMENT_EXCEEDS_OUTSTANDING_BALANCE");
  });
});
