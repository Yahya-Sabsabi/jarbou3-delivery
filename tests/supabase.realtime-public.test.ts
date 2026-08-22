import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Jarbou3 Realtime bridge", () => {
  it("keeps Supabase URLs and publishable keys out of the mobile Realtime client", async () => {
    const clientSource = await readFile(path.resolve(process.cwd(), "lib/jarbou3-realtime.ts"), "utf8");
    expect(clientSource).not.toContain("EXPO_PUBLIC_SUPABASE");
    expect(clientSource).not.toContain("createClient(");
    expect(clientSource).toContain("/api/jarbou3/realtime");
  });
});
