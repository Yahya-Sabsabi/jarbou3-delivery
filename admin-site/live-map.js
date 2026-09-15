const ADMIN_LIBERTY_STYLE = "https://tiles.openfreemap.org/styles/liberty";
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
let placesMap = null;
let placesMapTarget = null;
let placesMarker = null;
let placesSavedMarkers = new Map();

function fleetEscape(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}
function fleetMoney(value) { return `${new Intl.NumberFormat("ar-SY").format(Number(value || 0))} ل.س`; }
function fleetMinutes(order) { if (!order?.startedAt) return "لم يبدأ عداد الوقت بعد"; const seconds = Math.max(0, Math.floor((Date.now() - new Date(order.startedAt).getTime()) / 1000)); return `${Math.max(1, Math.floor(seconds / 60))} دقيقة منذ قبول المهمة`; }
function finitePoint(point) { const latitude = Number(point?.latitude ?? point?.last_location_lat ?? point?.lastLocationLat); const longitude = Number(point?.longitude ?? point?.last_location_lng ?? point?.lastLocationLng); return Number.isFinite(latitude) && Number.isFinite(longitude) ? { ...point, latitude, longitude } : null; }
function maplibreReady(target) { return target && window.maplibregl && typeof window.maplibregl.Map === "function"; }
function mapError(target, text = "تعذر تحميل الخريطة. تحقق من الاتصال ثم أعد المحاولة.") { if (!target || target.querySelector(".map-empty")) return; target.insertAdjacentHTML("beforeend", `<p class="map-empty">${text}</p>`); }
function makeMarkerElement(className, content) { const element = document.createElement("div"); element.className = className; element.innerHTML = content; return element; }
function mapPopup(html) { return new window.maplibregl.Popup({ closeButton: true, closeOnClick: true, offset: 18, maxWidth: "320px" }).setHTML(html); }

function createAdminMap(target, onLoad) {
  if (!maplibreReady(target)) return null;
  const map = new window.maplibregl.Map({
    container: target,
    style: ADMIN_LIBERTY_STYLE,
    center: ADMIN_HAMA_CENTER,
    zoom: 12,
    minZoom: 11,
    maxZoom: 19,
    maxBounds: ADMIN_HAMA_BOUNDS,
    attributionControl: true,
    dragRotate: false,
    touchPitch: false,
    doubleClickZoom: true,
  });
  map.addControl(new window.maplibregl.NavigationControl({ showCompass: true }), "top-right");
  map.addControl(new window.maplibregl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: true,
    showUserHeading: true,
  }), "top-right");
  map.once("load", () => { map._optimusLoaded = true; map.resize(); onLoad?.(map); });
  map.on("error", () => mapError(target));
  return map;
}

