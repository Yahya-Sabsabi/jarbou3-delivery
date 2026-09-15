import { useCallback, useEffect, useRef } from "react";
import { Dimensions, findNodeHandle, Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, UIManager, View, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewProps } from "react-native";
import type { PropsWithChildren, RefObject } from "react";
import type { StyleProp, ViewStyle } from "react-native";

type ScrollTarget = { scrollTo: (options: { y: number; animated?: boolean }) => void };
type FocusHandler = (event: { nativeEvent: { target: number } }) => void;
type ScrollOffsetRef = { current: number };
const FocusView = View as unknown as React.ComponentType<React.ComponentProps<typeof View> & { onFocusCapture?: FocusHandler }>;

export function useKeyboardAwareFocus(scrollRef: RefObject<ScrollTarget | null>, scrollOffsetRef: ScrollOffsetRef): FocusHandler {
  const keyboardHeightRef = useRef(0);

  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", (event) => {
      keyboardHeightRef.current = event.endCoordinates.height;
    });
    const hide = Keyboard.addListener("keyboardDidHide", () => {
      keyboardHeightRef.current = 0;
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return useCallback((event) => {
    const target = event.nativeEvent.target;
    const scrollNode = findNodeHandle(scrollRef.current as unknown as React.Component<any, any>);
    if (!target || !scrollNode) return;

    const reveal = () => {
      const keyboardHeight = keyboardHeightRef.current || Keyboard.metrics?.()?.height || 0;
      const windowHeight = Dimensions.get("window").height;
      UIManager.measureInWindow(
        target,
        (_x, y, _width, height) => {
          const safeTop = 24;
          const safeBottom = windowHeight - keyboardHeight - 24;
          const targetBottom = y + height;
          const currentOffset = scrollOffsetRef.current;
          const downDelta = targetBottom - safeBottom;
          const upDelta = safeTop - y;
          const nextOffset = downDelta > 0
            ? currentOffset + downDelta
            : upDelta > 0
              ? Math.max(0, currentOffset - upDelta)
              : null;
          if (nextOffset !== null) scrollRef.current?.scrollTo({ y: nextOffset, animated: true });
        },
      );
    };

    requestAnimationFrame(reveal);
    setTimeout(reveal, 180);
  }, [scrollOffsetRef, scrollRef]);
}

export function KeyboardAwareFocusView({ children, scrollRef, scrollOffsetRef, style }: PropsWithChildren<{ scrollRef: RefObject<ScrollTarget | null>; scrollOffsetRef: ScrollOffsetRef; style?: StyleProp<ViewStyle> }>) {
  const onFocusCapture = useKeyboardAwareFocus(scrollRef, scrollOffsetRef);
  return <FocusView style={[styles.focusContainer, style]} onFocusCapture={onFocusCapture}>{children}</FocusView>;
}

export function KeyboardAwareScrollView({ children, contentContainerStyle, ...props }: PropsWithChildren<ScrollViewProps>) {
  const scrollRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef(0);
  const onFocusCapture = useKeyboardAwareFocus(scrollRef, scrollOffsetRef);
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
    props.onScroll?.(event);
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <FocusView style={styles.focusContainer} onFocusCapture={onFocusCapture}>
        <ScrollView
          {...props}
          ref={scrollRef}
          onScroll={onScroll}
          scrollEventThrottle={16}
          automaticallyAdjustKeyboardInsets
          keyboardShouldPersistTaps={props.keyboardShouldPersistTaps ?? "handled"}
          keyboardDismissMode={props.keyboardDismissMode ?? "on-drag"}
          contentContainerStyle={contentContainerStyle}
          showsVerticalScrollIndicator={props.showsVerticalScrollIndicator ?? false}
        >
          {children}
        </ScrollView>
      </FocusView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 }, focusContainer: { flex: 1 } });
