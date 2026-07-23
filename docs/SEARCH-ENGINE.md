# Motor de búsqueda de Applica (CORE DEL PRODUCTO)

> **Este es el corazón del negocio.** Applica no compite por tener más vacantes;
> compite por entender las capacidades y la experiencia reales del usuario y
> devolverle **las mejores oportunidades para las que sí puede recibir
> entrevistas**. Si este motor funciona, el producto funciona. Si se degrada,
> nada más importa.
>
> **LECTURA OBLIGATORIA antes de tocar CUALQUIER archivo listado en la sección
> "Mapa de archivos".** Este doc registra qué falla y por qué, qué funciona y
> por qué, y qué invariantes no se pueden romper. Costó muchas iteraciones y
> bugs reales de producción llegar aquí. No se itera de cero ni se "simplifica"
> sin leer esto completo.

---

## 0. Cómo se blinda este motor (LÉELO PRIMERO)

Un agente de IA nuevo, sin memoria de este chat, es exactamente el escenario en
que se rompe el core sin querer. La protección tiene 5 capas y **ninguna es
opcional**:

1. **Separación de capas.** El motor vive 100% en `src/core/` (backend puro:
   `scoring/`, `platforms/`, `profile/`, `pipeline/`, `jobs/`). El frontend
   (`src/app/`, `mobile/`) SOLO consume sus resultados. **Un cambio de UI nunca
   debe tocar `src/core/`, y este doc nunca documenta UI.** Si estás cambiando
   el front y crees que necesitas tocar el motor, estás equivocado casi seguro.

2. **Suite de tests de regresión.** Cada bug real encontrado en producción se
   convierte en un caso en `src/core/scoring/__tests__/` o
   `src/core/platforms/__tests__/`. Los tests NO son hipotéticos: cada uno
   referencia el incidente real que lo originó. Hoy son ~78 casos. **Regla
   dura: `npm test` debe estar en verde ANTES y DESPUÉS de tocar el motor, y
   cada bug de matching nuevo que encuentres se agrega como caso ANTES de darlo
   por cerrado.** Así el afinamiento es acumulativo (siempre mejor), no
   reprocesado por pérdida de contexto entre sesiones.

3. **Gate de CI.** `.github/workflows/deploy.yml` corre `npm test` en el runner
   ANTES del SSH al VPS. Un cambio que rompe un test **nunca llega a
   producción**. No lo desactives.

4. **Documentar el PORQUÉ, no solo el qué.** Cada regla no obvia de este motor
   nace de un caso real que falló. El comentario en el código y la entrada en
   este doc explican el incidente. Un agente que entiende *por qué* existe una
   regla no la "limpia" pensando que es código muerto.

5. **Invariantes explícitos** (sección 5). Una lista corta de cosas que NUNCA
   deben cambiar sin una decisión de producto consciente. Cada invariante está
   anclado a un test que lo hace fallar si se viola.

**La garantía en una frase:** el motor es maleable (agrega familias de roles,
señales, umbrales, plataformas libremente) pero robusto (cualquier regresión de
comportamiento rompe un test y bloquea el deploy). Para dañarlo hay que romper
tests a propósito e ignorar CI, lo cual es una decisión visible, no un
accidente.

---

## 1. Qué es el éxito (la misión, medible)

El motor tiene éxito cuando devuelve vacantes que cumplen las TRES a la vez:

- **Relevantes al perfil real:** el rol, la seniority y la industria calzan con
  lo que el usuario ha hecho y busca.
- **Alcanzables:** el usuario puede efectivamente aplicar y ser considerado
  (modalidad, ubicación, autorización de trabajo, idioma).
- **Con probabilidad real de entrevista:** su experiencia amerita el rol; no son
  títulos aspiracionales imposibles ni roles muy por debajo de su nivel.

Un falso positivo (mostrar algo inalcanzable) erosiona la confianza tanto como un
falso negativo (esconder algo bueno). El motor prefiere **precisión sobre
volumen**: mejor 20 oportunidades reales que 200 con ruido.

