# Applica - Estado

> Vivo y BREVE (se auto-carga en cada sesión: cada línea aquí cuesta tokens siempre).
> Historial detallado de iteraciones: `docs/CHANGELOG-2026-07.md` (no auto-cargado).
> El motor de aplicación a fondo: `docs/APPLY-ENGINE.md` (lectura obligatoria antes de tocarlo).
> Última actualización: 2026-07-09.

## Hecho (estado actual, estable)
- **Los 4 ATS (Ashby, Greenhouse, Lever, SmartRecruiters) con el mismo flujo asistido**, verificado por el usuario en su Brave real: CV adjunto con verificación en página, llenado completo (shadow DOM incluido), multi-página (SR), banner de estado, aprendizaje silencioso.
- **Greenhouse E2E confirmado por el usuario (2026-07-06)**: llenado ~25s, comboboxes comprometiendo la opción real, location correcta en navegador en español (guard de país + ancla del perfil + puente de exónimo), demográficas voluntarias en "prefiero no responder", OTP por correo tratado como reto (bot congelado, ventana abierta), banner visible. Las ~10 causas raíz y sus reglas quedaron en `APPLY-ENGINE.md` (§3 reglas 3b/3c/6/9/10, §4 banner/OTP/página-inicial, §8 Greenhouse).
- **Regla de producto: demográficas voluntarias -> decline por default en todos los ATS + extensión** (ver `DECISIONS.md`); el banco explícito gana y el aprendizaje captura cambios manuales (ahora también lee selecciones de combobox).
- **Auto-avance**: sin captcha y con todo lo requerido respondido, el bot clickea Siguiente/Enviar solo. Con captcha/OTP: freeze total + banner "Tu turno"; tras el primer reto el auto-avance queda deshabilitado.
- **Ciclo captcha en Lever verificado por el usuario** (freeze -> "Tu turno" -> resolver -> Enviar manual), 2026-07-05.
- **Detección de vacante vencida** (`urlLiveness.ts` + pre-check en `assisted_apply`): vacante cerrada -> no abre ventana, app `skipped`, vacante `archived`, badge "Vacante cerrada". Verificado contra la URL muerta real de 6sense.
- **Primer envío real exitoso**: SR/Experian; worker detectó, marcó `submitted`, guardó respuestas al banco.
- **Extensión de navegador** (`extension/`, MV3): llena en la sesión real, CV vía DataTransfer, token auto-conectado; con paridad de decline/matching (recargarla tras cambios).
- **Banco de respuestas**: índice único `(user_id, path)` en `memory_documents`.
- **Worker**: resiliente, rescata huérfanos `approved` al arrancar, cola sin throttle. Fallback a Chromium bundled SOLO si el navegador real no lanza. Sin hot-reload: reiniciar tras tocar adapters/core.
- **IA**: Gemini de pago (`gemini-2.5-flash`), limiter ajustado.
- Fixtures `[TEST]` (2/ATS, score 200) + harness `scripts/_submit.ts`, `_dom.ts`, `_liveness.ts`, `_banner.ts`.
- **Branch `v3-web-app`: rediseño "Applica Executive" completo** (base Stitch en `applica movil/` y `applica web/`), las 4 pantallas del mockup + auth + landing verificadas. `master` queda intacto como V1.
  - Tema global: paleta forest #123338 + dorado #fed65b sobre superficies blancas/crema (no fondo oscuro salvo acentos puntuales: landing hero, avatar, botones primarios), sombras ambientales "quiet luxury", botones pill, tipografía editorial moderada (se redujo tras feedback de "texto muy grande / muy oscuro").
  - **Navegación en 4 pantallas reales**: `/applications` = Feed (`SwipeDeck.tsx`, una vacante a la vez con gesto de swipe real - drag/rotate + sellos NOPE/APLICAR igual al prototipo Stitch -, botón discreto de "buscar ahora"); `/applications/pending` = Pendientes (captcha/confirmación de apps `approved` + `pending_review` con datos faltantes); `/applications/apps` = historial + "Motor de búsqueda" (cifras del funnel, frecuencia, automatización) colapsado por defecto; `/profile` = Executive Profile (avatar, portafolio de CV, preferencias con slider de salario). Sidebar y `BottomNavigation.tsx` (pill flotante en móvil) muestran las mismas 4 secciones. `/review` y `/dashboard` redirigen a las rutas nuevas.
  - Lógica compartida en `applications/data.ts` (query server-side única) + `useApplicationActions.ts`/`useSearchEngine.ts` (hooks cliente) para que la máquina de estados del apply engine (docs/APPLY-ENGINE.md §9) viva una sola vez y no diverja entre pantallas. `ApplicationsClient.tsx` (monolito V1) fue eliminado.
  - Auth (`/auth/login`, `/auth/register`) y landing pública heredan el tema automáticamente (clases `.auth-*`/`.card`/`.btn` compartidas) sin haberlas tocado directamente - verificado visualmente, sin inconsistencias.
  - Responsive mobile-first casi idéntico al diseño móvil de Stitch: bottom nav pill flotante, mazo de tarjetas apiladas en el Feed, botones circulares SVG, para ensayar cómo se vería la futura app (probablemente React Native).
  - Verificado con `tsc --noEmit` limpio en cada paso y capturas Playwright (desktop/mobile) de las 6 pantallas (landing, login, register, Feed, Pendientes, Apps, Perfil) vía rutas `dev-preview` temporales con datos mock, siempre borradas tras verificar (no se tocó la DB real). Cuenta demo del login (`test@example.com`) no existe en esta DB - no es una vía de verificación viable.

