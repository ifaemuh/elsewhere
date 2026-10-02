import { useState } from 'react';
import { Tabs } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SOCIAL_POP } from '@/components/AppHeader';
import { AppBottomSheet } from '@/components/AppBottomSheet';
import { LiquidGlassDock } from '@/components/LiquidGlass';
import { TripIntakeContent } from '@/components/TripIntakeContent';

function TabGlyph({ focused }: { focused: boolean }) {
  return (
    <View style={[styles.glyph, focused && styles.glyphActive]}>
      <View style={[styles.glyphInner, focused && styles.glyphInnerActive]} />
    </View>
  );
}

function BookButton({ focused, onPress }: { focused: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Book"
      style={styles.bookButton}
      onPress={onPress}
    >
      <View style={[styles.bookButtonInner, focused && styles.bookButtonInnerActive]}>
        <Text style={styles.bookButtonText}>book</Text>
      </View>
    </Pressable>
  );
}

export default function TabLayout() {
  const [bookSheetOpen, setBookSheetOpen] = useState(false);

  return (
    <View style={styles.shell}>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: SOCIAL_POP.coral,
          tabBarInactiveTintColor: 'rgba(17, 17, 20, 0.34)',
          tabBarLabelStyle: styles.tabLabel,
          tabBarItemStyle: styles.tabItem,
          tabBarStyle: styles.tabBar,
          tabBarBackground: () => <LiquidGlassDock />,
          headerShown: false,
        }}
      >
        <Tabs.Screen
          name="discover"
          options={{
            title: 'Discover',
            tabBarIcon: ({ focused }) => <TabGlyph focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="plan"
          options={{
            title: 'Plan',
            tabBarIcon: ({ focused }) => <TabGlyph focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="book"
          options={{
            title: '',
            tabBarLabel: '',
            tabBarIcon: ({ focused }) => <BookButton focused={focused} onPress={() => setBookSheetOpen(true)} />,
          }}
          listeners={{
            tabPress: (event) => {
              event.preventDefault();
              setBookSheetOpen(true);
            },
          }}
        />
        <Tabs.Screen
          name="trips"
          options={{
            title: 'Trips',
            tabBarIcon: ({ focused }) => <TabGlyph focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="trip/[id]"
          options={{
            title: 'Trip',
            href: null,
            tabBarIcon: ({ focused }) => <TabGlyph focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="wallet"
          options={{
            title: 'Wallet',
            href: null,
            tabBarIcon: ({ focused }) => <TabGlyph focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="assist"
          options={{
            title: 'Assist',
            href: null,
            tabBarIcon: ({ focused }) => <TabGlyph focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ focused }) => <TabGlyph focused={focused} />,
          }}
        />
      </Tabs>
      <AppBottomSheet
        visible={bookSheetOpen}
        onClose={() => setBookSheetOpen(false)}
        bottomOffset={82}
        maxHeightRatio={0.78}
      >
        <TripIntakeContent contentStyle={styles.bookSheetContent} />
      </AppBottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
  },
  tabBar: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 0,
    height: 64,
    paddingTop: 6,
    paddingBottom: 3,
    borderTopWidth: 0,
    borderRadius: 30,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 22,
    elevation: 10,
  },
  tabItem: {
    borderRadius: 28,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '900',
    marginTop: 3,
  },
  bookButton: {
    top: -15,
    width: 66,
    height: 66,
    borderRadius: 33,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookButtonInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 79, 109, 0.86)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.46)',
    shadowColor: SOCIAL_POP.coral,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.32,
    shadowRadius: 20,
  },
  bookButtonInnerActive: {
    backgroundColor: SOCIAL_POP.coral,
  },
  bookButtonText: {
    color: '#fff',
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '900',
    textTransform: 'lowercase',
  },
  glyph: {
    width: 28,
    height: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(17, 17, 20, 0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
  },
  glyphActive: {
    borderColor: 'rgba(255, 255, 255, 0.48)',
    backgroundColor: 'rgba(255, 255, 255, 0.20)',
  },
  glyphInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(17, 17, 20, 0.26)',
  },
  glyphInnerActive: {
    width: 16,
    backgroundColor: SOCIAL_POP.coral,
  },
  bookSheetContent: {
    paddingTop: 4,
    paddingBottom: 28,
  },
});
