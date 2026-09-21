# ALaunchi

Lanzador de escritorio de Minecraft (modpacks) hecho a medida — Electron + React + TypeScript. Estética seria verde/naranja, para un grupo privado de jugadores (no un producto público).

## Qué hace

- Instala y actualiza modpacks publicados por un admin, con autenticación real de Microsoft/Xbox/Minecraft (device code flow) para lanzar el juego de verdad (online, con sesión válida).
- Soporta Forge, NeoForge y Fabric — resuelve e instala el modloader y las librerías necesarias, incluyendo Forge legado (pre-1.13).
- Cada instancia gestiona su propia Java: cachea varias JRE por versión mayor (`~/.alaunchi/java/<major>`) y descarga la que falte bajo demanda — no depende de una única Java global.
- Explorador de mods/shaders/resourcepacks vía la API de Modrinth: buscar, instalar, actualizar, filtrar por categoría, ordenar por descargas/me-gusta/relevancia/fecha.
- Gestor de skins: cambia skin/capa en la cuenta real de Mojang, biblioteca local de skins guardadas, visor 3D que hace idle realista (respira + gestos aleatorios: mirar alrededor, estirarse, saludar), se gira arrastrando y reacciona al clic. Las miniaturas de skins guardadas siguen usando el visor simple de skinview3d (camina en el sitio).
- Diálogo de novedades (changelog) antes de aplicar cualquier actualización.
- Panel de admin para publicar modpacks (sube archivos a GitHub Releases, genera el manifiesto).

## Arquitectura

- **`electron/main.js`** — proceso principal. IPC handlers para: instalar/actualizar modpacks (`mc:install-snapshot`), lanzar Minecraft (`mc:launch`), gestión de Java por versión mayor, instalación de Forge/NeoForge (incluye legado), auth de Microsoft/Xbox, gestor de skins (API oficial de Mojang), proxy de texturas (evita problemas de CORS con `textures.minecraft.net`).
- **`electron/preload.js`** — expone `window.electronAPI` vía `contextBridge`.
- **`src/pages/`** — `home.tsx` (carrusel principal, botón Jugar con barra de progreso animada), `modpack-detail.tsx` (gestor de instancias: contenido, búsqueda/instalación, changelog), `admin.tsx` / `admin-modpack.tsx` (publicar modpacks), `settings.tsx`, `login.tsx`.
- **`src/services/`** — `github.ts` (manifiestos, publicación, snapshots), `modrinth.ts` (búsqueda/categorías/versiones), `electron.ts` (wrappers de IPC), `translate.ts` (traducción de descripciones respetando HTML), `skin.ts` (API de skins/capas + biblioteca local), `auth.ts`.
- **`src/hooks/`** — `use-auth.ts`, `use-modpacks.ts`, `use-launch-modpack.ts` (flujo compartido actualizar-y-lanzar), `use-changelog-confirm.ts`, `use-dynamic-accent.ts` (color de acento según la imagen del modpack).
- **`src/components/`** — `loader-icon.tsx` (marca de cada modloader/MC en las tarjetas del Hub: usa el logo real extraído en runtime del jar que el launcher ya descargó — `mc:get-loader-icons`, mismo patrón que las hojas de cerezo —, luego un archivo suelto en `src/assets/loaders/`, y por último un glifo dibujado). `skin-viewer-3d.tsx` (skinview3d: camina en el sitio; se usa en miniaturas y previews de emotes), `skin-viewer-animated.tsx` (three.js + glTF riggeado + AnimationMixer: idle realista con gestos, prop `effect`: `"soul-fire"` (`THREE.Points` de fuego azul alrededor) o `"cherry-petals"` (`InstancedMesh` de quads que voltean en 3D; textura = los 12 fotogramas de la partícula `cherry_N` sacados en runtime de un client jar 1.20+ cacheado vía `mc:get-cherry-petal-frames`, con fallback a un pétalo pixel-art dibujado si no hay jar); gestor de skins usa cherry-petals), `skin-manager-panel.tsx`, `changelog-dialog.tsx`, `ui/*` (shadcn).

## Modelo de datos

