# Fork changelog — media-sync

Registro de los cambios específicos de este fork, separado del
`CHANGELOG.md` del proyecto original para no generar conflictos al
hacer `git rebase upstream/main`. Solo dos líneas de `main.ts` tocan
código upstream (ver README); todo lo demás vive en
`obsidian-plugin/media-sync/`.

## 1.0.0 — basado en upstream 1.4.1

### Añadido
- Módulo `media-sync`: descarga localmente las imágenes y miniaturas
  de vídeo de cada bookmark (incluidas las del tweet citado) en vez
  de dejarlas como enlaces al CDN de X, y reescribe la nota con
  embeds `![[...]]`.
- Ajuste **Download media** (toggle) y **Media folder** (subcarpeta,
  por defecto `assets`) en la pestaña de ajustes del plugin.
- Comando **Toggle media download** — alterna la descarga sin pasar
  por la UI de ajustes.
- Comando **Redownload media in existing notes** — recorre las notas
  ya importadas y descarga los medios que sigan como enlace remoto,
  reescribiendo la nota.
- Comando **Repair broken media filenames** — corrige los nombres de
  archivo mal formados (`.jpg-1` en vez de `.jpg`) que dejó una
  primera pasada de backfill antes de este fix, sin volver a
  descargar nada.

### Notas técnicas
- Todo el módulo funciona parcheando en tiempo de ejecución
  `saveBookmarksToVault`, `formatTweet` y `getSettingDefinitions` del
  plugin base — no se modifica `types.ts`, `view.ts`,
  `settings-tab.ts`, `quoted.ts`, `modal.ts` ni `manifest.json`.
- Los ajustes del módulo se guardan bajo la clave `mediaSync` en
  `data.json`, separados de las settings del plugin base.
- Descargas fallidas conservan la URL remota (nunca se pierde un
  medio por un error de red); los avisos van a consola con el
  prefijo `[x-bookmarks-sync:media]`.

### Limitaciones conocidas
- El embed de pósters de vídeo queda anidado
  (`[![[local]]](videoUrl)`), que no es sintaxis de link válida — la
  imagen se ve, pero el enlace "reproducir vídeo" sobre la miniatura
  no funciona. Pendiente de arreglo.