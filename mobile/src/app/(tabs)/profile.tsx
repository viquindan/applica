import * as DocumentPicker from 'expo-document-picker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getToken } from '@/api/auth';
import { AVATAR_URL, getProfileData, saveProfile, sendTestPush, uploadAvatar } from '@/api/profile';
import { activateResume, deleteResume, uploadBaseResume } from '@/api/resumes';
import { AnimatedPressable } from '@/components/animated-pressable';
import { GradientButton } from '@/components/gradient-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Gold, GoldDim, Gradients, Petrol, Radius, Shadows, Spacing, TextGold } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useRefreshOnFocus } from '@/hooks/use-refresh-on-focus';
import { useTheme } from '@/hooks/use-theme';
import type { Language, ProfessionalProfile, ProfileUser, Resume } from '@/types';
import { COUNTRIES } from '@/constants/countries';

const REMOTE_REGIONS = ['Europa', 'América del Norte', 'América Latina', 'Asia', 'Medio Oriente', 'África', 'Oceanía'];
const LANGUAGE_OPTIONS = ['Spanish', 'English', 'French', 'Portuguese', 'German', 'Italian', 'Mandarin', 'Japanese', 'Other'];
const LANGUAGE_LABELS: Record<string, string> = {
  Spanish: 'Español', English: 'Inglés', French: 'Francés', Portuguese: 'Portugués',
  German: 'Alemán', Italian: 'Italiano', Mandarin: 'Mandarín', Japanese: 'Japonés', Other: 'Otro',
};
const PROFICIENCY_OPTIONS = ['Native', 'C2', 'C1', 'B2', 'B1', 'A2', 'A1'];
const PROFICIENCY_LABELS: Record<string, string> = {
  Native: 'Nativo', C2: 'C2', C1: 'C1', B2: 'B2', B1: 'B1', A2: 'A2', A1: 'A1',
};

type FormState = {
  name: string;
  phone: string;
  location: string;
  country: string;
  linkedin: string;
  portfolio: string;
  noticePeriod: string;
  targetRoles: string[];
  salaryMin: string;
  salaryCurrency: string;
  acceptsRemote: boolean;
  remoteScope: 'worldwide' | 'regions';
  remoteRegions: string[];
  acceptsHybrid: boolean;
  hybridLocations: string[];
  acceptsOnsite: boolean;
  onsiteLocations: string[];
  targetCountries: string[];
  skills: Array<{ skill: string; level?: string }>;
  languages: Language[];
};

const TABS = [
  { key: 'contact', label: 'Perfil' },
  { key: 'cv', label: 'CV' },
  { key: 'skills', label: 'Experiencia' },
  { key: 'prefs', label: 'Preferencias' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

function toForm(user: ProfileUser | null, profile: ProfessionalProfile | null): FormState {
  const prefs = user?.workModalityPrefs;
  return {
    name: user?.name ?? '',
    phone: user?.phone ?? '',
    location: user?.location ?? '',
    country: user?.country ?? '',
    linkedin: user?.linkedin ?? '',
    portfolio: user?.portfolio ?? '',
    noticePeriod: user?.noticePeriod ?? '',
    targetRoles: profile?.targetRoles ?? [],
    salaryMin: user?.salaryMin != null ? String(user.salaryMin) : '',
    salaryCurrency: user?.salaryCurrency ?? 'USD',
    acceptsRemote: prefs?.acceptsRemote ?? false,
    remoteScope: prefs?.remoteScope ?? 'worldwide',
    remoteRegions: prefs?.remoteRegions ?? [],
    acceptsHybrid: prefs?.acceptsHybrid ?? false,
    hybridLocations: prefs?.hybridLocations ?? [],
    acceptsOnsite: prefs?.acceptsOnsite ?? false,
    onsiteLocations: prefs?.onsiteLocations ?? [],
    targetCountries: profile?.targetCountries ?? [],
    skills: normalizeSkills(profile?.skills),
    languages: user?.languages ?? [],
  };
}

function normalizeSkills(value: unknown): Array<{ skill: string; level?: string }> {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === 'string') return { skill: item };
    if (item && typeof item === 'object') {
      const row = item as { skill?: unknown; name?: unknown; level?: unknown };
      return {
        skill: String(row.skill ?? row.name ?? '').trim(),
        ...(row.level ? { level: String(row.level) } : {}),
      };
    }
    return { skill: '' };
  }).filter((item) => item.skill.length > 0);
}

