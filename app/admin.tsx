import { AdminWebPortal } from "@/components/admin-web-portal";
import { ScreenContainer } from "@/components/screen-container";

export default function AdminWebRoute() {
  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <AdminWebPortal />
    </ScreenContainer>
  );
}