Cada modpack se publica como `modpacks/{id}/manifest.json` (schemaVersion 2) en un repo privado de GitHub (`tomaamns-glitch/Modpacks`), con la lista de archivos (ruta/hash/tamaño). Los objetos (los archivos en sí) se suben como assets de una GitHub Release etiquetada `{modpackId}-objects`, nombrados por su hash SHA-256. Los objetos se cachean globalmente en el equipo por hash (`~/.alaunchi/objects` o similar), no por instancia.

## Cosas importantes que ya se rompieron una vez (no reintroducir)

1. **Java por versión mayor**: nunca usar una única JRE global — cada modloader/versión de MC puede necesitar una Java distinta. Ver `getJavaPathForMajor`/`installJavaMajor` en `main.js`.
2. **DNS IPv4 primero**: `dns.setDefaultResultOrder("ipv4first")` está puesto en `main.js` porque la red de desarrollo tiene IPv6 inestable (causaba `ETIMEDOUT` intermitentes). No quitarlo sin motivo.
3. **Forge legado**: los instaladores de Forge pre-1.13 no tienen `install_profile.json#libraries` — las librerías reales están en `versionJson.libraries`. Si solo se descarga de `installProfile.libraries`, no se descarga nada para esos modpacks.
4. **Descargas resilientes**: `mc:install-snapshot` recopila TODOS los objetos que fallan antes de lanzar el error, en vez de abortar en el primer 404 — así se ve el problema completo de una vez.
5. **Publicación resiliente**: `publishModpackUpdate` verifica que los archivos "sin cambios" (heredados de la publicación anterior) sigan existiendo de verdad en GitHub antes de publicar — si no, bloquea con la lista exacta de lo que falta. Los archivos "sin cambios" nunca se re-suben solos (no se tienen sus bytes en el editor).
6. **`logs/`, `crash-reports/`, `.curseclient`** se excluyen por defecto al arrastrar carpetas/archivos al panel de admin — son basura de partidas jugadas, no contenido del modpack.
7. **CurseForge**: se investigó añadir soporte pero se aparcó — requiere solicitar una API key aprobada por Overwolf (proceso manual, no inmediato). Si se retoma, la key nunca debe vivir en el renderer (hay que proxearla desde `main.js`, igual que con las texturas de Mojang).
8. **Servicios de terceros para skins pueden caerse** (le pasó a Crafatar en esta sesión — devolvía el skin de Steve genérico por error 500 silencioso). El gestor de skins real usa el proxy propio de texturas de Mojang (`mc:fetch-texture-b64`) precisamente para no depender de un espejo externo.
9. **Modelos glTF del visor animado son GPL-3.0**: `src/assets/models/{classic,slim}-player.gltf` (geometría + clips `idle`/`idle_sub_*`/`interact`) vienen de `modrinth/code` (`packages/assets`), GPL-3.0-only — ver `src/assets/models/NOTICE.md`. Distribuir ALaunchi con estos archivos obliga a ofrecer el código fuente a quien reciba el binario. Si algún día ALaunchi tiene que ir con otra licencia, hay que sustituirlos (export propio de Blockbench, o un rig CC0/CC-BY); el componente no depende de nada más de Modrinth.
10. **Bucle de render de three.js**: `skin-viewer-animated.tsx` NO debe puentear el `mixer.update()` con `if (!document.hidden)` — `requestAnimationFrame` ya se pausa solo cuando la ventana no es visible, y ese check extra congelaba la animación en navegadores automatizados (y podría hacerlo en la app). En su lugar se hace `Math.min(clock.getDelta(), 0.1)` para que el primer frame tras una pausa no dé un salto.
11. **Materiales compartidos en el glTF de skins**: los 12 meshes del cuerpo del modelo apuntan al MISMO material ("Mat") en el archivo. `gltf.scene.clone(true)` NO clona materiales. Si no se hace `isolateMaterials()` (clonar el material de cada mesh) tras clonar, la textura de skin y los ajustes por-mesh se pisan entre partes y entre TODOS los visores montados a la vez → todos muestran la misma skin. Y `disposeModel()` no debe tocar la geometría (es compartida con el glTF cacheado en `modelCache`).

## Flujo de desarrollo

```bash
npm install
npm run electron:dev   # Vite + Electron en modo dev, con HMR
npm run typecheck      # tsc --noEmit
```

Tras tocar `electron/main.js` o `electron/preload.js` hace falta reiniciar la app entera (Electron no hace hot-reload de esos archivos); los cambios en `src/` sí aplican con HMR en caliente.
