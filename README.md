# ALaunchi — Launcher de modpacks de Minecraft

App de escritorio para Windows (Electron + React) que funciona como un CurseForge/Modrinth
privado: tú publicas modpacks en un repositorio de GitHub, tus amigos instalan el launcher, eligen
un pack y la app se encarga de todo — login con Microsoft, Java, instalación de Forge/Fabric,
descarga de mods y lanzamiento del juego. El propio launcher se autoactualiza.

## Requisitos (para desarrollar/empaquetar)

- **Node.js 20+**
- **Java 17+** solo hace falta en las máquinas donde se juega (el launcher puede instalarlo solo
  con el botón "Instalar Java automáticamente" si no lo detecta)

## Modo desarrollo

```bash
npm install
npm run electron:dev
```

Levanta Vite en `http://127.0.0.1:5173` y abre una ventana de Electron apuntando ahí, con hot
reload y DevTools en una ventana separada.

## Empaquetar / publicar una nueva versión

1. Edita `electron-builder.yml` y pon tu usuario/repo reales en `publish.owner` / `publish.repo`
   (el repo **de la app**, ver más abajo).
2. Sube la versión en `package.json` (semver, ej. `1.0.1`).
3. Genera un [GitHub Personal Access Token](https://github.com/settings/tokens) con permiso
   `repo` y expórtalo como `GH_TOKEN`.
4. Ejecuta:

```bash
npm run release
```

Esto compila el frontend, empaqueta el `.exe` (NSIS, instalación por usuario sin pedir permisos
de administrador) y crea una Release en GitHub con el instalador + `latest.yml`. Los launchers ya
instalados detectan la nueva versión solos al arrancar y se actualizan sin intervención del
usuario (descarga en segundo plano, se aplica al reiniciar la app).

Si solo quieres el `.exe` sin publicar: `npm run dist`.

## Los dos repositorios de GitHub

Usa **dos repos separados** — si se mezclan, el puntero "latest release" de GitHub puede acabar
apuntando a una release sin `latest.yml` y romper el auto-update.

### 1. Repo de la app (público, ej. `tu-usuario/alaunchi-app`)

Solo lo tocas con `npm run release`. Contiene únicamente las Releases con el instalador y
`latest.yml` que genera electron-builder.

### 2. Repo de modpacks (público o privado, el que configures en Ajustes → Admin dentro de la app)

Estructura:

```
tu-repo/
  modpacks.json
  modpacks/
    vanilla-plus/
      manifest.json
    survival-pro/
      manifest.json
```

**`modpacks.json`** — lista de modpacks disponibles:

```json
[
  {
    "id": "vanilla-plus",
    "name": "VANILLA+",
    "description": "Experiencia vanilla pulida",
    "minecraftVersion": "1.20.4",
    "loaderType": "vanilla",
    "version": "1.0.0",
    "imageUrl": "https://raw.githubusercontent.com/tu-usuario/tu-repo/main/modpacks/vanilla-plus/cover.jpg",
    "fileCount": 45,
    "totalSizeMb": 250
  }
]
```

**`modpacks/<id>/manifest.json`** — archivos del pack, subidos como asset de una Release:

```json
{
  "files": [
    {
      "filename": "sodium-0.5.8.jar",
      "type": "mod",
      "sizeMb": 1.5,
      "downloadUrl": "https://github.com/tu-usuario/tu-repo/releases/download/vanilla-plus-v1.0.0/sodium-0.5.8.jar"
    }
  ]
}
```

Publicar una versión nueva de un modpack se hace desde el **panel de Admin** dentro de la propia
app (botón "ADMIN" en la pantalla principal): sube los archivos, calcula hashes, sube lo que
cambió como Release y actualiza el `manifest.json` — no hace falta tocarlo a mano.

Si el repo de modpacks es privado, genera un token con permiso `repo` y ponlo en
Ajustes → Admin → "Token GitHub".

## Login con Microsoft (obligatorio para poder jugar)

El launcher usa el flujo *device code* de Microsoft/Xbox Live/Minecraft. Para que funcione hace
falta registrar una app en Azure (gratis):

1. Ve a [entra.microsoft.com](https://entra.microsoft.com) → **App registrations** → **New
   registration**.
2. Nombre: el que quieras (ej. "ALaunchi"). **"Supported account types"**: elige la opción
   **"Accounts in any organizational directory (Any Microsoft Entra ID tenant - Multitenant) and
   personal Microsoft accounts (e.g. Skype, Xbox)"**. Esto es obligatorio — si eliges solo
   "cuentas personales" (personal accounts only), Xbox Live/Minecraft rechaza el login con
   `HTTP 403 Invalid app registration`, aunque el resto del flujo (Microsoft, Xbox, XSTS) funcione
   bien.
3. En **Authentication**, activa **"Allow public client flows"** → Yes, y guarda.
4. Copia el **Application (client) ID**.
5. Pégalo en la app, en Ajustes → "Azure Client ID".

Si ya registraste la app con el tipo de cuenta equivocado, no hace falta crear una nueva: entra en
**Authentication** de tu app existente y cambia "Supported account types" a la opción de arriba.

Sin este paso, el botón de login no funcionará.

## Panel de administración

- Se accede con el botón **ADMIN** en la pantalla principal.
- Contraseña por defecto definida en `src/pages/settings.tsx`
  (`DEFAULT_ADMIN_PASSWORD`) — **cámbiala la primera vez** desde Ajustes → Admin.

## Estructura del proyecto

- `electron/main.js` — proceso principal: login MS/Xbox, descarga de Minecraft/Forge/Fabric,
  gestión de Java, sincronización de modpacks, auto-actualización.
- `electron/preload.js` — puente IPC expuesto como `window.electronAPI`.
- `src/pages/` — pantallas (login, home, admin, settings).
- `src/services/github.ts` — lectura/publicación de `modpacks.json` y manifiestos.
- `src/hooks/use-auth.ts`, `use-modpacks.ts` — estado global (Zustand).
