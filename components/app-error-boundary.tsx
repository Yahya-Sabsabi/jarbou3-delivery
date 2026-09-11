import { Component, type ErrorInfo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[app-error-boundary] unexpected render error", error, info.componentStack);
  }

  private retry = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <View style={styles.container}>
        <Text style={styles.title}>حدث خطأ غير متوقع</Text>
        <Text style={styles.message}>لم يتوقف حسابك. أعد المحاولة، وإذا استمر الخطأ أغلق التطبيق وافتحه من جديد.</Text>
        <Pressable onPress={this.retry} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
          <Text style={styles.buttonText}>إعادة المحاولة</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#F5F5F5" },
  title: { color: "#252525", fontSize: 22, fontWeight: "800", textAlign: "center", marginBottom: 12 },
  message: { color: "#5C5C5C", fontSize: 15, lineHeight: 23, textAlign: "center", maxWidth: 360, marginBottom: 22 },
  button: { minWidth: 180, borderRadius: 14, paddingHorizontal: 20, paddingVertical: 13, alignItems: "center", backgroundColor: "#4A4A4A" },
  pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
  buttonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
});
