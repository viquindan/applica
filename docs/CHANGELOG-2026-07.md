# Applica - Estado

> Vivo. Actualizar al cerrar cada bloque de trabajo (1 línea por item). Convertir fechas relativas a absolutas.
> Última actualización: 2026-07-01.

## Hecho
- **Apply asistido (headful local) - para las 4 ATS:** al aplicar, el worker abre un navegador **visible en la máquina del usuario** (`launchHeadfulBrowser`), navega a la oferta, **pre-llena todo el formulario** (`fillOnly` en cada adapter devuelve `assisted_ready`), y **deja la ventana abierta**. `runAssistedApply` (`assistedApply.ts`) vigila hasta detectar confirmación de envío o que el usuario cierre; marca `submitted` si confirma. Cola `assisted_apply` + handler en worker + acción `assisted` en el route. Probado end-to-end en Ashby (ventana abre, llena, espera).
- **UI del flujo asistido:** botón **"Abrir y aplicar"** (ATS), estado de carga amigable ("Abriendo la oferta… aparecerá una ventana con tu formulario ya lleno"), y botones **" Ya envié"** (mientras la ventana está abierta) / **"Ya apliqué"** (en review). SmartRecruiters ya no muestra "fallido" - abre la oferta asistida.
- **Verificación headful end-to-end (harness `assisted`) - las 4 :** Ashby, Greenhouse, SmartRecruiters y **Lever** abren ventana visible y llenan el formulario ("Ventana lista para el usuario"), sin crash. SmartRecruiters ya no muestra "fallido".
- **Fix del crash de Lever/dLocal (hCaptcha):** (1) init-script global que **desactiva la creación de contextos WebGL** (evita el crash del WebGL de hCaptcha; el reto visual sigue resoluble por el usuario). (2) En modo `fillOnly` se saltan los `page.evaluate` pesados post-llenado (ensureRequiredChoices/logUnfilledRequired) que en hosts limitados tumbaban el tab. (3) `--disable-dev-shm-usage` en ambos launchers; headful usa GPU real. (4) `runAssistedApply` recarga si detecta crash.

- **Adapters con assisted-handoff** (llenan formulario real + detectan CAPTCHA `failed_captcha`):
  - **Ashby** - reescrito; llena 100% (system fields, location autocomplete, radios por label con verificación, consent). reCAPTCHA v2 handoff.
  - **Lever** - reescrito; llena 100% (campos `cards[uuid]`, radios/checkbox/select/textarea, fix-up de choices requeridos, consent). CAPTCHA de imagen en submit handoff.
  - **Greenhouse** - fills + detección reCAPTCHA invisible handoff.
  - **SmartRecruiters** - fills + detección CAPTCHA handoff.
- **Mapa de CAPTCHA (probado):** las 4 ATS gatean el envío con verificación humana (Lever muestra grid de imágenes en submit - con captura de evidencia).
- **Worker:** `failed_captcha` app `pending_review` + aviso "lista para tu clic" (no "fallido").
- **UI:** `ApplicationsClient.attentionReason` muestra "Lista - solo falta tu clic" + ir a la oferta cuando hay warning de verificación humana.
- **IA:** key de pago de Gemini en `.env.local` (`GOOGLE_GENERATIVE_AI_API_KEY`), modelo `gemini-2.5-flash` (`GEMINI_MODEL`). Limiter ajustado (reintentos 2, backoff 20s).
- **Elegibilidad:** R1 onsite refinado, hireability geography-agnostic, `formRequiresForeignWorkAuth`, re-evaluación de historial (`reEvaluateVacancies`).
- **Fixtures de prueba:** 8 vacantes `[TEST]` (2/ATS) a score 200, con materiales IA preparados (`scripts/seedTestApps.ts`).
- **Tooling dev:** `scripts/_submit.ts` (harness de envío en primer plano), `scripts/_dom.ts` (volcado de DOM real por ATS).
- `browserManager` headless por defecto + `APPLY_HEADFUL=true` opcional.

