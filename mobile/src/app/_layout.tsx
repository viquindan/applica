import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { AppState, useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AuthFlow } from '@/components/auth/auth-flow';
import { AuthProvider, useAuth } from '@/hooks/use-auth';
import { usePushNotifications } from '@/hooks/use-push-notifications';

SplashScreen.preventAutoHideAsync();

// React Query's default focus signal is web-only (window focus events); on RN
// it never fires, so stale data survived backgrounding the app. Feed it
// AppState instead - foregrounding now revalidates active queries.
focusManager.setEventListener((handleFocus) => {
  const sub = AppState.addEventListener('change', (state) => handleFocus(state === 'active'));
  return () => sub.remove();
});

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: true, staleTime: 15_000 } },
});

function Gate() {
  const { status } = useAuth();
  usePushNotifications(status === 'signedIn');
  // AnimatedSplashOverlay owns hiding the native splash on its own layout -
  // whatever renders here (or null, while status==='loading') sits behind it.
  if (status === 'loading') return null;
  if (status === 'signedOut') return <AuthFlow />;
  // (tabs) owns the bottom tab bar; detail/modal screens stack on top of it.
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="application/[id]" options={{ headerShown: true, title: '' }} />
      <Stack.Screen name="linkedin-apply/[id]" options={{ headerShown: true, title: 'LinkedIn' }} />
      <Stack.Screen name="streak-progress" options={{ headerShown: true, title: 'Tu progreso', presentation: 'modal' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AnimatedSplashOverlay />
          <Gate />
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
