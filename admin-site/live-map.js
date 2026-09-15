const ADMIN_LIBERTY_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const ADMIN_LEAFLET_TILE_URL = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
const ADMIN_ESRI_TILE_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}";
const ADMIN_HAMA_CENTER = [36.76, 35.13];
const ADMIN_HAMA_BOUNDS = [[36.60, 35.04], [36.91, 35.23]];
let fleetOperationsMap = null;
let fleetMapTarget = null;
let fleetPayload = null;
let fleetRouteSourceReady = false;
let fleetDriverMarkers = new Map();
let fleetCustomerMarkers = new Map();
let fleetStopMarkers = [];
let fleetRefreshInFlight = false;
let leafletFleetMap = null;
let leafletFleetTarget = null;
let leafletFleetDriverMarkers = new Map();
let leafletFleetCustomerMarkers = new Map();
let leafletFleetRoute = null;
let leafletFleetStops = [];
let placesMap = null;
let placesMapTarget = null;
let placesMarker = null;
let placesSavedMarkers = new Map();
let leafletPlacesMap = null;
let leafletPlacesTarget = null;
let leafletPlacesMarker = null;
let leafletPlacesSavedMarkers = new Map();

function fleetEscape(value) { return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char])); }
function fleetMoney(value) { return `${new Intl.NumberFormat("ar-SY").format(Number(value || 0))} ل.س`; }
function fleetMinutes(order) { if (!order?.startedAt) return "لم يبدأ عداد الوقت بعد"; const seconds = Math.max(0, Math.floor((Date.now() - new Date(order.startedAt).getTime()) / 1000)); return `${Math.max(1, Math.floor(seconds / 60))} دقيقة منذ قبول المهمة`; }
function finitePoint(point) { const latitude = Number(point?.latitude ?? point?.last_location_lat ?? point?.lastLocationLat); const longitude = Number(point?.longitude ?? point?.last_location_lng ?? point?.lastLocationLng); return Number.isFinite(latitude) && Number.isFinite(longitude) ? { ...point, latitude, longitude } : null; }
function maplibreReady(target) { return target && window.maplibregl && typeof window.maplibregl.Map === "function"; }
function maplibreSupported() { try { if (!maplibreReady(document.body)) return false; if (typeof window.maplibregl.supported === "function") return window.maplibregl.supported({ failIfMajorPerformanceCaveat: false }); const canvas = document.createElement("canvas"); return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl") || canvas.getContext("experimental-webgl")); } catch { return false; } }
function leafletReady() { return Boolean(window.L && typeof window.L.map === "function"); }
function mapError(target, text = "تعذر تحميل الخريطة. تحقق من الاتصال ثم أعد المحاولة.") { if (!target || target.querySelector(".map-empty")) return; target.insertAdjacentHTML("beforeend", `<p class="map-empty">${fleetEscape(text)}</p>`); }
function makeMarkerElement(className, content) { const element = document.createElement("div"); element.className = className; element.innerHTML = content; return element; }
function mapPopup(html) { return new window.maplibregl.Popup({ closeButton: true, closeOnClick: true, offset: 18, maxWidth: "320px" }).setHTML(html); }
function leafPopup(html) { return window.L.popup({ closeButton: true, closeOnClick: true, offset: [0, -8], maxWidth: 320 }).setContent(html); }
function leafIcon(className, content, size = [38, 38], anchor = [19, 19]) { return window.L.divIcon({ className: `${className} leaflet-div-icon`, html: content, iconSize: size, iconAnchor: anchor }); }

function createAdminMap(target, onLoad, onFailure) {
  if (!maplibreReady(target) || !maplibreSupported()) return null;
  let settled = false;
  let failureTimer = null;
  const fail = () => { if (settled) return; settled = true; if (failureTimer) window.clearTimeout(failureTimer); try { map.remove(); } catch {} onFailure?.(); };
  let map;
  try {
    map = new window.maplibregl.Map({ container: target, style: ADMIN_LIBERTY_STYLE, center: ADMIN_HAMA_CENTER, zoom: 12, minZoom: 11, maxZoom: 19, maxBounds: ADMIN_HAMA_BOUNDS, attributionControl: true, dragRotate: false, touchPitch: false, doubleClickZoom: true });
    map.addControl(new window.maplibregl.NavigationControl({ showCompass: true }), "top-right");
    map.addControl(new window.maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true, showUserHeading: true }), "top-right");
    map.once("load", () => { settled = true; if (failureTimer) window.clearTimeout(failureTimer); map._optimusLoaded = true; map.resize(); onLoad?.(map); });
    map.on("error", (event) => { if (!settled) { console.warn("MapLibre resource error", event?.error || event); if (failureTimer) window.clearTimeout(failureTimer); failureTimer = window.setTimeout(fail, 1800); } });
    failureTimer = window.setTimeout(fail, 9000);
    return map;
  } catch (error) { console.warn("MapLibre initialization failed", error); onFailure?.(); return null; }
}

