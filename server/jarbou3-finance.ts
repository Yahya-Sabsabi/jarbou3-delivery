export const COMPANY_COMMISSION_PERCENT = 3;

export type TripFinance = {
  grossAmount: number;
  companyCommissionAmount: number;
  driverNetAmount: number;
};

export type DriverCompanyBalance = {
  totalCommissionAmount: number;
  paidAmount: number;
  outstandingAmount: number;
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

/**
 * يجمع العمولة المثبتة للرحلات المكتملة ويطرح الدفعات الموثقة فقط.
 * تفرض قاعدة البيانات عدم تجاوز الدفعة للرصيد المستحق؛ هذه الدالة للاختبار
 * والتحقق من العرض، وليست بديلاً عن التسوية الذرية على الخادم.
 */
export function calculateDriverCompanyBalance(commissionAmounts: number[], paymentAmounts: number[]): DriverCompanyBalance {
  const totalCommissionAmount = commissionAmounts.reduce((sum, amount) => {
    if (!Number.isSafeInteger(amount) || amount < 0) throw new Error("INVALID_COMMISSION_AMOUNT");
    return sum + amount;
  }, 0);
  const paidAmount = paymentAmounts.reduce((sum, amount) => {
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("INVALID_PAYMENT_AMOUNT");
    return sum + amount;
  }, 0);
  if (paidAmount > totalCommissionAmount) throw new Error("PAYMENT_EXCEEDS_OUTSTANDING_BALANCE");
  return { totalCommissionAmount, paidAmount, outstandingAmount: totalCommissionAmount - paidAmount };
}