## Fixes (2026-07-01, tras prueba del usuario)
- **"Enviando" pegado al reintentar (todos los ATS):** la cola `assisted_apply` tenía un singleton de 20 min que descartaba el reintento en silencio app colgada en `approved`. Quitado el throttle; guard en memoria (`activeAssisted`) contra doble-ventana; el handler ahora SIEMPRE resuelve el estado (nunca queda pegado), con try/catch que resetea a `pending_review` ante cualquier fallo.
- **SmartRecruiters "Access is temporarily restricted":** su oneclick-ui (SAP) **bloquea el navegador Playwright por completo** (fingerprint), sin importar quién haga clic. Fix definitivo: para `smartrecruiters` la acción `assisted` **abre la oferta en el navegador REAL del usuario** (`openInDefaultBrowser`, `Start-Process`) en vez del Playwright huella legítima, sin bloqueo. Sin pre-llenado (SR autocompleta del CV; respuestas en la app). Verificado: abre pestaña real. Patrón reutilizable vía lista `BROWSER_BLOCKED` en el route.

## Modo "navegador real" (2026-07-01) - para auto-envío donde el captcha es invisible
- `browserManager.launchRealBrowserContext()` lanza el **binario real del usuario** (Brave/Chrome vía `detectLocalBrowser`) con **perfil dedicado persistente** (`%TEMP%/applica-apply-profile`), headful, con la bandera de automatización oculta. Un navegador real + GPU real + perfil con historial **puntaje reCAPTCHA v3/v2 alto captchas invisibles suelen pasar sin reto** (NO se resuelve captcha; se presenta un navegador confiable).
- `runRealBrowserApply()` (assistedApply.ts): llena + **intenta enviar de verdad**. Si auto-confirma `submitted` (`auto:true`). Si aparece reto visible deja la ventana abierta y vigila que el usuario lo complete.
- **Worker `assisted_apply`** (Ashby/Greenhouse/Lever) ahora usa `runRealBrowserApply` primero; fallback a `runAssistedApply` (bundled) si no hay navegador local. **SmartRecruiters** sigue por `openInDefaultBrowser` (bloquea Playwright).
- **Pendiente de medir por el usuario:** cuántos pasan solos. Para subir el puntaje, iniciar sesión en Google una vez en el perfil `applica-apply-profile`.

## Banco de respuestas + aprendizaje silencioso (2026-07-01)
- **Sin preguntas upfront.** La info se pide/aprende **just-in-time**, conforme una aplicación la requiere, una sola vez.
- El loop guardarreutilizar YA existía (`captureReusableAnswer` + `getReusableAnswersMap` sobre `memory/reusable_answers.md`); el endpoint `answers/route.ts` ya guardaba al banco al "Completar datos".
- **Nuevo - aprendizaje silencioso en el navegador real:** mientras el usuario llena los campos faltantes en la ventana, `runRealBrowserApply` toma snapshots del formulario (`readFormAnswers`, saltando campos sensibles/EEOC y los estándar ya conocidos). Al enviar/cerrar, el worker guarda las respuestas **nuevas** al banco (`captureReusableAnswer`) y las mergea en la app. la próxima postulación las pre-llena sola. Aplica a Ashby/Greenhouse/Lever (navegador real). SR aplica en navegador propio, no se puede leer, pero el banco alimentado por las otras igual le sirve.

## Aprendizaje verificado + UI (2026-07-01)
- **Loop de aprendizaje verificado autonomamente (ambas mitades):** (1) captura con formato correcto `"Gender"="Male"` (no `"Male"="on"`) - clave=pregunta, valor=opcion, via `WINDOW_CAPTURE` (sessionStorage al submit) y `readFormAnswers` (fallback, inline sin bug `__name`). (2) reuso: con el banco sembrado, el adapter Ashby pre-selecciona los radios (genero/etnia/work-auth). Falta solo el submit humano.
- **Deteccion de envio robusta:** exito por texto/URL de confirmacion o "formulario desaparecio"; distingue bloqueo del sitio (limite de aplicaciones, ej. Mural 2/60dias) y NO lo marca enviado (`site_limit`).
- **UI:** ATS siempre van a "Abrir y aplicar" (nunca formulario in-app); "Faltan datos" oculto para ATS; inspector Ashby agrupa radios (sin basura de opciones). Columna "Modo" eliminada; botones de Acciones en vertical.