- **GenericAdapter (`src/core/platforms/genericAdapter.ts`)**: sitios sin adapter dedicado (empresa propia, LinkedIn->externo) ahora pasan por el MISMO flujo asistido real que los ATS conocidos, en vez de solo "leer preguntas y que el usuario retipeara en el sitio real". Detalle completo y por qué es seguro (no toca `process_application`, no toca ningún adapter existente) en `APPLY-ENGINE.md` §8.1. Verificado con Playwright: Greenhouse sigue disparando exactamente `{action:'assisted'}` (sin regresión) y una plataforma desconocida ahora también, en vez de caer en el mensaje muerto anterior.

## En curso / verificar
- Aprendizaje de respuestas de combobox (deal size, hunting vs expansion...): fix verificado en sintético; confirmar que la próxima postulación real las pre-llene.
- GenericAdapter recién construido - sin verificar aún contra un sitio real (solo regresión sintética de que no rompe los ATS). Probar en un sitio no-ATS real antes de confiar en su fiabilidad.

## Pendiente
- Fixtures `[TEST]` se mantienen; las pruebas las corre el usuario (NO borrarlas salvo pedido explícito).
- Paridad del guard de país de location en extensión y barrido universal (hoy solo el adapter de Greenhouse la tiene).
- "Current location" de Lever: el geocoder no responde en el entorno de prueba; verificar en el navegador real del usuario.
- **App móvil (nueva, no existe todavía)**: el usuario pidió construirla (React Native u otra, a decidir) con LinkedIn auto-apply vía webview - requiere una conversación de planeación de alcance/stack aparte (dado el tamaño, candidata a `/EnterPlanMode`) antes de empezar. No confundir con el LinkedIn Easy Apply del web, que YA está completo (`linkedinApplyEngine.ts`/`linkedinSession.ts`/`linkedinLoginCapture.ts`, sin stubs).
- Abrir el navegador POR DEFECTO real del usuario (leer registro `UrlAssociations\https`) y detectar instalaciones per-user de Chrome/Brave (`%LOCALAPPDATA%`); hoy el orden es fijo Brave>Chrome>Edge y solo rutas de sistema. Safari/macOS no soportado (rutas Windows-only).
- El worker relanzado por Claude murió en silencio una vez; si reaparece, que el usuario lo lance con su comando de siempre.
- Proxies residenciales para escalar (idea futura).
