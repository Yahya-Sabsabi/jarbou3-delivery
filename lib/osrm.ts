import { estimateDeliveryPrice, type MapPoint } from "@/shared/jarbou3";

export type RouteEstimate = {
  distanceM: number;
  durationSeconds: number;
  price: number;
  path: MapPoint[];
};

export async function getOsrmRoute(source: MapPoint, destination: MapPoint): Promise<RouteEstimate> {
  const coordinates = `${source.longitude},${source.latitude};${destination.longitude},${destination.latitude}`;
  const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false`);
  if (!response.ok) throw new Error("OSRM_ROUTE_UNAVAILABLE");
  const payload = await response.json() as { code: string; routes?: Array<{ distance: number; duration: number; geometry?: { coordinates: Array<[number, number]> } }> };
  const route = payload.routes?.[0];
  if (payload.code !== "Ok" || !route) throw new Error("OSRM_ROUTE_NOT_FOUND");
  const distanceM = Math.round(route.distance);
  return { distanceM, durationSeconds: Math.round(route.duration), price: estimateDeliveryPrice(distanceM), path: (route.geometry?.coordinates ?? []).map(([longitude, latitude]) => ({ latitude, longitude })) };
}