---

## 2. Arquitectura en dos mitades

El motor se divide en dos responsabilidades claras. La mitad A entiende al
usuario; la mitad B usa ese entendimiento para consultar el mundo.

```
   CV / perfil                          Bases de datos de vacantes
       │                                          │
       ▼                                          ▼
┌──────────────────┐              ┌───────────────────────────────┐
│  A. INGESTA Y     │             │  B. CONSULTA Y MATCHING        │
│  COMPRENSIÓN      │──perfil────▶│  (embudo: pool → elegibilidad  │
│  DEL USUARIO      │  estructu-  │   → scoring → umbral → Feed)   │
└──────────────────┘   rado      └───────────────────────────────┘
                                              ▲
                                              │ refresco continuo
                                  ┌───────────────────────────────┐
                                  │  C. MEJORA CONTINUA DE LAS     │
                                  │  BASES (discovery + registry   │
                                  │  + cache)                      │
                                  └───────────────────────────────┘
```

---

## 3. MITAD A: Ingesta y comprensión del usuario

**Objetivo:** convertir un CV en lenguaje natural + lo que el usuario declara en
un **perfil estructurado** que el matching pueda consumir sin ambigüedad.

### A.1 Extracción del CV
- `src/core/profile/extractResumeText.ts` — extrae texto crudo del PDF/DOCX.
- `src/core/profile/extractProfileFromCv.ts` — IA (Gemini) estructura el texto
  en: `name, phone, linkedin, portfolio, location, country, languages[],
  experience[], education[], certifications[], skills[], achievements`. Tiene un
  `fallbackExtract` heurístico (regex) para cuando no hay IA disponible.
- `src/core/profile/suggestRoles.ts` — a partir de la experiencia real, sugiere
  **roles objetivo realistas** (los que el usuario plausiblemente conseguiría
  entrevistas para), no aspiracionales. Se registran como `targetRoles`
  editables.

**REGLA CRÍTICA (bug real 2026-07-20):** la extracción con IA NO es
determinista. El mismo CV puede devolver 0 experiencias en una corrida y 5 en
la siguiente. **Nunca sobreescribir un campo estructurado con un resultado
vacío.** `resumes/base/route.ts` y `resumes/[id]/route.ts` solo escriben
`experience/education/skills/etc.` cuando la extracción trajo algo
(`?.length ? valor : undefined`). Un array vacío es *truthy* en JS: `x || undefined`
NO protege; hay que chequear longitud explícitamente. Anclado en la conducta de
esas rutas; un CV re-subido nunca debe vaciar datos buenos.

### A.2 Datos que el usuario declara (además del CV)
Editables en Perfil (web y mobile), guardados con **merge parcial** en
`PUT /api/profile` (cada campo solo se toca si viene en el body; ver bug de
2026-07-18 donde un save parcial borraba todo lo demás):
- `targetRoles`, `targetSeniority`, `targetIndustries` — guías de búsqueda.
- `targetCountries`, `workModalityPrefs` (remoto/híbrido/presencial + alcance +
  regiones/países), `relocationAvailable`, `workAuthorization[{country,status}]`.
- `languages[{language,proficiency}]`, `salaryMin`, `noticePeriod`.
- `priorityKeywords` (suben score), `alertKeywords` (bajan/avisan),
  `skills[{skill,level}]`, `achievements` (texto libre que SÍ alimenta el
  matching, no solo la carta).

**Todos estos campos alimentan el matching.** Ver `docs/STATUS.md` (auditoría
2026-07-13) para el mapeo campo→uso. Si agregas un campo al perfil, debe tener un
consumidor real en la Mitad B o es peso muerto.

