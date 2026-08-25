import NetInfo from "@react-native-community/netinfo";
import * as Location from "expo-location";
import { Platform } from "react-native";

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
  const gpsEnabled = await Location.hasServicesEnabledAsync();
  return { online, gpsEnabled, locationGranted: permission.status === "granted" };
}

export async function requestRuntimeLocationPermission() {
  if (Platform.OS === "web") return;
  await Location.requestForegroundPermissionsAsync();
}
