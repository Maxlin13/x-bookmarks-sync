import { Notice, PluginSettingTab, Setting } from "obsidian";
import {
  DEFAULT_MEDIA_SETTINGS,
  HostPlugin,
  LOG_PREFIX,
  MEDIA_SETTINGS_KEY,
  MediaSyncSettings,
} from "./types";

/**
 * Estado persistido en data.json bajo `mediaSync`.
 * Vive aparte de plugin.settings porque el onload() del upstream reconstruye ese
 * objeto clave por clave y descartaría cualquier campo que no conozca.
 */
export class MediaSyncState {
  private constructor(
    private readonly plugin: HostPlugin,
    public readonly settings: MediaSyncSettings,
  ) {}

  static async load(plugin: HostPlugin): Promise<MediaSyncState> {
    const data = (await plugin.loadData()) ?? {};
    const stored = (data[MEDIA_SETTINGS_KEY] ?? {}) as Partial<MediaSyncSettings>;
    return new MediaSyncState(plugin, {
      downloadMedia: stored.downloadMedia ?? DEFAULT_MEDIA_SETTINGS.downloadMedia,
      mediaSubfolder: stored.mediaSubfolder || DEFAULT_MEDIA_SETTINGS.mediaSubfolder,
    });
  }

  /** Reinyecta nuestro bloque en data.json sin tocar el resto. */
  async save(): Promise<void> {
    const data = (await this.plugin.loadData()) ?? {};
    data[MEDIA_SETTINGS_KEY] = { ...this.settings };
    await this.plugin.saveData(data);
  }
}

/** Tras cada saveSettings() del upstream, volvemos a escribir nuestro bloque. */
export function patchSaveSettings(plugin: HostPlugin, state: MediaSyncState): void {
  const original = plugin.saveSettings.bind(plugin);
  plugin.saveSettings = async (): Promise<void> => {
    await original();
    await state.save();
  };
}

function renderMediaSettings(containerEl: HTMLElement, state: MediaSyncState): void {
  new Setting(containerEl)
    .setName("Download media")
    .setDesc(
      "Guarda imágenes y miniaturas de vídeo en el vault y usa embeds ![[...]] en vez de URLs remotas.",
    )
    .addToggle((toggle) =>
      toggle.setValue(state.settings.downloadMedia).onChange(async (value) => {
        state.settings.downloadMedia = value;
        await state.save();
      }),
    );

  new Setting(containerEl)
    .setName("Media folder")
    .setDesc("Subcarpeta, dentro de la carpeta de bookmarks, donde se guardan los medios.")
    .addText((text) =>
      text
        .setPlaceholder("assets")
        .setValue(state.settings.mediaSubfolder)
        .onChange(async (value) => {
          state.settings.mediaSubfolder =
            value.trim().replace(/^\/+|\/+$/g, "") || DEFAULT_MEDIA_SETTINGS.mediaSubfolder;
          await state.save();
        }),
    );
}

function findSettingTab(plugin: HostPlugin): PluginSettingTab | null {
  const setting = (plugin.app as unknown as { setting?: { pluginTabs?: PluginSettingTab[] } }).setting;
  const tabs = setting?.pluginTabs ?? [];
  const match = tabs.find(
    (tab) => (tab as unknown as { id?: string }).id === plugin.manifest.id,
  );
  return match ?? null;
}

/**
 * Añade los dos ajustes al final de la pestaña existente, sin editar settings-tab.ts.
 * Si no se encuentra la pestaña, el comando de respaldo sigue permitiendo activarlo.
 */
export function patchSettingsTab(plugin: HostPlugin, state: MediaSyncState): void {
  const tab = findSettingTab(plugin);
  if (!tab) {
    console.warn(LOG_PREFIX, "no se encontró la pestaña de ajustes; se usará solo el comando");
    return;
  }

  const originalDisplay = tab.display.bind(tab);
  tab.display = (): void => {
    originalDisplay();
    try {
      renderMediaSettings(tab.containerEl, state);
    } catch (e) {
      console.error(LOG_PREFIX, "no se pudieron pintar los ajustes de medios", e);
    }
  };
}

/** Respaldo, y atajo cómodo: alternar la descarga desde la paleta de comandos. */
export function registerMediaCommands(plugin: HostPlugin, state: MediaSyncState): void {
  plugin.addCommand({
    id: "toggle-media-download",
    name: "Toggle media download",
    callback: () => {
      state.settings.downloadMedia = !state.settings.downloadMedia;
      void state.save();
      new Notice(
        `Descarga de medios: ${state.settings.downloadMedia ? "activada" : "desactivada"}`,
      );
    },
  });
}