function clearMarkerStore(store) { for (const marker of store.values()) marker.remove(); store.clear(); }
function clearFleetStops() { fleetStopMarkers.forEach((marker) => marker.remove()); fleetStopMarkers = []; }
function clearFleetRoute() {
  if (fleetOperationsMap?.getSource("fleet-route")) fleetOperationsMap.getSource("fleet-route").setData({ type: "FeatureCollection", features: [] });
  clearFleetStops();
}
function ensureFleetRouteLayer(map) {
  if (!map.getSource("fleet-route")) {
    map.addSource("fleet-route", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  }
  if (!map.getLayer("fleet-route-line")) {
    map.addLayer({ id: "fleet-route-line", type: "line", source: "fleet-route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#24755E", "line-width": 5, "line-opacity": 0.9 } });
  }
  fleetRouteSourceReady = true;
}
function showFleetRoute(driver) {
  if (!fleetOperationsMap || !fleetRouteSourceReady) return;
  clearFleetRoute();
  const order = driver.activeOrder;
  if (!order) return;
  const route = (order.route || []).map((point) => [Number(point.longitude), Number(point.latitude)]).filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]));
  const current = [Number(driver.longitude), Number(driver.latitude)];
  if (Number.isFinite(current[0]) && Number.isFinite(current[1]) && (!route.length || route[route.length - 1][0] !== current[0] || route[route.length - 1][1] !== current[1])) route.push(current);
  if (route.length > 1) fleetOperationsMap.getSource("fleet-route").setData({ type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "LineString", coordinates: route }, properties: {} }] });
  const source = [Number(order.source?.longitude), Number(order.source?.latitude)];
  const destination = [Number(order.destination?.longitude), Number(order.destination?.latitude)];
  [[source, "استلام", "map-stop-label source"], [destination, "وجهة", "map-stop-label destination"]].forEach(([point, label, className]) => {
    if (!Array.isArray(point) || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) return;
    const marker = new window.maplibregl.Marker({ element: makeMarkerElement(className, `<span>${label}</span>`), anchor: "center" }).setLngLat(point).addTo(fleetOperationsMap);
    fleetStopMarkers.push(marker);
  });
}
function driverPopup(driver) {
  const order = driver.activeOrder;
  const detail = order ? `<b>مهمة نشطة</b><span>${fleetEscape(order.sourceAddress)} ← ${fleetEscape(order.destinationAddress)}</span><span>الوقت: ${fleetEscape(fleetMinutes(order))}</span><span>المسافة الفعلية: ${(Number(order.actualDistanceM || 0) / 1000).toFixed(1)} كم</span><span>تكلفة الرحلة التقديرية: ${fleetMoney(order.estimatedPrice)}</span>` : `<span>${driver.lastLocationAt ? `آخر تحديث: ${new Date(driver.lastLocationAt).toLocaleString("ar-SY")}` : "لا يوجد وقت تحديث"}</span><span>لا توجد مهمة نشطة حالياً.</span>`;
  return `<div class="map-driver-popup"><strong>${fleetEscape(driver.name || "سفير جربوع")}</strong>${detail}</div>`;
}
function customerPopup(customer) { return `<div class="map-driver-popup"><strong>${fleetEscape(customer.name || "عميل")}</strong><span>عميل</span>${customer.lastLocationAt ? `<span>آخر تحديث: ${new Date(customer.lastLocationAt).toLocaleString("ar-SY")}</span>` : ""}</div>`; }
function syncFleetMarker(store, point, kind, popupHtml) {
  const id = String(point.id);
  const position = [point.longitude, point.latitude];
  const existing = store.get(id);
  if (existing) { existing.setLngLat(position); existing.setPopup(mapPopup(popupHtml)); return existing; }
  const initial = fleetEscape(String(point.name || (kind === "driver" ? "س" : "ع")).slice(0, 1));
  const element = kind === "driver" ? makeMarkerElement("driver-map-marker", `<span class="driver-marker-dot">${initial}</span>`) : makeMarkerElement("customer-map-marker", `<span class="customer-marker-dot"><b>ع</b></span>`);
  const marker = new window.maplibregl.Marker({ element, anchor: "center" }).setLngLat(position).setPopup(mapPopup(popupHtml)).addTo(fleetOperationsMap);
  if (kind === "driver") marker.getElement().addEventListener("click", () => showFleetRoute(point));
  store.set(id, marker);
  return marker;
}
function syncFleetMarkers(points, store, kind) {
  const visible = new Set();
  points.forEach((point) => { visible.add(String(point.id)); syncFleetMarker(store, point, kind, kind === "driver" ? driverPopup(point) : customerPopup(point)); });
  for (const [id, marker] of store.entries()) if (!visible.has(id)) { marker.remove(); store.delete(id); }
}
function fitFleetPoints(map, points, filterChanged) {
  if (!filterChanged || !points.length) return;
  if (points.length === 1) { map.flyTo({ center: [points[0].longitude, points[0].latitude], zoom: 14, duration: 450 }); return; }
  const bounds = points.reduce((box, point) => box.extend([point.longitude, point.latitude]), new window.maplibregl.LngLatBounds([points[0].longitude, points[0].latitude], [points[0].longitude, points[0].latitude]));
  map.fitBounds(bounds, { padding: 38, maxZoom: 14, duration: 450 });
}
function renderFleetPayload(payload) {
  if (!fleetOperationsMap || !fleetOperationsMap._optimusLoaded || !document.querySelector("#fleet-map")) return;
  const map = fleetOperationsMap;
  const target = document.querySelector("#fleet-map");
  target.querySelector(".map-empty")?.remove();
  map.resize();
  ensureFleetRouteLayer(map);
  const filter = document.querySelector("#fleet-map-filter")?.value || "all";
  const filterChanged = map._optimusFleetFilter !== filter;
  map._optimusFleetFilter = filter;
  const driverPoints = (payload?.drivers || []).map(finitePoint).filter(Boolean);
  const customerPoints = (payload?.customers || []).map(finitePoint).filter(Boolean);
  const drivers = filter === "customers" ? [] : driverPoints;
  const customers = filter === "drivers" ? [] : customerPoints;
  syncFleetMarkers(drivers, fleetDriverMarkers, "driver");
  syncFleetMarkers(customers, fleetCustomerMarkers, "customer");
  const visiblePoints = [...drivers, ...customers];
  fitFleetPoints(map, visiblePoints, filterChanged);
  if (!visiblePoints.length) mapError(target, "لا توجد مواقع GPS حديثة ضمن التصفية الحالية.");
  document.querySelectorAll("[data-fleet-driver]").forEach((item) => { if (item.dataset.fleetBound === "true") return; item.dataset.fleetBound = "true"; item.addEventListener("click", () => { const marker = fleetDriverMarkers.get(item.dataset.fleetDriver); if (!marker) return; const point = drivers.find((driver) => String(driver.id) === item.dataset.fleetDriver); if (point) showFleetRoute(point); map.flyTo({ center: marker.getLngLat(), zoom: Math.max(map.getZoom(), 15), duration: 450 }); marker.togglePopup(); }); });
  window.requestAnimationFrame(() => map.resize());
}
window.installFleetOperationsMap = function installFleetOperationsMap(payload) {
  const target = document.querySelector("#fleet-map");
  if (!target) { if (!adminView.hidden && state.currentView === "fleet") window.setTimeout(() => window.installFleetOperationsMap(payload), 150); return; }
  fleetPayload = payload;
  if (!maplibreReady(target)) { mapError(target, "تعذر تحميل مكتبة MapLibre. حدّث الصفحة ثم حاول مرة أخرى."); return; }
  if (!fleetOperationsMap || fleetMapTarget !== target) {
    if (fleetOperationsMap) fleetOperationsMap.remove();
    clearMarkerStore(fleetDriverMarkers); clearMarkerStore(fleetCustomerMarkers); clearFleetStops();
    fleetDriverMarkers = new Map(); fleetCustomerMarkers = new Map(); fleetRouteSourceReady = false;
    fleetMapTarget = target;
    target.innerHTML = "";
    fleetOperationsMap = createAdminMap(target, () => renderFleetPayload(fleetPayload));
  } else if (fleetOperationsMap._optimusLoaded) renderFleetPayload(payload);
  const filterControl = document.querySelector("#fleet-map-filter");
  if (filterControl && filterControl.dataset.bound !== "true") { filterControl.dataset.bound = "true"; filterControl.addEventListener("change", () => renderFleetPayload(fleetPayload)); }
};
window.refreshFleetOperationsMap = async function refreshFleetOperationsMap() {
  if (fleetRefreshInFlight || state.currentView !== "fleet") return;
  fleetRefreshInFlight = true;
  try { const payload = await api("/admin/api/fleet-map"); if (state.currentView === "fleet" && document.querySelector("#fleet-map")) window.installFleetOperationsMap(payload); } catch (error) { if (error?.status === 401 || error?.status === 403) handleApiError(error); } finally { fleetRefreshInFlight = false; }
};

