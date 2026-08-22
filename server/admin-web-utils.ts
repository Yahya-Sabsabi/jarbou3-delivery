export type AdminOrderNotice = {
  id: string;
  status: string;
  created_at: string;
  updated_at: string;
  driver_id: string | null;
};

export type DriverVerificationNotice = {
  user_id: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type AdminNotification = {
  id: string;
  kind: "order" | "driver";
  level: "info" | "warning" | "success";
  title: string;
  detail: string;
  createdAt: string;
};

export function normalizeReportMonth(value: string): string | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(value)) return null;
  return value;
}

export function buildAdminNotifications(
  orders: AdminOrderNotice[],
  verifications: DriverVerificationNotice[],
): AdminNotification[] {
  const orderNotifications = orders.map((order) => {
    const isNew = order.status === "requested" && !order.driver_id;
    return {
      id: `order-${order.id}-${order.updated_at}`,
      kind: "order" as const,
      level: isNew ? "warning" as const : order.status === "delivered" ? "success" as const : "info" as const,
      title: isNew ? "طلب جديد بانتظار التعيين" : order.status === "delivered" ? "تم تسليم طلب" : "تغيرت حالة طلب",
      detail: `الطلب #${order.id.slice(0, 8)} حالته الآن: ${order.status}`,
      createdAt: order.updated_at || order.created_at,
    };
  });

  const driverNotifications = verifications.map((verification) => ({
    id: `driver-${verification.user_id}-${verification.updated_at}`,
    kind: "driver" as const,
    level: verification.status === "pending" ? "warning" as const : verification.status === "approved" ? "success" as const : "info" as const,
    title: verification.status === "pending" ? "طلب تفعيل سائق جديد" : "تحديث في حالة سائق",
    detail: `ملف السائق #${verification.user_id.slice(0, 8)} حالته: ${verification.status}`,
    createdAt: verification.updated_at || verification.created_at,
  }));

  return [...orderNotifications, ...driverNotifications]
    .sort((first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt))
    .slice(0, 12);
}

export function isSameOriginRequest(origin: string | undefined, host: string | undefined, protocol: string): boolean {
  if (!origin) return true;
  if (!host) return false;
  try {
    return new URL(origin).host === host && new URL(origin).protocol === `${protocol}:`;
  } catch {
    return false;
  }
}
