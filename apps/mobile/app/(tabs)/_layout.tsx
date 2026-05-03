import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SOCIAL_POP } from '@/components/AppHeader';
import { LiquidGlassDock } from '@/components/LiquidGlass';

function TabGlyph({ focused }: { focused: boolean }) {
  return (
    <View style={[styles.glyph, focused && styles.glyphActive]}>
      <View style={[styles.glyphInner, focused && styles.glyphInnerActive]} />
    </View>
  );
}

export default function TabLayout() {
  return (
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
  );
}

const styles = StyleSheet.create({
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
});
