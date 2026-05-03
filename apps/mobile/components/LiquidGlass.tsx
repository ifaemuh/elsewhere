import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type PressableProps, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';

export function LiquidGlassDock() {
  return <BlurView pointerEvents="none" intensity={15} tint="light" style={styles.dock} />;
}

export function LiquidGlassButton({
  children,
  label,
  style,
  textStyle,
  ...props
}: PressableProps & {
  children?: ReactNode;
  label?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}) {
  return (
    <Pressable {...props} style={({ pressed }) => [styles.button, pressed && styles.buttonPressed, style]}>
      <BlurView pointerEvents="none" intensity={18} tint="light" style={styles.glassFill} />
      {children ?? <Text style={[styles.buttonText, textStyle]}>{label}</Text>}
    </Pressable>
  );
}

export function LiquidGlassPill({
  children,
  style,
  textStyle,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}) {
  return (
    <View style={[styles.pill, style]}>
      <BlurView pointerEvents="none" intensity={16} tint="light" style={styles.glassFill} />
      {typeof children === 'string' ? <Text style={[styles.pillText, textStyle]}>{children}</Text> : children}
    </View>
  );
}

export function LiquidGlassCard({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.card, style]}>
      <BlurView pointerEvents="none" intensity={12} tint="light" style={styles.glassFill} />
      {children}
    </View>
  );
}

const glassBorder = 'rgba(255, 255, 255, 0.30)';

const styles = StyleSheet.create({
  dock: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 30,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.10,
    shadowRadius: 24,
  },
  glassFill: {
    ...StyleSheet.absoluteFillObject,
  },
  button: {
    minHeight: 40,
    borderRadius: 999,
    paddingHorizontal: 15,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.13)',
    borderWidth: 1,
    borderColor: glassBorder,
  },
  buttonPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.32)',
  },
  buttonText: {
    color: '#fff',
    fontSize: 13,
    lineHeight: 15,
    fontWeight: '900',
    textAlign: 'center',
  },
  pill: {
    minHeight: 30,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.24)',
  },
  pillText: {
    color: '#fff',
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '900',
    textShadowColor: 'rgba(0, 0, 0, 0.36)',
    textShadowRadius: 8,
  },
  card: {
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.34)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.42)',
  },
});
