export type ReleaseSettings = {
  minVersion: string | null;
  forceUpdate: boolean;
  updateUrl: string | null;
};

function versionParts(value: string) {
  return value.split(".").map((part) => Number.parseInt(part.replace(/\D.*$/, ""), 10) || 0).slice(0, 3);
}

export function isVersionBelow(currentVersion: string, minimumVersion: string | null) {
  if (!minimumVersion) return false;
  const current = versionParts(currentVersion);
  const minimum = versionParts(minimumVersion);
  for (let index = 0; index < 3; index += 1) {
    if ((current[index] ?? 0) < (minimum[index] ?? 0)) return true;
    if ((current[index] ?? 0) > (minimum[index] ?? 0)) return false;
  }
  return false;
}
