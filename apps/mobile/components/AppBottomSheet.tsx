import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  PanResponder,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';

export function AppBottomSheet({
  visible,
  onClose,
  children,
  bottomOffset = 86,
  maxHeightRatio = 0.82,
  sheetStyle,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  bottomOffset?: number;
  maxHeightRatio?: number;
  sheetStyle?: StyleProp<ViewStyle>;
}) {
  const { height } = useWindowDimensions();
  const [isMounted, setIsMounted] = useState(visible);
  const progress = useRef(new Animated.Value(1)).current;

  const closeWithAnimation = () => {
    Animated.timing(progress, {
      toValue: 1,
      duration: 210,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setIsMounted(false);
      onClose();
    });
  };

  const responder = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) => gesture.dy > 10 && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.2,
      onPanResponderMove: (_event, gesture) => {
        progress.setValue(Math.max(0, Math.min(1, gesture.dy / Math.max(height * 0.42, 1))));
      },
      onPanResponderRelease: (_event, gesture) => {
        if (gesture.dy > 86 || gesture.vy > 0.72) {
          closeWithAnimation();
          return;
        }
        Animated.spring(progress, {
          toValue: 0,
          useNativeDriver: true,
          damping: 18,
          stiffness: 180,
        }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(progress, {
          toValue: 0,
          useNativeDriver: true,
          damping: 18,
          stiffness: 180,
        }).start();
      },
    }),
    [height, progress],
  );

  useEffect(() => {
    if (!visible) {
      if (isMounted) closeWithAnimation();
      return;
    }
    setIsMounted(true);
    progress.setValue(1);
    Animated.timing(progress, {
      toValue: 0,
      duration: 270,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible]);

  if (!isMounted) return null;

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, height],
  });
  const backdropOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });

  return (
    <View style={styles.scrim} pointerEvents="box-none">
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={closeWithAnimation} />
      </Animated.View>
      <Animated.View
        style={[
          styles.sheet,
          {
            bottom: bottomOffset,
            maxHeight: height * maxHeightRatio,
            transform: [{ translateY }],
          },
          sheetStyle,
        ]}
      >
        <BlurView pointerEvents="none" intensity={18} tint="light" style={styles.blur} />
        <View style={styles.grabberWrap} {...responder.panHandlers}>
          <View style={styles.grabber} />
        </View>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 200,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.38)',
  },
  sheet: {
    position: 'absolute',
    left: 12,
    right: 12,
    borderRadius: 30,
    overflow: 'hidden',
    backgroundColor: 'rgba(248,246,241,0.91)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.62)',
  },
  blur: {
    ...StyleSheet.absoluteFillObject,
  },
  grabberWrap: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  grabber: {
    width: 52,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(12,12,14,0.18)',
  },
});
