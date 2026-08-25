export const COMPANY_COMMISSION_PERCENT = 3;

export type TripFinance = {
  grossAmount: number;
  companyCommissionAmount: number;
  driverNetAmount: number;
};

/**
 * يقسم قيمة الرحلة النهائية بوحدة الليرة الصحيحة.
 * المصدر الحاكم عند التسليم هو PostgreSQL؛ هذه الدالة مستخدمة أيضاً للتحقق
 * والعرض الاحتياطي عندما لا تكون لقطة مالية قديمة متاحة بعد.
 */
export function calculateTripFinance(finalPrice: number): TripFinance {
  if (!Number.isSafeInteger(finalPrice) || finalPrice < 0) {
    throw new Error("INVALID_FINAL_PRICE");
  }

  const companyCommissionAmount = Math.floor((finalPrice * COMPANY_COMMISSION_PERCENT) / 100);
  return {
    grossAmount: finalPrice,
    companyCommissionAmount,
    driverNetAmount: finalPrice - companyCommissionAmount,
  };
}
