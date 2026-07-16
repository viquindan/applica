# Deploy a Hostinger VPS

Este documento cubre la preparación del despliegue del **web app** (`src/`,
Next.js) a un VPS de Hostinger vía GitHub Actions. La app móvil (`mobile/`)
NO se despliega aquí - se distribuye como APK (o luego Play Store), ver
`mobile/README` / el plan en `C:\Users\lidic\.claude\plans\dazzling-humming-hummingbird.md`.

## 1. Provisionar el VPS (una vez, manual)

En el VPS de Hostinger (Ubuntu recomendado):

```bash
# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# PM2 (gestor de procesos - ya usado por ecosystem.config.js)
sudo npm install -g pm2

# Postgres local (ver sección 3 - alternativa a Neon)
sudo apt-get install -y postgresql

# Clonar el repo
git clone <url-del-repo> /home/<usuario>/applica
cd /home/<usuario>/applica
npm ci
```

Crear `.env.local` (o exportar las variables en `~/.bashrc` /
`/etc/environment`) con `DATABASE_URL`, `AUTH_SECRET`,
`GOOGLE_GENERATIVE_AI_API_KEY`, etc. - **nunca comitear este archivo**.

Primer arranque manual:
```bash
npx drizzle-kit push --force   # crea el schema
npm run build
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup   # para que sobreviva un reinicio del VPS
```

## 2. Configurar GitHub Actions

El workflow `.github/workflows/deploy.yml` ya está listo - dispara en cada
push a `main`, o manualmente desde la pestaña "Actions" del repo
(`workflow_dispatch`).

**Secrets necesarios** (Settings → Secrets and variables → Actions):

| Secret | Valor |
|---|---|
| `VPS_HOST` | IP o dominio del VPS |
| `VPS_USER` | usuario SSH (ej. `root` o el usuario que clonó el repo) |
| `VPS_SSH_KEY` | clave privada SSH (par de claves dedicado al CI, no tu clave personal) |
| `VPS_APP_PATH` | ruta absoluta del repo en el VPS, ej. `/home/ubuntu/applica` |

Generar un par de claves dedicado para CI (recomendado, no reusar tu clave
personal):
```bash
ssh-keygen -t ed25519 -f deploy_key -N ""
# copiar deploy_key.pub al VPS: ~/.ssh/authorized_keys
# pegar el contenido de deploy_key (privada) como el secret VPS_SSH_KEY
```

**Importante**: este repo local no tiene remoto de git configurado
(`git remote -v` vacío) ni existe la rama `main` todavía - solo `master`,
`v2-uiux`, `v3-web-app`. El workflow no puede dispararse hasta que:
1. Se configure un remoto (`git remote add origin <url>`).
2. Exista una rama `main` con push (fusionar `v3-web-app` cuando esté listo).

## 3. Base de datos: no depender de Neon gratis

Ver `docs/DECISIONS.md` (entrada de esta fecha) para el análisis completo de
alternativas. Recomendación corta: **Postgres nativo en el mismo VPS**
(paso 1 de arriba) - sin límites de egress, sin cuenta externa, un solo lugar
que mantener. `src/db/client.ts` ya detecta automáticamente si
`DATABASE_URL` es de Neon (`neon.tech` en el host) o no, y usa el driver
correcto (`pg`/`node-postgres`) - cero cambios de código necesarios al
migrar.

## 4. Verificación post-deploy

```bash
curl -I https://tu-dominio.com          # 200
pm2 list                                 # applica-web + applica-worker "online"
pm2 logs applica-worker --lines 50       # sin errores de conexión a DB
```
