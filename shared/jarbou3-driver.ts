export type DriverVehicleType = "motorcycle" | "electric_scooter";

export type CustomerVisibleDriver = {
  fullName: string;
  phone: string | null;
  vehicleType: DriverVehicleType | null;
  photoUrl?: string | null;
};

export function driverVehicleLabel(vehicleType: DriverVehicleType | null) {
  if (vehicleType === "motorcycle") return "دراجة نارية";
  if (vehicleType === "electric_scooter") return "دراجة كهربائية";
  return "نوع الدراجة غير محدد";
}
