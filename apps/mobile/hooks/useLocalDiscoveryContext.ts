import { useEffect, useState } from 'react';
import * as Location from 'expo-location';

export type LocalDiscoveryPermission = 'checking' | 'granted' | 'denied' | 'unavailable';

export interface LocalDiscoveryContext {
  permission: LocalDiscoveryPermission;
  marketLabel: string;
  coordinates: {
    latitude: number;
    longitude: number;
  } | null;
  usingFallbackMarket: boolean;
}

const FALLBACK_MARKET = 'Southern California';

export function useLocalDiscoveryContext(): LocalDiscoveryContext {
  const [context, setContext] = useState<LocalDiscoveryContext>({
    permission: 'checking',
    marketLabel: FALLBACK_MARKET,
    coordinates: null,
    usingFallbackMarket: true,
  });

  useEffect(() => {
    let active = true;

    async function loadLocation() {
      try {
        const servicesEnabled = await Location.hasServicesEnabledAsync();
        if (!servicesEnabled) {
          if (active) {
            setContext({
              permission: 'unavailable',
              marketLabel: FALLBACK_MARKET,
              coordinates: null,
              usingFallbackMarket: true,
            });
          }
          return;
        }

        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted) {
          if (active) {
            setContext({
              permission: 'denied',
              marketLabel: FALLBACK_MARKET,
              coordinates: null,
              usingFallbackMarket: true,
            });
          }
          return;
        }

        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const geocode = await Location.reverseGeocodeAsync({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        const firstPlace = geocode[0];
        const marketLabel = firstPlace?.city || firstPlace?.region || FALLBACK_MARKET;

        if (active) {
          setContext({
            permission: 'granted',
            marketLabel,
            coordinates: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            },
            usingFallbackMarket: false,
          });
        }
      } catch {
        if (active) {
          setContext({
            permission: 'unavailable',
            marketLabel: FALLBACK_MARKET,
            coordinates: null,
            usingFallbackMarket: true,
          });
        }
      }
    }

    loadLocation();
    return () => {
      active = false;
    };
  }, []);

  return context;
}