export default function ProfileScreen() {
  const theme = useTheme();
  const { user: authUser, logout } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({ queryKey: ['profile'], queryFn: getProfileData });
  useRefreshOnFocus(refetch);
  const [form, setForm] = useState<FormState>(toForm(null, null));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarNonce, setAvatarNonce] = useState(0);
  const [authHeader, setAuthHeader] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('contact');
  const [testingPush, setTestingPush] = useState(false);

  async function onSendTestPush() {
    setTestingPush(true);
    setMessage(null);
    try {
      await sendTestPush();
      setMessage('Notificación enviada. Debería llegar en unos segundos.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'No se pudo enviar la notificación de prueba.');
    } finally {
      setTestingPush(false);
    }
  }

  useEffect(() => {
    if (data) setForm(toForm(data.user, data.profile));
  }, [data?.user, data?.profile]);

  // expo-image needs the Authorization header up front (source.headers), not
  // fetched lazily like the JSON api client - load it once per session.
  useEffect(() => {
    getToken().then((token) => setAuthHeader(token ? { Authorization: `Bearer ${token}` } : {}));
  }, []);

  const initial = (data?.user?.name ?? authUser?.name ?? '?').trim().charAt(0).toUpperCase();

  async function onSave() {
    setSaving(true);
    setMessage(null);
    try {
      // PUT /api/profile has no partial-merge - fields left out get wiped. Spread
      // everything we fetched (experience/education/etc we don't edit here) and
      // only override what this form actually changed.
      await saveProfile({
        name: form.name,
        email: data?.user?.email,
        phone: form.phone,
        location: form.location,
        country: form.country,
        linkedin: form.linkedin,
        portfolio: form.portfolio,
        noticePeriod: form.noticePeriod,
        languages: form.languages,
        workAuthorization: data?.user?.workAuthorization ?? [],
        relocationAvailable: data?.user?.relocationAvailable ?? false,
        salaryMin: form.salaryMin ? Number(form.salaryMin) : null,
        salaryCurrency: form.salaryCurrency,
        // Full shape - fitScorer.ts's remoteScope/remoteRegions/hybridLocations/
        // onsiteLocations are how "remote worldwide + hybrid/onsite only in my
        // own country" actually gets enforced. Sending just the 3 booleans
        // silently wiped this the first time (PUT /api/profile has no partial
        // merge) and broke real search targeting - never regress this again.
        workModalityPrefs: {
          acceptsRemote: form.acceptsRemote,
          remoteScope: form.remoteScope,
          remoteRegions: form.remoteRegions,
          acceptsHybrid: form.acceptsHybrid,
          hybridLocations: form.hybridLocations,
          acceptsOnsite: form.acceptsOnsite,
          onsiteLocations: form.onsiteLocations,
        },
        targetRoles: form.targetRoles,
        targetCountries: form.targetCountries,
        experience: data?.profile?.experience ?? [],
        education: data?.profile?.education ?? [],
        certifications: data?.profile?.certifications ?? [],
        skills: form.skills,
      });
      setMessage('Guardado.');
      qc.invalidateQueries({ queryKey: ['profile'] });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  async function onPickResume() {
    let result: DocumentPicker.DocumentPickerResult;
    try {
      result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      });
    } catch (e) {
      // Without this, a native picker failure dies as an unhandled rejection
      // and the UI silently returns to Perfil with no trace.
      setMessage(e instanceof Error ? e.message : 'No se pudo abrir el selector de archivos.');
      return;
    }
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setUploading(true);
    setMessage(null);
    try {
      await uploadBaseResume({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType });
      setMessage('CV subido. Buscando vacantes...');
      qc.invalidateQueries({ queryKey: ['profile'] });
      qc.invalidateQueries({ queryKey: ['applications'] });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'No se pudo subir el CV.');
    } finally {
      setUploading(false);
    }
  }

  async function onPickAvatar() {
    // expo-image-picker isn't installed (would need a new EAS dev-client
    // build); expo-document-picker filtered to images works without one and
    // is already a dependency (used for CV upload above).
    let result: DocumentPicker.DocumentPickerResult;
    try {
      result = await DocumentPicker.getDocumentAsync({ type: ['image/jpeg', 'image/png', 'image/webp'] });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'No se pudo abrir el selector de fotos.');
      return;
    }
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setUploadingAvatar(true);
    setMessage(null);
    try {
      await uploadAvatar({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType });
      setAvatarNonce(Date.now());
      qc.invalidateQueries({ queryKey: ['profile'] });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'No se pudo subir la foto.');
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function onActivateResume(id: string) {
    await activateResume(id);
    qc.invalidateQueries({ queryKey: ['profile'] });
  }

  async function onDeleteResume(id: string) {
    await deleteResume(id);
    qc.invalidateQueries({ queryKey: ['profile'] });
  }

  const visibleResumes = (data?.resumes ?? []).filter((resume) => (
    resume.version === 1 || /\.(pdf|docx?|rtf)$/i.test(resume.label.trim())
  ));
  const activeResume = visibleResumes.find((r) => r.isBase);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <View style={styles.identity}>
            <AnimatedPressable
              haptic="light"
              onPress={onPickAvatar}
              accessibilityLabel="Cambiar foto de perfil"
              accessibilityHint="Abre el selector para elegir una nueva foto"
              style={styles.avatarShadow}>
              {data?.user?.avatarPath && Object.keys(authHeader).length > 0 ? (
                <Image
                  source={{ uri: `${AVATAR_URL}?v=${avatarNonce}`, headers: authHeader }}
                  style={styles.avatar}
                  contentFit="cover"
                  transition={150}
                />
              ) : (
                <LinearGradient colors={Gradients.gold} style={styles.avatar}>
                  <ThemedText style={styles.avatarText}>{initial}</ThemedText>
                </LinearGradient>
              )}
              {uploadingAvatar ? (
                <View style={styles.avatarOverlay}>
                  <ActivityIndicator color="#fff" size="small" />
                </View>
              ) : (
                <View style={styles.avatarEditBadge}>
                  <ThemedText style={styles.avatarEditBadgeText}>✎</ThemedText>
                </View>
              )}
            </AnimatedPressable>
            <View>
              <ThemedText type="subtitle" style={[styles.name, { color: theme.text }]}>{data?.user?.name ?? authUser?.name}</ThemedText>
              <ThemedText style={[styles.email, { color: theme.textSecondary }]}>{data?.user?.email ?? authUser?.email}</ThemedText>
            </View>
          </View>

          {activeResume ? (
            <ThemedText style={[styles.activeResumeHint, { color: theme.textSecondary }]} numberOfLines={1}>
              La búsqueda usa: {activeResume.label}
            </ThemedText>
          ) : null}

          <View style={styles.tabBar}>
            {TABS.map((t) => (
              <AnimatedPressable key={t.key} haptic="light" onPress={() => setTab(t.key)} style={[styles.tabButton, { backgroundColor: theme.backgroundElement }, tab === t.key && styles.tabButtonActive]}>
                <ThemedText style={[styles.tabButtonText, { color: theme.textSecondary }, tab === t.key && styles.tabButtonTextActive]}>{t.label}</ThemedText>
              </AnimatedPressable>
            ))}
          </View>
        </View>

        {isLoading ? (
          <ActivityIndicator color={Petrol} style={{ marginTop: Spacing.four }} />
        ) : (
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            {tab === 'cv' ? (
              <>
                <Section title="CVs">
                  {visibleResumes.map((r) => (
                    <ResumeRow key={r.id} resume={r} onActivate={() => onActivateResume(r.id)} onDelete={() => onDeleteResume(r.id)} />
                  ))}
                  {!visibleResumes.length ? <ThemedText style={[styles.empty, { color: theme.textSecondary }]}>Sin CVs subidos todavía.</ThemedText> : null}
                  <GradientButton label={uploading ? 'Subiendo...' : 'Subir CV'} onPress={onPickResume} loading={uploading} variant="secondary" />
                </Section>

              </>
            ) : null}

            {tab === 'skills' ? (
              <>
                {data?.profile?.experience?.length ? (
                  <Section title="Experiencia">
                    {data.profile.experience.map((exp, i) => (
                      <View key={i} style={[styles.readCard, { backgroundColor: theme.backgroundElement }]}>
                        <ThemedText style={styles.readTitle}>{exp.role ?? 'Rol'}</ThemedText>
                        <ThemedText style={styles.readSubtitle}>
                          {exp.company}{exp.current ? ' · Actual' : ''}
                        </ThemedText>
                        {exp.startDate ? (
                          <ThemedText style={styles.readMeta}>{exp.startDate}{exp.endDate ? ` - ${exp.endDate}` : exp.current ? ' - presente' : ''}</ThemedText>
                        ) : null}
                        {exp.description ? (
                          <ThemedText style={styles.readBody} numberOfLines={4}>{exp.description}</ThemedText>
                        ) : null}
                      </View>
                    ))}
                  </Section>
                ) : null}

                {data?.profile?.education?.length ? (
                  <Section title="Educación">
                    {data.profile.education.map((ed, i) => (
                      <View key={i} style={[styles.readCard, { backgroundColor: theme.backgroundElement }]}>
                        <ThemedText style={styles.readTitle}>{ed.degree ?? ed.field ?? 'Título'}</ThemedText>
                        <ThemedText style={styles.readSubtitle}>{ed.institution}{ed.year ? ` · ${ed.year}` : ''}</ThemedText>
                      </View>
                    ))}
                  </Section>
                ) : null}

                <Section title="Habilidades">
                  <SkillEditor skills={form.skills} onChange={(skills) => setForm((f) => ({ ...f, skills }))} />
                </Section>

                {message ? <ThemedText style={styles.message}>{message}</ThemedText> : null}
                <View style={styles.saveWrap}>
                  <GradientButton label="Guardar cambios" onPress={onSave} loading={saving} />
                </View>
              </>
            ) : null}

            {tab === 'contact' ? (
              <>
                <Section title="Datos de contacto">
                  <LabeledInput label="Nombre" value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} />
                  <LabeledInput label="Teléfono" value={form.phone} onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))} />
                  <LabeledInput label="Ubicación" value={form.location} onChangeText={(v) => setForm((f) => ({ ...f, location: v }))} />
                  <CountryInput label="País" value={form.country} onChangeText={(v) => setForm((f) => ({ ...f, country: v }))} />
                  <LabeledInput label="LinkedIn" value={form.linkedin} onChangeText={(v) => setForm((f) => ({ ...f, linkedin: v }))} autoCapitalize="none" />
                  <LabeledInput label="Portafolio" value={form.portfolio} onChangeText={(v) => setForm((f) => ({ ...f, portfolio: v }))} autoCapitalize="none" />
                </Section>

                <Section title="Roles objetivo">
                  <RoleEditor roles={form.targetRoles} onChange={(roles) => setForm((f) => ({ ...f, targetRoles: roles }))} />
                </Section>

                {message ? <ThemedText style={styles.message}>{message}</ThemedText> : null}
                <View style={styles.saveWrap}>
                  <GradientButton label="Guardar cambios" onPress={onSave} loading={saving} />
                </View>
              </>
            ) : null}

            {tab === 'prefs' ? (
              <>
                <Section title="Idiomas">
                  <LanguageEditor languages={form.languages} onChange={(languages) => setForm((f) => ({ ...f, languages }))} />
                </Section>

                <Section title="Modalidad de trabajo">
                  <ThemedText style={styles.hint}>
                    Elige todas las que acepten. Presencial e híbrido se limitan a los países que agregues abajo (no podemos asistir a una oficina en un país donde no vivimos ni tenemos permiso de trabajo) - remoto puede ser mundial.
                  </ThemedText>
                  <View style={styles.toggleRow}>
                    <ToggleChip label="Remoto" active={form.acceptsRemote} onPress={() => setForm((f) => ({ ...f, acceptsRemote: !f.acceptsRemote }))} />
                    <ToggleChip label="Híbrido" active={form.acceptsHybrid} onPress={() => setForm((f) => ({ ...f, acceptsHybrid: !f.acceptsHybrid }))} />
                    <ToggleChip label="Presencial" active={form.acceptsOnsite} onPress={() => setForm((f) => ({ ...f, acceptsOnsite: !f.acceptsOnsite }))} />
                  </View>

                  {form.acceptsRemote ? (
                    <View style={[styles.subCard, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }]}>
                      <ThemedText style={[styles.subCardTitle, { color: theme.text }]}>Alcance remoto</ThemedText>
                      <View style={styles.toggleRow}>
                        <ToggleChip label="Todo el mundo" active={form.remoteScope === 'worldwide'} onPress={() => setForm((f) => ({ ...f, remoteScope: 'worldwide' }))} />
                        <ToggleChip label="Regiones específicas" active={form.remoteScope === 'regions'} onPress={() => setForm((f) => ({ ...f, remoteScope: 'regions' }))} />
                      </View>
                      {form.remoteScope === 'regions' ? (
                        <View style={[styles.toggleRow, { marginTop: Spacing.two }]}>
                          {REMOTE_REGIONS.map((region) => (
                            <ToggleChip
                              key={region}
                              label={region}
                              active={form.remoteRegions.includes(region)}
                              onPress={() => setForm((f) => ({
                                ...f,
                                remoteRegions: f.remoteRegions.includes(region)
                                  ? f.remoteRegions.filter((r) => r !== region)
                                  : [...f.remoteRegions, region],
                              }))}
                            />
                          ))}
                        </View>
                      ) : null}
                    </View>
                  ) : null}

                  {form.acceptsHybrid ? (
                    <LocationList
                      title="Países donde aceptas híbrido"
                      locations={form.hybridLocations}
                      homeCountry={form.country}
                      onChange={(locs) => setForm((f) => ({ ...f, hybridLocations: locs }))}
                    />
                  ) : null}

                  {form.acceptsOnsite ? (
                    <LocationList
                      title="Países donde aceptas presencial"
                      locations={form.onsiteLocations}
                      homeCountry={form.country}
                      onChange={(locs) => setForm((f) => ({ ...f, onsiteLocations: locs }))}
                    />
                  ) : null}
                </Section>

                <Section title="Países objetivo">
                  <ThemedText style={styles.hint}>
                    Mercados en los que te interesa trabajar. No se excluye un rol presencial/híbrido en estos países aunque sean extranjeros - úsalo si buscas reubicarte a un mercado específico.
                  </ThemedText>
                  <LocationList
                    title="Añadir país"
                    locations={form.targetCountries}
                    homeCountry={form.country}
                    onChange={(locs) => setForm((f) => ({ ...f, targetCountries: locs }))}
                  />
                </Section>

                <Section title="Preferencias salariales">
                  <LabeledInput
                    label={`Mínimo mensual (${form.salaryCurrency})`}
                    value={form.salaryMin}
                    onChangeText={(v) => setForm((f) => ({ ...f, salaryMin: v.replace(/[^0-9]/g, '') }))}
                    keyboardType="number-pad"
                    placeholder="Ej. 5000"
                  />
                  <LabeledInput
                    label="Periodo de aviso (días)"
                    value={form.noticePeriod}
                    onChangeText={(v) => setForm((f) => ({ ...f, noticePeriod: v }))}
                    keyboardType="number-pad"
                    placeholder="Ej. 15"
                  />
                </Section>

                {message ? <ThemedText style={styles.message}>{message}</ThemedText> : null}
                <View style={styles.saveWrap}>
                  <GradientButton label="Guardar cambios" onPress={onSave} loading={saving} />
                </View>

                <View style={styles.saveWrap}>
                  <GradientButton
                    label={testingPush ? 'Enviando...' : 'Enviar notificación de prueba'}
                    onPress={onSendTestPush}
                    loading={testingPush}
                    variant="secondary"
                  />
                </View>

                <AnimatedPressable haptic="light" onPress={() => logout()}>
                  <ThemedText style={styles.logout}>Cerrar sesión</ThemedText>
                </AnimatedPressable>
              </>
            ) : null}
          </ScrollView>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.section}>
      <ThemedText style={[styles.sectionTitle, { color: theme.textSecondary }]}>{title}</ThemedText>
      {children}
    </View>
  );
}

