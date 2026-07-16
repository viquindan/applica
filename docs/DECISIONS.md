# Applica - Decisiones (ADRs)

> Append-only. Una entrada por decisión importante/irreversible, con su porqué. Leer al cuestionar una decisión existente.

## D1 - Billing con LemonSqueezy, no Stripe
LemonSqueezy actúa como merchant-of-record (maneja impuestos/VAT globales). No introducir Stripe.

## D2 - Flujo de envío: auto-fill + assisted handoff
Los adapters llenan el formulario real campo por campo. El envío se confirma automáticamente cuando el ATS lo permite; si el ATS exige un paso de verificación al enviar, el adapter devuelve `failed_captcha` y el flujo deja el formulario completo para que el usuario complete el paso final desde la oferta (su sesión, su autofill). En la práctica las 4 ATS objetivo requieren ese paso, por lo que el handoff es el camino principal de envío hoy.

## D3 - Proveedor IA: Gemini (key de pago), modelo por env
`GOOGLE_GENERATIVE_AI_API_KEY` en `.env.local`; modelo en `GEMINI_MODEL` (default `gemini-2.5-flash`). El selector de modelo de Google AI Studio NO afecta producción - el modelo se manda en cada request desde el código. Flash es ideal (barato, suficiente para tailoring); Pro solo si se requiere máxima calidad de redacción. El tier gratis topa cuota diaria usar billing habilitado.

## D4 - Concurrencia del worker = 5
5 contextos concurrentes: 300-500% más rápido que secuencial, RAM segura, y por debajo del radar de tracking por volumen (WAF/Cloudflare). No subir sin proxies residenciales.

## D5 - Worker corre local
`npx tsx scripts/startWorker.ts` (lanzar desacoplado vía `cmd /c ... > worker.log 2>&1` para sobrevivir teardowns). No depende del dev server.

## D6 - Envíos reales activados
`ENABLE_REAL_SUBMISSIONS=true`. El motor aplica de verdad; el peor caso aceptado es que no llamen. El gate de captcha igual fuerza handoff.

## D7 - Canvas para la animación, no SVG/DOM
`CanvasParticleSwarm` (60 FPS) evita bloquear el hilo de React con updates DOM pesados. No reemplazar por SVG.

## D8 - Elegibilidad geography-agnostic
Las señales de "hireability" no asumen país; los hard-excludes (onsite extranjero, idioma, work-auth) sí. `formRequiresForeignWorkAuth` capa el score cuando el formulario exige autorización que el usuario no tiene.

## D9 - Apply asistido vía extensión de navegador (no Playwright-real-browser)
Para ATS con verificación (los 4 objetivo), el llenado en la máquina del usuario se hace con una extensión Manifest V3 (`extension/`), no con Playwright manejando el Brave real. Por qué: Playwright-real-browser choca con límites de Chromium (no dos instancias por perfil -> "sesión existente", procesos zombis que bloquean el perfil) y con el anti-bot de SmartRecruiters; es intrínsecamente <99% confiable. Una extensión corre en la sesión real del usuario (cero automatización detectable, cero conflicto de perfil), que es como lo hacen Simplify/OwlApply/JobWizard. Híbrido: Playwright headless se queda para auto-envío en ATS sin verificación. El captcha y los datos faltantes (incl. CV, que MV3 no puede adjuntar a `input[type=file]`) son los únicos pasos humanos, por diseño.

## D10 - Demográficas voluntarias: "prefiero no responder" por default (2026-07-06)
U.S. Standard Demographic Questions y self-identification (EEOC) son siempre opcionales. Sin respuesta EXPLÍCITA en el banco, Applica elige la opción "decline to answer" del propio formulario (nunca AFIRMA hechos como default: el viejo default de veteran afirmaba "I am not a protected veteran"). El banco explícito siempre gana, y si el usuario cambia la opción a mano, el aprendizaje guarda SU elección. Por qué: acelera el llenado (cero adivinanzas/reintentos), es honesto, y da mejor UX. Implementado en universalFill (todos los ATS), adapter de Greenhouse y extensión.

