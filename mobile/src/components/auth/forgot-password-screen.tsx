import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GradientButton } from '@/components/gradient-button';
import { ThemedText } from '@/components/themed-text';
import { Gold, Gradients, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';

type Props = { onSwitchToLogin: () => void };

export function ForgotPasswordScreen({ onSwitchToLogin }: Props) {
  const { forgotPasswordQuestion, resetPassword } = useAuth();
  const [step, setStep] = useState<'email' | 'answer'>('email');
  const [email, setEmail] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onFindQuestion() {
    setError(null);
    setSubmitting(true);
    try {
      const q = await forgotPasswordQuestion(email.trim());
      setQuestion(q);
      setStep('answer');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo encontrar la cuenta.');
    } finally {
      setSubmitting(false);
    }
  }

  async function onReset() {
    setError(null);
    if (newPassword.length < 8) {
      setError('La nueva contraseña necesita al menos 8 caracteres.');
      return;
    }
    setSubmitting(true);
    try {
      await resetPassword({ email: email.trim(), answer, newPassword });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Respuesta incorrecta.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={Gradients.petrolHero} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <ThemedText type="subtitle" style={styles.title}>Recuperar contraseña</ThemedText>

          {step === 'email' ? (
            <Animated.View entering={FadeIn.duration(300)} style={styles.fields}>
              <ThemedText style={styles.hint}>Escribe tu email y te mostramos tu pregunta de seguridad.</ThemedText>
              <TextInput style={styles.input} placeholder="Email" placeholderTextColor="#71797a" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
              {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}
              <GradientButton label="Continuar" onPress={onFindQuestion} loading={submitting} />
            </Animated.View>
          ) : (
            <Animated.View entering={FadeIn.duration(300)} style={styles.fields}>
              <ThemedText style={styles.question}>{question}</ThemedText>
              <TextInput style={styles.input} placeholder="Tu respuesta" placeholderTextColor="#71797a" value={answer} onChangeText={setAnswer} />
              <TextInput style={styles.input} placeholder="Nueva contraseña" placeholderTextColor="#71797a" secureTextEntry value={newPassword} onChangeText={setNewPassword} />
              {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}
              <GradientButton label="Cambiar contraseña" onPress={onReset} loading={submitting} />
            </Animated.View>
          )}

          <ThemedText onPress={onSwitchToLogin} style={styles.switchLink}>Volver a entrar</ThemedText>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', padding: Spacing.four, gap: Spacing.three },
  fields: { gap: Spacing.three },
  title: { color: '#FAF9F9', fontSize: 22 },
  hint: { color: '#B9C0C1', fontSize: 13 },
  question: { color: Gold, fontSize: 15, fontWeight: '700', marginBottom: Spacing.two },
  input: { backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: Radius.sm, paddingHorizontal: Spacing.three, paddingVertical: Spacing.three, fontSize: 15, color: '#1A1C1C' },
  error: { color: '#f0a3a3', fontSize: 13 },
  switchLink: { color: '#B9C0C1', textAlign: 'center', marginTop: Spacing.four, fontSize: 13 },
});
