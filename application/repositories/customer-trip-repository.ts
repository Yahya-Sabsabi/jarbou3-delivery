import type { CustomerVisibleDriver } from "../../shared/jarbou3-driver";

export type CustomerTracking = {
  id: string;
  driver_id: string | null;
  status: string;
  source_lat: number | string;
  source_lng: number | string;
  destination_lat: number | string;
  destination_lng: number | string;
  driver: CustomerVisibleDriver | null;
};

export interface CustomerTripRepository {
  findActiveForCustomer(customerId: string): Promise<CustomerTracking | null>;
}