function CountryInput({ label, value, onChangeText }: { label: string; value: string; onChangeText: (v: string) => void }) {
  const theme = useTheme();
  const [draft, setDraft] = useState(value);
  // Sync from outside (e.g. initial profile load) without fighting local typing.
  useEffect(() => { setDraft(value); }, [value]);

  const query = draft.trim().toLowerCase();
  // Never gated on focus/blur: blur fires before a tap on a suggestion
  // registers and would unmount the list before the press completes.
  const suggestions = draft !== value && query
    ? COUNTRIES.filter((c) => c.toLowerCase().includes(query)).slice(0, 6)
    : [];

  return (
    <View style={styles.fieldWrap}>
      <ThemedText style={[styles.fieldLabel, { color: theme.textSecondary }]}>{label}</ThemedText>
      <TextInput
        style={[styles.input, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected, color: theme.text }]}
        value={draft}
        onChangeText={setDraft}
        placeholder="Escribe un país..."
        placeholderTextColor="#a3a9aa"
      />
      {suggestions.length > 0 ? (
        <View style={[styles.suggestionBox, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }]}>
          {suggestions.map((s) => (
            <AnimatedPressable key={s} haptic="light" onPress={() => onChangeText(s)} style={styles.suggestionRow}>
              <ThemedText style={styles.suggestionText}>{s}</ThemedText>
            </AnimatedPressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function LabeledInput(props: { label: string; value: string; onChangeText: (v: string) => void; placeholder?: string; autoCapitalize?: 'none' | 'sentences'; keyboardType?: 'default' | 'number-pad' }) {
  const theme = useTheme();
  return (
    <View style={styles.fieldWrap}>
      <ThemedText style={[styles.fieldLabel, { color: theme.textSecondary }]}>{props.label}</ThemedText>
      <TextInput
        style={[styles.input, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected, color: theme.text }]}
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor="#a3a9aa"
        autoCapitalize={props.autoCapitalize ?? 'sentences'}
        keyboardType={props.keyboardType ?? 'default'}
      />
    </View>
  );
}

function ToggleChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <AnimatedPressable haptic="light" onPress={onPress} hitSlop={8} style={[styles.chip, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }, active && styles.chipActive]}>
      <ThemedText style={[styles.chipText, { color: theme.textSecondary }, active && styles.chipTextActive]}>{label}</ThemedText>
    </AnimatedPressable>
  );
}

function LocationList({ title, locations, homeCountry, onChange }: {
  title: string; locations: string[]; homeCountry: string; onChange: (locs: string[]) => void;
}) {
  const theme = useTheme();
  const [draft, setDraft] = useState('');
  const query = draft.trim().toLowerCase();
  const suggestions = query
    ? COUNTRIES.filter((c) => !locations.includes(c) && c.toLowerCase().includes(query)).slice(0, 6)
    : [];

  function addCountry(country: string) {
    if (!locations.includes(country)) onChange([...locations, country]);
    setDraft('');
  }

  return (
    <View style={[styles.subCard, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }]}>
      <ThemedText style={[styles.subCardTitle, { color: theme.text }]}>{title}</ThemedText>
      <View style={styles.toggleRow}>
        {locations.map((loc) => (
          <AnimatedPressable key={loc} haptic="light" onPress={() => onChange(locations.filter((l) => l !== loc))} hitSlop={8} accessibilityLabel={`Quitar ${loc}`} style={[styles.chip, styles.chipActive]}>
            <ThemedText style={styles.chipTextActive}>{loc} ✕</ThemedText>
          </AnimatedPressable>
        ))}
        {homeCountry && !locations.includes(homeCountry) ? (
          <AnimatedPressable haptic="light" onPress={() => onChange([...locations, homeCountry])} style={styles.chip}>
            <ThemedText style={styles.chipText}>+ {homeCountry}</ThemedText>
          </AnimatedPressable>
        ) : null}
      </View>
      <View style={styles.addRow}>
        <TextInput
          style={[styles.input, styles.addInput, { backgroundColor: theme.background, borderColor: theme.backgroundSelected, color: theme.text }]}
          value={draft}
          onChangeText={setDraft}
          placeholder="Escribe un país..."
          placeholderTextColor="#a3a9aa"
          onSubmitEditing={() => { if (suggestions.length === 1) addCountry(suggestions[0]); }}
        />
        {suggestions.length > 0 ? (
          <View style={[styles.suggestionBox, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }]}>
            {suggestions.map((s) => (
              <AnimatedPressable key={s} haptic="light" onPress={() => addCountry(s)} style={styles.suggestionRow}>
                <ThemedText style={styles.suggestionText}>{s}</ThemedText>
              </AnimatedPressable>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function RoleEditor({ roles, onChange }: { roles: string[]; onChange: (roles: string[]) => void }) {
  const theme = useTheme();
  const [draft, setDraft] = useState('');

  function addRole() {
    const v = draft.trim();
    if (v && !roles.includes(v)) onChange([...roles, v]);
    setDraft('');
  }

  return (
    <View style={[styles.subCard, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }]}>
      <View style={styles.toggleRow}>
        {roles.map((role, i) => (
          <AnimatedPressable key={i} haptic="light" onPress={() => onChange(roles.filter((_, idx) => idx !== i))} hitSlop={8} accessibilityLabel={`Quitar rol ${role}`} style={[styles.chip, styles.chipActive]}>
            <ThemedText style={styles.chipTextActive}>{role} ✕</ThemedText>
          </AnimatedPressable>
        ))}
        {!roles.length ? <ThemedText style={styles.empty}>Sin roles objetivo todavía.</ThemedText> : null}
      </View>
      <View style={styles.addRow}>
        <TextInput
          style={[styles.input, styles.addInput, { backgroundColor: theme.background, borderColor: theme.backgroundSelected, color: theme.text }]}
          value={draft}
          onChangeText={setDraft}
          placeholder="Ej. Product Manager"
          placeholderTextColor="#a3a9aa"
          onSubmitEditing={addRole}
          returnKeyType="done"
        />
      </View>
    </View>
  );
}

const SKILL_LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'Expert'];
const SKILL_LEVEL_LABELS: Record<string, string> = {
  Beginner: 'Básico', Intermediate: 'Intermedio', Advanced: 'Avanzado', Expert: 'Experto',
};

function SkillEditor({ skills, onChange }: {
  skills: Array<{ skill: string; level?: string }>; onChange: (skills: Array<{ skill: string; level?: string }>) => void;
}) {
  const theme = useTheme();
  const [draft, setDraft] = useState('');
  const [draftLevel, setDraftLevel] = useState('Intermediate');
  return (
    <View style={[styles.subCard, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }]}>
      <View style={styles.toggleRow}>
        {skills.map((s, i) => (
          <AnimatedPressable key={i} haptic="light" onPress={() => onChange(skills.filter((_, idx) => idx !== i))} hitSlop={8} accessibilityLabel={`Quitar habilidad ${s.skill}`} style={[styles.chip, styles.chipActive]}>
            <ThemedText style={styles.chipTextActive}>
              {s.skill}{s.level ? ` · ${SKILL_LEVEL_LABELS[s.level] ?? s.level}` : ''} ✕
            </ThemedText>
          </AnimatedPressable>
        ))}
        {!skills.length ? <ThemedText style={styles.empty}>Sin habilidades todavía.</ThemedText> : null}
      </View>
      <View style={styles.addRow}>
        <TextInput
          style={[styles.input, styles.addInput, { backgroundColor: theme.background, borderColor: theme.backgroundSelected, color: theme.text }]}
          value={draft}
          onChangeText={setDraft}
          placeholder="Añadir habilidad..."
          placeholderTextColor="#a3a9aa"
          onSubmitEditing={() => {
            const v = draft.trim();
            if (v) { onChange([...skills, { skill: v, level: draftLevel }]); setDraft(''); }
          }}
        />
      </View>
      <View style={[styles.toggleRow, { marginTop: Spacing.two }]}>
        {SKILL_LEVELS.map((lvl) => (
          <ToggleChip key={lvl} label={SKILL_LEVEL_LABELS[lvl]} active={draftLevel === lvl} onPress={() => setDraftLevel(lvl)} />
        ))}
      </View>
    </View>
  );
}

function LanguageEditor({ languages, onChange }: { languages: Language[]; onChange: (langs: Language[]) => void }) {
  const theme = useTheme();
  const [draftLang, setDraftLang] = useState('English');
  const [draftProf, setDraftProf] = useState('B2');
  return (
    <View style={[styles.subCard, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }]}>
      <View style={styles.toggleRow}>
        {languages.map((l, i) => (
          <AnimatedPressable key={i} haptic="light" onPress={() => onChange(languages.filter((_, idx) => idx !== i))} hitSlop={8} accessibilityLabel={`Quitar idioma ${l.language}`} style={[styles.chip, styles.chipActive]}>
            <ThemedText style={styles.chipTextActive}>
              {LANGUAGE_LABELS[l.language] ?? l.language}{l.proficiency ? ` · ${PROFICIENCY_LABELS[l.proficiency] ?? l.proficiency}` : ''} ✕
            </ThemedText>
          </AnimatedPressable>
        ))}
        {!languages.length ? <ThemedText style={styles.empty}>Sin idiomas todavía.</ThemedText> : null}
      </View>
      <ThemedText style={[styles.subCardTitle, { color: theme.text }]}>Añadir idioma</ThemedText>
      <View style={styles.toggleRow}>
        {LANGUAGE_OPTIONS.map((opt) => (
          <ToggleChip key={opt} label={LANGUAGE_LABELS[opt]} active={draftLang === opt} onPress={() => setDraftLang(opt)} />
        ))}
      </View>
      <View style={[styles.toggleRow, { marginTop: Spacing.two }]}>
        {PROFICIENCY_OPTIONS.map((opt) => (
          <ToggleChip key={opt} label={PROFICIENCY_LABELS[opt]} active={draftProf === opt} onPress={() => setDraftProf(opt)} />
        ))}
      </View>
      <View style={{ marginTop: Spacing.two }}>
        <GradientButton
          label="+ Añadir idioma"
          variant="secondary"
          onPress={() => onChange([...languages, { language: draftLang, proficiency: draftProf }])}
        />
      </View>
    </View>
  );
}

function ResumeRow({ resume, onActivate, onDelete }: { resume: Resume; onActivate: () => void; onDelete: () => void }) {
  const theme = useTheme();
  return (
    <View style={[styles.resumeRow, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText style={[styles.resumeLabel, { color: theme.text }]} numberOfLines={1}>{resume.label}</ThemedText>
      {resume.isBase ? (
        <ThemedText style={styles.badgeBase}>Activo</ThemedText>
      ) : (
        <View style={styles.resumeActions}>
          <ThemedText onPress={onActivate} style={[styles.resumeAction, { color: theme.text }]}>Activar</ThemedText>
          <ThemedText onPress={onDelete} style={[styles.resumeAction, styles.resumeActionDanger]}>Borrar</ThemedText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  header: { paddingHorizontal: Spacing.four, gap: Spacing.two },
  scroll: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.six, paddingTop: Spacing.two },
  identity: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, marginTop: Spacing.three },
  avatarShadow: { borderRadius: 28, ...Shadows.gold },
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: TextGold, fontSize: 24, fontWeight: '800' },
  avatarOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 28, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  avatarEditBadge: { position: 'absolute', bottom: -2, right: -2, width: 20, height: 20, borderRadius: 10, backgroundColor: Petrol, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FAF9F9' },
  avatarEditBadgeText: { color: '#fff', fontSize: 10 },
  name: { fontSize: 18 },
  email: { fontSize: 13 },
  activeResumeHint: { fontSize: 11 },
  tabBar: { flexDirection: 'row', gap: 6, marginTop: Spacing.one },
  tabButton: { flex: 1, minHeight: 44, justifyContent: 'center', paddingVertical: 9, borderRadius: Radius.full, alignItems: 'center', backgroundColor: '#f4f3f3' },
  tabButtonActive: { backgroundColor: Petrol },
  tabButtonText: { fontSize: 12.5, fontWeight: '700' },
  tabButtonTextActive: { color: '#FAF9F9' },
  section: { marginTop: Spacing.four, gap: Spacing.two },
  sectionTitle: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  empty: { fontSize: 13, marginTop: Spacing.four, textAlign: 'center' },
  fieldWrap: { gap: 4 },
  fieldLabel: { fontSize: 12 },
  input: { backgroundColor: '#FFFFFF', borderRadius: Radius.sm, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, fontSize: 14, color: '#1A1C1C', borderWidth: 1, borderColor: '#eeeeed' },
  toggleRow: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' },
  chip: { paddingHorizontal: Spacing.three, paddingVertical: 8, borderRadius: Radius.full, backgroundColor: '#f4f3f3', borderWidth: 1, borderColor: '#eeeeed' },
  chipActive: { backgroundColor: Gold, borderColor: Gold },
  chipText: { fontSize: 13 },
  chipTextActive: { color: TextGold, fontWeight: '700' },
  message: { fontSize: 13, marginTop: Spacing.three, textAlign: 'center' },
  hint: { fontSize: 12, lineHeight: 17, marginBottom: 2 },
  subCard: { backgroundColor: '#FFFFFF', borderRadius: Radius.md, padding: Spacing.three, marginTop: Spacing.two, gap: Spacing.two, borderWidth: 1, borderColor: '#eeeeed' },
  subCardTitle: { fontSize: 12, fontWeight: '700' },
  addRow: { marginTop: 2 },
  addInput: { fontSize: 13, paddingVertical: 8 },
  suggestionBox: { marginTop: 4, backgroundColor: '#FFFFFF', borderRadius: Radius.sm, borderWidth: 1, borderColor: '#eeeeed', overflow: 'hidden' },
  suggestionRow: { paddingHorizontal: Spacing.three, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f4f3f3' },
  suggestionText: { fontSize: 13 },
  saveWrap: { marginTop: Spacing.four },
  resumeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: Radius.md, padding: Spacing.three, marginBottom: Spacing.two },
  resumeLabel: { flexShrink: 1, fontSize: 13 },
  badgeBase: { color: TextGold, backgroundColor: GoldDim, fontSize: 11, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.sm, overflow: 'hidden' },
  resumeActions: { flexDirection: 'row', gap: Spacing.two },
  resumeAction: { color: Petrol, fontSize: 12, fontWeight: '600' },
  resumeActionDanger: { color: '#b91c1c' },
  readCard: { backgroundColor: '#FFFFFF', borderRadius: Radius.md, padding: Spacing.three, marginBottom: Spacing.two, gap: 2 },
  readTitle: { fontSize: 14, fontWeight: '700' },
  readSubtitle: { fontSize: 13 },
  readMeta: { fontSize: 11 },
  readBody: { fontSize: 12.5, marginTop: 4, lineHeight: 18 },
  logout: { textAlign: 'center', color: '#b91c1c', marginTop: Spacing.six, marginBottom: Spacing.four, fontSize: 14 },
});
