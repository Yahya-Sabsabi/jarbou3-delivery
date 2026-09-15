# MapLibre Native / OpenFreeMap compatibility findings

## Decision
Use `@maplibre/maplibre-react-native` with the OpenFreeMap Liberty style URL:
`https://tiles.openfreemap.org/styles/liberty`

## Verified constraints

MapLibre's official Expo setup states that the package cannot run in Expo Go, requires installation through Expo/package manager, requires the config plugin `@maplibre/maplibre-react-native`, and requires rebuilding the app with native code. The official getting-started guide states that current MapLibre React Native requires React Native >= 0.80, Android API >= 23, and from v11 onward supports only the New Architecture. This project uses React Native 0.81.5, Android minSdk 24, and `newArchEnabled: true`, so the documented baseline is compatible, subject to the actual dependency build.

OpenFreeMap's official quick start documents the Liberty style URL and states that mobile applications can use the same styles with MapLibre Native. Attribution must include OpenFreeMap, OpenMapTiles, and OpenStreetMap copyright notices.

## Important delivery consequence

The app cannot be tested in Expo Go after this migration. Validation must use the local Android Release/development build. This is a native migration, not a WebView fallback.

## References

1. MapLibre React Native Expo Setup: https://maplibre.org/maplibre-react-native/docs/setup/expo/
2. MapLibre React Native Getting Started: https://maplibre.org/maplibre-react-native/docs/setup/getting-started/
3. OpenFreeMap Quick Start: https://openfreemap.org/quick_start/
4. OpenFreeMap Liberty style: https://tiles.openfreemap.org/styles/liberty
