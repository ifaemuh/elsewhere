import { useMemo, useRef } from 'react';
import { Animated, Dimensions, Easing, PanResponder } from 'react-native';
import { useRouter } from 'expo-router';

type MainTab = 'discover' | 'plan' | 'trips' | 'profile';

const TAB_ORDER: MainTab[] = ['discover', 'plan', 'trips', 'profile'];
const SWIPE_THRESHOLD = 86;

export function useHorizontalTabSwipe(activeTab: MainTab) {
  const router = useRouter();
  const dragX = useRef(new Animated.Value(0)).current;

  const panHandlers = useMemo(() => {
    const activeIndex = TAB_ORDER.indexOf(activeTab);

    return PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_event, gesture) => {
        const horizontalIntent = Math.abs(gesture.dx) > 34 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.55;
        return horizontalIntent;
      },
      onMoveShouldSetPanResponder: (_event, gesture) => {
        const horizontalIntent = Math.abs(gesture.dx) > 34 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.55;
        return horizontalIntent;
      },
      onPanResponderGrant: () => {
        dragX.stopAnimation();
      },
      onPanResponderMove: (_event, gesture) => {
        const direction = gesture.dx < 0 ? 1 : -1;
        const nextTab = TAB_ORDER[activeIndex + direction];
        const width = Dimensions.get('window').width;
        if (!nextTab) {
          dragX.setValue(gesture.dx * 0.18);
          return;
        }
        dragX.setValue(Math.max(-width, Math.min(width, gesture.dx)));
      },
      onPanResponderRelease: (_event, gesture) => {
        const width = Dimensions.get('window').width;
        if (Math.abs(gesture.dx) < SWIPE_THRESHOLD || Math.abs(gesture.dx) < Math.abs(gesture.dy) * 1.4) {
          Animated.spring(dragX, {
            toValue: 0,
            useNativeDriver: true,
            damping: 18,
            stiffness: 190,
            mass: 0.7,
          }).start();
          return;
        }

        const direction = gesture.dx < 0 ? 1 : -1;
        const nextTab = TAB_ORDER[activeIndex + direction];
        if (nextTab) {
          Animated.timing(dragX, {
            toValue: direction < 0 ? width : -width,
            duration: 190,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }).start(() => {
            dragX.setValue(0);
            router.replace(`/${nextTab}`);
          });
          return;
        }
        Animated.spring(dragX, {
          toValue: 0,
          useNativeDriver: true,
          damping: 18,
          stiffness: 190,
          mass: 0.7,
        }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(dragX, {
          toValue: 0,
          useNativeDriver: true,
          damping: 18,
          stiffness: 190,
          mass: 0.7,
        }).start();
      },
    }).panHandlers;
  }, [activeTab, dragX, router]);

  const animatedStyle = useMemo(() => ({
    opacity: dragX.interpolate({
      inputRange: [-360, 0, 360],
      outputRange: [0.86, 1, 0.86],
      extrapolate: 'clamp' as const,
    }),
    transform: [
      {
        translateX: dragX.interpolate({
          inputRange: [-360, 0, 360],
          outputRange: [-360, 0, 360],
          extrapolate: 'clamp' as const,
        }),
      },
      {
        scale: dragX.interpolate({
          inputRange: [-360, 0, 360],
          outputRange: [0.98, 1, 0.98],
          extrapolate: 'clamp' as const,
        }),
      },
    ],
  }), [dragX]);

  return { panHandlers, animatedStyle };
}