## Los 4 ATS con el mismo flujo (2026-07-01)
- **Greenhouse:** ahora llena TODO (nombre/email/telefono/LinkedIn/pais/ciudad/etnia), CV primero, selectores robustos (id/name/autocomplete/aria/label), y **commit React** (input/change/blur) para que los campos no se vean vacios ni se reseteen. Antes solo llenaba CV+LinkedIn.
- **SmartRecruiters:** ya NO se abre en navegador aparte; va por el flujo real-browser, **clickea "I'm interested"** y llena. (En navegador real de Brave evita el bloqueo del oneclick-ui.)
- **Lever/Ashby:** **commit React** en los llenados de texto. Deteccion de envio al **navegar a la confirmacion** (`framenavigated` -> `everSuccess`): si el usuario cierra la ventana justo despues de enviar, se marca enviada (no se relanza).
- **UI:** modal prominente **"La IA de Applica esta trabajando - no toques la ventana"** mientras la app esta en `approved` (autofill activo), con boton "Ya envie". Explica cuando dejar actuar a la IA y cuando intervenir.
- **Fill-all:** demograficos con "Decline to self-identify", texto requerido con valor neutro (nunca vacio).

## Fixes finales de flujo (2026-07-01)
- **SmartRecruiters ya no clickea "Apply with Indeed":** el error venia del selector de submit (`button:has-text("Apply")` matcheaba Indeed). Fix: en navegador real SR va en modo `fillOnly` (solo llena, el usuario envia); el submit propio se busca por rol exacto (Submit/Enviar), nunca terceros; y el boton inicial es solo "I'm interested".
- **Email del perfil:** era `test@example.com` (basura del seed) y el perfil no tenia campo de email. Fix: corregido en DB al correo real + agregado campo Email al perfil (se guarda con validacion) + telefono con selector de indicativo (+507, etc.) para no meter correo por error.
- **App ya no se queda "cargando" para siempre:** el panel de estado `approved` tiene botones "Ya envie" (→ submitted) y "No se envio" (→ pending_review, reintentar). El worker NO sobreescribe lo que el usuario resuelva (guard: si el usuario ya cambio el estado, no lo pisa).
- **Lever no relanza al cerrar:** el error "Target/browser closed" al cerrar ya NO cuenta como fallo del navegador real (que abria una segunda ventana); se trata como cierre normal.
- **Barra dentro de la ventana:** aviso "Applica esta llenando… no toques" → "Listo, resuelve el captcha y envia", inyectado en la pagina real (no en el dashboard).

## Fixes del flujo Playwright-real-browser (2026-07-03, tras prueba del usuario en SR)
- **Aprendizaje silencioso perdía todo al cerrar la ventana (bug real):** `lastSnapshot`/`capturedAnswers` vivía DENTRO del `try` de `runRealBrowserApply`; cerrar la ventana casi siempre lanza "Target/context closed" en Playwright, cayendo al `catch`, cuyo `return` no incluía las respuestas capturadas (se perdían en silencio, por eso "Bloomberg" no se guardó). Fix: `lastSnapshot` izado fuera del `try`, incluido en TODOS los returns (incluidos los del catch).
- **Ventana extra vacía al abrir:** el perfil dedicado (`applica-apply-profile`) quedaba marcado `exit_type: Crashed` tras los `Stop-Process -Force` de zombis; Chromium/Brave abre una segunda ventana ofreciendo restaurar la sesión anterior en el siguiente lanzamiento. Fix en `launchRealBrowserContext`: parchea `Preferences` a `exit_type: Normal` antes de lanzar + flags `--disable-session-crashed-bubble`/`--hide-crash-restore-bubble` + cierra cualquier página extra que aparezca tras el lanzamiento.
- **Banner no aparecía (bug real, no solo CSP):** `addInitScript` corre tan temprano que a veces `document.documentElement` es `null` al primer `appendChild`, lanzando una excepción no capturada que mataba el script completo (el flag de init ya estaba puesto, así que nunca reintentaba). Fix: `whenReady()` sondea hasta que `documentElement` exista antes de tocar el DOM.
- **Banner con estados en tiempo real:** ya no es un simple "llenando/listo" estático. Reevalúa la página cada 1.2s y decide sola: `filling` (punto girando, "no toques nada aún") -> detecta captcha visible ("resuelve el captcha y envía") o campos requeridos vacíos ("completa N campos y envía") -> `ready` ("revisa y envía, puedes cerrar"). Migrado a clases CSS (no estilos inline) para resistir CSP estricto (style-src-attr) que antes podía dejarlo sin estilo.
- Verificado en vivo: 1 sola ventana tras el lanzamiento (antes 2), banner sin error de consola con las 3 fases correctas (`filling` -> `ready`/`action` según captcha/campos).
- **ATS multi-página (SmartRecruiters divide la postulación en varias pantallas):** el adapter solo llenaba UNA VEZ al inicio; al darle "Siguiente" aparecían preguntas nuevas que nadie llenaba (bot "desactivado"). Fix: `fillEverythingKnown` (universalFill) ahora se re-ejecuta en CADA tick del loop de vigilancia (~2s) en `runRealBrowserApply`/`runAssistedApply`. Como solo toca campos vacíos reconocidos, es idempotente y seguro de repetir; produce el ciclo bot llena -> humano resuelve captcha/dato faltante -> Siguiente -> bot llena la página nueva -> repite, hasta el envío final. Verificado: simula "página 2" apareciendo (campos nuevos) y confirma que se llenan solos sin tocar lo ya puesto.

