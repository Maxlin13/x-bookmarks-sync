import { App, Notice, TFile, TFolder, Vault } from "obsidian";
import { downloadOne, safeExt } from "./downloader";
import { HostPlugin, LOG_PREFIX, MediaSyncSettings } from "./types";

// Coincide con los embeds remotos que genera el plugin: ![](https://...twimg.com/...)
const REMOTE_EMBED = /!\[\]\((https:\/\/[^)\s]*twimg\.com[^)\s]*)\)/g;

function sanitize(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 60);
  return cleaned || "note";
}

/** Prefiere el id del tweet (frontmatter, numérico) sobre el nombre de archivo. */
function baseNameFor(app: App, file: TFile): string {
  const fm = app.metadataCache.getFileCache(file)?.frontmatter;
  const id = fm && fm.id != null ? String(fm.id) : "";
  return sanitize(id || file.basename);
}

function collectMarkdownFiles(vault: Vault, folderPath: string, excludeSubfolder: string): TFile[] {
  const root = vault.getAbstractFileByPath(folderPath);
  if (!(root instanceof TFolder)) return [];

  const excludePath = `${folderPath}/${excludeSubfolder}`;
  const out: TFile[] = [];

  const walk = (folder: TFolder): void => {
    for (const child of folder.children) {
      if (child.path === excludePath) continue;
      if (child instanceof TFolder) walk(child);
      else if (child instanceof TFile && child.extension === "md") out.push(child);
    }
  };
  walk(root);
  return out;
}

async function backfillFile(
  app: App,
  file: TFile,
  mediaDir: string,
): Promise<{ downloaded: number; failed: number }> {
  const vault = app.vault;
  const content = await vault.read(file);
  const matches = Array.from(content.matchAll(REMOTE_EMBED));
  if (!matches.length) return { downloaded: 0, failed: 0 };

  const base = baseNameFor(app, file);
  const seen = new Map<string, string>(); // url remota -> ruta local
  let downloaded = 0;
  let failed = 0;
  let index = 0;

  for (const match of matches) {
    const url = match[1];
    if (seen.has(url)) continue;
    index++;
    const absPath = `${mediaDir}/${base}_media_${index}${safeExt(url)}`;
    const local = await downloadOne(url, absPath, vault);
    if (local) {
      seen.set(url, local);
      downloaded++;
    } else {
      failed++;
    }
  }

  if (seen.size) {
    let updated = content;
    for (const [url, local] of seen) {
      updated = updated.split(`![](${url})`).join(`![[${local}]]`);
    }
    await vault.modify(file, updated);
  }

  return { downloaded, failed };
}

export async function backfillExistingMedia(
  plugin: HostPlugin,
  settings: MediaSyncSettings,
): Promise<void> {
  const vault = plugin.app.vault;
  const targetFolder = plugin.settings.defaultFolder;
  const mediaDir = `${targetFolder}/${settings.mediaSubfolder}`;

  const files = collectMarkdownFiles(vault, targetFolder, settings.mediaSubfolder);
  if (!files.length) {
    new Notice("Media sync: no hay notas para revisar");
    return;
  }

  const { ensureFolder } = await import("./downloader");
  await ensureFolder(vault, mediaDir);

  let totalDownloaded = 0;
  let totalFailed = 0;
  let filesTouched = 0;

  new Notice(`Media sync: revisando ${files.length} notas...`);

  for (const file of files) {
    try {
      const { downloaded, failed } = await backfillFile(plugin.app, file, mediaDir);
      if (downloaded) filesTouched++;
      totalDownloaded += downloaded;
      totalFailed += failed;
    } catch (e) {
      console.error(LOG_PREFIX, "backfill falló en", file.path, e);
    }
  }

  console.info(
    LOG_PREFIX,
    `backfill: ${totalDownloaded} descargados, ${totalFailed} fallidos, ${filesTouched} notas actualizadas`,
  );
  new Notice(
    `Media sync: ${totalDownloaded} archivos descargados en ${filesTouched} notas` +
      (totalFailed ? ` (${totalFailed} fallaron, revisa la consola)` : ""),
  );
}