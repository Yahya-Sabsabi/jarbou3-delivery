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

  // Expo Go loads JavaScript from the current Metro session. Its matching API
  // carries the latest development procedures, unlike the published API which
  // intentionally changes only after deployment.
  const expoPreviewApiUrl = isExpoGo ? previewApiFromExpoHost(expoHostUri) : "";
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
