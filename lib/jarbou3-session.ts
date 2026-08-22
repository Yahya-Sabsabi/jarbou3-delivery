import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const ACCESS_TOKEN_KEY = "jarbou3.access-token";
const REFRESH_TOKEN_KEY = "jarbou3.refresh-token";
const ONBOARDING_KEY = "jarbou3.onboarding-state";

function webStore() {
  if (typeof localStorage === "undefined") return null;
  return localStorage;
}

export type SavedOnboarding = {
  role: "customer" | "driver";
  stage: "form" | "waiting" | "code";
  name: string;
  phone: string;
  requestId: string | null;
  codeExpiresAt: string | null;
};

export const jarbou3Session = {
  async save(accessToken: string, refreshToken: string) {
    if (Platform.OS === "web") {
      webStore()?.setItem(ACCESS_TOKEN_KEY, accessToken);
      webStore()?.setItem(REFRESH_TOKEN_KEY, refreshToken);
      return;
    }
    await Promise.all([
      SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken),
      SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken),
    ]);
  },
  async getAccessToken() {
    return Platform.OS === "web" ? webStore()?.getItem(ACCESS_TOKEN_KEY) ?? null : SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  },
  async clear() {
    if (Platform.OS === "web") {
      webStore()?.removeItem(ACCESS_TOKEN_KEY);
      webStore()?.removeItem(REFRESH_TOKEN_KEY);
      return;
    }
    await Promise.all([SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY), SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY)]);
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
      if (!state || !["customer", "driver"].includes(state.role) || !["form", "waiting", "code"].includes(state.stage)) return null;
      return state;
    } catch {
      return null;
    }
  },
  async clearOnboarding() {
    if (Platform.OS === "web") {
      webStore()?.removeItem(ONBOARDING_KEY);
      return;
    }
    await SecureStore.deleteItemAsync(ONBOARDING_KEY);
  },
};
