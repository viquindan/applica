import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GradientButton } from '@/components/gradient-button';
import { ThemedText } from '@/components/themed-text';
import { Gold, Gradients, Radius, Shadows, Spacing, TextGold } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';

type Props = { onSwitchToRegister: () => void; onSwitchToForgot: () => void };

export function LoginScreen({ onSwitchToRegister, onSwitchToForgot }: Props) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar sesión.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={Gradients.petrolHero} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safeArea}>
        <Animated.View entering={FadeInDown.duration(500)} style={styles.hero}>
          <View style={styles.badgeShadow}>
            <LinearGradient colors={Gradients.gold} style={styles.badge}>
              <ThemedText style={styles.badgeText}>A</ThemedText>
            </LinearGradient>
          </View>
          <ThemedText type="title" style={styles.title}>Applica</ThemedText>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(500).delay(120)} style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#71797a"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            placeholder="Contraseña"
            placeholderTextColor="#71797a"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}
          <GradientButton label="Entrar" onPress={onSubmit} loading={submitting} />

          <ThemedText onPress={onSwitchToForgot} style={styles.forgotLink}>Olvidé mi contraseña</ThemedText>
          <ThemedText onPress={onSwitchToRegister} style={styles.registerLink}>¿No tienes cuenta? Crear una</ThemedText>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, padding: Spacing.four, justifyContent: 'center', gap: Spacing.six },
  hero: { alignItems: 'center', gap: Spacing.three },
  badgeShadow: { borderRadius: Radius.lg, ...Shadows.gold },
  badge: { width: 56, height: 56, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: TextGold, fontSize: 28, fontWeight: '800' },
  title: { color: '#FAF9F9', fontSize: 24, fontWeight: '700' },
  form: { gap: Spacing.three },
  input: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 15,
    color: '#1A1C1C',
  },
  error: { color: '#f0a3a3', fontSize: 13 },
  forgotLink: { color: '#B9C0C1', textAlign: 'center', fontSize: 13, marginTop: Spacing.three },
  registerLink: { color: Gold, textAlign: 'center', fontSize: 13, fontWeight: '700', marginTop: Spacing.two },
});
