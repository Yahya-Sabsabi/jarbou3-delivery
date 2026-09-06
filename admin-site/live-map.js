let liveDriverMap = null;
let overviewMarkerLayers = null;

function installDriverMap(payload) {
  const target = document.querySelector("#overview-fleet-map");
  if (!target) return;
  if (!window.L) { const attempts = Number(target.dataset.leafletAttempts || "0"); if (attempts >= 40) { target.innerHTML = "<p class=\"map-empty\">تعذر تحميل مكتبة الخريطة. تحقق من الاتصال ثم حدّث الصفحة.</p>"; delete target.dataset.leafletAttempts; return; } target.dataset.leafletAttempts = String(attempts + 1); window.setTimeout(() => installDriverMap(payload), 120); return; } delete target.dataset.leafletAttempts;
  const sourceDrivers = Array.isArray(payload) ? payload : payload?.drivers || [];
  const sourceCustomers = Array.isArray(payload) ? [] : payload?.customers || [];
  const drivers = sourceDrivers.map((driver) => ({ ...driver, latitude: Number(driver.latitude ?? driver.last_location_lat), longitude: Number(driver.longitude ?? driver.last_location_lng) })).filter((driver) => Number.isFinite(driver.latitude) && Number.isFinite(driver.longitude));
  const customers = sourceCustomers.map((customer) => ({ ...customer, latitude: Number(customer.latitude ?? customer.last_location_lat), longitude: Number(customer.longitude ?? customer.last_location_lng) })).filter((customer) => Number.isFinite(customer.latitude) && Number.isFinite(customer.longitude));
  const existingContainer = liveDriverMap?.getContainer?.();
  const isNewMap = !liveDriverMap || !existingContainer || existingContainer !== target;
  if (isNewMap) {
    if (liveDriverMap) liveDriverMap.remove();
    target.innerHTML = "";
    liveDriverMap = window.L.map(target, { zoomControl: true }).setView([35.1319, 36.7547], 12);
    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(liveDriverMap);
    overviewMarkerLayers = window.L.layerGroup().addTo(liveDriverMap);
  } else {
    liveDriverMap.invalidateSize();
    overviewMarkerLayers?.clearLayers();
    target.querySelector(".map-empty")?.remove();
  }
  const map = liveDriverMap;
  drivers.forEach((driver) => {
    const initial = fleetEscape(String(driver.name || "س").slice(0, 1));
    const marker = window.L.marker([driver.latitude, driver.longitude], { icon: window.L.divIcon({ className: "driver-map-marker", html: `<span class="driver-marker-dot">${initial}</span>`, iconSize: [34, 34], iconAnchor: [17, 17] }) }).addTo(overviewMarkerLayers);
    marker.bindPopup(`<div class="driver-map-popup"><strong>${fleetEscape(driver.name || "سفير جربوع")}</strong><span>سفير</span><span>${driver.last_location_at ? `آخر تحديث: ${new Date(driver.last_location_at).toLocaleString("ar-SY")}` : "لا يوجد وقت تحديث"}</span></div>`);
  });
  customers.forEach((customer) => {
    const marker = window.L.marker([customer.latitude, customer.longitude], { icon: window.L.divIcon({ className: "customer-map-marker", html: "<span class=\"customer-marker-dot\"><b>ع</b></span>", iconSize: [30, 30], iconAnchor: [15, 15] }) }).addTo(overviewMarkerLayers);
    marker.bindPopup(`<div class="driver-map-popup"><strong>${fleetEscape(customer.name || "عميل")}</strong><span>عميل</span><span>${customer.last_location_at ? `آخر تحديث: ${new Date(customer.last_location_at).toLocaleString("ar-SY")}` : "لا يوجد وقت تحديث"}</span></div>`);
  });
  const visiblePoints = [...drivers, ...customers];
  if (visiblePoints.length === 1) map.setView([visiblePoints[0].latitude, visiblePoints[0].longitude], 14);
  if (visiblePoints.length > 1) map.fitBounds(visiblePoints.map((point) => [point.latitude, point.longitude]), { padding: [30, 30], maxZoom: 14 });
  if (!visiblePoints.length) target.insertAdjacentHTML("beforeend", "<p class=\"map-empty\">الخريطة تعمل، ولا توجد مواقع GPS حديثة مسجلة بعد.</p>");
  window.setTimeout(() => map.invalidateSize(), 0);
}

