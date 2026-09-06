import { spawn } from "node:child_process";

const port = process.env.EXPO_PORT || "8081";
const expoArgs = ["expo", "start", "--clear", "--max-workers", "1", "--port", port];

function startExpo(host, extraArgs = []) {
  const child = spawn("npx", [...expoArgs, "--host", host, ...extraArgs], {
    stdio: "inherit",
    env: { ...process.env, EXPO_USE_METRO_WORKSPACE_ROOT: "1" },
  });
  return child;
}

const tunnel = startExpo("tunnel");
let fallbackStarted = false;
const fallback = () => {
  if (fallbackStarted) return;
  fallbackStarted = true;
  console.warn("[expo] Tunnel لم يتصل؛ إبقاء Metro قائماً بوضع LAN بدلاً من إنهائه.");
  startExpo("lan");
};

const fallbackTimer = setTimeout(fallback, 20_000);
tunnel.once("exit", (code) => {
  clearTimeout(fallbackTimer);
  if (code !== 0) fallback();
});
tunnel.once("error", () => {
  clearTimeout(fallbackTimer);
  fallback();
});

process.on("SIGINT", () => {
  tunnel.kill("SIGINT");
  process.exit(0);
});
process.on("SIGTERM", () => {
  tunnel.kill("SIGTERM");
  process.exit(0);
});
