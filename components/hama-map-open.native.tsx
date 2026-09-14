import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import { HAMA_BOUNDS, HAMA_INITIAL_REGION, type MapPoint } from "@/shared/jarbou3";
import type { HamaMapProps } from "@/components/hama-map-fallback";

// Keep the customer map aligned with the protected admin fleet map: the same
// OpenStreetMap tile source and attribution are used in admin-site/live-map.js.
const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION = "© OpenStreetMap contributors";

function safeJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function buildMapHtml(props: HamaMapProps) {
  const payload = {
    center: props.focusPoint ?? props.driverLocation ?? HAMA_INITIAL_REGION,
    focusZoom: props.focusZoom ?? 13,
    focusRequestId: props.focusRequestId ?? 0,
    source: props.source ?? null,
    destination: props.destination ?? null,
    driverLocation: props.driverLocation ?? null,
    routePath: props.actualPath?.length ? props.actualPath : (props.routePath ?? []),
    selecting: props.selecting ?? null,
    readOnly: Boolean(props.readOnly),
    bounds: HAMA_BOUNDS,
  };

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxNxv9L5Qk2Y9z8sF2wR0b0Xj0Q8o9m2G7lQ6e9rM=" crossorigin="" />
<style>
html, body { width:100%; height:100%; min-width:100%; min-height:100%; margin:0; padding:0; overflow:hidden; background:#e8ece8; }
#map { position:absolute; left:0; top:0; right:0; bottom:0; width:100%; height:100%; margin:0; padding:0; touch-action:none; }
.leaflet-control-attribution { font-size:10px; background:rgba(255,255,255,.86)!important; }
  .leaflet-control-zoom { display:none; }
  /* Do not alter Leaflet's inline tile geometry: changing margin/padding creates
     the staggered rows and vertical gaps visible on high-density Android screens. */
  .leaflet-tile, .leaflet-tile-container img { display:block; border:0 !important; outline:1px solid transparent; margin:0 !important; padding:0 !important; box-sizing:border-box; }
  .leaflet-tile-container { line-height:0 !important; }
  .leaflet-container { background:#f2f2f2 !important; }
  .leaflet-pane, .leaflet-layer, .leaflet-tile, .leaflet-marker-icon, .leaflet-marker-shadow { image-rendering:auto; }
  img { border:0; }
  .pin { width:30px; height:30px; border:3px solid #fff; border-radius:50% 50% 50% 0; transform:rotate(-45deg); box-shadow:0 2px 8px rgba(0,0,0,.25); }
.pin span { display:block; width:10px; height:10px; margin:7px; border-radius:50%; background:#fff; }
.pin.source { background:#536b78; }
.pin.destination { background:#2f7a62; }
.pin.driver { width:36px; height:36px; background:#242424; border-radius:50%; transform:none; display:flex; align-items:center; justify-content:center; color:#fff; font-weight:900; font-size:13px; }
</style>
</head>
<body>
<div id="map" aria-label="خريطة حماة التفاعلية"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<script>
(function(){
  const data = ${safeJson(payload)};
  const initial = data.center && typeof data.center.latitude === 'number' ? data.center : { latitude: ${HAMA_INITIAL_REGION.latitude}, longitude: ${HAMA_INITIAL_REGION.longitude} };
  const map = L.map('map', { zoomControl:false, attributionControl:true, tap:true, dragging:true, touchZoom:true, doubleClickZoom:false, scrollWheelZoom:true, wheelDebounceTime:100, wheelPxPerZoomLevel:120, zoomDelta:0.5, zoomSnap:0.5, smoothWheelZoom:true, bounceAtZoom:false, boxZoom:false, keyboard:false }).setView([initial.latitude, initial.longitude], data.focusZoom || 13);
  L.tileLayer('${TILE_URL}', { maxZoom:19, attribution:'${OSM_ATTRIBUTION}', updateWhenIdle:true, updateWhenZooming:false, keepBuffer:2 }).addTo(map);
  const layer = L.layerGroup().addTo(map);
  let lastFocusRequestId = data.focusRequestId || 0;
  function pin(kind, label) {
    return L.divIcon({ className:'', html:'<div class="pin '+kind+'">'+(kind === 'driver' ? 'ج' : '<span></span>')+'</div>', iconSize: kind === 'driver' ? [36,36] : [30,30], iconAnchor: kind === 'driver' ? [18,18] : [4,30] });
  }
  function point(value){ return value && typeof value.latitude === 'number' && typeof value.longitude === 'number' ? [value.latitude,value.longitude] : null; }
  function render(){
    layer.clearLayers();
    const path = Array.isArray(data.routePath) ? data.routePath.map(point).filter(Boolean) : [];
    if(path.length > 1) L.polyline(path, { color:'#24755e', weight:5, opacity:.9, lineCap:'round', lineJoin:'round' }).addTo(layer);
    [['source','استلام',data.source],['destination','وجهة',data.destination],['driver','السفير',data.driverLocation]].forEach(([kind,label,value]) => { if(kind === data.selecting) return; const p=point(value); if(p) L.marker(p,{icon:pin(kind,label),keyboard:false}).addTo(layer).bindTooltip(label,{direction:'top',opacity:.9}); });
  }
  render();
  let lastReportedCenter = null;
  function reportCenter(){
    if(data.readOnly || !data.selecting) return;
    const p=map.getCenter();
    if(p.lat < data.bounds.minLatitude || p.lat > data.bounds.maxLatitude || p.lng < data.bounds.minLongitude || p.lng > data.bounds.maxLongitude){ window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({type:'outside'})); return; }
    if(lastReportedCenter && Math.abs(lastReportedCenter.latitude-p.lat) < 0.00001 && Math.abs(lastReportedCenter.longitude-p.lng) < 0.00001) return;
    lastReportedCenter={latitude:p.lat,longitude:p.lng};
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({type:'select',point:lastReportedCenter}));
  }
  map.on('moveend', reportCenter);
  map.on('click', function(){ if(data.readOnly || !data.selecting) return; reportCenter(); });
  function refreshMapSize(){
    window.requestAnimationFrame(function(){
      map.invalidateSize({ animate:false, pan:false });
      window.requestAnimationFrame(function(){ map.invalidateSize({ animate:false, pan:false }); });
    });
  }
  map.on('zoomend', refreshMapSize);
  map.on('moveend', refreshMapSize);
  window.resizeMap = refreshMapSize;
  window.addEventListener('resize', refreshMapSize);
  window.addEventListener('orientationchange', refreshMapSize);
  window.setTimeout(refreshMapSize, 0);
  window.setTimeout(refreshMapSize, 80);
  window.setTimeout(refreshMapSize, 300);
  window.setTimeout(refreshMapSize, 700);
  window.receiveMapUpdate=function(next){ const update=next||{}; Object.assign(data,update); render(); if(update.focusRequestId && update.focusRequestId !== lastFocusRequestId){ lastFocusRequestId=update.focusRequestId; const focus=data.focusPoint || data.driverLocation || data.center; if(focus) map.flyTo([focus.latitude,focus.longitude],16,{animate:true,duration:1}); } refreshMapSize(); };
  window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({type:'ready'}));
})();
</script>
</body>
</html>`;
}

export function HamaMap(props: HamaMapProps) {
  const webViewRef = useRef<WebView>(null);
  const initialHtmlRef = useRef<string | null>(null);
  const html = initialHtmlRef.current ?? (initialHtmlRef.current = buildMapHtml({ ...props, focusRequestId: 0 }));
  const updatePayload = {
    center: props.focusPoint ?? props.driverLocation ?? HAMA_INITIAL_REGION,
    focusZoom: props.focusZoom ?? 13,
    focusRequestId: props.focusRequestId ?? 0,
    source: props.source ?? null,
    destination: props.destination ?? null,
    driverLocation: props.driverLocation ?? null,
    routePath: props.actualPath?.length ? props.actualPath : (props.routePath ?? []),
    selecting: props.selecting ?? null,
    readOnly: Boolean(props.readOnly),
  };
  const injectUpdate = () => {
    webViewRef.current?.injectJavaScript(`window.receiveMapUpdate(${safeJson(updatePayload)}); true;`);
  };
  useEffect(() => {
    injectUpdate();
  }, [props.source, props.destination, props.driverLocation, props.routePath, props.actualPath, props.selecting, props.readOnly, props.focusRequestId, props.focusPoint, props.focusZoom]);
  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data) as { type?: string; point?: MapPoint };
      if (message.type === "select" && message.point) props.onSelect?.(message.point);
      if (message.type === "outside") props.onOutsideRange?.();
    } catch {
      // Ignore malformed messages from the embedded map.
    }
  };
  return (
    <View
      onLayout={() => webViewRef.current?.injectJavaScript("window.resizeMap && window.resizeMap(); true;")}
      style={[styles.container, props.compact && styles.compact, props.fullScreen && styles.fullScreen]}
    >
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html, baseUrl: "https://optimus-x.local" }}
        style={styles.webview}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        onMessage={handleMessage}
        onLoadEnd={injectUpdate}
        cacheEnabled
        allowsInlineMediaPlayback
        automaticallyAdjustContentInsets={false}
        startInLoadingState={false}
        applicationNameForUserAgent="OPTIMUS-X/1.0 (Hama OpenStreetMap)"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { height: 220, minHeight: 220, width: "100%", alignSelf: "stretch", marginHorizontal: 16, marginTop: 16, borderRadius: 23, overflow: "hidden", backgroundColor: "#e8ece8" },
  compact: { height: 188, minHeight: 188 },
  fullScreen: { flex: 1, flexGrow: 1, flexBasis: 0, width: "100%", height: "100%", minHeight: 300, alignSelf: "stretch", marginHorizontal: 0, marginTop: 0, borderRadius: 0 },
  webview: { flex: 1, flexGrow: 1, flexBasis: 0, width: "100%", height: "100%", alignSelf: "stretch", backgroundColor: "#e8ece8" },
});

export { buildMapHtml };
