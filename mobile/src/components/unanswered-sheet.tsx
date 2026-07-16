import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Gold, Petrol, Radius, Spacing, TextGold } from '@/constants/theme';

type Props = {
  fields: string[];
  onSubmit: (answers: Record<string, string>) => void;
  onDismiss: () => void;
};

export function UnansweredSheet({ fields, onSubmit, onDismiss }: Props) {
  const [values, setValues] = useState<Record<string, string>>({});

  return (
    <Modal transparent animationType="slide" visible={fields.length > 0} onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ThemedText type="subtitle" style={styles.title}>Faltan algunos datos</ThemedText>
          <ScrollView keyboardShouldPersistTaps="handled" style={styles.fieldsScroll}>
            {fields.map((f) => (
              <View key={f} style={styles.field}>
                <ThemedText style={styles.label}>{f}</ThemedText>
                <TextInput
                  style={styles.input}
                  value={values[f] ?? ''}
                  onChangeText={(t) => setValues((v) => ({ ...v, [f]: t }))}
                  accessibilityLabel={f}
                />
              </View>
            ))}
          </ScrollView>
          <ThemedText onPress={() => onSubmit(values)} accessibilityRole="button" style={styles.submit}>Continuar</ThemedText>
          <ThemedText onPress={onDismiss} accessibilityRole="button" style={styles.cancel}>Ahora no</ThemedText>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(12,34,38,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, padding: Spacing.four, maxHeight: '75%' },
  title: { color: Petrol, marginBottom: Spacing.three },
  fieldsScroll: { flexGrow: 0 },
  field: { marginBottom: Spacing.three },
  label: { fontSize: 13, color: '#414849', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#e5e3e2', borderRadius: Radius.sm, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, fontSize: 14 },
  submit: { backgroundColor: Gold, color: TextGold, fontWeight: '700', textAlign: 'center', paddingVertical: Spacing.three, borderRadius: Radius.full, overflow: 'hidden', marginTop: Spacing.two },
  cancel: { textAlign: 'center', color: '#5c6366', paddingVertical: Spacing.three, marginTop: Spacing.one },
});