function createAdminLeafletMap(target, onLoad) {
  if (!leafletReady()) return null;
  const map = window.L.map(target, { zoomControl: false, attributionControl: true, minZoom: 11, maxZoom: 19, maxBounds: [[35.04, 36.60], [35.23, 36.91]], maxBoundsViscosity: 1, doubleClickZoom: true }).setView([ADMIN_HAMA_CENTER[1], ADMIN_HAMA_CENTER[0]], 12);
  const cartoLayer = window.L.tileLayer(ADMIN_LEAFLET_TILE_URL, { maxZoom: 19, subdomains: ["a", "b", "c", "d"], tileSize: 256, zoomOffset: 0, updateWhenIdle: true, keepBuffer: 2, attribution: "© OpenStreetMap contributors © CARTO" });
  const esriLayer = window.L.tileLayer(ADMIN_ESRI_TILE_URL, { maxZoom: 19, updateWhenIdle: true, keepBuffer: 2, attribution: "Tiles © Esri — Source: Esri, OpenStreetMap contributors" });
  let rasterBackupActivated = false;
  cartoLayer.on("tileerror", () => { if (rasterBackupActivated) return; rasterBackupActivated = true; if (map.hasLayer(cartoLayer)) map.removeLayer(cartoLayer); esriLayer.addTo(map); });
  cartoLayer.addTo(map);
  window.L.control.zoom({ position: "topright" }).addTo(map);
  const locate = window.L.control({ position: "topright" });
  locate.onAdd = () => { const button = document.createElement("button"); button.type = "button"; button.className = "leaflet-control-locate"; button.title = "موقعي الحالي"; button.textContent = "⌖"; window.L.DomEvent.on(button, "click", (event) => { window.L.DomEvent.stop(event); map.locate({ setView: true, maxZoom: 16, enableHighAccuracy: true }); }); return button; };
  locate.addTo(map);
  map.on("locationerror", () => {});
  map.whenReady(() => { map.invalidateSize(); window.setTimeout(() => map.invalidateSize(), 80); onLoad?.(map); });
  return map;
}

