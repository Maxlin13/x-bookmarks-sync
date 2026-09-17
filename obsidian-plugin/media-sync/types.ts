/**
 * Tipos estructurales propios del fork.
 * No importamos nada de ../types.ts a propósito: así los cambios de nombre o de
 * forma en el upstream no rompen la compilación de este módulo.
 */

export interface QuotedMedia {
  images?: string[];
  videoPosters?: string[];
}

export interface MediaTweet {
  id: string;
  url?: string;
  images?: string[];
  videoPosters?: string[];
  quoted?: QuotedMedia | null;
}

export interface MediaSyncSettings {
  downloadMedia: boolean;
  mediaSubfolder: string;
}

export const DEFAULT_MEDIA_SETTINGS: MediaSyncSettings = {
  downloadMedia: false,
  mediaSubfolder: "assets",
};

/** Clave bajo la que guardamos nuestro bloque dentro de data.json. */
export const MEDIA_SETTINGS_KEY = "mediaSync";

export const LOG_PREFIX = "[x-bookmarks-sync:media]";

/** Superficie mínima del plugin anfitrión que este módulo necesita. */
export interface HostPlugin {
  app: import("obsidian").App;
  manifest: { id: string };
  settings: { defaultFolder: string };
  loadData(): Promise<Record<string, unknown> | null>;
  saveData(data: unknown): Promise<void>;
  saveSettings(): Promise<void>;
  isTweetImported(tweet: MediaTweet): boolean;
  saveBookmarksToVault(bookmarks: MediaTweet[]): Promise<void>;
  formatTweet(tweet: MediaTweet): string;
  addCommand(command: import("obsidian").Command): unknown;
}