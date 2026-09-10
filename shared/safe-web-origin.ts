export type WindowLike = {
  location?: {
    origin?: unknown;
  };
};

export function getSafeWebOrigin(globalObject: { window?: WindowLike }): string | undefined {
  const origin = globalObject.window?.location?.origin;
  return typeof origin === "string" ? origin : undefined;
}
