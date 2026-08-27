function withoutTrailingSlash(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function previewApiFromExpoHost(hostUri?: string): string {
  if (!hostUri?.trim()) return "";
  try {
    const source = hostUri.includes("://") ? hostUri : `https://${hostUri}`;
    const url = new URL(source);
    if (url.hostname.startsWith("8081-")) {
      url.hostname = url.hostname.replace(/^8081-/, "3000-");
    } else if (url.port === "8081") {
      url.port = "3000";
    } else {
      return "";
    }
    url.protocol = "https:";
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return withoutTrailingSlash(url.toString());
  } catch {
    return "";
  }
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
  isExpoGo,
  expoHostUri,
}: {
  configuredApiBaseUrl?: string;
  embeddedApiBaseUrl?: string;
  isWeb: boolean;
  currentOrigin?: string;
  isExpoGo?: boolean;
  expoHostUri?: string;
}): string {
  const configuredApiUrl = configuredApiBaseUrl?.trim()
    ? withoutTrailingSlash(configuredApiBaseUrl)
    : "";
  const embeddedApiUrl = embeddedApiBaseUrl?.trim()
    ? withoutTrailingSlash(embeddedApiBaseUrl)
    : "";

  // Expo replaces EXPO_PUBLIC_* values while bundling. The development script
  // supplies the matching 3000 preview origin, making this path independent of
  // manifest shape and Expo Go runtime metadata.
  if (!isWeb && /^https:\/\/3000-[a-z0-9-]+\.us\d+\.manus\.computer$/i.test(configuredApiUrl)) {
    return configuredApiUrl;
  }

  // The presence of Metro's host URI is the reliable indicator of a preview
  // session. Do not depend on an Expo ownership flag because it differs between
  // Expo Go releases and can be absent from a development manifest.
  const expoPreviewApiUrl = previewApiFromExpoHost(expoHostUri);
  if (expoPreviewApiUrl) return expoPreviewApiUrl;

  // Installed Android/iOS packages use the stable published API.
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