## Shadow DOM en todo el pipeline + banner con textos rotativos (2026-07-03)
- **Causa raíz de "no llena la página 2 de SR" y "no aprendió Bloomberg" (la misma):** SmartRecruiters renderiza TODO campo dentro de shadow DOM (`spl-*`); `document.querySelectorAll` plano veía 1 elemento donde hay 15. Ni el llenador ni la captura de aprendizaje veían nada.
- Fix en 4 sitios: `universalFill.ts` (enumeración deep + etiqueta que trepa límites de shadow; verificado: llena 7 campos en SR real), `readFormAnswers` (assistedApply.ts), `WINDOW_CAPTURE` y `countMissing`/`hasCaptcha` del banner (browserManager.ts). Verificado: `WINDOW_CAPTURE` captura `{"Institution":"Bloomberg"}` desde un campo en shadow root.
- Con esto el re-fill multi-página ya actúa en las páginas 2/3 de SR (antes barría 0 campos ahí) y el aprendizaje captura lo que el usuario escribe en esos campos.
- **Banner con textos rotativos** en fase "llenando" (ambos flujos: banner Playwright y extensión): "Leyendo la vacante...", "Eligiendo la mejor respuesta para cada pregunta...", "Mejorando tu perfil para este puesto...", etc., rotando cada ~2.5s.

## Regresión del freeze: offsetParent en overlays fixed (2026-07-04)
- El fix de visibilidad usaba `offsetParent === null` como test de "oculto", pero los overlays de reto son `position: fixed` y un elemento fixed reporta offsetParent null AUN VISIBLE: el detector quedó ciego y el bot volvió a actuar con el reto abierto. Fix: solo display/visibility/opacity + rect > 60px (display:none ya da rect 0x0). Verificado con iframe fixed real: abierto -> "Tu turno" congelado; oculto -> "Listo" liberado.

## Pausa que no se liberaba tras resolver el captcha (2026-07-04)
- Resolver un hCaptcha solo OCULTA su iframe (sigue en el DOM/frames para siempre): la detección por existencia dejaba "Tu turno..." y la pausa pegadas tras resolver. Fix: detección por VISIBILIDAD real (offsetParent + visibility/opacity + tamaño, shadow-aware) en worker y banner. Verificado: reto visible -> "Tu turno"; reto oculto -> "Listo" y pausa liberada.
- `--test-type` (para suprimir la barra "flag no admitido" de Brave) ROMPE el lanzamiento de Brave (sale de inmediato; probado A/B con ambas variantes). No usarlo: la barra es cosmética y cerrable; el flag que la causa (AutomationControlled de Playwright) debe quedarse o se expone navigator.webdriver.

