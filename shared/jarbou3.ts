export const HAMA_BOUNDS = {
  minLatitude: 35.04,
  maxLatitude: 35.23,
  minLongitude: 36.6,
  maxLongitude: 36.91,
} as const;

export const HAMA_CENTER = {
  latitude: 35.1318,
  longitude: 36.7578,
} as const;

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

export function isInsideHama(latitude: number, longitude: number) {
  return latitude >= HAMA_BOUNDS.minLatitude && latitude <= HAMA_BOUNDS.maxLatitude
    && longitude >= HAMA_BOUNDS.minLongitude && longitude <= HAMA_BOUNDS.maxLongitude;
}

export function formatSyp(amount: number) {
  return new Intl.NumberFormat('ar-SY', { maximumFractionDigits: 0 }).format(amount) + ' ل.س';
}
