import type { DriverCompanyBalance, TripFinance } from "../../domain/entities/trip-finance";

export const COMPANY_COMMISSION_PERCENT = 10;

export function calculateTripFinance(finalPrice: number): TripFinance {
  if (!Number.isSafeInteger(finalPrice) || finalPrice < 0) throw new Error("INVALID_FINAL_PRICE");
  const companyCommissionAmount = Math.floor((finalPrice * COMPANY_COMMISSION_PERCENT) / 100);
  return {
    grossAmount: finalPrice,
    companyCommissionAmount,
    driverNetAmount: finalPrice - companyCommissionAmount,
  };
}

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