### A.3 Principio rector de esta mitad
Los **roles objetivo son una GUÍA, no un filtro rígido** (cambio de 2026-07-20).
El sistema también deriva roles de la experiencia real del CV
(`buildSearchRoles` en `fitScorer.ts`): un candidato que ha corrido operaciones
pero solo listó títulos de fintech debe ver buenos matches de "Director of
Operations" aunque nunca lo escribiera. La experiencia amplía el alcance; lo
explícito tiene prioridad de peso.

---

## 4. MITAD B: Consulta y matching (el embudo)

**Objetivo:** dado el perfil estructurado, recorrer ~91k vacantes y devolver
solo las mejores, ordenadas, sin ruido. Todo esto vive en el handler
`search_vacancies` de `src/core/jobs/worker.ts`, que orquesta los pasos.

### Paso 1 — Armar el pool de candidatos
- **Fuentes cacheadas** (`src/core/platforms/jobCache.ts`): Greenhouse, Lever,
  Ashby, Recruitee. Un fetch central llena un cache en memoria compartido por
  todos los usuarios; cada búsqueda filtra/rankea sobre el cache SIN red.
- **SmartRecruiters NO se cachea** (su API exige fetch por-posting para
  descripciones): se busca en vivo por búsqueda, con **todos** sus boards
  activos (no una página rotatoria; ver bug 2026-07-20). Es la fuente más
  grande (~46k jobs).
- **LinkedIn** (solo plan Pro): scraper stealth en vivo, con los roles reales
  del usuario. Es donde viven los roles ejecutivos que casi no aparecen en ATS.
- **Plataformas por defecto (opt-out):** se buscan TODAS las plataformas
  soportadas salvo que el usuario desactive una explícitamente. Agregar una
  plataforma nueva no requiere que el usuario la pre-configure.
- **Roles de búsqueda:** `buildSearchRoles(profile).all` = roles objetivo +
  roles derivados de la experiencia.

El pre-filtro (`atsSearchHelpers.ts::matchesFilters`) descarta por rol y
ubicación ANTES del scoring, por rendimiento. **REGLA CRÍTICA (bug 2026-07-20):**
si el candidato acepta remoto, el pre-filtro conserva TODA vacante remota (no
solo global/regional). Tener `targetCountries` NO debe encoger el pool: es una
guía que amplía, no un cerco. La decisión fina de geografía es del scorer, no de
este filtro grueso de string.

### Paso 2 — Gate de elegibilidad (descarte duro)
`src/core/scoring/eligibility.ts` — reglas de "esto es fundamentalmente
inaplicable para ti", evaluadas por vacante. Las que fallan NO se guardan:
- **R1** presencial/híbrido en país extranjero sin permiso/reubicación/target.
- **R2** exige idioma extranjero fluido que el usuario no declara.
- **R3** liderazgo de mercado local atado a un mercado lejano.
- **R4/R5** work-auth y alcance geográfico del posting (lee la descripción, no
  solo el string de location, vía `detectGeoScopeFromText`).

