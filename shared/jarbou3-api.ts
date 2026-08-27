function withoutTrailingSlash(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

/**
 * يختار عنوان API الملائم للبيئة. معاينة الويب تستخدم خادمها المقابل، بينما
 * التطبيق الأصلي يستخدم العنوان المنشور المضمّن في إعداد Expo.
 */
export function resolveJarbou3ApiBaseUrl({
  configuredApiBaseUrl,
  embeddedApiBaseUrl,
  isWeb,
  currentOrigin,
}: {
  configuredApiBaseUrl?: string;
  embeddedApiBaseUrl?: string;
  isWeb: boolean;
  currentOrigin?: string;
}): string {
  const configuredApiUrl = configuredApiBaseUrl?.trim()
    ? withoutTrailingSlash(configuredApiBaseUrl)
    : "";
  const embeddedApiUrl = embeddedApiBaseUrl?.trim()
    ? withoutTrailingSlash(embeddedApiBaseUrl)
    : "";

  // Expo Go inherits EXPO_PUBLIC_API_BASE_URL from the managed preview. That
  // address is session-bound and can expire, whereas the embedded URL is the
  // published API intended for every Android/iOS installation.
  if (!isWeb && embeddedApiUrl) return embeddedApiUrl;

  if (isWeb && currentOrigin) {
    try {
      const url = new URL(currentOrigin);
      if (url.hostname.startsWith("8081-")) {
        url.hostname = url.hostname.replace(/^8081-/, "3000-");
        return withoutTrailingSlash(url.toString());
      }
    } catch {
      // يستمر التطبيق إلى عنوان الإنتاج المضمّن عند توفره.
    }
  }

  return configuredApiUrl || embeddedApiUrl;
}
