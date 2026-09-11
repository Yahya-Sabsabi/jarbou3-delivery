import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const ACCESS_TOKEN_KEY = "jarbou3.access-token";
const REFRESH_TOKEN_KEY = "jarbou3.refresh-token";
const ONBOARDING_KEY = "jarbou3.onboarding-state";
const ACTIVE_TRIP_KEY = "jarbou3.active-trip";
const QUEUED_LOCATION_KEY = "jarbou3.queued-location";
const PROFILE_KEY = "jarbou3.session-profile";

function webStore() {
  if (typeof localStorage === "undefined") return null;
  return localStorage;
}

export type SavedOnboarding = {
  role: "customer" | "driver";
  stage: "form" | "waiting" | "code" | "password";
  name: string;
  phone: string;
  requestId: string | null;
  codeExpiresAt: string | null;
  retryAfter?: string | null;
};

export type SavedSessionProfile = {
  role: "customer" | "driver";
  name: string;
};

export type SavedActiveTrip = {
  role: "customer" | "driver";
  orderId: string;
  sourceAddress: string;
  sourceLat: number;
  sourceLng: number;
  destinationAddress: string;
  destinationLat: number;
  destinationLng: number;
  distanceM: number;
  started?: boolean;
  savedAt: string;
};

export type QueuedLocation = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  capturedAt: string;
};

async function readJson<T>(key: string): Promise<T | null> {
  const value = Platform.OS === "web" ? webStore()?.getItem(key) ?? null : await SecureStore.getItemAsync(key);
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

async function writeJson(key: string, value: unknown) {
  const serialized = JSON.stringify(value);
  if (Platform.OS === "web") {
    webStore()?.setItem(key, serialized);
    return;
  }
  await SecureStore.setItemAsync(key, serialized);
}

async function removeValue(key: string) {
  if (Platform.OS === "web") {
    webStore()?.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export const jarbou3Session = {
  async save(accessToken: string, refreshToken: string, profile?: SavedSessionProfile) {
    if (Platform.OS === "web") {
      webStore()?.setItem(ACCESS_TOKEN_KEY, accessToken);
      webStore()?.setItem(REFRESH_TOKEN_KEY, refreshToken);
      if (profile) await writeJson(PROFILE_KEY, profile);
      return;
    }
    await Promise.all([
      SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken),
      SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken),
    ]);
    if (profile) await writeJson(PROFILE_KEY, profile);
  },
  async getAccessToken() {
    return Platform.OS === "web" ? webStore()?.getItem(ACCESS_TOKEN_KEY) ?? null : SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  },
  async clear() {
    if (Platform.OS === "web") {
      webStore()?.removeItem(ACCESS_TOKEN_KEY);
      webStore()?.removeItem(REFRESH_TOKEN_KEY);
      webStore()?.removeItem(PROFILE_KEY);
      return;
    }
    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
      SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
      SecureStore.deleteItemAsync(PROFILE_KEY),
    ]);
  },
  async getProfile(): Promise<SavedSessionProfile | null> {
    const profile = await readJson<SavedSessionProfile>(PROFILE_KEY);
    if (!profile || !["customer", "driver"].includes(profile.role) || typeof profile.name !== "string") return null;
    return profile;
  },
  async saveOnboarding(state: SavedOnboarding) {
    const value = JSON.stringify(state);
    if (Platform.OS === "web") {
      webStore()?.setItem(ONBOARDING_KEY, value);
      return;
    }
    await SecureStore.setItemAsync(ONBOARDING_KEY, value);
  },
  async getOnboarding(): Promise<SavedOnboarding | null> {
    const value = Platform.OS === "web" ? webStore()?.getItem(ONBOARDING_KEY) ?? null : await SecureStore.getItemAsync(ONBOARDING_KEY);
    if (!value) return null;
    try {
      const state = JSON.parse(value) as SavedOnboarding;
      if (!state || !["customer", "driver"].includes(state.role) || !["form", "waiting", "code", "password"].includes(state.stage)) return null;
      return state;
    } catch {
      return null;
    }
  },
  async clearOnboarding() {
    await removeValue(ONBOARDING_KEY);
  },
  async saveActiveTrip(trip: SavedActiveTrip) {
    await writeJson(ACTIVE_TRIP_KEY, trip);
  },
  async getActiveTrip() {
    return readJson<SavedActiveTrip>(ACTIVE_TRIP_KEY);
  },
  async clearActiveTrip() {
    await removeValue(ACTIVE_TRIP_KEY);
  },
  async saveQueuedLocation(location: QueuedLocation) {
    await writeJson(QUEUED_LOCATION_KEY, location);
  },
  async getQueuedLocation() {
    return readJson<QueuedLocation>(QUEUED_LOCATION_KEY);
  },
  async clearQueuedLocation() {
    await removeValue(QUEUED_LOCATION_KEY);
  },
};
