import { useState } from 'react';

import { ForgotPasswordScreen } from '@/components/auth/forgot-password-screen';
import { LoginScreen } from '@/components/auth/login-screen';
import { OnboardingScreen } from '@/components/auth/onboarding-screen';
import { RegisterScreen } from '@/components/auth/register-screen';
import { useAuth } from '@/hooks/use-auth';

type Screen = 'login' | 'register' | 'forgot';

// Signed-out flow: first-ever open shows the 3-step onboarding once (flag
// persisted in SecureStore), then login <-> register <-> forgot-password.
export function AuthFlow() {
  const { onboarded, finishOnboarding } = useAuth();
  const [screen, setScreen] = useState<Screen>('login');

  if (!onboarded) return <OnboardingScreen onDone={finishOnboarding} />;

  if (screen === 'register') return <RegisterScreen onSwitchToLogin={() => setScreen('login')} />;
  if (screen === 'forgot') return <ForgotPasswordScreen onSwitchToLogin={() => setScreen('login')} />;
  return <LoginScreen onSwitchToRegister={() => setScreen('register')} onSwitchToForgot={() => setScreen('forgot')} />;
}
