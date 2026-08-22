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
    errorBox.textContent = error.status === 429 ? "تم إيقاف المحاولة مؤقتاً للحماية. حاول لاحقاً." : "كلمة المرور غير صحيحة. تحقق منها ثم أعد المحاولة.";
    errorBox.hidden = false;
  } finally {
    button.disabled = false;
    button.textContent = "فتح الموقع";
  }
}, true);

setInterval(() => {
  if (!adminView.hidden) refreshDashboard();
}, 10000);
