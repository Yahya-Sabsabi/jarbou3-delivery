import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import path from "path";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerAdminWebRoutes } from "../admin-web";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { recordDriverLocation } from "../jarbou3-driver-location";
import { registerJarbou3RealtimeBridge } from "../jarbou3-realtime-bridge";
import { createContext } from "./context";

function isAllowedCorsOrigin(req: express.Request) {
  const origin = req.headers.origin;
  if (!origin) return false;
  const configuredOrigin = process.env.APP_WEB_ORIGIN;
  if (configuredOrigin && origin === configuredOrigin) return true;
  const forwarded = req.headers["x-forwarded-proto"];
  const protocol = typeof forwarded === "string" ? forwarded.split(",")[0].trim() : req.protocol;
  if (req.headers.host && origin === `${protocol}://${req.headers.host}`) return true;
  return process.env.NODE_ENV !== "production" && /^https:\/\/(?:3000|8081)-[a-z0-9-]+\.us\d+\.manus\.computer$/.test(origin);
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  registerJarbou3RealtimeBridge(server, (request) => {
    const origin = request.headers.origin;
    if (!origin) return false;
    const configuredOrigin = process.env.APP_WEB_ORIGIN;
    if (configuredOrigin && origin === configuredOrigin) return true;
    const forwarded = request.headers["x-forwarded-proto"];
    const protocol = typeof forwarded === "string" ? forwarded.split(",")[0].trim() : "https";
    if (request.headers.host && origin === `${protocol}://${request.headers.host}`) return true;
    return process.env.NODE_ENV !== "production" && /^https:\/\/(?:3000|8081)-[a-z0-9-]+\.us\d+\.manus\.computer$/.test(origin);
  });
  app.disable("x-powered-by");

  // Native builds do not send an Origin; browser clients receive credentials only from an approved origin.
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && isAllowedCorsOrigin(req)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Vary", "Origin");
    }
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization",
    );
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("X-Content-Type-Options", "nosniff");
    res.header("Referrer-Policy", "same-origin");
    res.header("Permissions-Policy", "geolocation=(self), camera=(self), microphone=()");
    res.header("Cross-Origin-Resource-Policy", "same-site");

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      if (origin && !isAllowedCorsOrigin(req)) {
        res.sendStatus(403);
        return;
      }
      res.sendStatus(200);
      return;
    }
    next();
  });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerStorageProxy(app);
  registerOAuthRoutes(app);
  app.use("/admin", (_req, res, next) => {
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("Content-Security-Policy", "default-src 'self'; connect-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    next();
  });
  app.use("/operations-portal", (_req, res, next) => {
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("Content-Security-Policy", "default-src 'self'; connect-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    next();
  });
  registerAdminWebRoutes(app);
  app.use("/admin/vendor/leaflet", express.static(path.resolve(process.cwd(), "node_modules/leaflet/dist")));
  app.use("/admin", express.static(path.resolve(process.cwd(), "admin-site"), { index: "index.html" }));
  app.use("/operations-portal/vendor/leaflet", express.static(path.resolve(process.cwd(), "node_modules/leaflet/dist")));
  app.get(["/operations-portal", "/operations-portal/"], (_req, res) => {
    res.sendFile(path.resolve(process.cwd(), "admin-site", "index.html"));
  });
  app.use("/operations-portal", express.static(path.resolve(process.cwd(), "admin-site"), { index: "index.html" }));

  app.get("/api/health", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, timestamp: Date.now() });
  });

  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.post("/api/jarbou3/driver-location", async (req, res) => {
    const accessToken = req.header("authorization")?.replace(/^Bearer\s+/i, "").trim();
    const location = req.body as { latitude?: unknown; longitude?: unknown; accuracy?: unknown };
    if (!accessToken || typeof location.latitude !== "number" || typeof location.longitude !== "number" || (location.accuracy != null && typeof location.accuracy !== "number")) {
      res.status(400).json({ error: "INVALID_LOCATION_REQUEST" });
      return;
    }
    try {
      const result = await recordDriverLocation(accessToken, { latitude: location.latitude, longitude: location.longitude, accuracy: location.accuracy ?? null });
      res.json({ ok: true, location: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "LOCATION_UPDATE_FAILED";
      res.status(message === "JARBOU3_FORBIDDEN" ? 403 : 400).json({ error: message });
    }
  });
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`[api] server listening on port ${port}`);
  });
}

startServer().catch(console.error);
