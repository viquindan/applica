# Applica - Estado

> Vivo y BREVE (se auto-carga en cada sesión: cada línea aquí cuesta tokens siempre).
> Historial detallado de iteraciones: `docs/CHANGELOG-2026-07.md` (no auto-cargado).
> El motor de aplicación a fondo: `docs/APPLY-ENGINE.md` (lectura obligatoria antes de tocarlo).
> Última actualización: 2026-07-06.

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

## En curso / verificar
- Aprendizaje de respuestas de combobox (deal size, hunting vs expansion...): fix verificado en sintético; confirmar que la próxima postulación real las pre-llene.

## Pendiente
- Fixtures `[TEST]` se mantienen; las pruebas las corre el usuario (NO borrarlas salvo pedido explícito).
- Paridad del guard de país de location en extensión y barrido universal (hoy solo el adapter de Greenhouse la tiene).
- "Current location" de Lever: el geocoder no responde en el entorno de prueba; verificar en el navegador real del usuario.
- App móvil (Option B): LinkedIn auto-apply vía webview (backend listo, falta wiring de cookies).
- Abrir el navegador POR DEFECTO real del usuario (leer registro `UrlAssociations\https`) y detectar instalaciones per-user de Chrome/Brave (`%LOCALAPPDATA%`); hoy el orden es fijo Brave>Chrome>Edge y solo rutas de sistema. Safari/macOS no soportado (rutas Windows-only).
- El worker relanzado por Claude murió en silencio una vez; si reaparece, que el usuario lo lance con su comando de siempre.
- Proxies residenciales para escalar (idea futura).
