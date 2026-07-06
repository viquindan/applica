'use client';
import { useState, useEffect, useMemo, useRef, Fragment } from'react';
import { useRouter } from'next/navigation';
import { useI18n } from'@/i18n/context';
import { users, professionalProfiles, userSettings, vacancies, applications } from'@/db/schema';
import { IconX } from'@tabler/icons-react';
import { FunnelFlow } from'@/components/FunnelFlow';
import { unresolvedBlockers } from'@/core/automation/blockers';

/** Smoothly tweens a displayed number toward `value` whenever it changes. */
function AnimatedCounter({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    const start = performance.now();
    const dur = 700;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [value]);
  return <>{display.toLocaleString('es')}</>;
}

const CompanyLogo = ({ companyName }: { companyName: string }) => {
  const [error, setError] = useState(false);
  const initial = companyName.charAt(0).toUpperCase();

  if (error || !companyName || companyName === 'N/A') {
    return <div className="company-avatar">{initial}</div>;
  }

  const domain = companyName.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com';

  return (
    <img
      src={`https://logo.clearbit.com/${domain}`}
      alt={companyName}
      className="company-avatar"
      style={{ objectFit: 'contain', background: 'white' }}
      onError={() => setError(true)}
    />
  );
};

const MOCK_COMPANIES = ['BairesDev', 'MercadoLibre', 'Globant', 'Nubank', 'Rappi', 'Auth0', 'Kavak', 'Ualá', 'Despegar', 'Vercel', 'Stripe', 'Google', 'Microsoft', 'Amazon', 'Meta'];
const MOCK_ROLES = ['Frontend Engineer', 'Fullstack Developer', 'Backend Engineer', 'React Native Developer', 'Software Engineer', 'Tech Lead', 'Senior Developer'];

const AIFunnelVisualizer = ({ totalFound, processed }: { totalFound: number; processed: number }) => {
  const [logs, setLogs] = useState<{ id: number; text: string; type: 'normal' | 'highlight' | 'danger' | 'success' }[]>([]);

  useEffect(() => {
    let id = 0;
    const interval = setInterval(() => {
      id++;
      const actionType = Math.random();
      const company = MOCK_COMPANIES[Math.floor(Math.random() * MOCK_COMPANIES.length)];
      const role = MOCK_ROLES[Math.floor(Math.random() * MOCK_ROLES.length)];

      let newLog: { id: number; text: string; type: 'normal' | 'highlight' | 'danger' | 'success' };

      if (actionType < 0.4) {
        newLog = { id, text: `Analizando ${role} en ${company}...`, type: 'normal' };
      } else if (actionType < 0.7) {
        newLog = { id, text: `[Descartado] Salario/Seniority no coincide.`, type: 'danger' };
      } else if (actionType < 0.9) {
        newLog = { id, text: `[Match Encontrado] Perfil de skills hace 85% de match.`, type: 'highlight' };
      } else {
        newLog = { id, text: `[Aprobado] Vacante lista para tu revisión.`, type: 'success' };
      }

      setLogs(prev => {
        const next = [...prev, newLog];
        if (next.length > 5) next.shift(); // Keep last 5 lines
        return next;
      });
    }, 1200);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ textAlign: 'center', width: '100%', marginTop: '1rem' }}>
      <FunnelFlow active />

      <div className="terminal-log-container">
        {logs.map(log => (
          <div key={log.id} className={`terminal-log-line ${log.type}`}>
            {log.text}
          </div>
        ))}
      </div>
    </div>
  );
};

const COUNTRIES = [
  ['Afganistán', 'AF'], ['Albania', 'AL'], ['Alemania', 'DE'], ['Andorra', 'AD'], ['Angola', 'AO'], ['Antigua y Barbuda', 'AG'],
  ['Arabia Saudita', 'SA'], ['Argelia', 'DZ'], ['Argentina', 'AR'], ['Armenia', 'AM'], ['Australia', 'AU'], ['Austria', 'AT'],
  ['Azerbaiyán', 'AZ'], ['Bahamas', 'BS'], ['Bangladés', 'BD'], ['Barbados', 'BB'], ['Baréin', 'BH'], ['Bélgica', 'BE'],
  ['Belice', 'BZ'], ['Benín', 'BJ'], ['Bielorrusia', 'BY'], ['Birmania', 'MM'], ['Bolivia', 'BO'], ['Bosnia y Herzegovina', 'BA'],
  ['Botsuana', 'BW'], ['Brasil', 'BR'], ['Brunéi', 'BN'], ['Bulgaria', 'BG'], ['Burkina Faso', 'BF'], ['Burundi', 'BI'],
  ['Bután', 'BT'], ['Cabo Verde', 'CV'], ['Camboya', 'KH'], ['Camerún', 'CM'], ['Canadá', 'CA'], ['Catar', 'QA'],
  ['Chad', 'TD'], ['Chile', 'CL'], ['China', 'CN'], ['Chipre', 'CY'], ['Colombia', 'CO'], ['Comoras', 'KM'],
  ['Corea del Norte', 'KP'], ['Corea del Sur', 'KR'], ['Costa de Marfil', 'CI'], ['Costa Rica', 'CR'], ['Croacia', 'HR'], ['Cuba', 'CU'],
  ['Dinamarca', 'DK'], ['Dominica', 'DM'], ['Ecuador', 'EC'], ['Egipto', 'EG'], ['El Salvador', 'SV'], ['Emiratos Árabes Unidos', 'AE'],
  ['Eritrea', 'ER'], ['Eslovaquia', 'SK'], ['Eslovenia', 'SI'], ['España', 'ES'], ['Estados Unidos', 'US'], ['Estonia', 'EE'],
  ['Esuatini', 'SZ'], ['Etiopía', 'ET'], ['Filipinas', 'PH'], ['Finlandia', 'FI'], ['Fiyi', 'FJ'], ['Francia', 'FR'],
  ['Gabón', 'GA'], ['Gambia', 'GM'], ['Georgia', 'GE'], ['Ghana', 'GH'], ['Granada', 'GD'], ['Grecia', 'GR'],
  ['Guatemala', 'GT'], ['Guinea', 'GN'], ['Guinea-Bisáu', 'GW'], ['Guinea Ecuatorial', 'GQ'], ['Guyana', 'GY'], ['Haití', 'HT'],
  ['Honduras', 'HN'], ['Hungría', 'HU'], ['India', 'IN'], ['Indonesia', 'ID'], ['Irak', 'IQ'], ['Irán', 'IR'],
  ['Irlanda', 'IE'], ['Islandia', 'IS'], ['Islas Marshall', 'MH'], ['Islas Salomón', 'SB'], ['Israel', 'IL'], ['Italia', 'IT'],
  ['Jamaica', 'JM'], ['Japón', 'JP'], ['Jordania', 'JO'], ['Kazajistán', 'KZ'], ['Kenia', 'KE'], ['Kirguistán', 'KG'],
  ['Kiribati', 'KI'], ['Kuwait', 'KW'], ['Laos', 'LA'], ['Lesoto', 'LS'], ['Letonia', 'LV'], ['Líbano', 'LB'],
  ['Liberia', 'LR'], ['Libia', 'LY'], ['Liechtenstein', 'LI'], ['Lituania', 'LT'], ['Luxemburgo', 'LU'], ['Macedonia del Norte', 'MK'],
  ['Madagascar', 'MG'], ['Malasia', 'MY'], ['Malaui', 'MW'], ['Maldivas', 'MV'], ['Malí', 'ML'], ['Malta', 'MT'],
  ['Marruecos', 'MA'], ['Mauricio', 'MU'], ['Mauritania', 'MR'], ['México', 'MX'], ['Micronesia', 'FM'], ['Moldavia', 'MD'],
  ['Mónaco', 'MC'], ['Mongolia', 'MN'], ['Montenegro', 'ME'], ['Mozambique', 'MZ'], ['Namibia', 'NA'], ['Nauru', 'NR'],
  ['Nepal', 'NP'], ['Nicaragua', 'NI'], ['Níger', 'NE'], ['Nigeria', 'NG'], ['Noruega', 'NO'], ['Nueva Zelanda', 'NZ'],
  ['Omán', 'OM'], ['Países Bajos', 'NL'], ['Pakistán', 'PK'], ['Palaos', 'PW'], ['Palestina', 'PS'], ['Panamá', 'PA'],
  ['Papúa Nueva Guinea', 'PG'], ['Paraguay', 'PY'], ['Perú', 'PE'], ['Polonia', 'PL'], ['Portugal', 'PT'], ['Reino Unido', 'GB'],
  ['República Centroafricana', 'CF'], ['República Checa', 'CZ'], ['República del Congo', 'CG'], ['República Democrática del Congo', 'CD'],
  ['República Dominicana', 'DO'], ['Ruanda', 'RW'], ['Rumania', 'RO'], ['Rusia', 'RU'], ['Samoa', 'WS'], ['San Cristóbal y Nieves', 'KN'],
  ['San Marino', 'SM'], ['San Vicente y las Granadinas', 'VC'], ['Santa Lucía', 'LC'], ['Santo Tomé y Príncipe', 'ST'], ['Senegal', 'SN'],
  ['Serbia', 'RS'], ['Seychelles', 'SC'], ['Sierra Leona', 'SL'], ['Singapur', 'SG'], ['Siria', 'SY'], ['Somalia', 'SO'],
  ['Sri Lanka', 'LK'], ['Sudáfrica', 'ZA'], ['Sudán', 'SD'], ['Sudán del Sur', 'SS'], ['Suecia', 'SE'], ['Suiza', 'CH'],
  ['Surinam', 'SR'], ['Tailandia', 'TH'], ['Tanzania', 'TZ'], ['Tayikistán', 'TJ'], ['Timor Oriental', 'TL'], ['Togo', 'TG'],
  ['Tonga', 'TO'], ['Trinidad y Tobago', 'TT'], ['Túnez', 'TN'], ['Turkmenistán', 'TM'], ['Turquía', 'TR'], ['Tuvalu', 'TV'],
  ['Ucrania', 'UA'], ['Uganda', 'UG'], ['Uruguay', 'UY'], ['Uzbekistán', 'UZ'], ['Vanuatu', 'VU'], ['Vaticano', 'VA'],
  ['Venezuela', 'VE'], ['Vietnam', 'VN'], ['Yemen', 'YE'], ['Yibuti', 'DJ'], ['Zambia', 'ZM'], ['Zimbabue', 'ZW'],
] as const;

