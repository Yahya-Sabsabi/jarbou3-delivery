import type { CustomerTripRepository, CustomerTracking } from "../../application/repositories/customer-trip-repository";
import type { CustomerVisibleDriver, DriverVehicleType } from "../../shared/jarbou3-driver";

type QueryClient = { from(table: string): { select(columns: string): any } };

const ACTIVE_STATUSES = ["requested", "accepted", "arriving", "awaiting_otp"];
const VEHICLE_TYPES = new Set<DriverVehicleType>(["motorcycle", "electric_scooter"]);

function toDriver(value: any): CustomerVisibleDriver {
  return {
    fullName: typeof value.name === "string" ? value.name : "سفير جربوع معيّن",
    phone: typeof value.phone === "string" ? value.phone : null,
    vehicleType: typeof value.vehicle_type === "string" && VEHICLE_TYPES.has(value.vehicle_type as DriverVehicleType) ? value.vehicle_type as DriverVehicleType : null,
  };
}

export class SupabaseCustomerTripRepository implements CustomerTripRepository {
  constructor(private readonly client: QueryClient) {}

  async findActiveForCustomer(customerId: string): Promise<CustomerTracking | null> {
    const { data, error } = await this.client
      .from("orders")
      .select("id,driver_id,status,source_lat,source_lng,destination_lat,destination_lng")
      .eq("customer_id", customerId)
      .in("status", ACTIVE_STATUSES)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    if (!data.driver_id) return { ...data, driver: null } as CustomerTracking;

    const { data: driver, error: driverError } = await this.client
      .from("users")
      .select("name,phone,vehicle_type")
      .eq("id", data.driver_id)
      .eq("role", "driver")
      .eq("is_active", true)
      .maybeSingle();
    if (driverError) throw new Error(driverError.message);
    return { ...data, driver: driver ? toDriver(driver) : null } as CustomerTracking;
  }
}
