import NetInfo from "@react-native-community/netinfo";
import * as Location from "expo-location";
import { Linking, Platform } from "react-native";

export type RuntimeReadiness = {
  online: boolean;
  gpsEnabled: boolean;
  locationGranted: boolean;
};

export async function readRuntimeReadiness(): Promise<RuntimeReadiness> {
  const network = await NetInfo.fetch();
  const online = Boolean(network.isConnected) && network.isInternetReachable !== false;
  if (Platform.OS === "web") return { online, gpsEnabled: true, locationGranted: true };
  const permission = await Location.getForegroundPermissionsAsync();
  // Avoid hasServicesEnabledAsync in this post-permission gate. On some
  // Android vendor builds the native provider query can terminate the process
  // immediately after the permission dialog closes. The active trip watcher
  // remains responsible for validating the provider when tracking is needed.
  const locationGranted = permission.status === "granted";
  return { online, gpsEnabled: locationGranted, locationGranted };
}

export async function requestRuntimeLocationPermission() {
  if (Platform.OS === "web") return;
  await Location.requestForegroundPermissionsAsync();
}

export async function openRuntimeLocationSettings() {
  if (Platform.OS !== "android") {
    await Linking.openSettings();
    return;
  }

  try {
    await Linking.sendIntent("android.settings.LOCATION_SOURCE_SETTINGS");
  } catch {
    await Linking.openSettings();
  }
}
