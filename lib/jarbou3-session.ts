import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const ACCESS_TOKEN_KEY = "jarbou3.access-token";
const REFRESH_TOKEN_KEY = "jarbou3.refresh-token";

function webStore() {
  if (typeof sessionStorage === "undefined") return null;
  return sessionStorage;
}

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
};
