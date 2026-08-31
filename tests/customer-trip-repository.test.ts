import { describe, expect, it } from "vitest";
import { SupabaseCustomerTripRepository } from "../infrastructure/repositories/supabase-customer-trip-repository";

function fakeClient(rows: Array<{ data: unknown; error: { message: string } | null }>) {
  const tables: string[] = [];
  return {
    tables,
    from(table: string) {
      tables.push(table);
      const builder = {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => rows.shift() ?? { data: null, error: null },
      };
      return builder;
    },
  };
}

describe("SupabaseCustomerTripRepository", () => {
  it("maps only the assigned active driver's public contact fields", async () => {
    const client = fakeClient([
      { data: { id: "order-1", driver_id: "driver-1", status: "accepted", source_lat: 35.13, source_lng: 36.75, destination_lat: 35.14, destination_lng: 36.76 }, error: null },
      { data: { name: "سفير حماة", phone: "+963900000000", vehicle_type: "motorcycle", personal_photo_path: "private/path" }, error: null },
    ]);
    const repository = new SupabaseCustomerTripRepository(client);

    await expect(repository.findActiveForCustomer("customer-1")).resolves.toEqual({
      id: "order-1",
      driver_id: "driver-1",
      status: "accepted",
      source_lat: 35.13,
      source_lng: 36.75,
      destination_lat: 35.14,
      destination_lng: 36.76,
      driver: { fullName: "سفير حماة", phone: "+963900000000", vehicleType: "motorcycle" },
    });
    expect(client.tables).toEqual(["orders", "users"]);
  });

  it("does not query driver data before an order is assigned", async () => {
    const client = fakeClient([
      { data: { id: "order-2", driver_id: null, status: "requested", source_lat: 35.13, source_lng: 36.75, destination_lat: 35.14, destination_lng: 36.76 }, error: null },
    ]);
    const repository = new SupabaseCustomerTripRepository(client);

    await expect(repository.findActiveForCustomer("customer-1")).resolves.toMatchObject({ driver: null });
    expect(client.tables).toEqual(["orders"]);
  });
});