type AppRow = typeof applications.$inferSelect & {
  vacancy: Pick<typeof vacancies.$inferSelect, 'title' | 'company' | 'platform' | 'url' | 'score' | 'location' | 'warnings' | 'description'> | null;
};

const STATUS_META: Record<string, { label: string; badge: string }> = {
  draft: { label: 'Preparando materiales', badge: 'badge-petrol' },
  pending_review: { label: 'Necesita tu atención', badge: 'badge-warning' },
  approved: { label: 'Abriendo la oferta…', badge: 'badge-warning' },
  submitted: { label: 'Enviado', badge: 'badge-success' },
  failed: { label: 'Fallido', badge: 'badge-danger' },
  skipped: { label: 'Omitido', badge: 'badge-ghost' },
  archived: { label: 'Archivado', badge: 'badge-ghost' },
  filtered: { label: 'Puntaje Bajo (No recomendada)', badge: 'badge-danger' },
};

const MODE_META: Record<string, string> = {
  auto: 'Auto',
  semi: 'Semi',
  manual: 'Manual',
  none: '-',
};

const FILTERS = [
  { key: 'pending_review', label: 'Nuevos Matches (Por revisar)' },
  { key: 'submitted', label: 'En Progreso / Enviadas' },
  { key: 'filtered', label: 'Descartadas por IA' },
  { key: 'all', label: 'Todas' },
];

function countFeedback(apps: AppRow[]) {
  return {
    contacted: apps.filter((app) => app.responseStatus === 'contacted').length,
    rejected: apps.filter((app) => app.responseStatus === 'rejected').length,
  };
}

function ScoreRing({ score }: { score: number | null | undefined }) {
  if (!score) return <span style={{ color: 'var(--text-3)', fontSize: '.75rem' }}>-</span>;
  const cls = score >= 80 ? 'score-high' : score >= 60 ? 'score-mid' : 'score-low';
  const r = 14, c = 2 * Math.PI * r, fill = (score / 100) * c;
  const color = score >= 80 ? '#4ecca3' : score >= 60 ? '#f0c040' : '#e57373';
  return (
    <svg width="38" height="38" style={{ transform: 'rotate(-90deg)' }}>
      <circle cx="19" cy="19" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="3" />
      <circle cx="19" cy="19" r={r} fill="none" stroke={color} strokeWidth="3"
        strokeDasharray={`${fill} ${c}`} strokeLinecap="round" />
      <text x="19" y="19" textAnchor="middle" dominantBaseline="central"
        style={{ transform: 'rotate(90deg)', transformOrigin: '19px 19px', fill: color, fontSize: 9, fontWeight: 700 }}>
        {score}
      </text>
    </svg>
  );
}