function syncPlacesMarkers(places) {
  const visible = new Set();
  places.forEach((place) => {
    const point = finitePoint(place); if (!point) return;
    const id = String(place.id); visible.add(id); const position = [point.longitude, point.latitude]; const existing = placesSavedMarkers.get(id);
    if (existing) { existing.setLngLat(position); return; }
    const element = makeMarkerElement("place-map-marker", "<span>⌖</span>");
    const marker = new window.maplibregl.Marker({ element, anchor: "bottom" }).setLngLat(position).setPopup(mapPopup(`<div class="map-driver-popup"><strong>${fleetEscape(place.name)}</strong><span>${point.latitude.toFixed(6)}, ${point.longitude.toFixed(6)}</span></div>`)).addTo(placesMap);
    placesSavedMarkers.set(id, marker);
  });
  for (const [id, marker] of placesSavedMarkers.entries()) if (!visible.has(id)) { marker.remove(); placesSavedMarkers.delete(id); }
}
window.installPlacesMap = function installPlacesMap(places = []) {
  const target = document.querySelector("#places-map");
  if (!target) return;
  if (!maplibreReady(target)) { mapError(target, "تعذر تحميل مكتبة MapLibre. حدّث الصفحة ثم حاول مرة أخرى."); return; }
  const latitudeInput = document.querySelector("#place-latitude");
  const longitudeInput = document.querySelector("#place-longitude");
  if (!placesMap || placesMapTarget !== target) {
    if (placesMap) placesMap.remove();
    placesMap = null; placesMarker = null; placesSavedMarkers = new Map(); placesMapTarget = target; target.innerHTML = "";
    placesMap = createAdminMap(target, () => syncPlacesMarkers(places));
    placesMap.once("load", () => {
      placesMap.on("click", (event) => { if (!latitudeInput || !longitudeInput) return; latitudeInput.value = Number(event.lngLat.lat).toFixed(6); longitudeInput.value = Number(event.lngLat.lng).toFixed(6); if (!placesMarker) placesMarker = new window.maplibregl.Marker({ element: makeMarkerElement("place-map-marker draft", "<span>⌖</span>"), anchor: "bottom" }).addTo(placesMap); placesMarker.setLngLat([event.lngLat.lng, event.lngLat.lat]); });
      syncPlacesMarkers(places);
    });
  } else if (placesMap._optimusLoaded) { placesMap.resize(); syncPlacesMarkers(places); }
};

document.querySelector("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  event.stopImmediatePropagation();
  const button = document.querySelector("#login-button");
  const errorBox = document.querySelector("#login-error");
  button.disabled = true;
  button.textContent = "جارٍ التحقق…";
  errorBox.hidden = true;
  try {
    const result = await api("/admin/api/login", { method: "POST", body: JSON.stringify({ password: document.querySelector("#password").value }) });
    state.user = result.user;
    await openAdmin();
  } catch (error) {
    errorBox.textContent = error.status === 503 ? "إعداد كلمة مرور الموقع غير مكتمل. أعد المحاولة بعد التحديث." : error.status === 429 ? "تم إيقاف المحاولة مؤقتاً للحماية. حاول لاحقاً." : "كلمة المرور غير صحيحة. تحقق منها ثم أعد المحاولة.";
    errorBox.hidden = false;
  } finally {
    button.disabled = false;
    button.textContent = "فتح الموقع";
  }
}, true);

setInterval(() => { if (!adminView.hidden) refreshDashboard(); }, 10000);