## D11 - Driver de DB auto-detectado por host, no fijo a Neon (2026-07-09)
`src/db/client.ts` elige `@neondatabase/serverless`/`neon-http` si `DATABASE_URL` tiene `neon.tech` en el host, si no usa `pg`/`node-postgres` (TCP normal). Por qué: el driver HTTP-only de Neon literalmente no puede hablar con un Postgres normal (reescribe el host a `api.<host>/sql`), así que sin esto la app queda atada a Neon para siempre. Con esto, cambiar de proveedor (local, VPS, otro host) es solo cambiar `DATABASE_URL` - cero cambios de código.

## D12 - No depender de Neon free tier para dev/producción (2026-07-09)
Neon agotó su cuota gratuita de egress mensual solo con tráfico de desarrollo, bloqueando la app por completo hasta el reset o un upgrade de plan. Opciones evaluadas:
- **Nuevo proyecto Neon (misma cuenta o cuenta nueva)**: cero fricción, pero vuelve a topar el mismo límite con el mismo patrón de uso - no resuelve la causa, solo pospone.
- **Otro proveedor gratuito** (Supabase, Railway, Render, CockroachDB Serverless): todos compatibles con el driver `pg` ya soportado (D11), pero cada uno tiene su propio límite/expiración en el tier gratis (ej. Render borra la DB free a los 90 días) - mismo problema, proveedor distinto.
- **Postgres local en la máquina de desarrollo** (ADOPTADO para dev, ver `STATUS.md`): cero límites, cero cuenta externa, ya funcionando.
- **Postgres nativo en el VPS de Hostinger** (RECOMENDADO para producción, una vez exista el VPS - ver `docs/DEPLOYMENT.md`): ya se paga el VPS para correr el web app, así que host de Postgres ahí es costo marginal cero, sin límites de egress ni cuentas externas adicionales, un solo lugar que mantener/respaldar.
Decisión: no relanzar en Neon. Dev sigue en Postgres local; producción (cuando exista el VPS) usa Postgres nativo ahí. Neon queda solo como opción de respaldo si algún día se necesita escalar horizontalmente sin gestionar la DB a mano.

## D13 - El swipe es la única autorización de envío; se eliminó el modo "Totalmente Autónomo" (2026-07-13)
Antes existía `globalAutomationMode === 'full'`: si el motor de reglas no encontraba ningún bloqueo, la aplicación saltaba directo a `approved`/auto-envío sin pasar por `pending_review` (sin que el usuario la viera en el Feed). Se eliminó por decisión explícita del usuario: **ninguna vacante puede enviarse sin que el usuario primero le dé swipe** (positivo o negativo) en el Feed. Motivo de producto (no técnico): el swipe es el mínimo de responsabilidad/control que el usuario debe tener sobre a dónde se postula - la analogía usada fue Tinder, donde a nadie le llega "tienes una cita" sin haber dado swipe, porque eso rompe el sentido de agencia y el uso real de la app. Tras el swipe positivo, el motor sigue intentando minimizar la interacción al máximo (auto-envío para ATS sin verificación, assisted handoff solo para las 4 ATS que exigen captcha/OTP en el envío - ver D2/D9) - eso no cambió, ya era el camino más automatizado posible dado que Applica nunca resuelve captchas por diseño.
Implementación: `submissionDecision.ts` ya no tiene una rama `auto_submit` - el resultado final del motor de reglas es siempre `queue_for_review` (o `skip`/`pause`), nunca un envío directo. `worker.ts` simplificado a juego: `skip` -> `filtered`/`skipped`, cualquier otra cosa -> `pending_review`. El enum `automation_mode` conserva el valor `'full'` en la DB (filas viejas) pero ya no se escribe nunca y se trata igual que `'semi'`. UI: el selector "Nivel de Automatización" (Totalmente Autónomo vs Revisión Manual) se quitó de Settings y de Apps/Motor de búsqueda - ya no hay nada que elegir ahí, el envío siempre depende del swipe.
