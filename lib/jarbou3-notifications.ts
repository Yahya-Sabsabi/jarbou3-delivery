import Constants from "expo-constants";
import { Platform } from "react-native";

const isExpoGo = Constants.appOwnership === "expo";
const canUseNativePush = Platform.OS !== "web" && !isExpoGo;
type NotificationsModule = typeof import("expo-notifications");

function getNotificationsModule(): NotificationsModule | null {
  if (!canUseNativePush) return null;
  // This runtime import prevents Expo Go from initialising a Push module that
  // is intentionally unavailable there, while installed Android builds keep it.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("expo-notifications") as NotificationsModule;
}

if (canUseNativePush) {
  const Notifications = getNotificationsModule();
  if (!Notifications) {
    throw new Error("PUSH_NOTIFICATIONS_UNAVAILABLE");
  }
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function registerJarbou3PushToken() {
  // Expo Go no longer ships Android remote-push support. Production builds
  // keep the registration path below; Expo Go simply skips it.
  if (!canUseNativePush) return null;
  const Notifications = getNotificationsModule();
  if (!Notifications) return null;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("jarbou3-orders", {
      name: "تحديثات طلبات جربوع",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 180, 120, 180],
      lightColor: "#4A4A4A",
    });
  }
  const current = await Notifications.getPermissionsAsync();
  const permission = current.status === "granted" ? current : await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted") return null;
  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) return null;
  try {
    return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch {
    return null;
  }
}
