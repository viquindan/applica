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
