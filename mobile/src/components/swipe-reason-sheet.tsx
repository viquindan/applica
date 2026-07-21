import { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Gold, Petrol, Radius, Spacing, TextGold } from '@/constants/theme';
import type { SwipeDecision } from '@/api/swipeFeedback';

type Props = {
  visible: boolean;
  decision: SwipeDecision | null;
  submitting?: boolean;
  onSubmit: (reason: string) => void;
  onCancel: () => void;
};

// Motor de afinamiento (solo cuenta habilitada, ver docs/SEARCH-ENGINE.md):
// captura obligatoriamente el motivo detrás de cada swipe para poder derivar
// reglas nuevas de scoring/eligibilidad más adelante. Mismo esqueleto que
// UnansweredSheet (Pendientes), pero un solo campo y sin salida "sáltalo".
export function SwipeReasonSheet({ visible, decision, submitting, onSubmit, onCancel }: Props) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (visible) setReason('');
  }, [visible]);

  const canSubmit = reason.trim().length > 0 && !submitting;
  const title = decision === 'positive' ? '¿Por qué aplicas a esta vacante?' : '¿Por qué la descartas?';

  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ThemedText type="subtitle" style={styles.title}>{title}</ThemedText>
          <ScrollView keyboardShouldPersistTaps="handled" style={styles.fieldScroll}>
            <TextInput
              style={styles.input}
              value={reason}
              onChangeText={setReason}
              placeholder="Explica tu decisión..."
              placeholderTextColor="#9aa3a4"
              multiline
              numberOfLines={4}
              autoFocus
              accessibilityLabel="Motivo de la decisión"
            />
          </ScrollView>
          <ThemedText
            onPress={() => canSubmit && onSubmit(reason.trim())}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSubmit }}
            style={[styles.submit, !canSubmit && styles.submitDisabled]}>
            {submitting ? 'Enviando...' : 'Enviar'}
          </ThemedText>
          <ThemedText onPress={submitting ? undefined : onCancel} accessibilityRole="button" style={styles.cancel}>
            Cancelar
          </ThemedText>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(12,34,38,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.four, maxHeight: '75%' },
  title: { color: Petrol, marginBottom: Spacing.three },
  fieldScroll: { flexGrow: 0 },
  input: {
    borderWidth: 1, borderColor: '#e5e3e2', borderRadius: Radius.sm,
    paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, fontSize: 14,
    minHeight: 96, textAlignVertical: 'top',
  },
  submit: {
    backgroundColor: Gold, color: TextGold, fontWeight: '700', textAlign: 'center',
    paddingVertical: Spacing.three, borderRadius: Radius.full, overflow: 'hidden', marginTop: Spacing.three,
  },
  submitDisabled: { opacity: 0.4 },
  cancel: { textAlign: 'center', color: '#5c6366', paddingVertical: Spacing.three, marginTop: Spacing.one },
});
