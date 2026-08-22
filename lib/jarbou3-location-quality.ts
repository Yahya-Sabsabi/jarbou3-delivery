import { distanceMeters, isInsideHama } from "../shared/jarbou3";

export type GpsQuality = "good" | "poor_accuracy" | "mocked" | "outside_hama" | "unrealistic_jump";
export type GpsSample = { latitude: number; longitude: number; accuracy: number | null; mocked?: boolean; timestamp: number; speed?: number | null };

const MAX_ACCURACY_METERS = 80;
const MAX_TRAVEL_SPEED_MPS = 55;

export function validateHamaGpsSample(sample: GpsSample, previous?: GpsSample): GpsQuality {
  if (!Number.isFinite(sample.latitude) || !Number.isFinite(sample.longitude) || sample.mocked) return "mocked";
  if (!isInsideHama(sample.latitude, sample.longitude)) return "outside_hama";
  if (sample.accuracy == null || sample.accuracy > MAX_ACCURACY_METERS) return "poor_accuracy";
  if (sample.speed != null && sample.speed > MAX_TRAVEL_SPEED_MPS) return "unrealistic_jump";
  if (previous) {
    const elapsedSeconds = Math.max(1, (sample.timestamp - previous.timestamp) / 1000);
    if (distanceMeters(previous, sample) / elapsedSeconds > MAX_TRAVEL_SPEED_MPS) return "unrealistic_jump";
  }
  return "good";
}
