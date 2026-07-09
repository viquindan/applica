# Motor de aplicación de Applica (apply engine)

> **LEER ANTES de tocar cualquier código de llenado/envío de formularios.**
> Este documento existe porque llegar al estado actual costó MUCHAS iteraciones
> (2026-06/07). Registra qué se intentó y falló (y POR QUÉ falló), y qué funciona
> hoy (y POR QUÉ). Si un cambio contradice una regla de aquí, lo más probable es
> que reintroduzca un bug ya resuelto. Actualiza este doc si cambias el motor.

## 1. El objetivo del producto (contexto de diseño)

Un clic del usuario -> la postulación queda enviada. Las ÚNICAS razones válidas
para que el usuario intervenga son: (1) un CAPTCHA (jamás lo resolvemos nosotros,
por diseño) y (2) un dato que Applica genuinamente no conoce (se pide una sola
vez y se aprende). Todo lo demás es un bug.

## 2. Arquitectura híbrida (decisión D9 en DECISIONS.md)

Tres vías de envío, según el ATS:

| Vía | Cuándo | Componentes |
|-----|--------|-------------|
| **Playwright headless** (backend) | ATS sin verificación humana al enviar | `applyEngine.ts` + adapters. Auto-envío real sin usuario. |
| **Navegador real del usuario** (Playwright sobre Brave/Chrome local) | ATS con verificación; flujo por defecto del botón "Abrir y aplicar" | `runRealBrowserApply` (assistedApply.ts) + `launchRealBrowserContext` (browserManager.ts) |
| **Extensión de navegador** (`extension/`, Manifest V3) | Oferta "de 99% a 100%": llena EN la sesión real del usuario, cero anti-bot | `content.js` + `background.js` + endpoints `/api/extension/*` |

### Qué se intentó y FALLÓ (no repetir)
- **Derrotar/evadir captchas o anti-bot:** prohibido por diseño y además inútil
  (SmartRecruiters/SAP detecta Playwright por fingerprint hagas lo que hagas).
  El captcha es SIEMPRE del usuario.
- **`openInDefaultBrowser` para SR** (abrir la oferta en pestaña normal sin
  autollenado): funcionaba pero perdía todo el valor (nada se llena). Sustituido
  por navegador-real + extensión.
