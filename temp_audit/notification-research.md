# External research — Android crash after workspace render

## Video evidence
The latest Google Drive video was `Screen_Recording_20260910_162028.mp4`, modified 2026-09-10. It shows: account chooser → customer → location permission dialog → precise/while-using permission granted → customer dashboard and loading spinner → app exits to Android home. The video does not show a GPS-disabled loop; it shows an exit after the workspace appears.

## Sources reviewed
1. Expo Location docs: https://docs.expo.dev/versions/latest/sdk/location/
   The docs describe foreground permission requests and note that Android location must be enabled for location access. This does not explain the new post-dashboard exit by itself.
2. Expo Notifications docs: https://docs.expo.dev/versions/latest/sdk/notifications/
   The docs show notification handler setup and push-token registration as runtime operations, and note that Android remote push is unavailable in Expo Go from SDK 53 and needs a development/release build.
3. Expo issue #27937: https://github.com/expo/expo/issues/27937
   A missing ExpoPushTokenManager native module caused module-load errors and prevented the React app from registering its main component. The issue demonstrates that importing/initializing notifications can abort the React tree when native support is unavailable or mismatched.
4. Expo issue #22995: https://github.com/expo/expo/issues/22995
   A reported Android crash occurred around returning from an Android notification-permission intent in a development build, with a ReactHost/onActivityResult soft exception. This supports avoiding fragile notification/permission initialization during the first workspace render.
5. Expo issue #30031: https://github.com/expo/expo/issues/30031
   `getExpoPushTokenAsync` can hang when push services/network are unreachable; push registration should not block or be allowed to destabilize the main UI.

## Code finding
`components/jarbou3-app.tsx` dynamically imports `lib/jarbou3-notifications` as soon as `accessToken` exists. Before the fix, `lib/jarbou3-notifications.ts` performed `require("expo-notifications")` and `setNotificationHandler(...)` at module top level. The fix removes top-level native initialization, guards require and handler setup with try/catch, and returns null when unavailable. A regression test checks that there is no top-level notification initialization.

## Build alternative status
EAS cloud build was blocked by the account's monthly Android build quota. Local EAS build initially lacked Android SDK, then SDK components and JDK compiler were installed inside sandbox only. The first local attempt failed because Java compiler was absent; the second failed because Gradle could not find `node`; node was then exposed at `/usr/local/bin/node` inside sandbox. The third local attempt is currently progressing through Expo Doctor/Metro/Gradle from commit `1a337219`; no APK has been produced yet at the time of this note.
