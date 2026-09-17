import * as Location from "expo-location";

import { type MapPoint } from "@/shared/jarbou3";
import { type GpsQuality, type GpsSample, validateHamaGpsSample } from "@/lib/jarbou3-location-quality";

export { type GpsQuality, type GpsSample, validateHamaGpsSample } from "@/lib/jarbou3-location-quality";

export async function getCurrentHamaLocation(): Promise<MapPoint> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== "granted") throw new Error("LOCATION_PERMISSION_DENIED");
  if (!(await Location.hasServicesEnabledAsync())) throw new Error("LOCATION_SERVICES_DISABLED");
  const lastKnown = await Location.getLastKnownPositionAsync({ maxAge: 30_000, requiredAccuracy: 150 });
  const position = lastKnown ?? await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  const point = { latitude: position.coords.latitude, longitude: position.coords.longitude };
  const quality = validateHamaGpsSample({ ...point, accuracy: position.coords.accuracy, mocked: position.mocked, timestamp: position.timestamp, speed: position.coords.speed });
  if (quality === "outside_hama") throw new Error("OUTSIDE_HAMA_SERVICE_RADIUS");
  if (quality === "mocked" || quality === "unrealistic_jump" || (quality === "poor_accuracy" && (position.coords.accuracy == null || position.coords.accuracy > 150))) throw new Error("LOCATION_QUALITY_TOO_LOW");
  return point;
}

export async function watchHamaLocation(onLocation: (point: MapPoint) => void, onQuality?: (quality: GpsQuality) => void, onError?: (error: unknown) => void) {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== "granted") throw new Error("LOCATION_PERMISSION_DENIED");
  if (!(await Location.hasServicesEnabledAsync())) throw new Error("LOCATION_SERVICES_DISABLED");
  let previous: GpsSample | undefined;
  return Location.watchPositionAsync(
    { accuracy: Location.Accuracy.High, timeInterval: 5_000, distanceInterval: 10, mayShowUserSettingsDialog: true },
    (location) => {
      const sample: GpsSample = { latitude: location.coords.latitude, longitude: location.coords.longitude, accuracy: location.coords.accuracy, mocked: location.mocked, timestamp: location.timestamp, speed: location.coords.speed };
      const quality = validateHamaGpsSample(sample, previous);
      onQuality?.(quality);
      if (quality === "good") {
        previous = sample;
        onLocation({ latitude: sample.latitude, longitude: sample.longitude });
      }
    },
    onError,
  );
}
