const arabicIndicDigits = "٠١٢٣٤٥٦٧٨٩";
const easternArabicDigits = "۰۱۲۳۴۵۶۷۸۹";

/** يحوّل الأرقام العربية إلى ASCII ويحصر الناتج في أرقام لاتينية فقط. */
export function normalizeJarbou3Digits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (digit) => String(arabicIndicDigits.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String(easternArabicDigits.indexOf(digit)))
    .replace(/[^0-9]/g, "");
}

export function normalizeJarbou3Phone(value: string): string {
  const digits = normalizeJarbou3Digits(value);
  if (digits.length < 8 || digits.length > 16) return "";
  return `+${digits}`;
}

export function isJarbou3Phone(value: string): boolean {
  return normalizeJarbou3Phone(value).length > 0;
}

/** يقبل رمز تحقق واحداً من ستة أرقام فقط، بعد تحويل الأرقام العربية إلى ASCII. */
export function normalizeJarbou3Otp(value: string): string {
  const ascii = value
    .replace(/[٠-٩]/g, (digit) => String(arabicIndicDigits.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String(easternArabicDigits.indexOf(digit)));
  return /^[0-9]{6}$/.test(ascii) ? ascii : "";
}

/** مقارنة رقمين بصيغ عرض مختلفة من دون الاعتماد على المطابقة النصية في قاعدة البيانات. */
export function isSameJarbou3Phone(left: string, right: string): boolean {
  const normalizedLeft = normalizeJarbou3Phone(left);
  return normalizedLeft.length > 0 && normalizedLeft === normalizeJarbou3Phone(right);
}
