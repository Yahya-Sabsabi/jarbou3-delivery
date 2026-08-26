export function normalizeJarbou3Phone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 16) return "";
  return `+${digits}`;
}

export function isJarbou3Phone(value: string): boolean {
  return normalizeJarbou3Phone(value).length > 0;
}
