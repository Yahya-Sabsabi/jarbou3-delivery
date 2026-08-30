import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "..");

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

describe("security and performance invariants", () => {
  it("keeps privacy consent versioned and protected by owner-only RLS", () => {
    const migration = read("supabase/migrations/20260830_jarbou3_privacy_consents.sql");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("using (user_id = auth.uid())");
    expect(migration).toContain("with check (user_id = auth.uid())");
    expect(migration).toContain("revoke all on table public.privacy_consents from anon");
  });

  it("keeps server-only tables explicitly denied to public roles", () => {
    const migration = read("supabase/migrations/20260830_jarbou3_security_advisors_cleanup.sql");
    expect(migration).toContain("using (false) with check (false)");
    expect(migration).toContain("revoke all on table public.%I from anon, authenticated");
    expect(migration).toContain("revoke all on function public.create_admin_access_recovery_token()");
  });

  it("uses Realtime first with slow tracking fallback and distance-aware GPS", () => {
    const app = read("components/jarbou3-app.tsx");
    const location = read("lib/jarbou3-location.ts");
    expect(app).toContain("refetchInterval: 30_000");
    expect(app).toContain("subscribeToOrderLiveLocation");
    expect(location).toContain("distanceInterval: 10");
  });
});