window.refreshOverviewMap = installDriverMap;

let fleetOperationsMap = null;
let fleetRouteLayers = null;
let fleetMarkerLayers = null;
let fleetRefreshInFlight = false;

function fleetEscape(value) { return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[char])); }
function fleetMoney(value) { return `${new Intl.NumberFormat("ar-SY").format(Number(value || 0))} ل.س`; }
function fleetMinutes(order) { if (!order?.startedAt) return "لم يبدأ عداد الوقت بعد"; const seconds = Math.max(0, Math.floor((Date.now() - new Date(order.startedAt).getTime()) / 1000)); return `${Math.max(1, Math.floor(seconds / 60))} دقيقة منذ قبول المهمة`; }

window.installFleetOperationsMap = function installFleetOperationsMap(payload) {
  const target = document.querySelector("#fleet-map");
  if (!target) return;
  if (!window.L) {
    const attempts = Number(target.dataset.leafletAttempts || "0");
    if (attempts >= 40) { target.innerHTML = "<p class=\"map-empty\">تعذر تحميل مكتبة الخريطة. تحقق من الاتصال ثم حدّث الصفحة.</p>"; delete target.dataset.leafletAttempts; return; }
    target.dataset.leafletAttempts = String(attempts + 1);
    window.setTimeout(() => window.installFleetOperationsMap(payload), 120);
    return;
  }
  delete target.dataset.leafletAttempts;
  const existingContainer = fleetOperationsMap?.getContainer?.();
  const isNewMap = !fleetOperationsMap || !existingContainer || existingContainer !== target || !target.querySelector(".leaflet-container");
  if (isNewMap) {
    if (fleetOperationsMap) fleetOperationsMap.remove();
    target.innerHTML = "";
    fleetOperationsMap = window.L.map(target, { zoomControl:true }).setView([35.1319, 36.7547], 12);
    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom:19, attribution:"© OpenStreetMap" }).addTo(fleetOperationsMap);
    fleetRouteLayers = window.L.layerGroup().addTo(fleetOperationsMap);
    fleetMarkerLayers = window.L.layerGroup().addTo(fleetOperationsMap);
  } else {
    fleetOperationsMap.invalidateSize();
    fleetRouteLayers?.clearLayers();
    fleetMarkerLayers?.clearLayers();
  }
  const map = fleetOperationsMap;
  target.querySelector(".map-empty")?.remove();
  const mapFilter = document.querySelector("#fleet-map-filter")?.value || "all";
  const filterChanged = map._jarbou3Filter !== mapFilter;
  map._jarbou3Filter = mapFilter;
  const driverPoints = (payload?.drivers || []).filter((driver) => Number.isFinite(Number(driver.latitude)) && Number.isFinite(Number(driver.longitude)));
  const customerPoints = (payload?.customers || []).filter((customer) => Number.isFinite(Number(customer.latitude)) && Number.isFinite(Number(customer.longitude)));
  const drivers = mapFilter === "customers" ? [] : driverPoints;
  const customers = mapFilter === "drivers" ? [] : customerPoints;
  const markerById = new Map();
  const filterControl = document.querySelector("#fleet-map-filter");
  if (filterControl && !filterControl.dataset.bound) { filterControl.dataset.bound = "true"; filterControl.addEventListener("change", () => window.installFleetOperationsMap(payload)); }

  function clearRoute() { fleetRouteLayers.clearLayers(); }
  function showRoute(driver) {
    clearRoute();
    const order = driver.activeOrder;
    if (!order) return;
    const route = (order.route || []).map((point) => [Number(point.latitude), Number(point.longitude)]).filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]));
    const currentPoint = [Number(driver.latitude), Number(driver.longitude)];
    if (!route.length || route[route.length - 1][0] !== currentPoint[0] || route[route.length - 1][1] !== currentPoint[1]) route.push(currentPoint);
    if (route.length > 1) window.L.polyline(route, { color:"#2f7a62", weight:5, opacity:.88 }).addTo(fleetRouteLayers);
    const sourceIcon = window.L.divIcon({ className:"map-stop-label", html:"<span>استلام</span>", iconSize:[52,22], iconAnchor:[26,11] });
    const destinationIcon = window.L.divIcon({ className:"map-stop-label", html:"<span>وجهة</span>", iconSize:[52,22], iconAnchor:[26,11] });
    const sourcePoint = [Number(order.source?.latitude), Number(order.source?.longitude)];
    const destinationPoint = [Number(order.destination?.latitude), Number(order.destination?.longitude)];
    if (sourcePoint.every(Number.isFinite)) window.L.marker(sourcePoint, { icon:sourceIcon }).addTo(fleetRouteLayers);
    if (destinationPoint.every(Number.isFinite)) window.L.marker(destinationPoint, { icon:destinationIcon }).addTo(fleetRouteLayers);
  }

  drivers.forEach((driver) => {
    const initial = fleetEscape(String(driver.name || "س").slice(0, 1));
    const order = driver.activeOrder;
    const detail = order ? `<b>مهمة نشطة</b><span>${fleetEscape(order.sourceAddress)} ← ${fleetEscape(order.destinationAddress)}</span><span>الوقت: ${fleetEscape(fleetMinutes(order))}</span><span>المسافة الفعلية: ${(Number(order.actualDistanceM || 0) / 1000).toFixed(1)} كم</span><span>تكلفة الرحلة التقديرية: ${fleetMoney(order.estimatedPrice)}</span>` : `<span>${driver.lastLocationAt ? `آخر تحديث: ${new Date(driver.lastLocationAt).toLocaleString("ar-SY")}` : "لا يوجد وقت تحديث"}</span><span>لا توجد مهمة نشطة حالياً.</span>`;
    const marker = window.L.marker([Number(driver.latitude), Number(driver.longitude)], { icon: window.L.divIcon({ className:"driver-map-marker", html:`<span class="driver-marker-dot">${initial}</span>`, iconSize:[34,34], iconAnchor:[17,17] }) }).addTo(fleetMarkerLayers);
    marker.bindPopup(`<div class="map-driver-popup"><strong>${fleetEscape(driver.name || "سفير جربوع")}</strong>${detail}</div>`);
    marker.on("click", () => showRoute(driver));
    markerById.set(String(driver.id), marker);
  });
  customers.forEach((customer) => {
    const marker = window.L.marker([Number(customer.latitude), Number(customer.longitude)], { icon: window.L.divIcon({ className:"customer-map-marker", html:"<span class=\"customer-marker-dot\"><b>ع</b></span>", iconSize:[30,30], iconAnchor:[15,15] }) }).addTo(fleetMarkerLayers);
    marker.bindPopup(`<div class="map-driver-popup"><strong>${fleetEscape(customer.name || "عميل")}</strong><span>عميل</span>${customer.lastLocationAt ? `<span>آخر تحديث: ${new Date(customer.lastLocationAt).toLocaleString("ar-SY")}</span>` : ""}</div>`);
  });
  document.querySelectorAll("[data-fleet-driver]").forEach((item) => { if (item.dataset.fleetBound === "true") return; item.dataset.fleetBound = "true"; item.addEventListener("click", () => { const marker = markerById.get(item.dataset.fleetDriver); if (!marker) return; map.setView(marker.getLatLng(), Math.max(map.getZoom(), 15)); marker.openPopup(); marker.fire("click"); }); });
  const visiblePoints = [...drivers, ...customers];
  if (filterChanged && visiblePoints.length === 1) map.setView([Number(visiblePoints[0].latitude), Number(visiblePoints[0].longitude)], 14);
  if (filterChanged && visiblePoints.length > 1) map.fitBounds(visiblePoints.map((point) => [Number(point.latitude), Number(point.longitude)]), { padding:[32,32], maxZoom:14 });
  if (!visiblePoints.length) target.insertAdjacentHTML("beforeend", "<p class=\"map-empty\">لا توجد مواقع GPS حديثة ضمن التصفية الحالية.</p>");
  window.setTimeout(() => map.invalidateSize(), 0);
};

window.refreshFleetOperationsMap = async function refreshFleetOperationsMap() {
  if (fleetRefreshInFlight || state.currentView !== "fleet") return;
  fleetRefreshInFlight = true;
  try {
    const payload = await api("/admin/api/fleet-map");
    if (state.currentView === "fleet" && document.querySelector("#fleet-map")) window.installFleetOperationsMap(payload);
  } catch (error) {
    if (error?.status === 401 || error?.status === 403) handleApiError(error);
  } finally {
    fleetRefreshInFlight = false;
  }
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

setInterval(() => {
  if (!adminView.hidden) refreshDashboard();
}, 10000);
