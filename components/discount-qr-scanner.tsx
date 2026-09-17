import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";

type Props = { visible: boolean; onClose: () => void; onScanned: (value: string) => void };

export function DiscountQrScanner({ visible, onClose, onScanned }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [handled, setHandled] = useState(false);
  const handleScanned = (result: BarcodeScanningResult) => {
    if (handled || result.type !== "qr") return;
    const value = result.data.trim();
    if (!value) return;
    setHandled(true);
    onScanned(value);
    onClose();
  };
  const close = () => { setHandled(false); onClose(); };
  return <Modal visible={visible} animationType="slide" onRequestClose={close}>
    <View style={styles.root}>
      {!permission ? <View style={styles.center}><ActivityIndicator color="#FFFFFF" /></View> : !permission.granted ? <View style={styles.center}><Text style={styles.title}>السماح بالكاميرا مطلوب</Text><Text style={styles.copy}>نحتاج الكاميرا لقراءة رمز الخصم فقط.</Text><Pressable onPress={requestPermission} style={styles.primary}><Text style={styles.primaryText}>السماح بالكاميرا</Text></Pressable><Pressable onPress={close} style={styles.secondary}><Text style={styles.secondaryText}>إلغاء</Text></Pressable></View> : <><CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={handled ? undefined : handleScanned} /><View style={styles.overlay}><View style={styles.scanFrame} /><Text style={styles.hint}>وجّه الكاميرا نحو رمز QR</Text><Pressable onPress={close} style={styles.close}><Text style={styles.closeText}>إغلاق</Text></Pressable></View></>}
    </View>
  </Modal>;
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: "#111" }, center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28 }, title: { color: "#FFF", fontSize: 20, fontWeight: "900", textAlign: "center" }, copy: { color: "#D7E2DC", fontSize: 13, textAlign: "center", marginTop: 10, marginBottom: 20 }, primary: { minHeight: 48, borderRadius: 15, backgroundColor: "#24755E", paddingHorizontal: 22, alignItems: "center", justifyContent: "center" }, primaryText: { color: "#FFF", fontWeight: "900" }, secondary: { marginTop: 12, minHeight: 44, justifyContent: "center" }, secondaryText: { color: "#D7E2DC", fontWeight: "800" }, overlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" }, scanFrame: { width: 250, height: 250, borderWidth: 3, borderColor: "#FFFFFF", borderRadius: 22, backgroundColor: "transparent" }, hint: { color: "#FFF", fontSize: 14, fontWeight: "800", marginTop: 20 }, close: { position: "absolute", bottom: 45, minWidth: 110, minHeight: 44, borderRadius: 14, backgroundColor: "#FFFFFFE8", alignItems: "center", justifyContent: "center" }, closeText: { color: "#1F2B25", fontWeight: "900" } });
