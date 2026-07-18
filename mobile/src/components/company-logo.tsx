import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Petrol } from '@/constants/theme';

// Same "guess the domain" trick as the web CompanyLogo (JobCardUI.tsx) - no
// logo API key needed. Clearbit's Logo API is dead (confirmed: connection
// failure on every domain), so this uses Google's public favicon service
// instead, which is still live and needs no key either. Falls back to an
// initial-letter avatar on any load error (wrong guess, no favicon, offline).
export function CompanyLogo({ companyName, size = 44 }: { companyName?: string | null; size?: number }) {
  const [error, setError] = useState(false);
  const name = companyName?.trim();
  const initial = (name?.charAt(0) ?? '?').toUpperCase();

  if (error || !name || name === 'N/A') {
    return (
      <View style={[styles.fallback, { width: size, height: size, borderRadius: size / 4 }]}>
        <ThemedText style={[styles.fallbackText, { fontSize: size * 0.4 }]}>{initial}</ThemedText>
      </View>
    );
  }

  const domain = name.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com';

  return (
    <Image
      source={{ uri: `https://www.google.com/s2/favicons?domain=${domain}&sz=128` }}
      style={[styles.image, { width: size, height: size, borderRadius: size / 4 }]}
      contentFit="contain"
      onError={() => setError(true)}
    />
  );
}

const styles = StyleSheet.create({
  image: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#eeeeed' },
  fallback: { backgroundColor: 'rgba(18,51,56,0.06)', alignItems: 'center', justifyContent: 'center' },
  fallbackText: { color: Petrol, fontWeight: '800' },
});
