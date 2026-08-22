import * as Location from "expo-location";

import { isInsideHama, type MapPoint } from "@/shared/jarbou3";

export async function getCurrentHamaLocation(): Promise<MapPoint> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== "granted") throw new Error("LOCATION_PERMISSION_DENIED");
  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  const point = { latitude: position.coords.latitude, longitude: position.coords.longitude };
  if (!isInsideHama(point.latitude, point.longitude)) throw new Error("OUTSIDE_HAMA_SERVICE_RADIUS");
  return point;
}

export async function watchHamaLocation(onLocation: (point: MapPoint) => void) {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== "granted") throw new Error("LOCATION_PERMISSION_DENIED");
  return Location.watchPositionAsync(
    { accuracy: Location.Accuracy.Balanced, timeInterval: 5_000, distanceInterval: 5 },
    ({ coords }) => {
      if (isInsideHama(coords.latitude, coords.longitude)) onLocation({ latitude: coords.latitude, longitude: coords.longitude });
    },
  );
}
