import { Notice, PluginSettingTab, Setting } from "obsidian";
import {
  DEFAULT_MEDIA_SETTINGS,
  HostPlugin,
  LOG_PREFIX,
  MEDIA_SETTINGS_KEY,
  MediaSyncSettings,
} from "./types";

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

  async save(): Promise<void> {
    const data = (await this.plugin.loadData()) ?? {};
    data[MEDIA_SETTINGS_KEY] = { ...this.settings };
    await this.plugin.saveData(data);
  }
}

export function patchSaveSettings(plugin: HostPlugin, state: MediaSyncState): void {
  const original = plugin.saveSettings.bind(plugin);
  plugin.saveSettings = async (): Promise<void> => {
    await original();
    await state.save();
  };
}

function buildMediaDefinitions(state: MediaSyncState): unknown[] {
  return [
    {
      name: "Download media",
      desc: "Guarda imágenes y miniaturas de vídeo en el vault y usa embeds ![[...]] en vez de URLs remotas.",
      render: (setting: Setting) => {
        setting.addToggle((toggle) =>
          toggle.setValue(state.settings.downloadMedia).onChange(async (value) => {
            state.settings.downloadMedia = value;
            await state.save();
          }),
        );
      },
    },
    {
      name: "Media folder",
      desc: "Subcarpeta, dentro de la carpeta de bookmarks, donde se guardan los medios.",
      render: (setting: Setting) => {
        setting.addText((text) =>
          text
            .setPlaceholder("assets")
            .setValue(state.settings.mediaSubfolder)
            .onChange(async (value) => {
              state.settings.mediaSubfolder =
                value.trim().replace(/^\/+|\/+$/g, "") || DEFAULT_MEDIA_SETTINGS.mediaSubfolder;
              await state.save();
            }),
        );
      },
    },
  ];
}

function findSettingTab(plugin: HostPlugin): PluginSettingTab | null {
  const own = (plugin as unknown as { settingTab?: PluginSettingTab }).settingTab;
  if (own) return own;

  const setting = (plugin.app as unknown as { setting?: { pluginTabs?: PluginSettingTab[] } }).setting;
  const tabs = setting?.pluginTabs ?? [];
  return tabs.find((tab) => (tab as unknown as { id?: string }).id === plugin.manifest.id) ?? null;
}

export function patchSettingsTab(plugin: HostPlugin, state: MediaSyncState): void {
  const tab = findSettingTab(plugin);
  if (!tab) {
    console.warn(LOG_PREFIX, "no se encontró la pestaña de ajustes; usa el comando de la paleta");
    return;
  }

  const anyTab = tab as unknown as { getSettingDefinitions?: () => unknown[] };
  if (typeof anyTab.getSettingDefinitions !== "function") {
    console.warn(LOG_PREFIX, "la pestaña no expone getSettingDefinitions(); usa el comando de la paleta");
    return;
  }

  const original = anyTab.getSettingDefinitions.bind(anyTab);
  anyTab.getSettingDefinitions = (): unknown[] => [...original(), ...buildMediaDefinitions(state)];
}

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