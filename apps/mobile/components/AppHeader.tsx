import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';

interface AppHeaderProps {
  pageLabel: string;
  title?: string;
  tagline?: string;
  compact?: boolean;
  sticky?: boolean;
  actionLabel?: string;
  onActionPress?: () => void;
  rightContent?: ReactNode;
}

const BRAND_TAGLINE = 'See yourself elsewhere. Travel, before you travel.';

export function AppHeader({
  pageLabel,
  title,
  tagline = BRAND_TAGLINE,
  compact = false,
  sticky = false,
  actionLabel,
  onActionPress,
  rightContent,
}: AppHeaderProps) {
  const insets = useSafeAreaInsets();
  const displayTitle = (title ?? pageLabel).toLowerCase();

  return (
    <View
      accessibilityLabel={`${pageLabel} header`}
      style={[
        styles.header,
        sticky && styles.stickyHeader,
        compact && styles.headerCompact,
        { paddingTop: insets.top + (compact ? 7 : 10) },
      ]}
    >
      <BlurView pointerEvents="none" intensity={12} tint="light" style={styles.headerGlass} />
      <View style={styles.brandBlock}>
        <View style={[styles.logoMark, compact && styles.logoMarkCompact]}>
          <View style={styles.logoOrbitA} />
          <View style={styles.logoOrbitB} />
          <Text style={[styles.logoMarkText, compact && styles.logoMarkTextCompact]}>e</Text>
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.wordmark, compact && styles.wordmarkCompact]} numberOfLines={1}>
            {displayTitle}
          </Text>
          {!compact ? (
            <Text style={styles.pageLine} numberOfLines={1}>
              {tagline}
            </Text>
          ) : null}
        </View>
      </View>
      {rightContent ?? (actionLabel && onActionPress ? (
        <Pressable style={styles.actionButton} onPress={onActionPress}>
          <Text
            style={styles.actionButtonText}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.82}
          >
            {actionLabel}
          </Text>
        </Pressable>
      ) : null)}
    </View>
  );
}

export const SOCIAL_POP = {
  background: '#fff8f1',
  surface: '#fffdf9',
  text: '#111114',
  muted: '#766f68',
  border: 'rgba(40, 32, 28, 0.10)',
  coral: '#ff4f6d',
  teal: '#2dd4bf',
  yellow: '#ffd166',
} as const;

export { BRAND_TAGLINE };

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginHorizontal: -16,
    paddingHorizontal: 16,
    paddingBottom: 12,
    marginBottom: 14,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 248, 241, 0.62)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.42)',
  },
  headerGlass: {
    ...StyleSheet.absoluteFillObject,
  },
  stickyHeader: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 2,
    zIndex: 10,
  },
  headerCompact: {
    paddingBottom: 9,
    marginBottom: 12,
  },
  brandBlock: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoMark: {
    width: 40,
    height: 40,
    borderRadius: 15,
    backgroundColor: '#fff',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(17, 17, 20, 0.08)',
  },
  logoMarkCompact: {
    width: 34,
    height: 34,
    borderRadius: 13,
  },
  logoOrbitA: {
    position: 'absolute',
    width: 44,
    height: 14,
    borderRadius: 999,
    backgroundColor: SOCIAL_POP.coral,
    transform: [{ rotate: '-28deg' }],
    top: 10,
    left: -6,
  },
  logoOrbitB: {
    position: 'absolute',
    width: 44,
    height: 14,
    borderRadius: 999,
    backgroundColor: SOCIAL_POP.teal,
    transform: [{ rotate: '28deg' }],
    bottom: 9,
    right: -6,
  },
  logoMarkText: { color: SOCIAL_POP.text, fontSize: 23, fontWeight: '900' },
  logoMarkTextCompact: { fontSize: 20 },
  headerText: { flex: 1 },
  wordmark: { color: SOCIAL_POP.text, fontSize: 22, fontWeight: '900', letterSpacing: 0 },
  wordmarkCompact: { fontSize: 18 },
  pageLine: { color: SOCIAL_POP.muted, fontSize: 11, fontWeight: '800', marginTop: 1 },
  actionButton: {
    maxWidth: 132,
    minHeight: 34,
    borderRadius: 999,
    backgroundColor: SOCIAL_POP.text,
    paddingHorizontal: 13,
    paddingVertical: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtonText: { color: '#fff', fontSize: 12, lineHeight: 14, fontWeight: '900', textAlign: 'center' },
});