export default function ApplicationsClient({
  apps,
  user,
  profile,
  settings,
  stats,
  outcomes,
  supply,
  billing,
  linkedinStatus = 'none',
  initialFilter = 'all'
}: {
  apps: AppRow[];
  user: typeof users.$inferSelect;
  profile: typeof professionalProfiles.$inferSelect;
  settings: typeof userSettings.$inferSelect;
  stats: { total: number; today: number; pendingReview: number; submitted: number };
  outcomes: {
    contacted: number;
    rejected: number;
    resolved: number;
    contactRate: number;
    rolePerformance: Array<{ role: string; label?: string; contacted: number; rejected: number; total: number; contactRate: number }>;
  };
  supply: { activeBoards: number; jobsSeen: number };
  billing?: {
    tier: string;
    limits: any;
    currentCount: number;
  };
  linkedinStatus?: 'none' | 'connected' | 'expired';
  initialFilter?: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const PAGE_SIZE = 25;
  const [filter, setFilter] = useState<string>(initialFilter);
  const [search, setSearch] = useState<string>('');
  const [manualOpen, setManualOpen] = useState(false);
  const [startingSearch, setStartingSearch] = useState(false);
  const [sortKey, setSortKey] = useState<string>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState<number>(1);
  const [navigatingId, setNavigatingId] = useState<string | null>(null);

  const [discardedIds, setDiscardedIds] = useState<Set<string>>(new Set());

  // Restore the list exactly as the user left it (filter, search, sort, page)
  // when they navigate back from a detail view. Done after mount to avoid any
  // server/client hydration mismatch. We persist on navigation (see openApp),
  // not on every keystroke, so there's nothing to clobber here.
  useEffect(() => {
    try {
      const s = JSON.parse(sessionStorage.getItem('applicationsListState') || 'null');
      if (s) {
        if (typeof s.filter === 'string') setFilter(s.filter);
        if (typeof s.search === 'string') setSearch(s.search);
        if (typeof s.sortKey === 'string') setSortKey(s.sortKey);
        if (s.sortDir === 'asc' || s.sortDir === 'desc') setSortDir(s.sortDir);
        if (typeof s.page === 'number') setPage(s.page);
      }
    } catch {}
  }, []);

  const persistListState = () => {
    try {
      sessionStorage.setItem('applicationsListState', JSON.stringify({ filter, search, sortKey, sortDir, page }));
    } catch {}
  };

  // While any application is being sent (status 'approved' = assisted window open),
  // poll so the user sees it resolve to "Enviado" without refreshing manually. No
  // time cutoff: an assisted apply can take many minutes (captcha, multi-page
  // forms) - a 45s cap meant the worker marked it submitted AFTER polling died and
  // the panel stayed frozen on "Applica está aplicando por ti". The interval
  // unmounts on its own when the refreshed data flips anySending to false.
  const anySending = apps.some((a) => a.status === 'approved');
  useEffect(() => {
    if (!anySending) return;
    const interval = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(interval);
  }, [anySending, router]);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir(key === 'score' || key === 'date' ? 'desc' : 'asc'); }
    setPage(1);
  };

  const openApp = (app: AppRow) => {
    // Always open the detail view - even low-score offers - so the user can see
    // why it scored low (description, radar, warnings) before deciding.
    persistListState();
    setNavigatingId(app.id);
    router.push(`/applications/${app.id}`);
  };

  // Platforms Applica can fill & submit automatically.
  const AUTO_APPLY = new Set(['greenhouse', 'lever', 'ashby', 'smartrecruiters']);
  const isAtsApp = (app: AppRow) => AUTO_APPLY.has(app.vacancy?.platform ?? '');
  const canAuto = (app: AppRow) => isAtsApp(app) && app.status === 'pending_review';
  const isLinkedIn = (app: AppRow) => app.vacancy?.platform === 'linkedin';
  const [actioningId, setActioningId] = useState<string | null>(null);

  // LinkedIn auto-apply needs a connected session. Surface the connect action
  // right here in context (next to the LinkedIn opportunities), not in a menu.
  const [liStatus, setLiStatus] = useState(linkedinStatus);
  // Keep in sync if the server status changes (e.g. the worker marks it expired
  // after a failed apply) so the reconnect prompt surfaces in the apply flow.
  useEffect(() => { setLiStatus(linkedinStatus); }, [linkedinStatus]);
  const [connectingLi, setConnectingLi] = useState(false);
  const [liMsg, setLiMsg] = useState<string | null>(null);
  const linkedinPendingCount = apps.filter((a) => isLinkedIn(a) && a.status === 'pending_review').length;

  // ── Simplified Tinder-style decision: Aplicar / Descartar ──
  // For ATS apps we no longer gate on "missing data": the user fills any blanks in
  // the real browser window (and Applica learns them silently). The in-app "complete
  // data" form is only for non-ATS (LinkedIn/external). This also avoids the form
  // inspector's noisy/garbage blockers forcing an unnecessary in-app form.
  const needsInfoFor = (app: AppRow) =>
    !isAtsApp(app) &&
    unresolvedBlockers((app.submissionDecision as any)?.formPreview?.blockers, app.formAnswers as Record<string, string>).length > 0;
  // Desktop auto-apply = public ATS forms (Greenhouse/Lever/Ashby/SmartRecruiters).
  // These always go straight to the real-browser flow ("Abrir y aplicar").
  const autoCapable = (app: AppRow) =>
    app.status === 'pending_review' && canAuto(app);

  const [attentionApp, setAttentionApp] = useState<AppRow | null>(null);

  function attentionReason(app: AppRow): { title: string; detail: string; cta: 'go' | 'fill' } {
    const url = app.vacancy?.url ?? '';
    // Assisted handoff: Applica filled the whole form, but the ATS requires a human
    // verification (CAPTCHA) to submit. One click away - open the offer and finish.
    const warns = (app.vacancy?.warnings as string[] | null) ?? [];
    if (warns.some((w) => /verificaci[óo]n humana|captcha/i.test(w)))
      return { title: 'Hicimos el 99%. Falta tu toque final.', detail: 'Applica hizo el trabajo pesado: tu CV a medida, carta y respuestas ya están preparadas para esta vacante. Solo queda el paso final en la oferta - esta empresa exige su propia verificación de seguridad, que completas en segundos. Ábrela y aplica.', cta: 'go' };
    if (needsInfoFor(app))
      return { title: 'Faltan algunos datos', detail: 'Esta vacante pide información adicional. Complétala y la enviamos por ti.', cta: 'fill' };
    if (isLinkedIn(app))
      return { title: 'Aplica en LinkedIn', detail: 'Te preparamos tu CV, carta y respuestas. Ábrela en LinkedIn -donde ya tienes tu sesión- y aplica en segundos.', cta: 'go' };
    if (/myworkdayjobs|workday|icims|taleo|brassring/i.test(url))
      return { title: 'Requiere que te registres', detail: 'El sitio de la empresa (Workday/iCIMS) exige crear una cuenta. Hazlo tú; tu CV y respuestas quedan listos para pegar.', cta: 'go' };
    return { title: 'Aplica en el sitio de la empresa', detail: 'El formulario está en su web. Te dejamos tu CV y respuestas preparadas para que apliques en segundos.', cta: 'go' };
  }

  function applyApp(app: AppRow) {
    // ATS assisted apply: open the offer in a visible window with the form
    // pre-filled; the user solves the CAPTCHA and submits. Otherwise attention.
    if (autoCapable(app)) { sendAssisted(app); return; }
    setAttentionApp(app);
  }

  // Opens a real browser window on the user's machine with the form pre-filled.
  async function sendAssisted(app: AppRow) {
    setActioningId(app.id);
    try {
      await fetch(`/api/applications/${app.id}/action`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'assisted' }),
      });
    } finally {
      setActioningId(null);
      router.refresh();
    }
  }

  // "Ya envié" - the user finished in the opened window. Mark as applied.
  async function markApplied(app: AppRow) {
    setActioningId(app.id);
    try {
      await fetch(`/api/applications/${app.id}/action`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'mark_applied' }),
      });
    } finally {
      setActioningId(null);
      router.refresh();
    }
  }

  // "No se envió" - stop the assisted flow and return the app to review to retry.
  async function cancelAssisted(app: AppRow) {
    setActioningId(app.id);
    try {
      await fetch(`/api/applications/${app.id}/action`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel_assisted' }),
      });
    } finally {
      setActioningId(null);
      router.refresh();
    }
  }

  async function connectLinkedIn() {
    setConnectingLi(true);
    setLiMsg('Se abrió LinkedIn en tu navegador - inicia sesión una vez y listo.');
    try {
      const data = await fetch('/api/linkedin/session/login', { method: 'POST' }).then((r) => r.json());
      if (data.ok) { setLiStatus('connected'); setLiMsg(null); router.refresh(); }
      else if (data.reason === 'timeout') setLiMsg('No completaste el inicio de sesión a tiempo. Inténtalo de nuevo.');
      else if (data.reason === 'window_closed') setLiMsg('Cerraste la ventana antes de entrar. Inténtalo de nuevo.');
      else setLiMsg('No pudimos capturar la sesión. Inténtalo de nuevo.');
    } catch { setLiMsg('Error de red.'); }
    finally { setConnectingLi(false); }
  }


  async function discardApp(app: AppRow) {
    setActioningId(app.id);
    // Optimistically remove it from the list right away so the state visibly changes.
    setDiscardedIds((prev) => new Set(prev).add(app.id));
    try {
      // Low-score"filtered" rows have no application - their id is a vacancy id,
      // so we must archive the vacancy, not a (non-existent) application.
      const hasApplication = (app.mode as string) !== 'none';
      const endpoint = hasApplication
        ? { url: `/api/applications/${app.id}/action`, body: { action: 'archive' } }
        : { url: `/api/vacancies/${app.vacancyId}/discard`, body: {} };
      await fetch(endpoint.url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(endpoint.body),
      });
    } finally {
      setActioningId(null);
      router.refresh();
    }
  }

  // Live search progress state (polled from /api/search/status)
  const [liveProgress, setLiveProgress] = useState({
    searchInProgress: settings.searchInProgress,
    lastSearchStatus: settings.lastSearchStatus,
    lastSearchResultCount: settings.lastSearchResultCount ?? 0,
    lastSearchPreparedCount: settings.lastSearchPreparedCount ?? 0,
    lastSearchFilteredCount: settings.lastSearchFilteredCount ?? 0,
    lastSearchSourceCount: settings.lastSearchSourceCount ?? 0,
    lastSearchScannedSourceCount: settings.lastSearchScannedSourceCount ?? 0,
    lastSearchAt: settings.lastSearchAt,
    lastSearchError: settings.lastSearchError,
  });

  const isSearching = liveProgress.searchInProgress || liveProgress.lastSearchStatus === 'running' || liveProgress.lastSearchStatus === 'queued' || startingSearch;

  const loadingPhrases = [
    "Buscando vacantes recientes...",
    "Descartando trabajos que no son para ti...",
    "Filtrando por tu expectativa salarial...",
    "Eligiendo solo las mejores oportunidades...",
    "No te hacemos perder tiempo con roles irrelevantes...",
    "Analizando requisitos y descripciones...",
  ];
  const [loadingPhraseIndex, setLoadingPhraseIndex] = useState(0);

  useEffect(() => {
    if (!isSearching) return;
    const interval = setInterval(() => {
      setLoadingPhraseIndex(prev => (prev + 1) % loadingPhrases.length);
    }, 3500);
    return () => clearInterval(interval);
  }, [isSearching]);

  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savedSettings, setSavedSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState({
    maxVacancyAgeDays: settings.maxVacancyAgeDays ?? 14,
    searchCadenceHours: settings.searchCadenceHours ?? 24,
    applicationMode: settings.globalAutomationMode === 'full' && !settings.requireReviewBeforeSubmit ? 'auto' : 'manual',
  });

  const [savingManual, setSavingManual] = useState(false);
  const [manualForm, setManualForm] = useState({
    title: '',
    company: '',
    location: '',
    modality: 'remote',
    url: '',
    description: '',
    requirements: '',
  });

  const timeAgo = (date: Date) => {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return'Hace' + Math.floor(interval) + ' años';
    interval = seconds / 2592000;
    if (interval > 1) return'Hace' + Math.floor(interval) + ' meses';
    interval = seconds / 86400;
    if (interval > 1) return'Hace' + Math.floor(interval) + ' días';
    interval = seconds / 3600;
    if (interval > 1) return'Hace' + Math.floor(interval) + ' horas';
    interval = seconds / 60;
    if (interval > 1) return'Hace' + Math.floor(interval) + ' minutos';
    return'Hace unos segundos';
  };

  const lastSearchLabel = liveProgress.lastSearchAt ? timeAgo(new Date(liveProgress.lastSearchAt)) : t.dashboard.neverRun;
  const nextSearchLabel = settings.nextSearchAt ? new Date(settings.nextSearchAt).toLocaleString('es', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }) : t.dashboard.scheduledOnSave;

  const maxApps = billing?.limits?.maxMonthlyApplications ?? (billing?.tier === 'pro' ? 150 : 30);
  const currentCount = billing?.currentCount ?? 0;
  const usagePercent = Math.min(100, (currentCount / maxApps) * 100);

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const updateSettings = (key: string, value: any) => {
    const next = { ...settingsForm, [key]: value };
    setSettingsForm(next);

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(async () => {
      setSavingSettings(true);
      await fetch('/api/home', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      setSavingSettings(false);
      setSavedSettings(true);
      setTimeout(() => setSavedSettings(false), 2000);
      router.refresh();
    }, 800);
  };

  async function submitManualVacancy() {
    setSavingManual(true);
    const res = await fetch('/api/vacancies/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(manualForm),
    });
    setSavingManual(false);
    if (!res.ok) return;
    setManualOpen(false);
    setManualForm({ title: '', company: '', location: '', modality: 'remote', url: '', description: '', requirements: '' });
    router.refresh();
  }

  async function runSearchNow() {
    setStartingSearch(true);
    // Reset local progress counters to 0 so the UI shows fresh progress
    setLiveProgress(prev => ({
      ...prev,
      searchInProgress: true,
      lastSearchStatus: 'queued',
      lastSearchResultCount: 0,
      lastSearchPreparedCount: 0,
      lastSearchFilteredCount: 0,
      lastSearchSourceCount: 0,
      lastSearchScannedSourceCount: 0,
    }));
    const res = await fetch('/api/search/run', { method: 'POST' });
    if (!res.ok) { setStartingSearch(false); return; }
  }

  async function pauseSearch() {
    await fetch('/api/search/cancel', { method: 'POST' });
    setStartingSearch(false);
    setLiveProgress(prev => ({ ...prev, searchInProgress: false, lastSearchStatus: 'cancelled' }));
    router.refresh();
  }

  // Real-time polling: fetch /api/search/status every 2s during search
  useEffect(() => {
    if (!isSearching) return;
    const poll = async () => {
      try {
        const res = await fetch('/api/search/status');
        if (res.ok) {
          const data = await res.json();
          setLiveProgress(data);
          // If search completed, refresh the page to get new applications
          if (!data.searchInProgress && data.lastSearchStatus !== 'running' && data.lastSearchStatus !== 'queued') {
            setStartingSearch(false);
            router.refresh();
          }
        }
      } catch {}
    };
    poll(); // immediate first poll
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, [isSearching, router]);

  const filtered = apps.filter(a => !discardedIds.has(a.id)).filter(a => {
    if (filter === 'all') return true;
    if (filter === 'contacted') return a.responseStatus === 'contacted';
    if (filter === 'rejected') return a.responseStatus === 'rejected';
    if (['auto', 'semi', 'manual'].includes(filter)) return a.mode === filter;
    return a.status === filter;
  }).filter(a => {
    if (!search) return true;
    const q = search.toLowerCase();
    return a.vacancy?.company?.toLowerCase().includes(q) ||
           a.vacancy?.title?.toLowerCase().includes(q) ||
           a.vacancy?.platform?.toLowerCase().includes(q);
  });

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const val = (a: AppRow): string | number => {
      switch (sortKey) {
        case'company': return (a.vacancy?.company ?? '').toLowerCase();
        case'platform': return (a.vacancy?.platform ?? '').toLowerCase();
        case'score': return a.vacancy?.score ?? -1;
        case'status': return STATUS_META[a.status as string]?.label ?? String(a.status);
        case'response': return a.responseStatus ?? '';
        case'mode': return MODE_META[a.mode as string] ?? String(a.mode);
        case'date': return new Date(a.createdAt).getTime();
        default: return 0;
      }
    };
    return [...filtered].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  // Clamp the (possibly restored) page if the data shrank.
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const safePage = Math.min(page, totalPages);
  const paged = useMemo(() => sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE), [sorted, safePage]);

  const feedback = countFeedback(apps);

  // Detect horizontal overflow so we can show a"scroll" affordance to the user.
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const [showScrollHint, setShowScrollHint] = useState(false);
  useEffect(() => {
    const el = tableScrollRef.current;
    if (!el) { setShowScrollHint(false); return; }
    const check = () => setShowScrollHint(el.scrollWidth - el.clientWidth > 8);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [sorted.length]);

  return (
    <div className="animate-fadein">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <div>
          <div className="page-eyebrow">Gestión</div>
          <h1 style={{ fontSize: '2rem', fontWeight: 600, color: 'var(--text)', margin: 0, letterSpacing: '-0.02em' }}>
            Búsqueda y Aplicaciones
          </h1>
          <p style={{ color: 'var(--text-3)', fontSize: '0.9375rem', margin: '0.5rem 0 0 0', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500 }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--success)' }} />
            {t.dashboard.buscandoActivamente ?? 'Autopilot is active and monitoring'}
          </p>
        </div>

        {/* Minimal Billing Card in Header */}
        <div style={{ background: 'var(--surface)', padding: '1rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', width: '280px', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: '0.5rem', fontWeight: 600 }}>
            <span style={{ color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {t.dashboard.plan} <span style={{ color: billing?.tier === 'pro' ? 'var(--text-gold)' : 'var(--text)', fontWeight: 700 }}>
                {billing?.tier === 'pro' ? 'PRO' : 'Free'}
              </span>
            </span>
            <span style={{ color: 'var(--text)', fontWeight: 700 }}>
              {currentCount} <span style={{ color: 'var(--text-3)', fontWeight: 500 }}>/ {maxApps} {t.dashboard.apps}</span>
            </span>
          </div>
          <div style={{ height: '4px', background: 'var(--bg-2)', borderRadius: '999px', overflow: 'hidden' }}>
            <div style={{
              height: '100%', background: 'var(--petrol)', borderRadius: '999px',
              width: `${usagePercent}%`, transition: 'width 1s cubic-bezier(0.4, 0, 0.2, 1)'
            }} />
          </div>
          {billing?.tier === 'free' && (
            <button onClick={() => setShowUpgradeModal(true)} style={{
              width: '100%', fontSize: '0.75rem', fontWeight: 600, background: 'var(--bg)', color: 'var(--text)',
              border: 'none', padding: '6px 0', borderRadius: 'var(--radius-sm)', cursor: 'pointer', transition: 'all 0.2s', marginTop: '0.75rem',
              textTransform: 'uppercase', letterSpacing: '0.02em'
            }}>
              {t.dashboard.upgradePro ?? 'Upgrade to Pro'}
            </button>
          )}
        </div>
      </div>

      {/* Funnel Metrics Row - live, animated counters that move during a search */}
      {(() => {
        const related = Math.max(liveProgress.lastSearchResultCount ?? 0, (liveProgress.lastSearchFilteredCount ?? 0) + (liveProgress.lastSearchPreparedCount ?? 0));
        const monitored = Math.max(supply.jobsSeen ?? 0, related);
        const discarded = liveProgress.lastSearchFilteredCount ?? 0;
        const selected = Math.max(liveProgress.lastSearchPreparedCount ?? 0, stats.pendingReview);
        const funnelCards: Array<{ label: string; value: number; color: string; pulse?: boolean }> = [
          { label: 'Ofertas monitoreadas', value: monitored, color: 'var(--text)' },
          { label: 'Relacionadas a tu rol', value: related, color: 'var(--petrol)' },
          { label: 'Descartadas por IA', value: discarded, color: 'var(--text-3)' },
          { label: 'Seleccionadas para ti', value: selected, color: 'var(--text-gold)', pulse: true },
        ];
        return (
          <div style={{ marginBottom: '2rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
            {funnelCards.map((c) => (
              <div key={c.label} className="bento-card" style={{ padding: '1.25rem 1.5rem', borderRadius: 'var(--radius-lg)', position: 'relative', overflow: 'hidden', border: c.pulse ? '1px solid rgba(224,169,46,.35)' : undefined }}>
                {isSearching && (
                  <span style={{ position: 'absolute', top: 12, right: 12, width: 7, height: 7, borderRadius: '50%', background: c.pulse ? 'var(--text-gold)' : 'var(--petrol)', boxShadow: `0 0 0 0 ${c.pulse ? 'rgba(224,169,46,.5)' : 'rgba(42,74,79,.4)'}`, animation: 'pulse-dot 1.4s infinite' }} />
                )}
                <div className="metric-number" style={{ color: c.color }}><AnimatedCounter value={c.value} /></div>
                <div className="metric-label" style={{ fontSize: '0.78rem' }}>{c.label}</div>
              </div>
            ))}
          </div>
        );
      })()}
      <style>{`@keyframes pulse-dot { 0% { box-shadow: 0 0 0 0 rgba(42,74,79,.45); } 70% { box-shadow: 0 0 0 8px rgba(42,74,79,0); } 100% { box-shadow: 0 0 0 0 rgba(42,74,79,0); } }`}</style>

      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '2.5rem' }}>
        {/* Central Container: Autopilot Config & Sankey */}
        <div className="bento-card" style={{ width: '100%', maxWidth: '800px', minHeight: '400px' }}>
          {isSearching ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', animation: 'fadeIn 0.3s ease-in' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                <div className="spinner" style={{ width: '16px', height: '16px' }} />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text)', margin: 0 }}>
                  Autopilot Trabajando...
                </h3>
              </div>

              <div style={{ width: '100%', maxWidth: '800px' }}>
                <AIFunnelVisualizer
                  totalFound={liveProgress.lastSearchResultCount ?? 0}
                  processed={(liveProgress.lastSearchFilteredCount ?? 0) + (liveProgress.lastSearchPreparedCount ?? 0)}
                />
              </div>

              <button className="btn btn-ghost" onClick={pauseSearch} style={{ marginTop: '1.5rem', color: 'var(--danger)', fontSize: '0.85rem', padding: '0.5rem 1rem', fontWeight: 500 }}>
                Pausar Búsqueda
              </button>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
                <div className="card-label">Centro de Mando del Autopilot</div>
                <p style={{ fontSize: '.875rem', color: 'var(--text-2)' }}>Configura el nivel de autonomía y la frecuencia con la que nuestro agente busca vacantes para ti.</p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

                <div className="grid-2" style={{ gap: '1rem' }}>
                  <div className="field-group">
                    <label className="field-label">Frecuencia de Búsqueda</label>
                    <select className="select" value={settingsForm.searchCadenceHours} onChange={(e) => updateSettings('searchCadenceHours', Number(e.target.value))}>
                      <option value={24}>Cada 24 horas</option>
                      <option value={12}>Cada 12 horas</option>
                      <option value={6}>Cada 6 horas</option>
                    </select>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginTop: '0.35rem', lineHeight: 1.4 }}>
                      <span style={{ color: 'var(--petrol)', fontWeight: 600 }}>Nota:</span> Una frecuencia mayor consumirá más rápidamente los tokens de tu límite mensual de aplicaciones.
                    </div>
                  </div>
                  <div className="field-group">
                    <label className="field-label">Nivel de Automatización</label>
                    <select className="select" value={settingsForm.applicationMode} onChange={(e) => updateSettings('applicationMode', e.target.value)}>
                      <option value="manual">Revisión Manual (Recomendado)</option>
                      <option value="auto">Totalmente Autónomo</option>
                    </select>
                  </div>
                </div>

                <div style={{ padding: '1rem', borderRadius: 'var(--radius-sm)', background: 'var(--bg)', border: '1px solid var(--border)', marginTop: '0.5rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '.75rem', color: 'var(--text-3)', marginBottom: '.25rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Estado del Sistema</div>
                  <div style={{ fontSize: '.8125rem', color: 'var(--text-2)', display: 'inline-block', marginRight: '1rem' }}>Último Escaneo: {lastSearchLabel}</div>
                  <div style={{ fontSize: '.8125rem', color: 'var(--text-2)', display: 'inline-block' }}>Próximo Escaneo: {nextSearchLabel}</div>
                  {settings.lastSearchStatus === 'success' && settings.lastSearchResultCount !== undefined && (
                    <div style={{ fontSize: '.8125rem', color: 'var(--text)', marginTop: '.5rem', fontWeight: 500 }}>
                      Último barrido: {settings.lastSearchResultCount} nuevas vacantes procesadas
                    </div>
                  )}
                  {settings.lastSearchStatus === 'failed' && (
                     <div style={{ fontSize: '.8125rem', color: 'var(--text-3)', marginTop: '.5rem', fontWeight: 500 }}>
                      Estado: Agente en reposo (esperando próximo ciclo)
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', alignItems: 'center' }}>
                  <button className="btn btn-primary" onClick={runSearchNow} disabled={isSearching} style={{ flex: 1, padding: '1.25rem', fontSize: '1.1rem', fontWeight: 600 }}>
                    {isSearching ? 'Buscando Vacantes...' : 'Buscar Ahora'}
                  </button>
                  {(savingSettings || savedSettings) && (
                    <div style={{ fontSize: '0.85rem', color: savedSettings ? 'var(--success)' : 'var(--text-3)', fontWeight: 500, width: '100px', textAlign: 'center' }}>
                      {savingSettings ? 'Guardando...' : '¡Guardado!'}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Contextual note: LinkedIn opportunities are applied manually on desktop
          (we prepare the materials). Auto-apply for LinkedIn lives in the app. */}
      {linkedinPendingCount > 0 && (
        <div style={{ marginBottom: '1.5rem', padding: '.85rem 1.15rem', borderRadius: 'var(--radius-lg)', background: 'linear-gradient(90deg, rgba(10,102,194,.07), rgba(42,74,79,.04))', border: '1px solid rgba(10,102,194,.22)', fontSize: '.82rem', color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: '.6rem' }}>
          <span style={{ fontSize: '1.1rem' }}></span>
          <span><strong style={{ color: 'var(--text)' }}>{linkedinPendingCount} {linkedinPendingCount === 1 ? 'oportunidad' : 'oportunidades'} en LinkedIn:</strong> te preparamos CV, carta y respuestas. Dale <strong>Aplicar</strong> y te llevamos a aplicar en tu LinkedIn en segundos.</span>
        </div>
      )}

      <div className="card-label" style={{ marginBottom: '1rem' }}>Historial de Aplicaciones</div>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <input className="input" placeholder="Buscar empresa, rol, plataforma…"
          value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
          style={{ maxWidth: 280 }} />
        <div className="tab-bar" style={{ borderBottom: 'none', marginBottom: 0, flex: 1, minWidth: 0, overflowX: 'auto' }}>
          {FILTERS.map(f => (
            <button key={f.key} className={`tab-btn ${filter === f.key ? 'active' : ''}`}
              onClick={() => { setFilter(f.key); setPage(1); }}>
              {f.label}
              <span style={{ marginLeft: '.35rem', opacity: .6, fontSize: '.65rem' }}>
                ({f.key === 'all' ? apps.length : apps.filter(a => f.key === 'auto' || f.key === 'semi' || f.key === 'manual'
                  ? a.mode === f.key : a.status === f.key).length})
              </span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: 0, overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div className="card" style={{ padding: '4rem 1rem', overflow: 'hidden', border: 'none', background: 'transparent' }}>
            <div className="empty-state">
              <div className="ambient-radar" style={{ margin: '0 auto 1.5rem auto' }}>
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--petrol)', boxShadow: '0 0 10px var(--petrol)' }} />
              </div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.75rem' }}>
                {isSearching ? 'Buscando oportunidades...' : 'Monitoreo Silencioso Activo'}
              </h3>
              <p style={{ fontSize: '.875rem', maxWidth: 480, color: 'var(--text-2)', lineHeight: 1.6, margin: '0 auto' }}>
                {isSearching
                  ? 'En cuanto encontremos vacantes que encajen contigo, aparecerán aquí.'
                  : filter !== 'all'
                    ? 'No hay vacantes en esta categoría. Intenta cambiar el filtro superior.'
                    : settings.lastSearchAt
                      ? `Applica está vigilando la red silenciosamente. Hoy hemos descartado miles de vacantes mediocres para proteger tu tiempo. El agente te avisará en cuanto aparezca la indicada.`
                      : 'Lanza tu primer barrido para que Applica empiece a traerte oportunidades.'}
              </p>
            </div>
          </div>
        ) : (
          <>
          <style>{`
            /* Scrollbar on TOP via double vertical flip (wrapper flips, table flips back). */
            .app-table-scroll { overflow-x: scroll; scrollbar-width: thin; scrollbar-color: var(--petrol) var(--bg-2); transform: rotateX(180deg); }
            .app-table-scroll > table { transform: rotateX(180deg); }
            .app-table-scroll::-webkit-scrollbar { height: 10px; -webkit-appearance: none; }
            .app-table-scroll::-webkit-scrollbar-track { background: var(--bg-2); border-radius: 999px; }
            .app-table-scroll::-webkit-scrollbar-thumb { background: var(--petrol); border-radius: 999px; border: 2px solid var(--bg-2); }
          `}</style>
          {showScrollHint && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontSize: '.73rem', fontWeight: 600, color: 'var(--petrol)', marginBottom: '.5rem' }}>
              Desliza la tabla horizontalmente (barra arriba) para ver todas las columnas
            </div>
          )}
          <div ref={tableScrollRef} className="modern-table-wrapper app-table-scroll" style={{ width: '100%' }}>
            <table className="modern-table" style={{ borderCollapse: 'separate', borderSpacing: '0 0.75rem', width: '100%', minWidth: '940px' }}>
              <thead>
                <tr>
                  <th onClick={() => toggleSort('company')} style={{ cursor: 'pointer', userSelect: 'none', width: '400px' }}>Empresa & Rol {sortKey === 'company' ? (sortDir === 'asc' ? '' : '') : ''}</th>
                  <th onClick={() => toggleSort('score')} style={{ cursor: 'pointer', textAlign: 'center', userSelect: 'none', width: '64px' }}>Score {sortKey === 'score' ? (sortDir === 'asc' ? '' : '') : ''}</th>
                  <th onClick={() => toggleSort('status')} style={{ cursor: 'pointer', userSelect: 'none', width: '160px' }}>Estado {sortKey === 'status' ? (sortDir === 'asc' ? '' : '') : ''}</th>
                  <th onClick={() => toggleSort('date')} style={{ cursor: 'pointer', userSelect: 'none', width: '92px' }}>Fecha {sortKey === 'date' ? (sortDir === 'asc' ? '' : '') : ''}</th>
                  <th style={{ userSelect: 'none', width: '180px', minWidth: '180px' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {paged.map(app => {
                  const sm = STATUS_META[app.status as string] || { label: String(app.status), badge: 'badge-ghost' };
                  const companyName = app.vacancy?.company ?? 'N/A';
                  const isNavigating = navigatingId === app.id;
                  const needsInfo = !isAtsApp(app) && unresolvedBlockers((app.submissionDecision as any)?.formPreview?.blockers, app.formAnswers as Record<string, string>).length > 0;
                  // After an auto-apply attempt that couldn't complete, the worker
                  // leaves a warning - surface it so the user isn't left guessing.
                  const lastWarn = ((app.vacancy?.warnings as string[] | null) ?? []).slice(-1)[0] ?? '';
                  const needsAttention = app.status === 'pending_review' && /aplica manualmente|aplicaci[oó]n externa|requiere registro|recon[eé]ctala|no usa easy apply|no es viable/i.test(lastWarn);
                  // The worker archives postings whose URL no longer points at the
                  // job (company closed it); tell the user instead of a bare "Omitido".
                  const vacancyGone = app.status === 'skipped' && /ya no est[aá] publicada/i.test(lastWarn);

                  const wfOpen = attentionApp?.id === app.id;
                  return (
                    <Fragment key={app.id}>
                    <tr
                      className="modern-row"
                      style={{
                        opacity: isNavigating ? 0.6 : ((app.status as string) === 'filtered' ? 0.75 : 1),
                        position: 'relative'
                      }}
                      onClick={() => openApp(app)}
                    >
                      <td style={{ position: 'relative', width: '400px', maxWidth: '400px' }}>
                        {(app.status as string) === 'pending_review' && (
                          <div style={{ position: 'absolute', left: 0, top: '20%', height: '60%', width: '4px', background: 'var(--gold)', borderRadius: '0 4px 4px 0' }} />
                        )}
                        <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'flex-start' }}>
                          <CompanyLogo companyName={companyName} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: '0.95rem', fontFamily: 'var(--font-display)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{companyName}</div>
                            <div style={{ fontWeight: 500, fontSize: '0.85rem', color: 'var(--text-2)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.3 }}>{app.vacancy?.title ?? '-'}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem', minWidth: 0 }}>
                              <span style={{ textTransform: 'capitalize', flexShrink: 0 }}>{app.vacancy?.platform ?? '-'}</span>
                              {app.vacancy?.location && (
                                <>
                                  <span style={{ margin: '0 0.15rem', flexShrink: 0 }}>•</span>
                                  <span style={{ flexShrink: 0 }}></span>
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{app.vacancy.location}</span>
                                </>
                              )}
                            </div>
                            {app.vacancy?.description && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginTop: '0.4rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.45 }}>
                                {app.vacancy.description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180)}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'inline-block' }}><ScoreRing score={app.vacancy?.score} /></div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                          <span className={`badge ${sm.badge}`}>{sm.label}</span>
                          {needsInfo && <span className="badge badge-warning" title="Esta vacante pide datos adicionales. Entra para completarlos.">Faltan datos</span>}
                          {needsAttention && !needsInfo && (
                            <span className="badge badge-warning" title={lastWarn} onClick={(e) => { e.stopPropagation(); setAttentionApp(app); }} style={{ cursor: 'pointer' }}>Requiere tu atención</span>
                          )}
                          {vacancyGone && <span className="badge badge-ghost" title={lastWarn}>Vacante cerrada</span>}
                          {app.responseStatus === 'contacted' && <span className="badge badge-success">Te llamaron</span>}
                          {app.responseStatus === 'rejected' && <span className="badge badge-danger">Rechazada</span>}
                        </div>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-2)', fontWeight: 500 }}>
                          {new Date(app.createdAt).toLocaleDateString('es', { day: '2-digit', month: 'short' })} {new Date(app.createdAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'stretch' }}>
                          {app.status === 'pending_review' && (
                            <button
                              className="btn btn-primary btn-sm"
                              disabled={actioningId === app.id || (connectingLi && isLinkedIn(app))}
                              title={autoCapable(app) ? 'Abrimos la oferta en tu navegador con el formulario ya lleno; tú solo resuelves el captcha y envías.' : 'Veamos cómo aplicar a esta oferta.'}
                              onClick={() => applyApp(app)}
                              style={{ whiteSpace: 'nowrap', minWidth: 84 }}
                            >
                              {actioningId === app.id ? <span className="spinner" style={{ width: 12, height: 12 }} /> : autoCapable(app) ? 'Abrir y aplicar' : 'Aplicar'}
                            </button>
                          )}
                          {app.status === 'pending_review' && autoCapable(app) && actioningId !== app.id && (
                            <button
                              className="btn btn-ghost btn-sm"
                              title="Si ya enviaste esta aplicación, márcala como aplicada."
                              onClick={() => markApplied(app)}
                              style={{ whiteSpace: 'nowrap', color: 'var(--text-3)' }}
                            >
                              Ya apliqué
                            </button>
                          )}
                          {app.status === 'approved' && (
                            <button
                              className="btn btn-secondary btn-sm"
                              disabled={actioningId === app.id}
                              title="Cuando termines de enviar en la ventana que abrimos, confírmalo aquí."
                              onClick={() => markApplied(app)}
                              style={{ whiteSpace: 'nowrap' }}
                            >
                              {actioningId === app.id ? <span className="spinner" style={{ width: 12, height: 12 }} /> : 'Ya envié'}
                            </button>
                          )}
                          {app.status !== 'archived' && (
                            <button
                              className="btn btn-ghost btn-sm"
                              disabled={actioningId === app.id}
                              title="No me interesa - quitar de la lista."
                              onClick={() => discardApp(app)}
                              style={{ whiteSpace: 'nowrap', color: 'var(--text-3)' }}
                            >
                              Descartar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {app.status === 'approved' && (
                      <tr className="animate-fadein">
                        <td colSpan={5} style={{ padding: 0 }}>
                          <div style={{ background: 'rgba(42,74,79,.07)', border: '1px solid rgba(42,74,79,.2)', borderRadius: 'var(--radius-md)', padding: '0.85rem 1.1rem', marginTop: '-0.5rem', display: 'flex', alignItems: 'center', gap: '0.9rem', flexWrap: 'wrap' }}>
                            <span style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--gold, #B09460)', flexShrink: 0, boxShadow: '0 0 0 4px rgba(176,148,96,.18)' }} />
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontWeight: 700, fontSize: '.85rem', color: 'var(--text)' }}>Applica está aplicando por ti</div>
                              <div style={{ fontSize: '.78rem', color: 'var(--text-2)', marginTop: '.2rem', maxWidth: 640, lineHeight: 1.5 }}>
                                Se abrirá una ventana y llenaremos el formulario por ti: nombre, correo, CV y todo lo que sabemos de tu perfil. <strong>Deja que termine</strong> (unos segundos). Cuando esté listo: revisa que todo esté bien, <strong>completa lo que falte</strong>, resuelve el captcha si aparece y dale <strong>Enviar</strong>. Al terminar, confírmalo aquí con <strong>"Ya envié"</strong>; si algo salió mal, <strong>"No se envió"</strong> para reintentar.
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '.4rem', flexShrink: 0 }}>
                              <button className="btn btn-primary btn-sm" disabled={actioningId === app.id} onClick={() => markApplied(app)} style={{ whiteSpace: 'nowrap' }}>
                                {actioningId === app.id ? <span className="spinner" style={{ width: 12, height: 12 }} /> : 'Ya envié'}
                              </button>
                              <button className="btn btn-ghost btn-sm" disabled={actioningId === app.id} title="Volver a intentar / no se completó." onClick={() => cancelAssisted(app)} style={{ whiteSpace: 'nowrap', color: 'var(--text-3)' }}>
                                No se envió
                              </button>
                            </div>
                            <ExtensionOffer />
                          </div>
                        </td>
                      </tr>
                    )}
                    {wfOpen && (() => {
                      const r = attentionReason(app);
                      return (
                        <tr className="animate-fadein">
                          <td colSpan={5} style={{ padding: 0 }}>
                            <div style={{ background: 'rgba(240,192,64,.10)', border: '1px solid rgba(240,192,64,.4)', borderRadius: 'var(--radius-md)', padding: '0.85rem 1.1rem', marginTop: '-0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 700, fontSize: '.82rem', color: 'var(--text)' }}>{r.title}</div>
                                <div style={{ fontSize: '.78rem', color: 'var(--text-2)', marginTop: '.15rem', maxWidth: 560 }}>{r.detail}</div>
                              </div>
                              <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', flexShrink: 0 }}>
                                <button className="btn btn-primary btn-sm" onClick={() => { setAttentionApp(null); openApp(app); }} style={{ whiteSpace: 'nowrap' }}>
                                  {r.cta === 'fill' ? 'Completar datos' : 'Ver materiales y aplicar'}
                                </button>
                                {r.cta !== 'fill' && app.vacancy?.url && (
                                  <a className="btn btn-secondary btn-sm" href={app.vacancy.url} target="_blank" rel="noopener" onClick={() => setAttentionApp(null)} style={{ textDecoration: 'none', whiteSpace: 'nowrap' }}>Ir a la oferta</a>
                                )}
                                <button className="btn btn-ghost btn-sm" onClick={() => setAttentionApp(null)} style={{ color: 'var(--text-3)', whiteSpace: 'nowrap' }}>Cancelar</button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })()}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ fontSize: '.73rem', color: 'var(--text-3)' }}>
          {sorted.length === 0
            ? 'Sin resultados'
            : `Mostrando ${(safePage - 1) * PAGE_SIZE + 1}-${Math.min(safePage * PAGE_SIZE, sorted.length)} de ${sorted.length}`}
        </div>
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '.35rem' }}>
            <button className="btn btn-secondary btn-sm" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Anterior</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 2)
              .reduce<number[]>((acc, p) => { if (acc.length && p - acc[acc.length - 1] > 1) acc.push(-1); acc.push(p); return acc; }, [])
              .map((p, i) => p === -1
                ? <span key={`gap-${i}`} style={{ color: 'var(--text-3)', padding: '0 .25rem' }}>…</span>
                : (
                  <button key={p} className={`btn btn-sm ${p === safePage ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setPage(p)} style={{ minWidth: 34 }}>
                    {p}
                  </button>
                ))}
            <button className="btn btn-secondary btn-sm" disabled={safePage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Siguiente</button>
          </div>
        )}
      </div>

      {showUpgradeModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255, 255, 255, 0.4)', backdropFilter: 'blur(8px)' }}>
          <div className="bento-card" style={{ width: '100%', maxWidth: '400px', position: 'relative' }}>
            <button onClick={() => setShowUpgradeModal(false)} style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', color: 'var(--text-3)' }}>
              <IconX size={20} />
            </button>
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.5rem' }}>Applica PRO</h2>
              <p style={{ color: 'var(--text-2)', fontSize: '0.9375rem' }}>Unlock full automation capabilities.</p>
            </div>
            <div style={{ background: 'var(--bg)', padding: '1rem', borderRadius: 'var(--radius-md)', textAlign: 'center', marginBottom: '2rem' }}>
              <span style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text)' }}>$29</span>
              <span style={{ color: 'var(--text-3)' }}> / month</span>
            </div>
            <button onClick={() => alert('Upgrade flow pending')} className="btn btn-primary" style={{ width: '100%' }}>
              Upgrade Now
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Last-resort offer to install the Applica browser extension. Shown inside the
 * assisted-apply panel (i.e. exactly when the user hits a verification-gated ATS
 * that keeps needing a window). Framed as "99% -> 100%": the extension fills the
 * form right in the user's own browser, so no more popup windows, anti-bot blocks
 * or profile conflicts. Self-contained: fetches the user's extension token on open.
 */
function ExtensionOffer() {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (open && token === null) {
      fetch('/api/extension/token').then((r) => r.json()).then((d) => setToken(d.token ?? '')).catch(() => setToken(''));
    }
  }, [open, token]);
  return (
    <div style={{ width: '100%', marginTop: '.6rem', paddingTop: '.6rem', borderTop: '1px dashed rgba(42,74,79,.18)' }}>
      {!open ? (
        <button onClick={() => setOpen(true)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--gold, #B09460)', fontWeight: 600, fontSize: '.76rem' }}>
          ¿Cansado de abrir ventanas? Pasa de 99% a 100% con la extensión Applica
        </button>
      ) : (
        <div style={{ fontSize: '.76rem', color: 'var(--text-2)', lineHeight: 1.55 }}>
          <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: '.3rem' }}>Extensión Applica: llena la postulación en tu propio navegador</div>
          Sin ventanas emergentes, sin bloqueos anti-bot. Un clic y se llena todo; solo el captcha y los datos que no sabemos quedan para ti.
          <ol style={{ margin: '.5rem 0', paddingLeft: '1.1rem' }}>
            <li>Abre <code>brave://extensions</code>, activa "Modo de desarrollador", "Cargar descomprimida" y elige la carpeta <code>extension/</code>.</li>
            <li>Abre la extensión, pega tu token y "Conectar":</li>
          </ol>
          <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center', margin: '.3rem 0 .5rem' }}>
            <input readOnly value={token ?? 'Cargando...'} style={{ flex: 1, fontSize: '.72rem', padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(42,74,79,.25)', fontFamily: 'monospace' }} onFocus={(e) => e.currentTarget.select()} />
            <button onClick={() => { if (token) { navigator.clipboard.writeText(token); setCopied(true); setTimeout(() => setCopied(false), 1500); } }} className="btn btn-primary btn-sm" style={{ whiteSpace: 'nowrap' }}>{copied ? 'Copiado' : 'Copiar'}</button>
          </div>
          <div>3. En la vacante, pulsa "Llenar con Applica" (abajo a la derecha). <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', textDecoration: 'underline', fontSize: '.74rem' }}>Ocultar</button></div>
        </div>
      )}
    </div>
  );
}
