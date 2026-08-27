import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import { Platform } from "react-native";
import superjson from "superjson";
import type { AppRouter } from "@/server/routers";
import { getApiBaseUrl } from "@/constants/oauth";
import * as Auth from "@/lib/_core/auth";

/**
 * tRPC React client for type-safe API calls.
 *
 * IMPORTANT (tRPC v11): The `transformer` must be inside `httpBatchLink`,
 * NOT at the root createClient level. This ensures client and server
 * use the same serialization format (superjson).
 */
export const trpc = createTRPCReact<AppRouter>();

/**
 * يحمي الطلبات الأصلية من رابط Metro المؤقت الذي قد يكون مخزناً في جلسة
 * Expo Go قديمة. نعيد اختيار API المنشور عند تنفيذ كل طلب، وليس عند إنشاء
 * العميل فقط، لكي لا يعلق التحقق بالرمز على خادم معاينة انتهت صلاحيته.
 */
export function resolveRuntimeTrpcUrl(url: RequestInfo | URL): string {
  const originalUrl = typeof url === "string" || url instanceof URL
    ? String(url)
    : url.url;
  if (Platform.OS === "web") return originalUrl;

  try {
    const requestUrl = new URL(originalUrl);
    const apiUrl = new URL(getApiBaseUrl());
    requestUrl.protocol = apiUrl.protocol;
    requestUrl.host = apiUrl.host;
    return requestUrl.toString();
  } catch {
    return originalUrl;
  }
}

/**
 * Creates the tRPC client with proper configuration.
 * Call this once in your app's root layout.
 */
export function createTRPCClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${getApiBaseUrl()}/api/trpc`,
        // tRPC v11: transformer MUST be inside httpBatchLink, not at root
        transformer: superjson,
        async headers() {
          const token = await Auth.getSessionToken();
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
        // Custom fetch to include credentials for cookie-based auth
        fetch(url, options) {
          return fetch(resolveRuntimeTrpcUrl(url), {
            ...options,
            credentials: "include",
          });
        },
      }),
    ],
  });
}
