export function normalizeProblemReportMessage(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function problemReportErrorMessage(code: string) {
  if (code === "SUPABASE_UNAUTHORIZED" || code === "JARBOU3_FORBIDDEN") {
    return "انتهت جلسة الدخول أو لم تعد صالحة. سجّل الخروج ثم ادخل إلى حسابك من جديد.";
  }
  if (code === "PROFILE_NOT_FOUND") {
    return "تعذر العثور على ملف حسابك. سجّل الخروج ثم أعد تسجيل الدخول.";
  }
  if (code === "PROBLEM_REPORT_CREATE_FAILED") {
    return "تعذر حفظ البلاغ في الوقت الحالي. تحقق من الاتصال وحاول مرة أخرى.";
  }
  return "تعذر إرسال البلاغ. تحقق من الاتصال وحاول مرة أخرى.";
}