## Banner solo en frame principal + flag duplicado (2026-07-04)
- El banner también se renderizaba DENTRO del iframe del reto de hCaptcha (addInitScript corre en todos los frames), atascado en "llenando" y tapando la pregunta del captcha. Fix: guard `window.top !== window.self` al inicio del banner. Verificado: banner en top=true, dentro de iframe=false.
- Quitado `--disable-blink-features=AutomationControlled` de nuestros args (Playwright ya lo pasa; duplicado hacía que Brave mostrara la barra "flag no admitido").

## Captcha primero en el banner + candado del auto-avance (2026-07-04)
- Verificado contra el hCaptcha REAL de dLocal (harness): la detección por frames SÍ funciona (`frame=challenge` presente). Los fallos reales eran otros dos: (1) el banner evaluaba el captcha DESPUÉS de la fase "llenando", así que mostraba "no toques nada" con el reto abierto (el reto lo dispara el clic de Enviar del adapter, aún en filling). Ahora el captcha se evalúa PRIMERO en cualquier fase: "Tu turno. Por favor resuelve el captcha para continuar." (2) el auto-avance re-clickeaba Enviar tras resolverse el reto, disparando un reto nuevo en bucle. Ahora `challengeSeen` deshabilita el auto-avance el resto de la corrida en cuanto aparece el primer captcha (el re-fill sigue).
- Verificado: banner en fase filling + texto de reto de patrón -> "Tu turno..." correcto.

## Auto-avance: Siguiente/Enviar automáticos cuando todo está completo (2026-07-04)
- Pedido del usuario: si no hay captcha y el sistema conoce TODAS las respuestas requeridas, debe avanzar de página y enviar solo. Implementado en ambos loops de vigilancia: `missingRequiredCount` (incluye shadow DOM, files y checkboxes requeridos; ante duda = incompleto) + `clickAdvance` (botones propios del ATS por rol exacto, Submit gated por ENABLE_REAL_SUBMISSIONS, cooldown 8s, tope 6 intentos, exige isVisible+clic exitoso).
- Bug encontrado y arreglado en el camino: los sellos `data-applica-f` de páginas anteriores OCULTAS (no removidas) colisionaban con la página nueva -> strict mode violation silenciosa que mataba el fill en la página 2+. Ahora se limpian al inicio de cada pasada.
- Verificado E2E (sintético multi-página): fill p1 -> Next automático -> fill p2 -> Submit automático -> confirmación detectada.

## Freeze v2: el reto de patrón de hCaptcha no se detectaba (2026-07-04)
- El freeze v1 no reconocía el reto NUEVO de hCaptcha ("completar el patrón" arrastrando): ni el texto ("desliza/slide" no aparece) ni el iframe matcheaban, así que el bot seguía actuando durante el reto; además un clic espurio de typeahead aterrizó en el enlace de política de cookies y navegó fuera.
- Fix: (1) detección por `page.frames()` (URL `frame=challenge`/`bframe`/arkose/turnstile: inmune al markup; el checkbox pasivo no congela), (2) textos del reto de patrón agregados en las 3 capas (worker, banner, extensión), (3) los pickers de opciones NUNCA clickean `a[href]` ni descendientes. Verificado: texto "completar el patrón" -> congelado.

## Freeze del bot durante captcha (2026-07-04, tras prueba del usuario en Lever)
- **El loop de re-fill seguía tecleando/clickeando mientras el usuario resolvía el hCaptcha de Lever** (roba el foco del reto y es patrón clásico de bot para el anti-bot). Fix: `captchaVisible(page)` antes de cada tick en ambos loops (`runRealBrowserApply`/`runAssistedApply`); con reto visible el bot solo observa, al desaparecer retoma. Verificado: detecta iframe hCaptcha visible -> congela; sin iframe -> retoma. Regla documentada en APPLY-ENGINE.md.

