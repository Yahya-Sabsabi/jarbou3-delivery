export type AdminView = "overview" | "orders" | "drivers" | "finance" | "reports";
export type DriverDecision = "pending" | "approved" | "rejected";

export interface AdminState {
  view: AdminView;
  driverDecision: DriverDecision;
  orderAssigned: boolean;
  shiftClosed: boolean;
  reportDownloaded: boolean;
}

export type AdminAction =
  | { type: "set_view"; view: AdminView }
  | { type: "approve_driver" }
  | { type: "reject_driver" }
  | { type: "assign_order" }
  | { type: "close_shift" }
  | { type: "confirm_report_download" };

export const initialAdminState: AdminState = {
  view: "overview",
  driverDecision: "pending",
  orderAssigned: false,
  shiftClosed: false,
  reportDownloaded: false,
};

export function adminReducer(state: AdminState, action: AdminAction): AdminState {
  switch (action.type) {
    case "set_view":
      return { ...state, view: action.view };
    case "approve_driver":
      return { ...state, driverDecision: "approved" };
    case "reject_driver":
      return { ...state, driverDecision: "rejected" };
    case "assign_order":
      return { ...state, orderAssigned: true };
    case "close_shift":
      return { ...state, shiftClosed: true };
    case "confirm_report_download":
      return { ...state, reportDownloaded: true };
  }
}
