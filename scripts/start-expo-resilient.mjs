import { spawn } from "node:child_process";

const port = process.env.EXPO_PORT || "8081";
const expoArgs = ["expo", "start", "--clear", "--max-workers", "1", "--port", port];

function startExpo(host, extraArgs = [], pipeOutput = false) {
  const child = spawn("npx", [...expoArgs, "--host", host, ...extraArgs], {
    stdio: pipeOutput ? ["inherit", "pipe", "pipe"] : "inherit",
    env: { ...process.env, EXPO_USE_METRO_WORKSPACE_ROOT: "1" },
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

let fallbackStarted = false;
let tunnelReady = false;
let fallbackTimer;
const fallback = () => {
  if (fallbackStarted || tunnelReady) return;
  fallbackStarted = true;
  console.warn("[expo] Tunnel لم يتصل؛ إبقاء Metro قائماً بوضع LAN بدلاً من إنهائه.");
  startExpo("lan");
};

const tunnel = startExpo("tunnel", [], true);
fallbackTimer = setTimeout(fallback, 20_000);
tunnel.once("exit", (code) => {
  clearTimeout(fallbackTimer);
  if (code !== 0 && !tunnelReady) fallback();
});
tunnel.once("error", () => {
  clearTimeout(fallbackTimer);
  if (!tunnelReady) fallback();
});

process.on("SIGINT", () => {
  tunnel.kill("SIGINT");
  process.exit(0);
});
process.on("SIGTERM", () => {
  tunnel.kill("SIGTERM");
  process.exit(0);
});
