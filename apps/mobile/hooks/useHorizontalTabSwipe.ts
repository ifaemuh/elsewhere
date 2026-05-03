import { useMemo } from 'react';
import { PanResponder } from 'react-native';
import { useRouter } from 'expo-router';

type MainTab = 'discover' | 'trips' | 'profile';

const TAB_ORDER: MainTab[] = ['discover', 'trips', 'profile'];
const SWIPE_THRESHOLD = 86;

export function useHorizontalTabSwipe(activeTab: MainTab) {
  const router = useRouter();

  return useMemo(() => {
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
      onPanResponderRelease: (_event, gesture) => {
        if (Math.abs(gesture.dx) < SWIPE_THRESHOLD || Math.abs(gesture.dx) < Math.abs(gesture.dy) * 1.4) {
          return;
        }

        const direction = gesture.dx < 0 ? 1 : -1;
        const nextTab = TAB_ORDER[activeIndex + direction];
        if (nextTab) {
          router.replace(`/${nextTab}`);
        }
      },
    }).panHandlers;
  }, [activeTab, router]);
}
