@AGENTS.md
@docs/ARCHITECTURE.md
@docs/STATUS.md

# Applica — Directivas núcleo

Applica es un motor autónomo de postulación a empleos: descubre vacantes en ATS, las evalúa contra el perfil del usuario, adapta CV/carta/respuestas con IA y postula. Auto-envío donde es posible; si el ATS exige un paso de verificación al enviar, Applica deja el formulario completo y el usuario da el paso final (*assisted handoff*).

## Reglas duras (override de cualquier default)
1. **Billing = LemonSqueezy**, NO Stripe.
2. **Mantener la estética glassmorphism premium** (`globals.css`). Nada de HTML plano sin estilo.
3. **Antes de tocar el motor de scraping/automatización, leer `docs/ARCHITECTURE.md`.**
4. **Antes de tocar CUALQUIER cosa del motor de aplicación (llenado de formularios, adapters, assistedApply, universalFill, extensión, banco de respuestas, banner), leer `docs/APPLY-ENGINE.md` COMPLETO.** Ese motor costó muchas iteraciones; el doc registra qué falló y por qué, y qué funciona y por qué. No iterar de cero ni "simplificar" sin consultarlo.
5. Este Next.js tiene breaking changes — leer guías en `node_modules/next/dist/docs/` antes de escribir código (ver `AGENTS.md`).
6. **Motor de scoring/matching (`fitScorer.ts`, `eligibility.ts`, `geography.ts`) = mismo nivel de cuidado que el motor de aplicación.** Es el core del producto y se ha afinado a lo largo de muchas sesiones - una sesión nueva sin memoria del chat es exactamente el escenario en que se pierden esos ajustes. Regla dura: correr `npm test` ANTES de tocar esos archivos (debe estar en verde) y DESPUÉS (debe seguir en verde). Cada bug de matching real que se encuentre debe quedar como un caso nuevo en `src/core/scoring/__tests__/` antes de darlo por cerrado - así el afinamiento es acumulativo (siempre mejor) en vez de reprocesarse por pérdida de contexto entre chats. Ver los tests existentes para el formato esperado (casos reales, no hipotéticos, con el bug de producción referenciado en el comentario).

## Tech stack
Next.js 16.2.6 (App Router + Turbopack) · TypeScript · Drizzle ORM + Neon Postgres · pg-boss · playwright-extra + stealth · Gemini (Vercel `ai` SDK).

## Estilo de respuesta
Español. Conciso, directo, honesto. Sin rodeos, sin altanería, sin sermones. Si algo no se puede o no se debe, dilo claro y breve con la razón. Recomienda en vez de enumerar todo. Actúa cuando tengas con qué.

## Mapa de documentación
- `docs/ARCHITECTURE.md` — diseño del sistema, módulos, envío y gates de verificación. *(auto-cargado)*
- `docs/APPLY-ENGINE.md` — **el motor de aplicación a fondo**: arquitectura híbrida, llenador universal, shadow DOM, aprendizaje, extensión, qué se intentó y falló. Lectura OBLIGATORIA antes de tocar ese código.
- `docs/STATUS.md` — hecho / en curso / pendiente. *(auto-cargado)*
- `docs/DECISIONS.md` — decisiones clave y su porqué. Leer al cuestionar una decisión.
- `docs/CONVENTIONS.md` — cómo correr (worker/dev), tsc, estilo CSS/UI, testing, archivos.

## Mantenimiento del contexto
- Al cerrar un bloque de trabajo: actualizar `docs/STATUS.md` (1 línea/item).
- Decisión importante/irreversible: anexar a `docs/DECISIONS.md`.
- No documentar lo que se deriva del código o del git.