## Primer envío real exitoso en SR + fixes post-envío (2026-07-04)
- **Aplicación de SR (Experian) enviada con éxito por el usuario**; el worker detectó el envío, marcó `submitted` y guardó 5 respuestas nuevas al banco (género, proficiencia inglés/español, etc.). El autofill multi-página actuó en vivo en la página 2 ("[auto] Auto-filled" en el log).
- **UI pegada en "Applica está aplicando por ti":** el poll de refresco moría a los 45s; un apply asistido tarda minutos. Quitado el tope (poll cada 4s mientras haya apps en `approved`; se apaga solo al resolverse).
- **Banco "perdía" respuestas (Bloomberg etc.):** carrera en `ensureUserMemory` (check-then-insert sin unicidad) duplicaba los documentos de memoria; las lecturas tomaban el duplicado casi vacío. Reparado: merge de 10 grupos duplicados (banco completo restaurado: 18 respuestas), índice único `(user_id, path)` en `memory_documents`, y `onConflictDoNothing` en el insert.
- **`docs/APPLY-ENGINE.md` creado:** arquitectura completa del motor de aplicación, qué se intentó y falló y por qué, reglas ganadas. Referenciado como regla dura en `CLAUDE.md` (lectura obligatoria antes de tocar el motor).

## Página 2 de SR resuelta de verdad (2026-07-04, reproducida end-to-end)
- Reproducido el flujo completo: página 1 -> cerrar/llenar tarjetas de Education (el barrido llena "Institution"="Bloomberg" desde el banco: el aprendizaje del usuario SÍ quedó guardado) -> Next -> "Preliminary questions".
- **Causa de "no llena la página 2": las preguntas ahí NO tienen `<label>` asociado** (el label real contiene solo "*"); la pregunta es texto suelto en un hermano anterior del componente. La detección de etiqueta devolvía ""/"*" y nada casaba. Fix: estrategia adicional que camina hermanos previos/ancestros buscando la línea de texto significativa más cercana. Aplicado en universalFill, WINDOW_CAPTURE (aprendizaje) y extensión.
- **Bug de matching de opciones:** escribir "Male" seleccionaba "Female | Feminino" (substring). Fix: match exacto y luego por word-boundary, nunca substring (universalFill + extensión).
- Verificado por captura en la página 2 real: "Como você encontrou essa vaga?" = LinkedIn, Gender = "Male | Masculino". Salario/proficiencias quedan para el usuario la primera vez y ahora se aprenden con la pregunta correcta.

## Verificación cruzada de los 4 ATS tras los cambios (2026-07-04)
- **Ashby:** completo (CV, contacto, ubicación, LinkedIn, salario, work-auth, demográficas, consent; 10 custom). Sin regresiones.
- **Greenhouse:** REGRESIÓN encontrada y arreglada: el soporte nuevo de typeaheads del barrido re-escribía los react-select que el adapter ya había seleccionado (react-select deja el input visible VACÍO tras seleccionar), borrando Location/Hispanic/Veteran. Fix: `fillTypeahead` del adapter marca `data-applica-filled` ANTES de operar, y el barrido los respeta. Además: campos URL nunca aceptan prosa del banco (se extrae el primer token con forma de URL, si no hay se usa el portfolio del perfil, si no se salta). Verificado por captura: todo lleno, Website = URL limpia, sin errores rojos.
- **Lever:** completo (CV, contacto, salario, 9 custom, 4 consents) salvo "Current location": el geocoder de Lever devuelve "No location found" para TODO término en el entorno de prueba (probado con 3 variantes; el servicio no responde aquí). Mitigado: fallback por teclado + no-blur para conservar el texto. En el navegador real del usuario el geocoder debería responder; si no, queda como "dato faltante" visible (1 campo).
- **SmartRecruiters:** verificado en sesiones anteriores de hoy (shadow DOM completo + página 2).

## Página 2 de SR: typeaheads + matching por concepto (2026-07-04)
- **"Applica deja de actuar en la página 2":** dos causas. (1) El matching del banco exigía que una frase contuviera a la otra; "Desired Salary / Expectativa Salarial" nunca casaba con "What are your desired salary expectation..." del banco. Fix: reglas por concepto (salario, cómo-encontraste-la-vacante con default "LinkedIn") + fallback por solape de >=2 palabras clave. (2) universalFill SALTABA los typeaheads (lupa); ahora los llena con teclas reales + clic en la sugerencia (fila hoja). Aplicado en universalFill (worker) y content.js (extensión). Verificado con réplica de la página 2: salario del banco + "LinkedIn" llenados solos.

