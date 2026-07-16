import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { api } from '@/api/client';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Requests permission and registers this device's Expo push token with the
 * backend (POST /api/mobile/device-token) once the user is signed in. No-ops
 * silently on a simulator/emulator (no push capability) or before an EAS
 * project id exists (see the mobile plan's Phase 4 / EAS Build step).
 */
export function usePushNotifications(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !Device.isDevice) return;
    let cancelled = false;

    (async () => {
      const { status: existing } = await Notifications.getPermissionsAsync();
      let status = existing;
      if (status !== 'granted') {
        const req = await Notifications.requestPermissionsAsync();
        status = req.status;
      }
      if (status !== 'granted' || cancelled) return;

      const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? (Constants as any).easConfig?.projectId;
      if (!projectId) return;

      try {
        const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
        if (cancelled) return;
        await api.post('/api/mobile/device-token', { expoPushToken: token, platform: Platform.OS });
      } catch (e) {
        console.warn('[push] Could not register device token:', (e as Error)?.message ?? e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled]);
}
