# Applica - Convenciones

> Cómo correr, verificar y escribir código en este repo.

## Correr
- **Dev server:** `npm run dev` (puerto 3000).
- **Worker:** `npx tsx scripts/startWorker.ts`. Para que sobreviva: lanzar desacoplado
  `cmd /c "npx tsx scripts/startWorker.ts > worker.log 2>&1"` (WindowStyle Hidden). Reiniciarlo tras cambiar adapters/worker/core (no hace hot-reload).
- **Headful** (para depurar reCAPTCHA invisible): `APPLY_HEADFUL=true`.

## Verificar
- **Tipos:** `npx tsc --noEmit` tras tocar schemas, API routes o core. Debe quedar limpio.
- **Harness de envío:** `npx tsx scripts/_submit.ts <appIdPrefix|platform> [dry]` - corre `applyPlaywright` en primer plano; `dry` llena sin clicar submit. Evidencia en `uploads/evidence/`.
- **Volcado de DOM:** `npx tsx scripts/_dom.ts <platform>` - inspecciona el formulario real (útil al arreglar selectores de un adapter).

## Base de datos
- Esquema en `src/db/schema.ts` (Drizzle). Si modificas tablas: exportarlas y actualizar queries relacionadas. Cliente ESM en `src/db/client.ts`.
- `warnings`/`redFlags` en `vacancies` son `text[]` (usar `ARRAY[]::text[]`, no jsonb).

## Estilo de código
- Match al código vecino (naming, comentarios, idioma de comentarios).
- TypeScript estricto. Evitar `any` salvo en límites de Playwright/evaluate.
- En `page.evaluate` con tsx: **no asignar funciones flecha a `const` nombrados** (esbuild inyecta `__name` "ReferenceError" en el browser). Inline las funciones. `CSS.escape` no existe en Node - usar selectores de atributo `[id="..."]`.

## UI / estilo
- Estética glassmorphism premium con variables CSS de `globals.css` (petrol `#2A4A4F`, gold `#B09460`, etc.). Inter. Radios 8/12/20/24.
- Nada de HTML genérico sin estilo. No animaciones DOM pesadas (usar el Canvas existente).

## Adapters (al crear/arreglar uno)
1. Volcar el DOM real con `_dom.ts`.
2. Llenar label-driven (system fields + custom). Adjuntar CV. Verificar choices requeridos (fix-up + re-check).
3. Al enviar: confirmar éxito, o detectar CAPTCHA devolver `{ status: 'pending_review', submissionStatus: 'failed_captcha', failureReason }`. Nunca lanzar excepción genérica ante el gate.

## Archivos temporales
Scratch en el directorio de scratchpad de la sesión, no en `/tmp` ni en el repo. Limpiar scripts de un solo uso.

## Producción (deploy, DB, APK)
Ver `ARCHITECTURE.md` §6 para el detalle completo. Resumen operativo:
- **Deploy web:** push a `master` → GitHub Actions lo despliega solo al VPS (Hostinger, `ssh vps-sortcash`, Nginx+HTTPS, PM2). No hace falta ningún paso manual.
- **DB de producción:** Postgres propio en el VPS, no Neon - antes de correr un script contra "la DB" confirmar contra cuál (local vs producción) para no mezclar datos.
- **APK de Android:** se compila LOCAL con Gradle (no EAS, cuota gratuita agotada) desde una ruta corta fuera de OneDrive (`C:\bld`, ver por qué en `DECISIONS.md`) con `assembleRelease`, y se sube por `scp` directo a `vps-sortcash:/var/www/applica-shared/downloads/applica-debug.apk` (desde el deploy de releases+symlink de 2026-07-21 - ver `ARCHITECTURE.md` §6 - antes era `/var/www/applica/public/downloads/`, esa ruta ya no es la que sirve el servidor). La URL de descarga para el usuario es siempre `https://applicaswipe.com/downloads/applica-debug.apk` - no se usa EAS/Expo cloud ni ningún servicio externo para distribuir el APK.
