import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

export function PremiumEmptyResultsDialog({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.dialog}>
          <View style={styles.icon}><MaterialIcons name="search-off" size={25} color="#24755E" /></View>
          <Text style={styles.title}>لا توجد نتائج</Text>
          <Text style={styles.copy}>جرّب كتابة اسم الحي أو الشارع متبوعًا بكلمة حماة.</Text>
          <Pressable onPress={onClose} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
            <Text style={styles.buttonText}>حسنًا</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "rgba(22, 37, 29, 0.34)" },
  dialog: { width: "100%", maxWidth: 360, borderRadius: 26, padding: 22, backgroundColor: "#FFFFFF", alignItems: "center", shadowColor: "#10231B", shadowOpacity: 0.16, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 8 },
  icon: { width: 54, height: 54, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "#EAF5EF", marginBottom: 12 },
  title: { color: "#21342A", fontSize: 19, fontWeight: "900", textAlign: "center" },
  copy: { color: "#7B8C82", fontSize: 12, lineHeight: 20, fontWeight: "600", textAlign: "center", marginTop: 8 },
  button: { minWidth: 132, minHeight: 46, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "#24755E", marginTop: 20, paddingHorizontal: 20 },
  buttonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
});
