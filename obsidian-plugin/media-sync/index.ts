import { Plugin } from "obsidian";
import {
  downloadTweetMedia,
  ensureFolder,
  tweetHasMedia,
  UrlMap,
} from "./downloader";
import { applyLocalEmbeds } from "./downloader";
import {
  MediaSyncState,
  patchSaveSettings,
  patchSettingsTab,
  registerMediaCommands,
} from "./settings";
import { HostPlugin, LOG_PREFIX, MediaTweet } from "./types";
import { backfillExistingMedia } from "./backfill";
import { repairMediaFilenames } from "./repair";

/**
 * Envuelve saveBookmarksToVault() y formatTweet() sin reescribirlos:
 * descargamos antes de delegar, y reescribimos los embeds del Markdown que devuelve.
 */
function patchImportPipeline(plugin: HostPlugin, state: MediaSyncState): void {
  const originalSave = plugin.saveBookmarksToVault.bind(plugin);
  const originalFormat = plugin.formatTweet.bind(plugin);

  /** Válido solo durante una importación: id de tweet → mapa de reescrituras. */
  const pending = new Map<string, UrlMap>();

  plugin.saveBookmarksToVault = async (bookmarks: MediaTweet[]): Promise<void> => {
    pending.clear();

    if (state.settings.downloadMedia) {
      const destDir = `${plugin.settings.defaultFolder}/${state.settings.mediaSubfolder}`;
      const vault = plugin.app.vault;
      let folderReady = false;

      for (const tweet of bookmarks) {
        if (plugin.isTweetImported(tweet) || !tweetHasMedia(tweet)) continue;

        if (!folderReady) {
          folderReady = await ensureFolder(vault, destDir);
          if (!folderReady) {
            console.error(LOG_PREFIX, "no se pudo crear", destDir, "— se importa sin descargar");
            break;
          }
        }

        try {
          const map = await downloadTweetMedia(vault, tweet, destDir);
          if (map.size) pending.set(tweet.id, map);
        } catch (e) {
          console.warn(LOG_PREFIX, "error descargando medios de", tweet.id, e);
        }
      }
    }

    try {
      await originalSave(bookmarks);
    } finally {
      pending.clear();
    }
  };

  plugin.formatTweet = (tweet: MediaTweet): string => {
    const markdown = originalFormat(tweet);
    const map = pending.get(tweet.id);
    return map ? applyLocalEmbeds(markdown, map) : markdown;
  };
}

/**
 * Punto de entrada único del fork. Llamar como última línea de onload().
 * Cualquier fallo aquí no debe tumbar el plugin base.
 */
export async function installMediaSync(plugin: Plugin): Promise<void> {
  try {
    const host = plugin as unknown as HostPlugin;
    const state = await MediaSyncState.load(host);
    patchSaveSettings(host, state);
    patchSettingsTab(host, state);
    patchImportPipeline(host, state);
    registerMediaCommands(host, state);
    host.addCommand({
      id: "backfill-media-download",
      name: "Redownload media in existing notes",
      callback: () => void backfillExistingMedia(host, state.settings),
    });
    host.addCommand({
      id: "repair-media-filenames",
      name: "Repair broken media filenames",
      callback: () => void repairMediaFilenames(host),
    });
    console.debug(LOG_PREFIX, "instalado");
  } catch (e) {
    console.error(LOG_PREFIX, "no se pudo instalar el módulo de medios", e);
  }
}