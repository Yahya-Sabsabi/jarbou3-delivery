import { spawn } from "node:child_process";

const port = process.env.EXPO_PORT || "8081";
const expoArgs = ["expo", "start", "--clear", "--max-workers", "1", "--port", port];
let primaryProcess = null;
let fallbackProcess = null;
let tunnelReady = false;
let fallbackStarted = false;
let fallbackTimer;

function startExpo(host, envOverrides = {}, pipeOutput = false) {
  const child = spawn("npx", [...expoArgs, "--host", host], {
    stdio: pipeOutput ? ["inherit", "pipe", "pipe"] : "inherit",
    env: { ...process.env, ...envOverrides, EXPO_USE_METRO_WORKSPACE_ROOT: "1" },
  });
  if (pipeOutput) {
    const forward = (chunk) => {
      const text = String(chunk);
      process.stdout.write(text);
      if (text.includes("Tunnel ready")) {
        tunnelReady = true;
        clearTimeout(fallbackTimer);
      }
    };
    child.stdout.on("data", forward);
    child.stderr.on("data", forward);
  }
  return child;
}

function startLocalTunnel() {
  return new Promise((resolve) => {
    const child = spawn("npx", ["--yes", "localtunnel", "--port", port], {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    fallbackProcess = child;
    let settled = false;
    let buffer = "";
    const onData = (chunk) => {
      const text = String(chunk);
      process.stdout.write(`[expo-tunnel] ${text}`);
      buffer += text;
      const match = buffer.match(/https:\/\/[^\\s]+/);
      if (match && !settled) {
        settled = true;
        resolve(match[0].replace(/[.,)]+$/, ""));
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.once("error", () => { if (!settled) { settled = true; resolve(null); } });
    child.once("exit", (code) => { if (!settled) { settled = true; resolve(null); } if (code && code !== 0) console.warn(`[expo-tunnel] localtunnel exited with code ${code}`); });
    setTimeout(() => { if (!settled) { settled = true; resolve(null); } }, 50_000);
  });
}

async function fallback() {
  if (fallbackStarted || tunnelReady) return;
  fallbackStarted = true;
  console.warn("[expo] ngrok لم يتصل؛ أنتظر localtunnel العام قبل استخدام LAN.");
  const publicUrl = await startLocalTunnel();
  if (publicUrl) {
    const hostname = new URL(publicUrl).hostname;
    console.log(`[expo] رابط المعاينة العام الحالي: ${publicUrl}`);
    primaryProcess = startExpo("lan", { REACT_NATIVE_PACKAGER_HOSTNAME: hostname });
    return;
  }
  console.warn("[expo] تعذر إنشاء نفق عام؛ إبقاء Metro بوضع LAN كخطة أخيرة.");
  primaryProcess = startExpo("lan");
}

primaryProcess = startExpo("tunnel", {}, true);
fallbackTimer = setTimeout(() => { void fallback(); }, 20_000);
primaryProcess.once("exit", (code) => {
  clearTimeout(fallbackTimer);
  if (code !== 0 && !tunnelReady) void fallback();
});
primaryProcess.once("error", () => {
  clearTimeout(fallbackTimer);
  if (!tunnelReady) void fallback();
});

function stopAll(signal) {
  clearTimeout(fallbackTimer);
  primaryProcess?.kill(signal);
  fallbackProcess?.kill(signal);
  process.exit(0);
}
process.on("SIGINT", () => stopAll("SIGINT"));
process.on("SIGTERM", () => stopAll("SIGTERM"));