**REGLA CRÍTICA (bug 2026-07-20):** cuando el campo de ubicación declara remoto
("Home Based - X", "Remote"), esa señal estructurada gana sobre menciones
INCIDENTALES de "in person"/"office" en la descripción (ej. "the team meets in
person twice a year" es un trabajo remoto, no presencial).

### Paso 3 — Scoring 0-100
`src/core/scoring/fitScorer.ts::scoreVacancy`. Componentes y pesos:

| Componente | Pts | Fuente del perfil |
|---|---|---|
| Rol | 30 | `targetRoles` (30/26) o rol derivado de experiencia (22/20) |
| Industria | 15 | `targetIndustries` vs descripción |
| Ubicación | 15 | local-first + hiring footprint (`geography.ts`) |
| Seniority | 10 | `targetSeniority` vs título (`roleTaxonomy.ts`) |
| Salario | 10 | `salaryMin` vs rango del posting |
| Skills | +10 | `skills` vs descripción |
| Expertise | +12 | experiencia/certs/logros (`expertise.ts`, embeddings) |
| Keywords | +10 | `priorityKeywords` |
| Empresa | ± | boost `targetCompanies` / hard-exclude `excludedCompanies` |

Ajustes: cap de 50 (`LOCAL_ONLY_CAP`) para roles remotos atados a un país
extranjero donde el usuario no tiene work-auth ("Remote US" para alguien en
Panamá); penalizaciones por idioma requerido no declarado; rerank semántico
opcional (`semanticMatch.ts`, `ENABLE_SEMANTIC_RERANK`).

### Paso 4 — Umbral y creación
- **score ≥ `minScoreToGenerateMaterials` (default 60):** se guarda la vacante
  (`generating`) y se crea la `application`; se preparan CV/respuestas y aparece
  en el **Feed** ordenada por score desc.
- **score < 60:** se guarda como `filtered` (visible bajo "aplicar de todos
  modos", no en el Feed).

**REGLA CRÍTICA (bug 2026-07-20):** preparar materiales es GRATIS y automático;
NUNCA consume cuota ni bloquea el Feed. La cuota mensual (`planLimits`) se cobra
al ENVIAR (swipe/approve/assisted/mark_applied) en
`/api/applications/[id]/action`, no al preparar. Alinea con D13 (el swipe es la
única autorización de envío). Un usuario nunca debe quedar bloqueado sin haber
aplicado a nada.

### Paso 5 — Re-evaluación
`src/core/pipeline/reEvaluate.ts` (cada 6h) re-puntúa vacantes guardadas contra
las reglas ACTUALES y **promueve** al Feed las que ahora cruzan el umbral (ej.
tras un cambio de perfil). Sin esto, una vacante que puntuó bajo antes quedaría
varada como `filtered` para siempre.

---

## 5. MITAD C: Mejora continua de las bases

Corren por `setInterval` en el proceso del worker (NO por reprogramación en
pg-boss, que era frágil entre reinicios; ver bug 2026-07-17):
- **`refresh_job_cache`** (5h) — re-fetcha todos los boards al cache compartido.
- **`refresh_ats_registry`** (12h) — actualiza conteos de boards conocidos.
- **`discover_ats_boards`** (4h) — descubre boards nuevos vía buscadores.
- **`discover_companies_directory`** (24h) — prueba nombres de empresas reales
  (categorías de Wikipedia) contra las 5 APIs de ATS; solo guarda las que
  responden con vacantes reales. Ningún token se inventa.

El registro crece solo y de forma verificada. Hoy: ~1,000+ boards activos, ~91k
jobs monitoreados. **Nunca sembrar tokens sin validarlos contra la API real.**

---

## 6. Invariantes que NUNCA se rompen sin decisión de producto

Cada uno tiene un test que falla si se viola. Si vas a cambiar uno, es una
decisión consciente que se documenta en `docs/DECISIONS.md`, no un refactor.

1. **Los roles objetivo amplían, no encierran.** Tener `targetCountries` o
   `targetRoles` nunca debe reducir el pool respecto a no tenerlos.
   → `platforms/__tests__/searchLocationFilter.test.ts`,
   `scoring/__tests__/fitScorer.test.ts` (rol derivado de experiencia).
2. **La extracción de CV nunca vacía datos buenos** con una corrida floja de IA.
   → conducta de `resumes/base` y `resumes/[id]`.
3. **Preparar es gratis; la cuota se cobra al enviar.** → `usageTracker.ts` +
   gate en la ruta de acción.
4. **Remoto declarado en la ubicación gana** sobre menciones incidentales de
   presencial en la descripción. → `scoring/__tests__/eligibility.test.ts`.
5. **Un rol sin relación no se infla** solo porque el perfil tenga experiencia.
   → `scoring/__tests__/fitScorer.test.ts` (guard "Registered Nurse" para un COO).
6. **Los tokens de ATS siempre se validan contra la API real** antes de
   guardarse. → mecanismo de `growRegistryFromCompanies`.
7. **La taxonomía de roles cubre TODO el mercado, no solo liderazgo.**
   `ROLE_FAMILIES` (roleTaxonomy.ts) debe reconocer títulos IC y no-tech
   (ingeniería, datos, diseño, finanzas, ventas, salud, legal, educación...,
   con aliases en inglés Y español) además de las familias ejecutivas. No es
   cosmético: `roleMatches()` no solo alimenta el componente de rol del score
   (30 pts, el más pesado) - también PRE-FILTRA el pool de candidatos
   (`atsSearchHelpers.ts`), así que un título sin familia pierde recall en
   origen ("Backend Engineer" ni siquiera entraba al embudo para quien busca
   "Software Engineer"). Bug real (auditoría doble 2026-07-23): todas las
   familias eran `*_leadership`, y 4 de 6 cuentas de producción terminaban
   con 0 matches. Las familias de liderazgo van PRIMERO en el objeto (el
   orden decide empates: "Director of Product" debe resolver a
   product_leadership, no a una familia IC). Al agregar una familia nueva,
   evita aliases de una sola palabra genérica ("engineer", "analyst") - el
   matching es por presencia de palabras y sobre-matchearía entre familias.
   → `scoring/__tests__/roleTaxonomy.test.ts` (bloque "IC and non-tech").
8. **El score se calcula con los MISMOS insumos en búsqueda y re-evaluación,
   y los insumos por-usuario se cargan UNA vez por corrida.** Bug real doble
   (auditoría 2026-07-23, N1+N2): (a) `reEvaluate.ts` re-puntuaba SIN las
   señales aprendidas mientras la búsqueda original SÍ las pasa - una vacante
   con ajuste aprendido (ej. -15 por empresa rechazada repetidamente)
   oscilaba entre dos scores distintos cada 6h, reordenando el Feed sin
   razón; (b) el historial completo del usuario (JOIN sin índice) se
   re-consultaba POR CADA candidato del pool dentro del loop de búsqueda -
   el consumidor de DB más pesado de toda la corrida, para datos que no
   cambian a mitad de búsqueda. Patrón obligatorio: `getUserApplicationHistory`
   una vez por corrida + `deriveSignals` (puro) por vacante; cualquier
   caller nuevo que itere vacantes debe pasar `history` en el contexto de
   `processVacancyForUser`, y cualquier re-score debe pasar las señales.
   → `scoring/__tests__/learnedSignals.test.ts`.
9. **Todo matching de texto respeta límites de palabra - nunca substring
   crudo.** Ya había pasado dos veces antes de la regla ("gas" dentro de
   "organizational" en excludedIndustries, 2026-07-13) y volvió a pasar
   (auditoría 2026-07-23, M1): `expertiseMatchRatio` tenía un fallback
   `|| haystack.includes(term)` que anulaba el chequeo con límite - skills
   cortos matcheaban DENTRO de palabras sin relación ("web"⊂"webinar",
   "app"⊂"application"), medido en vivo hasta 0.75 de ratio contra puro
   ruido, filtrando ~+5 pts del componente de expertise (+12) a vacantes
   irrelevantes. Si agregas cualquier comparación de términos nueva, usa
   límite de palabra (`includesNormalizedPhrase`, el patrón espaciado de
   expertise, o regex con `\b`) - un `.includes()` crudo sobre texto libre
   es un bug esperando su auditoría.
   → `scoring/__tests__/expertise.test.ts`.
10. **Ningún estado "en curso" sobrevive a un reinicio del worker sin
   rescate.** Un worker recién arrancado tiene CERO trabajos corriendo (un
   solo proceso, ver `ecosystem.config.js`), así que todo estado en DB que
   diga "en curso" al arrancar es huérfano de una muerte dura (SIGKILL/OOM
   se salta los dos caminos de limpieza) y DEBE resetearse en el arranque:
   aplicaciones `approved` → `pending_review`, y `searchInProgress=true` →
   false + re-encolar la búsqueda. Además, el guard anti-duplicados del
   handler de búsqueda trata un flag con más de 30 min como huérfano y lo
   reclama en vez de saltarse la corrida. Bug real (auditoría 2026-07-23):
   un usuario quedó >24h en lockout total y silencioso - sin búsqueda
   automática programada y con cada "Buscar ahora" rechazado - porque el
   flag quedó pegado y nada lo limpiaba. Si agregas un estado "en curso"
   nuevo a cualquier tabla, agrega su rescate de arranque en `worker.ts`
   junto a los dos existentes.

---

## 7. Mapa de archivos (qué toca qué)

**Mitad A — ingesta:** `core/profile/{extractResumeText, extractProfileFromCv,
suggestRoles}.ts`, `app/api/resumes/*`, `app/api/profile/route.ts`,
`app/api/onboarding/save/route.ts`.

**Mitad B — matching:** `core/jobs/worker.ts` (orquesta),
`core/platforms/{jobCache, atsSearchHelpers, smartrecruiters, greenhouse,
lever, ashby, recruitee}.ts`, `core/scoring/{fitScorer, eligibility, geography,
roleTaxonomy, expertise, semanticMatch, semanticRole, learnedSignals, salary,
synonyms}.ts`, `core/pipeline/{processVacancy, reEvaluate}.ts`,
`core/billing/{planLimits, usageTracker}.ts`.

**Mitad C — bases:** `core/platforms/{atsRegistry, atsAutoDiscovery,
companyDirectoryDiscovery, *Sources}.ts`, `core/jobs/boss.ts`.

**Tests (el ancla):** `core/scoring/__tests__/*`,
`core/platforms/__tests__/*`.

---

## 8. Historial de reglas (por qué cada una existe)

Todas trazan a un bug real de producción. Detalle cronológico en
`docs/STATUS.md` y `docs/CHANGELOG-2026-07.md`. Resumen de las que más duelen si
se rompen:

- **Familias de roles toleran palabras intermedias** ("VP of Credit
  Operations" → operations_leadership). Sin esto, 5 de 9 roles de un usuario no
  matcheaban nada. (`roleTaxonomy.ts`, 2026-07-20)
- **Pre-filtro de ubicación conserva remotos** si el usuario acepta remoto.
  (8→34 candidatos, 2026-07-20)
- **"Home Based - Americas" no es presencial.** (rescató las mejores vacantes,
  2026-07-20)
- **Cuota al enviar, no al preparar.** (usuario bloqueado 83/30 con 0 apps
  activas, 2026-07-20)
- **Roles como guía + inferencia del CV.** (23→46 apps, 2026-07-20)
- **`profile.languages` vive en `users`, no en `professionalProfiles`.** (el
  hard-exclude por idioma no reconocía ningún idioma declarado, 2026-07-13)
- **`geoScope` desde la descripción, no solo el string de location.**
  (remote-US-only vs remote-global, 2026-07-18)

---

## 9. Cómo trabajar sobre este motor (checklist)

Antes de tocar cualquier archivo de la sección 7:
1. Lee este doc completo (ya lo hiciste si llegaste aquí).
2. `npm test` en verde (línea base).
3. Reproduce el problema con datos REALES si es un bug (script directo contra la
   DB, no hipótesis). Los mejores diagnósticos de este motor salieron de medir
   el embudo paso a paso con un usuario real.
4. Haz el cambio. Explica el PORQUÉ en el comentario, con el caso real.
5. Agrega un caso de test que capture el bug/comportamiento nuevo.
6. `npm test` en verde otra vez. `tsc --noEmit` limpio.
7. Deploy vía push a `master` (CI corre los tests como gate).
8. Verifica en producción con una búsqueda real; mide el embudo, no asumas.
9. Anexa una línea a `docs/STATUS.md`.

> Última actualización: 2026-07-20. Mantener este doc al día es parte de tocar
> el motor, no un extra.
