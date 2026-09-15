import { Tabs } from "expo-router";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: "none", height: 0, borderTopWidth: 0 },
        tabBarItemStyle: { display: "none" },
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "",
        }}
      />
    </Tabs>
  );
}
