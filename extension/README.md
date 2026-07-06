# Applica - Extensión de autollenado

Llena tus postulaciones (Greenhouse, Lever, Ashby, SmartRecruiters) con un clic, en tu
navegador real. Cero anti-bot, cero conflictos de perfil: la extensión corre dentro de
tu sesión normal, así que solo el captcha y los datos que no conocemos quedan para ti.

## Instalar (modo desarrollador, Brave/Chrome)
1. Abre `brave://extensions` (o `chrome://extensions`).
2. Activa **Modo de desarrollador** (arriba a la derecha).
3. **Cargar descomprimida** y selecciona esta carpeta (`extension/`).
4. Fija la extensión en la barra.

## Conectar (automático)
No pegas nada: **abre Applica** (el dashboard) con la extensión instalada y se conecta
sola (verás "Extension Applica conectada"). El popup de la extensión solo es respaldo
manual por si acaso.

## Usar
1. Abre la vacante y su formulario de aplicación.
2. Pulsa **"Llenar con Applica"** (abajo a la derecha).
3. Se adjunta el **CV solo**, se llenan los campos, y quedan para ti: **el captcha** (si
   aparece) y **cualquier dato que no sepamos**. Revisa y **envía** tú.

## Notas técnicas
- `APPLICA_BASE_URL` en `config.js` apunta al backend (por defecto `http://localhost:3000`).
- CV automático: el background trae el CV en base64 y el content script lo asigna a
  `input.files` via `DataTransfer` (las extensiones no pueden setear `input.value`, pero
  `input.files` sí). Se adjunta antes de llenar.
- Auth por token HMAC por usuario, auto-obtenido por `connector.js` en el dominio Applica.
