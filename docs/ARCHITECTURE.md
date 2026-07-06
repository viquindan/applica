# Applica - Arquitectura del sistema

> Diseño estable del proyecto. El **progreso** vive en `STATUS.md`; las **decisiones y su porqué** en `DECISIONS.md`; **cómo correr/convenciones** en `CONVENTIONS.md`.

## 1. Qué es
Motor autónomo de postulación a empleos. Descubre vacantes en ATS públicos, las evalúa contra el perfil profesional del usuario, adapta CV/carta/respuestas con IA, y postula. Dos rutas de envío:
- **ATS sin verificación al enviar:** Applica llena y **envía** automáticamente (sin usuario).
- **ATS con verificación al enviar (las 4 objetivo hoy):** el llenado del adapter ocurre en un navegador headless del servidor (efímero, el usuario no lo ve). Applica deja CV/carta/respuestas **preparadas** y el usuario **aplica desde la oferta en su propio navegador**, resolviendo ahí la verificación (*assisted handoff*).

## 2. Tech stack
- **Framework:** Next.js 16.2.6 (App Router + Turbopack)
- **Lenguaje:** TypeScript (estricto)
- **DB:** Neon PostgreSQL vía Drizzle ORM (`src/db`)
- **Cola/jobs:** pg-boss (`src/core/jobs`)
- **Automatización:** `playwright-extra` + `puppeteer-extra-plugin-stealth` (Chromium bundled)
- **IA:** Gemini vía Vercel `ai` SDK (`src/core/ai`)
- **UI:** React + CSS custom (glassmorphism, `globals.css`) + HTML5 Canvas para física

## 3. Módulos núcleo

### A. Motor de automatización (`src/core/automation`)
- **`browserManager.ts`** - clúster de `BrowserContext` aislados (incógnito), rota User-Agents, soporta proxy (`PROXY_SERVER`). Headless por defecto; `APPLY_HEADFUL=true` para headful (pasa mejor reCAPTCHA invisible).
- **`applyEngine.ts`** - `runAutomatedApplication(adapter, url, ctx)`: abre contexto, detecta CAPTCHA visible, delega al adapter, guarda evidencia (screenshot) vía `evidenceSaver.ts`. Sin dry-run propio: el envío real lo gobierna `ENABLE_REAL_SUBMISSIONS`.
- **`formPreview.ts`** - `inspectApplicationForm`: preview de campos/bloqueadores antes de aplicar.
- Captura de sesión LinkedIn (`linkedinLoginCapture.ts`, `browserCookies.ts`).

### B. Adapters por ATS (`src/core/platforms`)
Cada uno implementa `PlatformAdapter`: `search`, `extractVacancy`, `inspectApplicationFormPlaywright`, `applyPlaywright`.
- **greenhouse, lever, ashby, smartrecruiters, recruitee.**
- `applyPlaywright` llena el formulario real campo por campo (label-driven), adjunta CV, y al enviar: si confirma `submitted`; si detecta verificación humana (CAPTCHA) `failed_captcha` (handoff assisted, NO se derrota el captcha).

### C. Workers (`src/core/jobs/worker.ts`)
Cola pg-boss. Handlers: `search_vacancies`, `prepare_application_materials`, `process_application`, `regenerate_materials`, `re_evaluate_vacancies`, `refresh_ats_registry`, `refresh_job_cache`, `discover_ats_boards`. Concurrencia 5 (ver `DECISIONS.md`). Corre local: `npx tsx scripts/startWorker.ts`.

### D. Scoring / elegibilidad (`src/core/scoring`)
- `eligibility.ts` - hard-excludes (onsite extranjero, idioma, work-auth) + señales de "hireability" **geography-agnostic**.
- `fitScorer.ts` - score 0-100. `formRequiresForeignWorkAuth` capa el score si el form exige work-auth que el usuario no tiene.

### E. Tailoring (`src/core/tailoring`)
- `tailorCV`, `generateCoverLetter`, `generateTailoredAnswers` (Gemini).
- `cvFile.ts` - `renderCvToPdf` (Chromium `page.pdf()`), `resolveUploadPath`.
- `src/core/ai/limiter.ts` - serializa + reintenta llamadas IA (cuota).

### F. Frontend (`src/app/(dashboard)`)
- `ApplicationsClient.tsx` - centro de control. Grid asimétrico estable. Flujo: auto-apply (ATS) vs assisted (captcha/LinkedIn "lista para tu clic, ir a la oferta").
- `CanvasParticleSwarm.tsx` - motor de partículas 60 FPS en Canvas (no reemplazar con SVG/DOM pesado).

## 4. Envío y gates de verificación
- El sistema usa stealth + comportamiento humano (delays, sin `.click()` instantáneo) para llenado y scraping.
- **Las 4 ATS objetivo exigen un paso de verificación al ENVIAR.** El llenado del adapter corre en un navegador headless del servidor que no se transfiere al usuario; por eso el adapter devuelve `failed_captcha` y el usuario aplica desde la oferta en **su** navegador con los materiales ya preparados (no "termina" el formulario del servidor).
- En `applyPlaywright`: nunca lanzar excepción genérica ante un gate de verificación; detectarlo y devolver `submissionStatus: 'failed_captcha'`.

## 5. Memoria del producto (motor cognitivo de Applica - NO es Claude Code)
Dos capas: (1) datos estructurados (Postgres), (2) markdown agent-native guardado en DB tratado como paths (`memory/profile.md`, `skills/*.md`). Regla: juicios repetidos se anexan a memoria; eventualmente se promueven a "skills" para mantener el prompt compacto.
