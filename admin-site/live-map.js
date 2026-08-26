let liveDriverMap = null;

function installDriverMap(drivers) {
  const target = document.querySelector(".map-panel");
  if (!target || !window.L) return;
  if (liveDriverMap) liveDriverMap.remove();
  target.innerHTML = "";
  const map = window.L.map(target).setView([35.1319, 36.7547], 12);
  window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
  const points = (drivers || []).map((driver) => ({ ...driver, latitude: Number(driver.last_location_lat), longitude: Number(driver.last_location_lng) })).filter((driver) => Number.isFinite(driver.latitude) && Number.isFinite(driver.longitude));
  points.forEach((driver) => {
    const initial = String(driver.name || "س").slice(0, 1);
    const marker = window.L.marker([driver.latitude, driver.longitude], { icon: window.L.divIcon({ className: "driver-map-marker", html: `<span class="driver-marker-dot">${initial}</span>`, iconSize: [34, 34], iconAnchor: [17, 17] }) }).addTo(map);
    marker.bindPopup(`<div class="driver-map-popup"><strong>${String(driver.name || "سائق جربوع")}</strong><span>${driver.last_location_at ? `آخر تحديث: ${new Date(driver.last_location_at).toLocaleString("ar-SY")}` : "لا يوجد وقت تحديث"}</span></div>`);
  });
  if (points.length === 1) map.setView([points[0].latitude, points[0].longitude], 14);
  if (points.length > 1) map.fitBounds(points.map((point) => [point.latitude, point.longitude]), { padding: [30, 30], maxZoom: 14 });
  if (!points.length) target.insertAdjacentHTML("beforeend", "<p class=\"map-empty\">لا توجد مواقع سائقين محدثة بعد.</p>");
  liveDriverMap = map;
}

let fleetOperationsMap = null;
let fleetRouteLayers = null;

function fleetEscape(value) { return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[char])); }
function fleetMoney(value) { return `${new Intl.NumberFormat("ar-SY").format(Number(value || 0))} ل.س`; }
function fleetMinutes(order) { if (!order?.startedAt) return "لم يبدأ عداد الوقت بعد"; const seconds = Math.max(0, Math.floor((Date.now() - new Date(order.startedAt).getTime()) / 1000)); return `${Math.max(1, Math.floor(seconds / 60))} دقيقة منذ قبول المهمة`; }

window.installFleetOperationsMap = function installFleetOperationsMap(payload) {
  const target = document.querySelector("#fleet-map");
  if (!target || !window.L) return;
  if (fleetOperationsMap) fleetOperationsMap.remove();
  target.innerHTML = "";
  const map = window.L.map(target, { zoomControl:true }).setView([35.1319, 36.7547], 12);
  window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom:19, attribution:"© OpenStreetMap" }).addTo(map);
  fleetOperationsMap = map;
  fleetRouteLayers = window.L.layerGroup().addTo(map);
  const drivers = (payload?.drivers || []).filter((driver) => Number.isFinite(Number(driver.latitude)) && Number.isFinite(Number(driver.longitude)));
  const markerById = new Map();

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
    window.L.marker([Number(order.source.latitude), Number(order.source.longitude)], { icon:sourceIcon }).addTo(fleetRouteLayers);
    window.L.marker([Number(order.destination.latitude), Number(order.destination.longitude)], { icon:destinationIcon }).addTo(fleetRouteLayers);
  }

  drivers.forEach((driver) => {
    const initial = fleetEscape(String(driver.name || "س").slice(0, 1));
    const order = driver.activeOrder;
    const detail = order ? `<b>مهمة نشطة</b><span>${fleetEscape(order.sourceAddress)} ← ${fleetEscape(order.destinationAddress)}</span><span>الوقت: ${fleetEscape(fleetMinutes(order))}</span><span>المسافة الفعلية: ${(Number(order.actualDistanceM || 0) / 1000).toFixed(1)} كم</span><span>تكلفة الرحلة التقديرية: ${fleetMoney(order.estimatedPrice)}</span>` : `<span>${driver.lastLocationAt ? `آخر تحديث: ${new Date(driver.lastLocationAt).toLocaleString("ar-SY")}` : "لا يوجد وقت تحديث"}</span><span>لا توجد مهمة نشطة حالياً.</span>`;
    const marker = window.L.marker([Number(driver.latitude), Number(driver.longitude)], { icon: window.L.divIcon({ className:"driver-map-marker", html:`<span class="driver-marker-dot">${initial}</span>`, iconSize:[34,34], iconAnchor:[17,17] }) }).addTo(map);
    marker.bindPopup(`<div class="map-driver-popup"><strong>${fleetEscape(driver.name || "سفير جربوع")}</strong>${detail}</div>`);
    marker.on("click", () => showRoute(driver));
    markerById.set(String(driver.id), marker);
  });
  document.querySelectorAll("[data-fleet-driver]").forEach((item) => item.addEventListener("click", () => { const marker = markerById.get(item.dataset.fleetDriver); if (!marker) return; map.setView(marker.getLatLng(), Math.max(map.getZoom(), 15)); marker.openPopup(); marker.fire("click"); }));
  if (drivers.length === 1) { map.setView([Number(drivers[0].latitude), Number(drivers[0].longitude)], 14); }
  if (drivers.length > 1) map.fitBounds(drivers.map((driver) => [Number(driver.latitude), Number(driver.longitude)]), { padding:[32,32], maxZoom:14 });
  if (!drivers.length) target.insertAdjacentHTML("beforeend", "<p class=\"map-empty\">لا توجد مواقع GPS حديثة للسفراء بعد.</p>");
};

const originalRenderOverview = renderOverview;
renderOverview = function () {
  originalRenderOverview();
  installDriverMap(state.dashboard?.drivers || []);
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
