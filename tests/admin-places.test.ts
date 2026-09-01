import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const migration = readFileSync(resolve(root, "supabase/migrations/20260901_jarbou3_admin_places.sql"), "utf8");
const adminWeb = readFileSync(resolve(root, "server/admin-web.ts"), "utf8");
const app = readFileSync(resolve(root, "admin-site/app.js"), "utf8");
const adminHtml = readFileSync(resolve(root, "admin-site/index.html"), "utf8");
const mobile = readFileSync(resolve(root, "components/jarbou3-app.tsx"), "utf8");

describe("Jarbou3 managed places contract", () => {
  it("keeps places minimal and constrained to Hama", () => {
    expect(migration).toContain("name text not null");
    expect(migration).toContain("latitude numeric(9,6)");
    expect(migration).toContain("longitude numeric(9,6)");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("using (is_active or private.is_admin())");
    expect(migration).toContain("PLACE_OUTSIDE_HAMA");
  });

  it("protects admin creation and active toggles behind the site session", () => {
    expect(adminWeb).toContain('app.get("/admin/api/places"');
    expect(adminWeb).toContain('app.post("/admin/api/places"');
    expect(adminWeb).toContain('app.patch("/admin/api/places/:placeId"');
    expect(adminWeb.match(/requireSiteSession\(req\)/g)?.length ?? 0).toBeGreaterThan(10);
  });

  it("renders the simple admin form and merges managed places into customer search", () => {
    expect(adminHtml).toContain('data-view="places"');
    expect(app).toContain("place-form");
    expect(app).toContain("places-map");
    expect(mobile).toContain("listJarbou3Places");
    expect(mobile).toContain("managedPlaces");
  });
});