## Fill una-sola-vez + website saneado + banner cortés (2026-07-04)
- **El re-fill peleaba con el usuario:** si el usuario borraba un valor nuestro (ej. Website con coma que SR rechaza), el barrido de ~2s lo veía vacío y lo rellenaba con el mismo valor malo, bloqueando el avance. Fix: cada campo se llena UNA vez (`data-applica-filled`); tras eso es del usuario. Aplicado en `universalFill.ts` y en la extensión. Verificado: pasada 1 llena, usuario borra, pasada 2 no lo toca.
- **Website/portfolio saneado a una sola URL** (sin comas/espacios) también en el backend (`resolveKnown`), no solo en la extensión.
- **Banner:** agregado "Por favor, no toques nada mientras trabajamos." en fase de llenado (ambos flujos).

## Llenador universal + fixes SR (2026-07-03)
- **Llenador universal** (`src/core/platforms/universalFill.ts`): barre CADA campo visible del form, lee su etiqueta (label/aria/placeholder/grupo) y lo llena si lo reconoce del perfil (nombre, email, confirm-email, teléfono, LinkedIn, país, ciudad, portfolio) o del banco de respuestas. Solo llena campos vacíos (no pisa autofill del CV) e ignora react-select/typeaheads/readonly (esos los maneja la lógica específica del adapter). Conectado como barrido final en los 4 adapters. Verificado en Ashby/Greenhouse/Lever vía `_submit fillonly` (sin crash, todos `assisted_ready`).
- **`profileData` del worker asistido** ahora incluye `country`, `city`, `portfolio` (antes solo nombre/email/phone/linkedin), para que el llenador tenga con qué llenar país/ciudad.
- **SmartRecruiters:** (1) espera el formulario tras "I'm interested" sondeando hasta ~2.5 min (aguanta el anti-bot slider; llena DESPUÉS de que el usuario lo resuelve, no antes). (2) llena todos los emails (Email + Confirmar), país (select o typeahead), LinkedIn, y CV con verificación de adjunto. (3) barrido universal para el resto.
- **`--no-sandbox`:** quitado en `launchRealBrowserContext` (`chromiumSandbox: true` + `ignoreDefaultArgs` incluye `--no-sandbox`); ya no sale el aviso de Brave.

## Arquitectura híbrida + extensión Applica (2026-07-03)
- **Decisión (tras investigación):** el apply asistido en la máquina del usuario se hace mejor con una **extensión de navegador** (como Simplify/OwlApply), no con Playwright manejando el Brave real. Playwright-real-browser es frágil: conflicto de perfil ("sesión existente"), procesos Brave zombis que bloquean el perfil, y anti-bot de SR. La extensión corre en la sesión real del usuario: cero anti-bot, cero zombis, cero conflicto. Ver `DECISIONS.md`.
- **Híbrido:** Playwright headless en backend queda para ATS **sin** verificación (auto-envío real sin usuario); la **extensión** cubre los ATS con verificación (los 4 objetivo). La extensión es el salto de 99% a 100%, ofrecida como último recurso.
- **Extensión** (`extension/`, Manifest V3): `content.js` recorre CADA campo (incluye **shadow DOM** via `labelFor` que trepa por los límites del shadow), llena del perfil+banco, maneja typeaheads (best-effort) y grupos radio/checkbox. Botón flotante "Llenar con Applica". `background.js` (service worker) trae los materiales del backend con el token. `popup` para pegar el token. **Verificado en SmartRecruiters (el ATS más difícil, todo shadow DOM): llena 8 campos auto** (nombre, apellido, email, confirm-email, teléfono, LinkedIn, website; city pre-escrito con dropdown abierto para 1 clic).
- **CV automático (sin arrastrar):** las extensiones no pueden setear `input.value` de un file input, PERO sí `input.files` via `DataTransfer` con un `File`. El background trae el CV en base64 (evita mixed-content HTTPS->localhost y CORS), el content script lo decodifica y lo dropea en el file input con eventos `composed`. **Verificado en Greenhouse: "cv.pdf" queda adjunto solo.** Se adjunta ANTES de llenar (crítico + algunos ATS autocompletan del CV).
- **Token one-click (auto-conexión):** `connector.js` corre en el dominio de Applica (mismo origen -> la cookie viaja), pide `/api/extension/token` y guarda el token solo. El usuario no pega nada: instala la extensión, abre Applica, y se conecta ("Extension Applica conectada").
- **Backend extensión:** `/api/extension/materials` (perfil+respuestas+banco por URL), `/resume` (CV en bytes; `resolveUploadPath` inline para NO arrastrar la cadena playwright-extra/stealth que revienta en una API route), `/token` (token HMAC por usuario, sin migración). `src/lib/extensionToken.ts`.
- **UI:** `ExtensionOffer` en el panel asistido ("¿Cansado de abrir ventanas? Pasa de 99% a 100%") con pasos de instalación.
- **Resiliencia del worker:** `startWorker.ts` ahora captura `unhandledRejection`/`uncaughtException` y **sigue vivo** (antes un error en un apply tumbaba el worker en silencio y los clics quedaban sin procesar). Rescate de huérfanos: al arrancar, los apps en `approved` (sin watcher) pasan a `pending_review`.
- **Límite honesto de la extensión:** el CV sí se adjunta solo (Greenhouse/Lever/Ashby, file input estándar). El typeahead de city de SR (`spl-select-option` en shadow DOM) ignora clics sintéticos no-trusted: se deja pre-escrito con el dropdown para 1 clic del usuario (caso "datos faltantes", permitido). Captcha = del usuario, por diseño.

