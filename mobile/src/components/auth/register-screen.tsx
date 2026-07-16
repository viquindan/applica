import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/animated-pressable';
import { GradientButton } from '@/components/gradient-button';
import { ThemedText } from '@/components/themed-text';
import { Gold, Gradients, Radius, Spacing, TextGold } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';

const SECURITY_QUESTIONS = [
  '¿Cuál es el nombre de tu primera mascota?',
  '¿En qué ciudad naciste?',
  '¿Cuál es tu comida favorita?',
  '¿Cuál fue el nombre de tu escuela primaria?',
];

type Props = { onSwitchToLogin: () => void };

export function RegisterScreen({ onSwitchToLogin }: Props) {
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [securityQuestion, setSecurityQuestion] = useState(SECURITY_QUESTIONS[0]);
  const [securityAnswer, setSecurityAnswer] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    setError(null);
    if (!name.trim() || !email.trim() || password.length < 8 || !securityAnswer.trim()) {
      setError('Completa todos los campos. La contraseña necesita al menos 8 caracteres.');
      return;
    }
    setSubmitting(true);
    try {
      await register({ name: name.trim(), email: email.trim(), password, securityQuestion, securityAnswer: securityAnswer.trim() });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear la cuenta.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={Gradients.petrolHero} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <ThemedText type="subtitle" style={styles.title}>Crear cuenta</ThemedText>

          <TextInput style={styles.input} placeholder="Nombre completo" placeholderTextColor="#71797a" value={name} onChangeText={setName} />
          <TextInput style={styles.input} placeholder="Email" placeholderTextColor="#71797a" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
          <TextInput style={styles.input} placeholder="Contraseña (mín. 8 caracteres)" placeholderTextColor="#71797a" secureTextEntry value={password} onChangeText={setPassword} />

          <ThemedText style={styles.sectionLabel}>Pregunta de seguridad</ThemedText>
          <ThemedText style={styles.hint}>La usaremos para que recuperes tu cuenta sin depender de correo.</ThemedText>
          <View style={styles.questionPicker}>
            {SECURITY_QUESTIONS.map((q) => (
              <AnimatedPressable key={q} haptic="light" onPress={() => setSecurityQuestion(q)}>
                <View style={[styles.questionOption, securityQuestion === q && styles.questionOptionActive]}>
                  <ThemedText style={[styles.questionOptionText, securityQuestion === q && styles.questionOptionTextActive]}>{q}</ThemedText>
                </View>
              </AnimatedPressable>
            ))}
          </View>
          <TextInput style={styles.input} placeholder="Tu respuesta" placeholderTextColor="#71797a" value={securityAnswer} onChangeText={setSecurityAnswer} />

          {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}

          <View style={styles.buttonSpacing}>
            <GradientButton label="Crear cuenta" onPress={onSubmit} loading={submitting} />
          </View>

          <ThemedText onPress={onSwitchToLogin} style={styles.switchLink}>Ya tengo cuenta - Entrar</ThemedText>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  scroll: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.six },
  title: { color: '#FAF9F9', fontSize: 22, marginBottom: Spacing.two },
  input: { backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: Radius.sm, paddingHorizontal: Spacing.three, paddingVertical: Spacing.three, fontSize: 15, color: '#1A1C1C' },
  sectionLabel: { color: '#FAF9F9', fontSize: 13, fontWeight: '700', marginTop: Spacing.two },
  hint: { color: '#B9C0C1', fontSize: 12, marginTop: -4 },
  questionPicker: { gap: Spacing.two },
  questionOption: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: Radius.sm, padding: Spacing.two },
  questionOptionActive: { backgroundColor: Gold },
  questionOptionText: { color: '#B9C0C1', fontSize: 13 },
  questionOptionTextActive: { color: TextGold, fontWeight: '700' },
  error: { color: '#f0a3a3', fontSize: 13 },
  buttonSpacing: { marginTop: Spacing.two },
  switchLink: { color: '#B9C0C1', textAlign: 'center', marginTop: Spacing.three, fontSize: 13 },
});
