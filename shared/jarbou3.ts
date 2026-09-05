export const HAMA_BOUNDS = {
  minLatitude: 35.04,
  maxLatitude: 35.23,
  minLongitude: 36.6,
  maxLongitude: 36.91,
} as const;

export const HAMA_CENTER = {
  latitude: 35.1319,
  longitude: 36.7547,
} as const;

export const HAMA_SERVICE_RADIUS_METERS = 7_000;

/** Monetary values are stored and displayed in the new Syrian pound (SYP-N). */
export const SYRIAN_POUND_UNIT = "SYP_NEW" as const;
export const OLD_SYRIAN_POUNDS_PER_NEW = 100;
export const HIGH_VALUE_ORDER_THRESHOLD_SYP = 1_000;
export const DRIVER_MINIMUM_AVAILABLE_BALANCE_SYP = 100;

export type MapPoint = { latitude: number; longitude: number };

export const VALID_HAMA_STOPS = [
  'ساحة العاصي، حماة',
  'المرابط، حماة',
  'حي الحاضر، حماة',
  'باب البلد، حماة',
  'القصور، حماة',
  'الحميدية، حماة',
  'المدينة الصناعية، حماة',
] as const;

export type UserRole = 'customer' | 'driver' | 'admin';
export type PaymentMethod = 'cash' | 'sham_cash';
export type OrderStatus = 'requested' | 'accepted' | 'arriving' | 'awaiting_otp' | 'delivered' | 'cancelled';

export function distanceMeters(from: MapPoint, to: MapPoint) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(to.latitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isInsideHama(latitude: number, longitude: number) {
  const insideBox = latitude >= HAMA_BOUNDS.minLatitude && latitude <= HAMA_BOUNDS.maxLatitude
    && longitude >= HAMA_BOUNDS.minLongitude && longitude <= HAMA_BOUNDS.maxLongitude;
  return insideBox && distanceMeters(HAMA_CENTER, { latitude, longitude }) <= HAMA_SERVICE_RADIUS_METERS;
}

export function estimateDeliveryPrice(distanceM: number) {
  return Math.max(60, Math.ceil(distanceM / 1_000) * 25);
}

export function formatSyp(amount: number) {
  return new Intl.NumberFormat('ar-SY', { maximumFractionDigits: 0 }).format(amount) + ' ل.س جديدة';
}