## En curso / verificar
- **Prueba real en la app (usuario):** dar "Abrir y aplicar" en un [TEST3], llenar lo que falte, resolver captcha y enviar. Unico paso que requiere intervencion humana (el captcha es humano por diseno).

## Pendiente
- **Fixtures `[TEST]`:** se mantienen. Las pruebas las corre el usuario; NO borrarlas salvo que él lo pida explícitamente.
- Pulir el flujo "ir a la oferta con CV/respuestas listas" (descarga/copia rápida).
- **App móvil (Option B):** LinkedIn auto-apply vía webview (backend listo, falta wiring de cookies).
- Proxies residenciales distribuidos para escalar el clúster (idea futura).

---

# 2026-07-06 - Greenhouse E2E estable + reglas ganadas

Sesión de depuración con pruebas reales del usuario (Brave, locale es). Causas raíz halladas y reglas nuevas (detalle en APPLY-ENGINE.md):
- Greenhouse no navegaba desde about:blank (contrato: el adapter navega) y los ids numéricos rompían selectores `#id`.
- El banner rompía la hidratación de React (#418/#423) y el re-render borraba lo llenado; ahora espera readyState complete +1s y re-inyecta su <style> por tick.
- `pickComboOption`: lista-primero (sin teclear en enums), commit verificado en single/multi-value, opciones scoped al listbox propio, guard de país con ancla del perfil y puente de exónimo ("X City" -> "Ciudad de X"), tecleo hasta la primera coma. El geocoder localiza nombres por idioma del navegador (en es, "Panama City" solo devuelve Florida).
- Matching del banco: frase/palabra completa (no substring), caption debe EMPEZAR con la pregunta, claves >40 chars no son alias de campo, valores UUID/prosa filtrados.
- Cuelgues de minutos: sellos data-applica-f borrados por re-renders dejaban locators muertos esperando 30s por acción; count()-guard + timeouts cortos.
- OTP por correo de Greenhouse = reto humano (3 capas); nunca concluir "enviado" con un reto visible.
- Brave: addInitScript no se adhiere a la página inicial del contexto persistente (banner y aprendizaje nunca corrían en el flujo real); newPage() tras registrar.
- CV en job-boards: solo el file chooser nativo registra el archivo; verificación por nombre visible en página.
- Regla de producto D10: demográficas voluntarias -> decline por default.
- Infra: urlLiveness pre-check (vacantes muertas), fallback a bundled solo si el navegador real no lanza, diagnóstico "Banner en la ventana" en el log.
