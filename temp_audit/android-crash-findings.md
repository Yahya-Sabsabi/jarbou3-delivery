# Android crash findings — OPTIMUS X

## Evidence source

The diagnostic archive downloaded from the user's Google Drive was extracted under `/tmp/optimus-drive-yahya/report`. Its bugreport is `bugreport-KI7-GL-TP1A.220624.014-2026-09-10-14-34-52.txt`.

## Confirmed fatal exception

The report contains repeated AndroidRuntime fatal exceptions for package `com.app.jarbou3delivery`, including a crash at `09-09 23:21:35.545`:

`com.facebook.react.common.JavascriptException: TypeError: Cannot read property 'origin' of undefined`

The React stack identifies `RootLayout`, and the JS stack identifies:

`getApiBaseUrl` → `createTRPCClient` → RootLayout mount

This is the same startup/bootstrap failure previously identified. It occurs before the app can safely complete the authenticated screen transition; it is not evidence of a wallet, GPS, map, or role-specific business-logic failure.

## Comparison with current source

The current `constants/oauth.ts` contains `getSafeWebOrigin()`, which checks `globalThis.window?.location?.origin` and returns `undefined` unless origin is a string. The current `app.config.ts` also embeds the production API URL in `extra.apiBaseUrl`, and the shared resolver is designed to avoid browser-origin access on native.

Therefore, the newly supplied bugreport was produced by an APK whose JavaScript bundle predates this source fix, or by a stale APK/cache. The source tree and the installed APK represented by the report are not the same revision.

## Next action

Do not change wallet/GPS/map logic based on this report. Complete a source audit for all origin reads, add a regression test around native API-base resolution, then build a fresh release APK from the current revision and provide its new artifact link. The user must uninstall the old APK or install the new build over it and verify the package/version before retesting.