function clearMarkerStore(store) { for (const marker of store.values()) marker.remove(); store.clear(); }
function clearFleetStops() { fleetStopMarkers.forEach((marker) => marker.remove()); fleetStopMarkers = []; }
function clearLeafletFleetStops() { leafletFleetStops.forEach((marker) => marker.remove()); leafletFleetStops = []; }
function clearFleetRoute() { if (fleetOperationsMap?.getSource("fleet-route")) fleetOperationsMap.getSource("fleet-route").setData({ type: "FeatureCollection", features: [] }); clearFleetStops(); }
function clearLeafletFleetRoute() { if (leafletFleetRoute) { leafletFleetRoute.remove(); leafletFleetRoute = null; } clearLeafletFleetStops(); }
function ensureFleetRouteLayer(map) {
  if (!map.getSource("fleet-route")) map.addSource("fleet-route", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  if (!map.getLayer("fleet-route-line")) map.addLayer({ id: "fleet-route-line", type: "line", source: "fleet-route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#24755E", "line-width": 5, "line-opacity": 0.9 } });
  fleetRouteSourceReady = true;
}
function showFleetRoute(driver) {
  if (!fleetOperationsMap || !fleetRouteSourceReady) return;
  clearFleetRoute();
  const order = driver.activeOrder; if (!order) return;
  const route = (order.route || []).map((point) => [Number(point.longitude), Number(point.latitude)]).filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]));
  const current = [Number(driver.longitude), Number(driver.latitude)];
  if (Number.isFinite(current[0]) && Number.isFinite(current[1]) && (!route.length || route[route.length - 1][0] !== current[0] || route[route.length - 1][1] !== current[1])) route.push(current);
  if (route.length > 1) fleetOperationsMap.getSource("fleet-route").setData({ type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "LineString", coordinates: route }, properties: {} }] });
  const source = [Number(order.source?.longitude), Number(order.source?.latitude)]; const destination = [Number(order.destination?.longitude), Number(order.destination?.latitude)];
  [[source, "استلام", "map-stop-label source"], [destination, "وجهة", "map-stop-label destination"]].forEach(([point, label, className]) => { if (!Array.isArray(point) || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) return; const marker = new window.maplibregl.Marker({ element: makeMarkerElement(className, `<span>${label}</span>`), anchor: "center" }).setLngLat(point).addTo(fleetOperationsMap); fleetStopMarkers.push(marker); });
}
function showLeafletFleetRoute(driver) {
  if (!leafletFleetMap || !driver?.activeOrder) return;
  clearLeafletFleetRoute();
  const order = driver.activeOrder;
  const route = (order.route || []).map((point) => [Number(point.latitude), Number(point.longitude)]).filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]));
  const current = [Number(driver.latitude), Number(driver.longitude)];
  if (Number.isFinite(current[0]) && Number.isFinite(current[1])) route.push(current);
  if (route.length > 1) leafletFleetRoute = window.L.polyline(route, { color: "#24755E", weight: 5, opacity: 0.9, lineCap: "round", lineJoin: "round" }).addTo(leafletFleetMap);
  [[order.source, "استلام"], [order.destination, "وجهة"]].forEach(([point, label]) => { const lat = Number(point?.latitude); const lng = Number(point?.longitude); if (!Number.isFinite(lat) || !Number.isFinite(lng)) return; const marker = window.L.marker([lat, lng], { icon: leafIcon("map-stop-label", `<span>${label}</span>`, [48, 24], [24, 12]) }).addTo(leafletFleetMap); leafletFleetStops.push(marker); });
}
function driverPopup(driver) {
  const order = driver.activeOrder;
  const detail = order ? `<b>مهمة نشطة</b><span>${fleetEscape(order.sourceAddress)} ← ${fleetEscape(order.destinationAddress)}</span><span>الوقت: ${fleetEscape(fleetMinutes(order))}</span><span>المسافة الفعلية: ${(Number(order.actualDistanceM || 0) / 1000).toFixed(1)} كم</span><span>تكلفة الرحلة التقديرية: ${fleetMoney(order.estimatedPrice)}</span>` : `<span>${driver.lastLocationAt ? `آخر تحديث: ${new Date(driver.lastLocationAt).toLocaleString("ar-SY")}` : "لا يوجد وقت تحديث"}</span><span>لا توجد مهمة نشطة حالياً.</span>`;
  return `<div class="map-driver-popup"><strong>${fleetEscape(driver.name || "سفير جربوع")}</strong>${detail}</div>`;
}
function customerPopup(customer) { return `<div class="map-driver-popup"><strong>${fleetEscape(customer.name || "عميل")}</strong><span>عميل</span>${customer.lastLocationAt ? `<span>آخر تحديث: ${new Date(customer.lastLocationAt).toLocaleString("ar-SY")}</span>` : ""}</div>`; }
function syncFleetMarker(store, point, kind, popupHtml) {
  const id = String(point.id); const position = [point.longitude, point.latitude]; const existing = store.get(id);
  if (existing) { existing.setLngLat(position); existing.setPopup(mapPopup(popupHtml)); return existing; }
  const initial = fleetEscape(String(point.name || (kind === "driver" ? "س" : "ع")).slice(0, 1));
  const element = kind === "driver" ? makeMarkerElement("driver-map-marker", `<span class="driver-marker-dot">${initial}</span>`) : makeMarkerElement("customer-map-marker", `<span class="customer-marker-dot"><b>ع</b></span>`);
  const marker = new window.maplibregl.Marker({ element, anchor: "center" }).setLngLat(position).setPopup(mapPopup(popupHtml)).addTo(fleetOperationsMap);
  if (kind === "driver") marker.getElement().addEventListener("click", () => showFleetRoute(point));
  store.set(id, marker); return marker;
}
function syncFleetMarkers(points, store, kind) { const visible = new Set(); points.forEach((point) => { visible.add(String(point.id)); syncFleetMarker(store, point, kind, kind === "driver" ? driverPopup(point) : customerPopup(point)); }); for (const [id, marker] of store.entries()) if (!visible.has(id)) { marker.remove(); store.delete(id); } }
function syncLeafletFleetMarker(store, point, kind, popupHtml) {
  const id = String(point.id); const position = [point.latitude, point.longitude]; const existing = store.get(id);
  if (existing) { existing.setLatLng(position); existing.setPopupContent(popupHtml); existing.off("click"); if (kind === "driver") existing.on("click", () => showLeafletFleetRoute(point)); return existing; }
  const initial = fleetEscape(String(point.name || (kind === "driver" ? "س" : "ع")).slice(0, 1));
  const icon = kind === "driver" ? leafIcon("driver-map-marker", `<span class="driver-marker-dot">${initial}</span>`) : leafIcon("customer-map-marker", `<span class="customer-marker-dot"><b>ع</b></span>`);
  const marker = window.L.marker(position, { icon }).bindPopup(popupHtml).addTo(leafletFleetMap);
  if (kind === "driver") marker.on("click", () => showLeafletFleetRoute(point));
  store.set(id, marker); return marker;
}
function syncLeafletFleetMarkers(points, store, kind) { const visible = new Set(); points.forEach((point) => { visible.add(String(point.id)); syncLeafletFleetMarker(store, point, kind, kind === "driver" ? driverPopup(point) : customerPopup(point)); }); for (const [id, marker] of store.entries()) if (!visible.has(id)) { marker.remove(); store.delete(id); } }
function fitFleetPoints(map, points, filterChanged) { if (!filterChanged || !points.length) return; if (points.length === 1) { map.flyTo({ center: [points[0].longitude, points[0].latitude], zoom: 14, duration: 450 }); return; } const bounds = points.reduce((box, point) => box.extend([point.longitude, point.latitude]), new window.maplibregl.LngLatBounds([points[0].longitude, points[0].latitude], [points[0].longitude, points[0].latitude])); map.fitBounds(bounds, { padding: 38, maxZoom: 14, duration: 450 }); }
function fitLeafletFleetPoints(map, points, filterChanged) { if (!filterChanged || !points.length) return; if (points.length === 1) { map.setView([points[0].latitude, points[0].longitude], 14, { animate: true }); return; } map.fitBounds(window.L.latLngBounds(points.map((point) => [point.latitude, point.longitude])), { padding: [38, 38], maxZoom: 14, animate: true }); }
function getFleetFilter() { return document.querySelector("#fleet-map-filter")?.value || "all"; }
function bindFleetFilter() { const filterControl = document.querySelector("#fleet-map-filter"); if (filterControl && filterControl.dataset.bound !== "true") { filterControl.dataset.bound = "true"; filterControl.addEventListener("change", () => { if (maplibreSupported() && fleetOperationsMap) renderFleetPayload(fleetPayload); else renderLeafletFleetPayload(fleetPayload); }); } }
function renderFleetPayload(payload) {
  if (!fleetOperationsMap || !fleetOperationsMap._optimusLoaded || !document.querySelector("#fleet-map")) return;
  const map = fleetOperationsMap; const target = document.querySelector("#fleet-map"); target.querySelector(".map-empty")?.remove(); map.resize(); ensureFleetRouteLayer(map);
  const filter = getFleetFilter(); const filterChanged = map._optimusFleetFilter !== filter; map._optimusFleetFilter = filter;
  const driverPoints = (payload?.drivers || []).map(finitePoint).filter(Boolean); const customerPoints = (payload?.customers || []).map(finitePoint).filter(Boolean);
  const drivers = filter === "customers" ? [] : driverPoints; const customers = filter === "drivers" ? [] : customerPoints;
  syncFleetMarkers(drivers, fleetDriverMarkers, "driver"); syncFleetMarkers(customers, fleetCustomerMarkers, "customer");
  const visiblePoints = [...drivers, ...customers]; fitFleetPoints(map, visiblePoints, filterChanged); if (!visiblePoints.length) mapError(target, "لا توجد مواقع GPS حديثة ضمن التصفية الحالية.");
  bindFleetSummaryActions(drivers, fleetDriverMarkers, map, showFleetRoute); window.requestAnimationFrame(() => map.resize());
}
function renderLeafletFleetPayload(payload) {
  if (!leafletFleetMap || !document.querySelector("#fleet-map")) return;
  const map = leafletFleetMap; const target = document.querySelector("#fleet-map"); target.querySelector(".map-empty")?.remove(); map.invalidateSize();
  const filter = getFleetFilter(); const filterChanged = map._optimusFleetFilter !== filter; map._optimusFleetFilter = filter;
  const driverPoints = (payload?.drivers || []).map(finitePoint).filter(Boolean); const customerPoints = (payload?.customers || []).map(finitePoint).filter(Boolean);
  const drivers = filter === "customers" ? [] : driverPoints; const customers = filter === "drivers" ? [] : customerPoints;
  syncLeafletFleetMarkers(drivers, leafletFleetDriverMarkers, "driver"); syncLeafletFleetMarkers(customers, leafletFleetCustomerMarkers, "customer");
  const visiblePoints = [...drivers, ...customers]; fitLeafletFleetPoints(map, visiblePoints, filterChanged); if (!visiblePoints.length) mapError(target, "لا توجد مواقع GPS حديثة ضمن التصفية الحالية.");
  bindFleetSummaryActions(drivers, leafletFleetDriverMarkers, map, showLeafletFleetRoute); window.setTimeout(() => map.invalidateSize(), 80);
}
function bindFleetSummaryActions(drivers, markers, map, showRoute) { document.querySelectorAll("[data-fleet-driver]").forEach((item) => { if (item.dataset.fleetBound === "true") return; item.dataset.fleetBound = "true"; item.addEventListener("click", () => { const marker = markers.get(item.dataset.fleetDriver); if (!marker) return; const point = drivers.find((driver) => String(driver.id) === item.dataset.fleetDriver); if (!point) return; showRoute(point); const position = marker.getLatLng ? marker.getLatLng() : marker.getLngLat(); if (marker.openPopup) marker.openPopup(); if (map.setView) map.setView([position.lat, position.lng], Math.max(map.getZoom(), 15), { animate: true }); else map.flyTo({ center: position, zoom: Math.max(map.getZoom(), 15), duration: 450 }); }); }); }
function destroyVectorFleetMap() { if (fleetOperationsMap) { try { fleetOperationsMap.remove(); } catch {} } fleetOperationsMap = null; fleetMapTarget = null; clearMarkerStore(fleetDriverMarkers); clearMarkerStore(fleetCustomerMarkers); clearFleetStops(); fleetDriverMarkers = new Map(); fleetCustomerMarkers = new Map(); fleetRouteSourceReady = false; }
function destroyLeafletFleetMap() { if (leafletFleetMap) { try { leafletFleetMap.remove(); } catch {} } leafletFleetMap = null; leafletFleetTarget = null; clearMarkerStore(leafletFleetDriverMarkers); clearMarkerStore(leafletFleetCustomerMarkers); clearLeafletFleetRoute(); leafletFleetDriverMarkers = new Map(); leafletFleetCustomerMarkers = new Map(); }
function installLeafletFleetMap(payload) {
  const target = document.querySelector("#fleet-map"); if (!target) return;
  destroyVectorFleetMap();
  if (!leafletReady()) { mapError(target, "تعذر تحميل محرك الخريطة. حدّث الصفحة ثم أعد المحاولة."); return; }
  if (!leafletFleetMap || leafletFleetTarget !== target) { destroyLeafletFleetMap(); leafletFleetTarget = target; target.innerHTML = ""; leafletFleetMap = createAdminLeafletMap(target, () => renderLeafletFleetPayload(fleetPayload)); }
  else renderLeafletFleetPayload(payload);
  bindFleetFilter();
}
window.installFleetOperationsMap = function installFleetOperationsMap(payload) {
  const target = document.querySelector("#fleet-map"); if (!target) { if (!adminView.hidden && state.currentView === "fleet") window.setTimeout(() => window.installFleetOperationsMap(payload), 150); return; }
  fleetPayload = payload;
  if (!maplibreSupported()) { installLeafletFleetMap(payload); return; }
  destroyLeafletFleetMap();
  if (!fleetOperationsMap || fleetMapTarget !== target) { destroyVectorFleetMap(); fleetMapTarget = target; target.innerHTML = ""; fleetOperationsMap = createAdminMap(target, () => renderFleetPayload(fleetPayload), () => { destroyVectorFleetMap(); installLeafletFleetMap(fleetPayload); }); }
  else if (fleetOperationsMap._optimusLoaded) renderFleetPayload(payload);
  bindFleetFilter();
};
window.refreshFleetOperationsMap = async function refreshFleetOperationsMap() { if (fleetRefreshInFlight || state.currentView !== "fleet") return; fleetRefreshInFlight = true; try { const payload = await api("/admin/api/fleet-map"); if (state.currentView === "fleet" && document.querySelector("#fleet-map")) window.installFleetOperationsMap(payload); } catch (error) { if (error?.status === 401 || error?.status === 403) handleApiError(error); } finally { fleetRefreshInFlight = false; } };