- **Playwright manejando el Brave real como única vía al 100%:** frágil por
  diseño de Chromium: un perfil = una instancia ("Se está abriendo en una sesión
  existente"), procesos zombis que bloquean el perfil, y el anti-bot de SR que a
  veces reta con slider. Por eso la extensión existe como remate (los líderes del
  mercado - Simplify, OwlApply - son extensiones, no automatización backend).

## 3. El llenador universal (`src/core/platforms/universalFill.ts`)

`fillEverythingKnown(page, profile, answers, log)` es el corazón. Barre TODOS los
campos visibles, deduce la etiqueta de cada uno, y llena lo que reconoce del
perfil + banco de respuestas. Reglas ganadas con sangre:

1. **Shadow DOM SIEMPRE.** SmartRecruiters (SAP `spl-*`) renderiza TODO campo
   dentro de shadow roots. `document.querySelectorAll` plano ve 1 elemento donde
   hay 15. Toda enumeración debe recorrer `el.shadowRoot` recursivamente. Esto
   aplica igual en: universalFill, WINDOW_CAPTURE, readFormAnswers, el banner
   (countMissing/hasCaptcha) y la extensión (deepAll).
2. **La etiqueta puede vivir FUERA del shadow root** (label en light DOM, input
   dentro del componente). La búsqueda de etiqueta debe "trepar" por
   `getRootNode().host` (hasta 4 saltos).
3. **La etiqueta puede no ser un `<label>`**: en "Preliminary questions" de SR el
   label asociado contiene solo "*" y la pregunta real es texto suelto en un
   HERMANO ANTERIOR. Estrategia final: label[for] -> label envolvente ->
   aria-label -> aria-labelledby -> contenedor field/question -> placeholder ->
   hermanos previos/ancestros con texto significativo (3-160 chars, != "*").
3b. **Locators sellados = bomba de 30s.** Nuestros propios clics disparan
   re-renders de React que borran los sellos `data-applica-f` A MITAD de pasada;
   cualquier acción sobre ese locator muerto espera su timeout completo EN
   SILENCIO (30s default de evaluate/selectOption/getAttribute/press), campo
   tras campo = MINUTOS congelado "sin hacer nada" (así se vivió: 5 min quieto
   y el usuario mató el proceso). Regla doble: (a) `count()`-guard antes de
   actuar (un sello muerto resuelve 0 al instante; el próximo tick lo retoma
   con sellos frescos), y (b) timeout corto explícito (1.5-3s) en TODA acción
   de locator dentro del barrido.
3c. **Multiselects ("mark all that apply") comprometen como CHIPS
   `multi-value`**, no `single-value`: sin chequear ambos, un multiselect ya
   respondido parece vacío y el re-clic lo DESMARCA (toggle).
4. **Una sola vez por campo** (`data-applica-filled`): el loop de vigilancia
   re-ejecuta el fill cada ~2s. Sin esta marca, si el usuario borra un valor
   nuestro (ej. un Website con formato que el ATS rechaza), lo re-llenábamos en
   bucle y lo bloqueábamos. Tras llenar un campo una vez, es del usuario.
5. **No pisar lo que ya tiene valor** (`hasValue -> skip`): respeta el autofill
   del CV del propio ATS y lo que el usuario escribió.
6. **Typeaheads: LISTA PRIMERO, teclear solo como fallback.** Abrir el menú con
   un clic y matchear contra las opciones visibles SIN teclear: los enums
   (género, veteran, sponsorship...) renderizan todo al abrir - match
   instantáneo y nada "escribe como loco" frente al usuario. Solo si el menú
   abre vacío (listas remotas: geocoder) se teclea la escalera de consultas.
   En la sonda sin tecleo NO hay fallback a "primera fila" (sería una opción
   arbitraria del enum, no un resultado de búsqueda). Escanear opciones con UN
   solo evaluate (`evaluateAll` texto+link por fila): el evaluate por fila eran
   250 round-trips en la lista de países = segundos de "pensando" muerto.
   Y NO saltarlos (página 2 de SR está llena de ellos), pero
   tampoco re-manejar los que el ADAPTER ya llenó: los react-select de Greenhouse
   dejan el input visible VACÍO tras seleccionar; si el barrido los re-escribe,
   BORRA la selección (regresión real: Location/Hispanic/Veteran quedaron vacíos).
   Por eso `fillTypeahead` de Greenhouse marca `data-applica-filled` ANTES de operar.
7. **Match de opciones por palabra completa, nunca substring:** escribir "Male"
   seleccionaba "Female | Feminino" ('male' es substring de 'Female'). Orden:
   match exacto -> word-boundary -> fallback teclado (ArrowDown+Enter).
   Y clic solo en filas HOJA (una línea, sin '\n'), no en el contenedor.
8. **Campos URL nunca aceptan prosa:** el banco puede tener una respuesta
   verbosa de IA para "Website". Se extrae el primer token con forma de URL, o
   se usa el portfolio del perfil (primera URL, sin comas: los ATS rechazan
   "site1.org, site2.com"), o se deja vacío.
9. **Matching contra el banco en 3 niveles:** (a) contención textual **POR
   FRASE COMPLETA con límites de palabra, jamás substring** ("Gender" hacía
   match dentro de "Do you identify as transGENDER?" y respondía "Male" a la
   pregunta equivocada),
   (b) reglas por CONCEPTO para preguntas que cada ATS redacta distinto y en
   distinto idioma (expectativa salarial; "cómo encontraste esta vacante" con
   default "LinkedIn"), (c) solape de >=2 palabras significativas.
10. **Demográficas voluntarias -> "prefiero no responder" por default (TODOS los
    ATS):** U.S. Standard Demographic Questions y self-identification (EEOC) son
    siempre opcionales. Sin respuesta EXPLÍCITA del banco (el banco siempre
    gana), se elige la opción tipo "Decline to answer / I don't wish to answer"
    (`DECLINE_ANSWER` + `DECLINE_OPTION_RX` + `DEMOGRAPHIC_RX` en universalFill;
    mismo trío replicado en `extension/content.js`). Nunca AFIRMAR hechos como
    default (el viejo default de veteran afirmaba "I am not a protected
    veteran"). Si el usuario cambia la opción a mano, el aprendizaje captura SU
    elección como siempre. Texto libre demográfico se deja vacío.
11. **`page.evaluate` con tsx/esbuild:** NUNCA asignar funciones flecha a
    `const` nombrados dentro del evaluate (esbuild inyecta `__name` ->
    ReferenceError en el browser). Inline los bucles. `CSS.escape` no existe en
    Node, solo dentro del browser.

## 4. Flujo asistido con navegador real (`assistedApply.ts` + `browserManager.ts`)

`runRealBrowserApply`: lanza el Brave/Chrome real del usuario con un perfil
dedicado persistente (`%TEMP%/applica-apply-profile`), el adapter llena, y un
LOOP DE VIGILANCIA (~2s por tick) hace todo lo demás:

- **Re-ejecuta `fillEverythingKnown` en cada tick.** Esto es lo que soporta ATS
  multi-página (SR divide la postulación): bot llena -> usuario resuelve captcha
  o dato faltante -> "Siguiente" -> el tick siguiente llena la página nueva.
  Es idempotente gracias a las reglas 4 y 5 de arriba.
- **CONGELADO mientras hay un captcha visible** (`captchaVisible(page)` antes de
  cada tick de fill): teclear/clickear con el reto en pantalla le roba el foco al
  usuario que lo está resolviendo (hCaptcha de imágenes sobre todo) Y es
  exactamente el patrón de actividad que dispara el anti-bot. Con el reto
  visible, el bot SOLO observa; al desaparecer, retoma. Las lecturas pasivas
  (readCaptured/readFormAnswers, detección de desenlace) sí siguen.
  La detección es por VISIBILIDAD del iframe del reto, NO por existencia:
  resolver un hCaptcha solo OCULTA su iframe (sigue en el DOM y en
  `page.frames()` para siempre), así que un check de existencia/frames deja la
  pausa pegada eternamente después de resolver ("resolví y el sistema sigue
  esperando"). Regla: iframe con src de reto (hcaptcha/bframe/arkose/turnstile)
  + display/visibility/opacity reales + tamaño > 60px, recorriendo shadow DOM.
  OJO: NUNCA usar `offsetParent === null` como test de "oculto" en estos
  iframes: los overlays de reto son `position: fixed`, y un elemento fixed
  reporta offsetParent null AUN ESTANDO VISIBLE (ese check dejó ciego al
  detector una vez: el bot seguía actuando con el reto abierto). display:none
  ya se cubre con el rect 0x0. Respaldo por texto para retos sin iframe (SR anti-bot,
  "completar el patrón"/arrastrar; **OTP por correo de Greenhouse**: "security
  code"/"código de seguridad" - al enviar, Greenhouse REEMPLAZA el form por el
  prompt del código, lo que se leía como "formulario desapareció limpio" ->
  falso submitted -> la ventana se CERRABA mientras el usuario copiaba el
  código del correo; por eso `formGoneClean` exige `!challengeUp`).
  Si aparece un reto nuevo, AGREGAR su texto
  en las 3 capas (worker, banner, extensión).
- **NUNCA clickear enlaces al elegir opciones de typeahead:** un match espurio en
  un `<a>` navega fuera de la postulación (pasó: terminó en la página de política
  de cookies). Los pickers filtran `a[href]`/ancestros antes de clickear
  (universalFill y extensión). Esto NO afecta Siguiente/Enviar: esos son botones
  y van por `clickAdvance`, otra ruta.
- **El banner vive SOLO en el frame principal** (`window.top !== window.self ->
  return`): addInitScript corre en TODOS los frames, y el banner se renderizaba
  también DENTRO del iframe del reto de hCaptcha (atascado en fase "llenando"),
  tapando la pregunta del captcha.
- **JAMÁS reusar la página INICIAL del contexto persistente** (`pages()[0]`):
  en Brave real, `context.addInitScript` NO se adhiere a ella - banner y
  WINDOW_CAPTURE reportaron `init=no` en vivo: el usuario nunca vio el banner
  en el flujo real Y el aprendizaje silencioso capturaba CERO. Crear
  `context.newPage()` DESPUÉS de registrar los init scripts y cerrar la
  inicial. (En Chromium bundled la inicial sí los recibe; el harness sintético
  no reproduce este bug - verificar con el log "Banner en la ventana".)
- **El país del PERFIL ancla el guard de location cuando el valor no trae país**
  ("Panama City" pelado está contenido en el texto de la opción de Florida y la
  elegía). `pickComboOption(countryHint)` + países canónicos bilingües
  ("United States" == "Estados Unidos").
- **El aprendizaje lee selecciones de combobox desde el div single/multi-value**
  (readFormAnswers + WINDOW_CAPTURE): el valor comprometido de react-select no
  vive en `input.value`, así que todo lo que el usuario elegía de listas (deal
  size, hunting vs expansion...) era invisible y nunca llegaba al banco.
- **No duplicar `--disable-blink-features=AutomationControlled`:** Playwright ya
  lo pasa; duplicarlo hace que Brave muestre una barra de "flag no admitido".
- **El banner evalúa el captcha PRIMERO, en cualquier fase:** el reto suele
  aparecer en plena fase "llenando" (lo dispara el clic de Enviar del propio
  adapter); con el orden viejo el banner decía "no toques nada" mientras el
  usuario debía resolver el reto. Con captcha visible muestra "Tu turno.
  Por favor resuelve el captcha para continuar" siempre.
- **Tras el PRIMER captcha, el auto-avance queda deshabilitado el resto de la
  corrida** (`challengeSeen`): resolver el reto suele completar el envío
  pendiente por sí solo, y re-clickear Enviar dispara un reto NUEVO: bucle
  infinito bot-vs-captcha peleando con el usuario. Con captcha visto, avanzar es
  territorio humano (el re-fill de campos sí continúa cuando no hay reto en
  pantalla).
- **AUTO-AVANCE (`missingRequiredCount` + `clickAdvance`):** si NO hay captcha y
  CERO campos requeridos sin responder (texto/select/textarea vacíos, file
  requerido sin archivo, checkbox/radio requerido sin marcar; ante duda cuenta
  como incompleto), el loop clickea el Next/Submit PROPIO del ATS (getByRole
  botón con nombre exacto; jamás enlaces ni "Apply with Indeed"). Submit respeta
  `ENABLE_REAL_SUBMISSIONS`. Cooldown 8s + tope 6 intentos para que una
  validación fallida nunca se convierta en martilleo. `clickAdvance` exige
  isVisible + clic exitoso (un botón OCULTO de la página anterior pasa
  count/isEnabled y un clic fallido no debe reportar éxito).
- **Los sellos `data-applica-f` se limpian al inicio de CADA pasada:** los forms
  multi-paso que OCULTAN la página anterior (en vez de removerla) dejaban sellos
  viejos; la pasada nueva re-usaba los mismos números y el locator matcheaba 2
  nodos -> strict mode violation que mataba en silencio todos los fills de la
  página 2+. Verificado E2E en sintético: fill p1 -> Next solo -> fill p2 ->
  Submit solo -> confirmación.
- **Captura respuestas para aprender** (readCaptured desde sessionStorage vía
  WINDOW_CAPTURE + readFormAnswers como respaldo).
- **Detecta el desenlace:** éxito por texto/URL de confirmación o "el formulario
  desapareció limpio"; distingue bloqueo del sitio (`site_limit`, ej. límite de
  2 aplicaciones/60 días de Mural) que NO es éxito.

### Trampas resueltas aquí (no reintroducir)
- **Cerrar la ventana LANZA una excepción** en Playwright ("Target/context
  closed") casi siempre. El `catch` DEBE devolver `capturedAnswers` y tratar el
  cierre como cierre normal, no como error: (a) `lastSnapshot` está IZADO fuera
  del try porque dentro se perdía todo lo aprendido justo al cerrar (así se
  perdió "Bloomberg" la primera vez); (b) devolver `status:'error'` por un cierre
  hacía que el worker relanzara una SEGUNDA ventana.
- **`everSuccess` vía `framenavigated`:** si el usuario cierra la ventana justo
  después de enviar, ya vimos la navegación de confirmación y se marca submitted.
- **Perfil "Crashed" = ventana extra:** matar procesos con `Stop-Process -Force`
  deja `exit_type: Crashed` en Preferences; el siguiente lanzamiento abre una
  segunda ventana vacía ("restaurar sesión"). `launchRealBrowserContext` parchea
  Preferences a `Normal`, añade `--disable-session-crashed-bubble`, y cierra
  páginas extra tras lanzar.
- **`--no-sandbox`:** Playwright lo añade por defecto y Brave muestra un aviso de
  seguridad. Se quita con `ignoreDefaultArgs: ['--no-sandbox']` + `chromiumSandbox: true`.
- **El banner de estado** (APPLICA_BANNER, inyectado por addInitScript) debe:
  (a) esperar a que `document.documentElement` exista (si no, el primer
  appendChild revienta y el script muere en silencio); (b) usar CLASES CSS de un
  <style> inyectado, no style="" inline (CSP estricto los descarta); (c)
  re-evaluar la página cada ~1.2s y decidir solo la fase: llenando (con frases
  rotativas) -> captcha visible -> faltan N campos -> listo; (d) **re-inyectar
  el <style> en CADA tick de ensure(), no solo al inicio**: las SPA React
  (Greenhouse job-boards) borran los nodos inyectados al hidratar/re-renderizar;
  la barra se re-creaba pero el <style> no, dejando una barra SIN estilos
  (position:static) invisible al fondo de la página; (e) **NO tocar el DOM hasta
  `document.readyState === 'complete'` (+1s de buffer, tope 8s)**: inyectar la
  barra ANTES de que React hidrate hace FALLAR la hidratación (errores #418/#423
  en consola) y React "se recupera" re-renderizando TODO desde cero - lo que
  BORRA lo que el adapter ya llenó (selecciones comprometidas incluidas), causa
  re-llenados lentos y picks equivocados. Verificado: con el retraso, cero
  errores de hidratación. Harness: `npx tsx scripts/_banner.ts [url]`.

## 5. Worker (`src/core/jobs/worker.ts`, handler `assisted_apply`)

- **Pre-check de vigencia ANTES de abrir la ventana** (`urlLiveness.ts`): los ATS
  no devuelven 404 en vacantes cerradas; Greenhouse redirige al careers page de
  la empresa (pasó con 6sense) y el usuario aterriza en una página que no
  llenamos. Señales de "muerta": 404/410 o redirección a OTRO dominio
  registrable (saltos de subdominio como boards.greenhouse.io ->
  job-boards.greenhouse.io son vida normal). Ante ambigüedad o error de red se
  asume VIVA (fail open): un falso "muerta" pierde una oportunidad real. Muerta:
  app -> `skipped`, vacante -> `archived` + warning; la UI muestra badge
  "Vacante cerrada". Harness: `npx tsx scripts/_liveness.ts [urls]`.
- Cola pg-boss SIN singleton/throttle (un singleton de 20min tragaba reintentos
  en silencio y la app quedaba "Enviando" para siempre). Guard en memoria
  (`activeAssisted`) contra doble ventana.
- El handler SIEMPRE resuelve el estado final. Guard: si el usuario ya resolvió
  desde la UI ("Ya envié"/"No se envió"), NO se pisa su decisión.
- **Rescate de huérfanos al arrancar:** un worker recién iniciado no tiene
  watchers, así que todo app en `approved` es huérfano de una sesión muerta ->
  pasa a `pending_review`. Sin esto, un reinicio del worker dejaba apps girando
  eternamente.
- `startWorker.ts` captura `unhandledRejection`/`uncaughtException` y SIGUE VIVO:
  antes un error en un apply tumbaba el worker en silencio y los clics del
  usuario encolaban jobs que nadie procesaba ("le doy y no pasa nada").
- El worker NO tiene hot-reload: **reiniciarlo tras tocar adapters/core**.

## 6. Aprendizaje silencioso (banco de respuestas)

Loop: lo que el usuario escribe en la ventana -> `WINDOW_CAPTURE` (snapshot a
sessionStorage en submit/click/beforeunload) + `readFormAnswers` (respaldo) ->
el worker guarda las respuestas NUEVAS con `captureReusableAnswer` -> el banco
(`memory/reusable_answers.md` en la tabla `memory_documents`) se mergea en el
próximo apply (`getReusableAnswersMap`; las respuestas específicas del app ganan).

- Clave = LA PREGUNTA, valor = la opción elegida ("Gender"="Male", no "Male"="on").
- La captura debe ver shadow DOM y usar la misma detección de etiqueta que el
  llenador (incluida la estrategia de hermanos previos), o lo que el usuario
  escribe en SR nunca se aprende.
- **`memory_documents` tiene índice único (user_id, path)** + `onConflictDoNothing`:
  hubo una carrera de creación que duplicó los documentos; las lecturas tomaban
  el duplicado casi vacío y el banco entero parecía borrado. Si un banco "pierde"
  respuestas, buscar duplicados ANTES de asumir pérdida de datos.

## 7. Extensión (`extension/`)

Mismo cerebro que universalFill pero corriendo dentro de la página (content
script). Particularidades:
- El backend habla con ella por token HMAC por usuario (`src/lib/extensionToken.ts`,
  las cookies no cruzan a la extensión). `connector.js` corre en el dominio de
  Applica y se auto-conecta (cero pegar tokens).
- **CV:** las extensiones no pueden setear `input.value` de un file input, pero
  SÍ `input.files` vía `DataTransfer`. El background baja el PDF en base64 (un
  content script en HTTPS no puede fetch a http://localhost: mixed content) y el
  content script lo dropea con eventos `composed`. Se adjunta ANTES de llenar.
- Los clics sintéticos del content script NO son "trusted": algunos widgets
  (spl-select-option del city de SR) los ignoran -> se deja el texto escrito y el
  dropdown abierto para 1 clic del usuario (caso "dato faltante", permitido).
- `/api/extension/resume` NO debe importar nada que arrastre playwright-extra
  (revienta en una API route); `resolveUploadPath` está inline por eso.

## 8. Adapters por ATS: peculiaridades que costaron encontrar

- **Contrato de navegación: el ADAPTER navega, no el caller.**
  `runRealBrowserApply` entrega una página en `about:blank`; cada
  `applyPlaywright` debe hacer su propio `page.goto` si no está ya en la oferta
  (Lever/Ashby/SR lo hacían; Greenhouse NO y esperaba el form sobre una ventana
  en blanco 15s -> "error" -> caía al Chromium bundled sin sesiones del
  usuario). El guard NO puede ser `page.url() !== url`: Greenhouse redirige
  `boards.greenhouse.io` -> `job-boards.greenhouse.io` y re-navegarías una
  página ya lista.
- **Ids dinámicos JAMÁS como `#id`:** Greenhouse genera ids NUMÉRICOS ("9120…")
  y `#9120` es CSS inválido; el SyntaxError abortaba TODO el llenado del adapter
  (la mayoría de campos quedaban vacíos). Todo id leído del DOM
  (`getAttribute('for')`) va como selector de atributo `[id="..."]`. Aplicado en
  los 4 fillQuestionByLabel.
- **El fallback al Chromium bundled es SOLO para fallo de LANZAMIENTO** del
  navegador real (`no_local_browser` / `launch_failed`). Un error DENTRO del
  navegador real (timeout del adapter, etc.) NO debe caer al bundled: no tiene
  las sesiones del usuario ni fingerprint confiable, y el usuario percibe "se
  abrió un Chromium raro sin mi sesión". En ese caso: `pending_review` y
  reintento en SU navegador.

- **SmartRecruiters:** todo shadow DOM (regla 1). El CV es un `<spl-dropzone>`
  cuyo file chooser NATIVO es lo único que registra el archivo (un setInputFiles
  directo se ignora en silencio). El anti-bot puede aparecer ANTES del form: se
  sondea hasta ~2.5 min a que el form exista (el humano resuelve el slider y
  ENTONCES llenamos). El botón inicial es SOLO "I'm interested" (un selector
  genérico de "Apply" clickeaba "Apply with Indeed"). Multi-página: la página 2+
  la llena el loop de vigilancia, no el adapter.
- **Greenhouse:** CV PRIMERO (su autofill re-renderiza y borra lo escrito antes),
  commit React en cada fill (input/change/blur o el valor se ve vacío), país/
  ciudad/demográficas son react-select (`fillTypeahead` por id + marca
  data-applica-filled).
  - **CV en la UI nueva (job-boards): SOLO el file chooser NATIVO registra el
    archivo** (igual que el dropzone de SR): clic en su botón "Attach" +
    `filechooser` + `chooser.setFiles`. Un `setInputFiles` directo deja
    `input.files` poblado pero el widget NUNCA sube ni muestra nada (log decía
    "attached" con el form vacío). Esperar ~1.5s antes del clic (sin hidratar,
    el chooser no dispara). Verificar contra LA PÁGINA: adjunto = el nombre del
    archivo aparece en el body (el widget sube a S3 y ELIMINA `input#resume` al
    lograrlo); si no aparece, fallback `setInputFiles` (UI legacy) y reintento.
  - **Comboboxes react-select (`pickComboOption`):** el "commit" se verifica en
    el div `single-value`, que es HERMANO del contenedor del input (un
    `closest('[class*=select]')` desde el input matchea su propio
    input-container y nunca lo ve: eso hizo fallar TODAS las selecciones).
    Opciones SIEMPRE scoped al listbox propio (`aria-controls` ->
    `react-select-<campo>-listbox`): un locator global de `[role=option]`
    clickeó una opción de PAÍS al llenar Location porque el menú anterior seguía
    abierto. Al fallar: limpiar el input Y cerrar con Escape (menú abierto
    envenena el campo siguiente). Valores del banco pueden ser bilingües
    ("Male | Masculino" -> variantes por "|") o VALUES internos (UUIDs de SR) que
    se filtran. Si nada matchea, NO dejar texto libre (el widget lo borra al
    blur y esconde el "campo faltante" del banner).
  - Los comboboxes se rutean SIEMPRE por `pickComboOption`, también desde
    `fillQuestionByLabel` (un `fill()`+blur ahí escribía texto libre que el
    widget borraba: así quedó Location en blanco sabiendo la ciudad).
  - **`fillQuestionByLabel` matchea SOLO `<label>` reales** (fallback: nodos de
    texto CORTOS) **y el caption debe EMPEZAR con la pregunta, no solo
    contenerla**. Con `getByText` a secas, la clave "Major" del banco matcheó
    el párrafo legal "...one or more of your 'major life activities'" y tecleó
    "Bloomberg..." en el multiselect de DISABILITY. Claves de <4 chars ("To") se
    saltan.
  - **En comboboxes se teclea solo hasta la PRIMERA COMA** (las 3 capas):
    "Panama City, Provincia de Panamá, Panama" hacía que el geocoder devolviera
    Florida primero; "Panama City" acierta. Las opciones enum (veteran, etc.) no
    llevan coma - no les afecta.
  - **Guard de PAÍS en location** (`pickComboOption`): el geocoder LOCALIZA los
    nombres según el idioma del navegador; con Brave en español, "Panama City"
    solo devuelve las de Florida (la capital se llama "Ciudad de Panamá") y así
    se comprometió "Panama City Beach, Florida" para un perfil de Panamá. Regla:
    si el valor es geográfico ("Ciudad, ..., País"), el último segmento de la
    opción debe COINCIDIR con el país del valor; sin opciones del país correcto
    se pasa a la siguiente consulta de la escalera (ciudad completa -> puente de
    exónimo "X City"->"Ciudad de X" -> primera palabra) y JAMÁS se elige un
    lookalike de otro país (mejor vacío que Florida). El fallback es la primera
    fila que SOBREVIVIÓ los guards, nunca ArrowDown+Enter crudo. El scoring por
    solape divide por el nº de palabras de la opción (los conteos crudos
    empataban Florida con Panamá). Verificado en locale es-419 y en-US.
  - **Un pick fallido LIBERA su `data-applica-filled`**: la respuesta del banco
    puede ser basura (Gemini guardó un PÁRRAFO como "Location (City)*") mientras
    el bloque de typeaheads trae el valor limpio del perfil; el sello pegado
    bloqueaba ese reintento. `pick()` además filtra UUIDs y valores >60 chars
    (una opción de lista jamás es prosa).
- **Lever:** campos `cards[uuid]` por etiqueta; "Current location" exige elegir
  sugerencia del geocoder (texto libre se BORRA al blur; si el geocoder no
  responde - pasa en el entorno de prueba - se mantiene el texto sin blur y
  queda como dato faltante). El hCaptcha de dLocal crasheaba el tab por WebGL:
  hay un init-script global que desactiva contextos WebGL.
- **Ashby:** ids estables `#_systemfield_*`; location con autocomplete propio;
  radios por label con verificación; esperar "uploading/updating" del CV antes
  del submit (si no, warning "We're updating your forms").

## 8.1 GenericAdapter (`src/core/platforms/genericAdapter.ts`) - sitios sin adapter dedicado

Antes, cualquier vacante en una plataforma sin adapter (una empresa con su propia
página de carreras, o LinkedIn redirigiendo a un sitio externo) solo generaba
preguntas EXTRAÍDAS (`genericFormScraper.ts`) para que el usuario las respondiera
en nuestra UI - pero eso NUNCA se auto-enviaba a ningún lado, así que el usuario
terminaba escribiendo la misma respuesta dos veces (una para nosotros, otra en el
sitio real). Decisión consciente documentada en el comentario de
`genericFormScraper.ts`, pero incompleta: dejaba al usuario sin la ventana real.

`GenericAdapter` cierra ese hueco reutilizando el mismo motor, sin tocar los ATS:

- Usado SOLO por el handler `assisted_apply` (ventana visible, supervisada por el
  usuario) - jamás por `process_application` (el flujo silencioso/headless de
  `action:'approve'`, que sigue fallando con "No adapter" para plataformas
  desconocidas, A PROPÓSITO: nunca auto-envíes sin supervisión en un sitio no
  probado).
- `applyPlaywright` hace lo MÍNIMO que el loop de vigilancia (`assistedApply.ts`)
  no puede hacer por sí solo: `page.goto`, clic en un botón "Apply"/"Aplicar"
  genérico para revelar el form, intento de adjuntar el CV (file chooser nativo
  primero, `setInputFiles` como respaldo), y UN pase de `fillEverythingKnown`. El
  loop retoma desde ahí exactamente igual que con cualquier ATS (re-fill cada
  tick, freeze en captcha, auto-avance genérico) - **nunca hace clic en enviar
  por su cuenta**, eso queda igual de gateado que siempre
  (`missingRequiredCount` + `ENABLE_REAL_SUBMISSIONS`).
- Gating en frontend (`useApplicationActions.ts`): `isGenericCapable` excluye
  LinkedIn (tiene su propio Easy Apply engine) y sitios que exigen registro
  (`workday|icims|taleo|brassring` en la URL - abrir una ventana ahí solo
  encuentra un login wall). Todo lo demás ahora es `autoCapable` igual que los
  ATS conocidos.
- Cambio quirúrgico en `worker.ts`: el `adapters` map NO incluye `genericAdapter`
  (para no alterar ningún otro lookup - `search`, `process_application`,
  `formPreview` siguen fallando/saltando exactamente igual para plataformas
  desconocidas). Solo el handler `assisted_apply` hace fallback a
  `genericAdapter` cuando `adapters[platform]` no existe y la plataforma no es
  `'linkedin'`. Verificado con Playwright que Greenhouse sigue disparando
  `{action:'assisted'}` sin cambios (regresión) y que una plataforma desconocida
  ahora también lo hace (antes caía en un mensaje muerto "ve tú mismo").
- Fiabilidad esperada MENOR que los 5 ATS conocidos (sin meses de casos
  documentados por sitio): si el llenado genérico no encuentra ni un campo o
  falla el CV, el usuario igual tiene la ventana abierta con sus materiales
  listos para completar a mano - nunca peor que el comportamiento anterior.

## 9. UI (dashboard)

- Estado `approved` = "Applica está aplicando por ti" con botones "Ya envié" /
  "No se envió" (el sistema nunca debe quedar sin salida terminal).
- El poll de refresco mientras hay apps en `approved` NO debe tener tope de
  tiempo (un apply asistido tarda minutos; con tope de 45s el panel se quedaba
  congelado en "aplicando" después de que el worker ya había marcado submitted).
- ATS siempre van por "Abrir y aplicar"; "Faltan datos" está oculto para ATS.

## 10. Cómo verificar cambios (obligatorio antes de dar algo por hecho)

- `npx tsc --noEmit` limpio.
- Harness: `npx tsx scripts/_submit.ts <platform> fillonly` (llena sin enviar,
  evidencia en `uploads/evidence/`). `scripts/_dom.ts <platform>` vuelca el DOM.
- **Verificar con CAPTURA DE PANTALLA, no solo logs**: los logs pueden decir
  "Filled X" mientras la página muestra el campo vacío o mal seleccionado (pasó
  con Gender=Female y con los typeaheads borrados). La captura es la verdad.
- SR no se puede probar con el Chromium bundled (su anti-bot lo bloquea): usar
  `launchRealBrowserContext` en scripts de prueba, y matar antes los Brave
  zombis del perfil (`applica-apply-profile`).
- Reiniciar el worker tras cambiar adapters/core.
