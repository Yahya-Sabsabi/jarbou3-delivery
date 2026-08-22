import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";

import { getApiBaseUrl } from "@/constants/oauth";
import { validateHamaGpsSample, type GpsSample } from "@/lib/jarbou3-location-quality";
import { jarbou3Session } from "@/lib/jarbou3-session";

export const JARBOU3_BACKGROUND_LOCATION_TASK = "jarbou3-active-order-location";

let previousLocation: GpsSample | undefined;

async function sendLocationToServer(sample: GpsSample) {
  const accessToken = await jarbou3Session.getAccessToken();
  const apiBaseUrl = getApiBaseUrl();
  if (!accessToken || !apiBaseUrl) return false;
  const response = await fetch(`${apiBaseUrl}/api/jarbou3/driver-location`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ latitude: sample.latitude, longitude: sample.longitude, accuracy: sample.accuracy }),
  });
  return response.ok;
}

function toGpsSample(location: Location.LocationObject): GpsSample {
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    accuracy: location.coords.accuracy,
    mocked: location.mocked,
    timestamp: location.timestamp,
    speed: location.coords.speed,
  };
}

if (Platform.OS !== "web" && !TaskManager.isTaskDefined(JARBOU3_BACKGROUND_LOCATION_TASK)) {
  TaskManager.defineTask(JARBOU3_BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
    if (error || !data) return;
    const locations = (data as { locations?: Location.LocationObject[] }).locations ?? [];
    for (const location of locations) {
      const sample = toGpsSample(location);
      if (validateHamaGpsSample(sample, previousLocation) !== "good") continue;
      previousLocation = sample;
      try {
        await sendLocationToServer(sample);
      } catch {
        // The operating system will request a new position later; never retry in a tight loop.
      }
    }
  });
}

export async function startJarbou3BackgroundTracking() {
  if (Platform.OS === "web" || !(await TaskManager.isAvailableAsync())) return "unavailable" as const;
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== "granted") return "foreground_denied" as const;
  const background = await Location.requestBackgroundPermissionsAsync();
  if (background.status !== "granted") return "background_denied" as const;
  if (!(await Location.hasServicesEnabledAsync())) return "services_disabled" as const;
  if (!(await Location.hasStartedLocationUpdatesAsync(JARBOU3_BACKGROUND_LOCATION_TASK))) {
    await Location.startLocationUpdatesAsync(JARBOU3_BACKGROUND_LOCATION_TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: 5_000,
      distanceInterval: 10,
      deferredUpdatesInterval: 5_000,
      pausesUpdatesAutomatically: false,
      activityType: Location.ActivityType.AutomotiveNavigation,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "جربوع يتتبع الرحلة",
        notificationBody: "تتم مشاركة موقع السفير مع العميل للطلب النشط فقط.",
      },
    });
  }
  return "started" as const;
}

export async function stopJarbou3BackgroundTracking() {
  if (Platform.OS === "web" || !(await TaskManager.isAvailableAsync())) return;
  if (await Location.hasStartedLocationUpdatesAsync(JARBOU3_BACKGROUND_LOCATION_TASK)) {
    await Location.stopLocationUpdatesAsync(JARBOU3_BACKGROUND_LOCATION_TASK);
  }
  previousLocation = undefined;
}