function syncPlacesMarkers(places) { const visible = new Set(); places.forEach((place) => { const point = finitePoint(place); if (!point) return; const id = String(place.id); visible.add(id); const position = [point.longitude, point.latitude]; const existing = placesSavedMarkers.get(id); if (existing) { existing.setLngLat(position); return; } const element = makeMarkerElement("place-map-marker", "<span>⌖</span>"); const marker = new window.maplibregl.Marker({ element, anchor: "bottom" }).setLngLat(position).setPopup(mapPopup(`<div class="map-driver-popup"><strong>${fleetEscape(place.name)}</strong><span>${point.latitude.toFixed(6)}, ${point.longitude.toFixed(6)}</span></div>`)).addTo(placesMap); placesSavedMarkers.set(id, marker); }); for (const [id, marker] of placesSavedMarkers.entries()) if (!visible.has(id)) { marker.remove(); placesSavedMarkers.delete(id); } }
function syncLeafletPlacesMarkers(places) { const visible = new Set(); places.forEach((place) => { const point = finitePoint(place); if (!point) return; const id = String(place.id); visible.add(id); const position = [point.latitude, point.longitude]; const existing = leafletPlacesSavedMarkers.get(id); if (existing) { existing.setLatLng(position); return; } const marker = window.L.marker(position, { icon: leafIcon("place-map-marker", "<span>⌖</span>", [38, 44], [19, 44]) }).bindPopup(leafPopup(`<div class="map-driver-popup"><strong>${fleetEscape(place.name)}</strong><span>${point.latitude.toFixed(6)}, ${point.longitude.toFixed(6)}</span></div>`)).addTo(leafletPlacesMap); leafletPlacesSavedMarkers.set(id, marker); }); for (const [id, marker] of leafletPlacesSavedMarkers.entries()) if (!visible.has(id)) { marker.remove(); leafletPlacesSavedMarkers.delete(id); } }
function bindPlacesClick(map, isLeaflet, latitudeInput, longitudeInput) { map.on("click", (event) => { const lat = isLeaflet ? event.latlng.lat : event.lngLat.lat; const lng = isLeaflet ? event.latlng.lng : event.lngLat.lng; if (!latitudeInput || !longitudeInput) return; latitudeInput.value = Number(lat).toFixed(6); longitudeInput.value = Number(lng).toFixed(6); if (isLeaflet) { if (!leafletPlacesMarker) leafletPlacesMarker = window.L.marker([lat, lng], { icon: leafIcon("place-map-marker draft", "<span>⌖</span>", [38, 44], [19, 44]) }).addTo(leafletPlacesMap); leafletPlacesMarker.setLatLng([lat, lng]); } else { if (!placesMarker) placesMarker = new window.maplibregl.Marker({ element: makeMarkerElement("place-map-marker draft", "<span>⌖</span>"), anchor: "bottom" }).addTo(placesMap); placesMarker.setLngLat([lng, lat]); } }); }
function installLeafletPlacesMap(places, latitudeInput, longitudeInput) { const target = document.querySelector("#places-map"); if (!target || !leafletReady()) { if (target) mapError(target, "تعذر تحميل محرك الخريطة. حدّث الصفحة ثم أعد المحاولة."); return; } destroyVectorPlacesMap(); if (!leafletPlacesMap || leafletPlacesTarget !== target) { destroyLeafletPlacesMap(); leafletPlacesTarget = target; target.innerHTML = ""; leafletPlacesMap = createAdminLeafletMap(target, () => { bindPlacesClick(leafletPlacesMap, true, latitudeInput, longitudeInput); syncLeafletPlacesMarkers(places); }); } else { leafletPlacesMap.invalidateSize(); syncLeafletPlacesMarkers(places); } }
function destroyVectorPlacesMap() { if (placesMap) { try { placesMap.remove(); } catch {} } placesMap = null; placesMapTarget = null; placesMarker = null; placesSavedMarkers = new Map(); }
function destroyLeafletPlacesMap() { if (leafletPlacesMap) { try { leafletPlacesMap.remove(); } catch {} } leafletPlacesMap = null; leafletPlacesTarget = null; leafletPlacesMarker = null; leafletPlacesSavedMarkers = new Map(); }
window.installPlacesMap = function installPlacesMap(places = []) { const target = document.querySelector("#places-map"); if (!target) return; const latitudeInput = document.querySelector("#place-latitude"); const longitudeInput = document.querySelector("#place-longitude"); if (!maplibreSupported()) { installLeafletPlacesMap(places, latitudeInput, longitudeInput); return; } destroyLeafletPlacesMap(); if (!maplibreReady(target)) { mapError(target, "تعذر تحميل مكتبة MapLibre. حدّث الصفحة ثم أعد المحاولة."); return; } if (!placesMap || placesMapTarget !== target) { destroyVectorPlacesMap(); placesMapTarget = target; target.innerHTML = ""; placesMap = createAdminMap(target, () => { bindPlacesClick(placesMap, false, latitudeInput, longitudeInput); syncPlacesMarkers(places); }, () => { destroyVectorPlacesMap(); installLeafletPlacesMap(places, latitudeInput, longitudeInput); }); } else if (placesMap._optimusLoaded) { placesMap.resize(); syncPlacesMarkers(places); } };

document.querySelector("#login-form").addEventListener("submit", async (event) => { event.preventDefault(); event.stopImmediatePropagation(); const button = document.querySelector("#login-button"); const errorBox = document.querySelector("#login-error"); button.disabled = true; button.textContent = "جارٍ التحقق…"; errorBox.hidden = true; try { const result = await api("/admin/api/login", { method: "POST", body: JSON.stringify({ password: document.querySelector("#password").value }) }); state.user = result.user; await openAdmin(); } catch (error) { errorBox.textContent = error.status === 503 ? "إعداد كلمة مرور الموقع غير مكتمل. أعد المحاولة بعد التحديث." : error.status === 429 ? "تم إيقاف المحاولة مؤقتاً للحماية. حاول لاحقاً." : "كلمة المرور غير صحيحة. تحقق منها ثم أعد المحاولة."; errorBox.hidden = false; } finally { button.disabled = false; button.textContent = "فتح الموقع"; } }, true);
setInterval(() => { if (!adminView.hidden) refreshDashboard(); }, 10000);
