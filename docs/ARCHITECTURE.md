# Applica - Arquitectura del sistema

> Diseño estable del proyecto. El **progreso** vive en `STATUS.md`; las **decisiones y su porqué** en `DECISIONS.md`; **cómo correr/convenciones** en `CONVENTIONS.md`.

## 1. Qué es
Motor autónomo de postulación a empleos. Descubre vacantes en ATS públicos, las evalúa contra el perfil profesional del usuario, adapta CV/carta/respuestas con IA, y postula. Dos rutas de envío:
- **ATS sin verificación al enviar:** Applica llena y **envía** automáticamente (sin usuario).
- **ATS con verificación al enviar (las 4 objetivo hoy):** el llenado del adapter ocurre en un navegador headless del servidor (efímero, el usuario no lo ve). Applica deja CV/carta/respuestas **preparadas** y el usuario **aplica desde la oferta en su propio navegador**, resolviendo ahí la verificación (*assisted handoff*).

## 2. Tech stack
- **Framework:** Next.js 16.2.6 (App Router + Turbopack)
- **Lenguaje:** TypeScript (estricto)
- **DB:** PostgreSQL vía Drizzle ORM (`src/db`). En **producción** es un Postgres propio corriendo en nuestro VPS (no Neon). `src/db/client.ts` detecta el host de `DATABASE_URL` (`neon.tech` → driver serverless, cualquier otro → `pg`/node-postgres), así que en dev local puede apuntar a Neon o a un Postgres local indistintamente.
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

## 6. Infraestructura de producción
Applica está **en vivo** en `https://applicaswipe.com`.
- **Hosting:** VPS de Hostinger (compartido con otros proyectos del usuario), acceso vía `ssh vps-sortcash`.
- **Web + HTTPS:** Nginx como reverse proxy delante de Next.js, con SSL real (no self-signed). Headers de seguridad configurados (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy).
- **Proceso:** PM2 gestiona tanto el proceso web (Next.js) como el worker (`ecosystem.config.js`); el worker debe lanzarse vía `scripts/startWorker.ts` (carga `.env.local` antes de importar nada) - lanzarlo directo se rompe (ver `DECISIONS.md`/`STATUS.md`, bug real ya corregido de `DATABASE_URL` indefinido).
- **Deploy:** GitHub Actions con push-to-deploy - un push a `master` dispara el pipeline que actualiza el servidor. No hay deploy manual salvo casos excepcionales.
  - **Releases + symlink atómico (2026-07-21).** Antes, `npm run build` corría EN VIVO dentro del mismo `.next` que el proceso `applica-web` ya en pie estaba sirviendo - cualquier request real que llegara durante esa ventana (30-90s) podía toparse con un build a medio escribir (confirmado en logs reales de producción: `Cannot find module .../setup-node-env.external.js`, `Failed to find Server Action`). Ahora cada deploy clona/instala/compila en un directorio de release nuevo y aislado (`/var/www/applica-releases/<timestamp>-<sha>`, ver el script completo en `.github/workflows/deploy.yml`) y **solo si el build termina bien** repone el symlink `/var/www/applica-current` (lo que `ecosystem.config.js` fija como `cwd` de ambos procesos PM2) para apuntar a esa release nueva, recién ahí reinicia PM2. Un build que falla (`set -e`) deja la release anterior corriendo intacta - nunca hay downtime ni una mezcla de código viejo/nuevo.
  - **`/var/www/applica-shared/` es lo único persistente entre releases**: `.env.local` (secretos - `UPLOAD_DIR` ahí es una ruta ABSOLUTA dentro de este mismo directorio compartido, así que los CVs/avatares subidos por usuarios nunca dependen de qué release esté activa) y `downloads/` (el APK, symlinkeado a `public/downloads` en cada release). `/var/www/applica` (el checkout original) queda como reliquia, sin uso activo tras la migración.
  - Rollback manual: repuntar `/var/www/applica-current` a una release anterior en `/var/www/applica-releases/` (se conservan las últimas 5) y `pm2 restart ecosystem.config.js`.
- **Base de datos:** PostgreSQL propio corriendo en el mismo VPS (no un proveedor externo tipo Neon/Supabase), con backups diarios configurados. Ver nota en §2 sobre cómo `src/db/client.ts` distingue el driver según el host.
- **Descargas / APK de la app móvil:** el APK de Android (compilado localmente con Gradle, sin depender de EAS/Expo cloud) se sube por `scp` directo a `/var/www/applica-shared/downloads/` (symlinkeado como `public/downloads` en la release activa) y se sirve desde `https://applicaswipe.com/downloads/<archivo>.apk` - no se usa ningún servicio externo de distribución (ni EAS, ni un bucket de terceros). `src/proxy.ts` permite acceso público sin auth a `/downloads`.
