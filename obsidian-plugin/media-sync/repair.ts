import { Notice, TFile, TFolder, Vault } from "obsidian";
import { HostPlugin, LOG_PREFIX } from "./types";

// Coincide con los wikilinks rotos que dejó el backfill: ![[.../nombre.jpg-1]]
const BROKEN_EMBED = /!\[\[([^\]]+\.(?:jpg|jpeg|png|gif|webp|avif|bmp)-\d+)\]\]/gi;

/** "AbCd1234.jpg-1" -> "AbCd1234.jpg" (el -N es un sobrante, el nombre ya era único) */
function fixExtension(path: string): string {
  return path.replace(/(\.(?:jpg|jpeg|png|gif|webp|avif|bmp))-\d+$/i, "$1");
}

function collectMarkdownFiles(vault: Vault, folderPath: string): TFile[] {
  const root = vault.getAbstractFileByPath(folderPath);
  if (!(root instanceof TFolder)) return [];
  const out: TFile[] = [];
  const walk = (folder: TFolder): void => {
    for (const child of folder.children) {
      if (child instanceof TFolder) walk(child);
      else if (child instanceof TFile && child.extension === "md") out.push(child);
    }
  };
  walk(root);
  return out;
}

async function uniquePath(vault: Vault, path: string): Promise<string> {
  if (!vault.getAbstractFileByPath(path)) return path;
  const dot = path.lastIndexOf(".");
  const base = dot === -1 ? path : path.slice(0, dot);
  const ext = dot === -1 ? "" : path.slice(dot);
  let n = 1;
  let candidate = `${base}-${n}${ext}`;
  while (vault.getAbstractFileByPath(candidate)) {
    n++;
    candidate = `${base}-${n}${ext}`;
  }
  return candidate;
}

export async function repairMediaFilenames(plugin: HostPlugin): Promise<void> {
  const vault = plugin.app.vault;
  const files = collectMarkdownFiles(vault, plugin.settings.defaultFolder);
  if (!files.length) {
    new Notice("Media sync: no hay notas para revisar");
    return;
  }

  const renamed = new Map<string, string>(); // ruta rota -> ruta ya corregida
  let filesTouched = 0;
  let renameCount = 0;
  let failCount = 0;

  new Notice(`Media sync: reparando nombres en ${files.length} notas...`);

  for (const file of files) {
    const content = await vault.read(file);
    const matches = Array.from(content.matchAll(BROKEN_EMBED));
    if (!matches.length) continue;

    let updated = content;
    let touched = false;

    for (const match of matches) {
      const oldLinkPath = match[1];

      if (!renamed.has(oldLinkPath)) {
        const abstract = vault.getAbstractFileByPath(oldLinkPath);
        if (!(abstract instanceof TFile)) {
          console.warn(LOG_PREFIX, "no se encontró el archivo a reparar:", oldLinkPath);
          failCount++;
          continue;
        }
        const desired = fixExtension(oldLinkPath);
        let finalPath = oldLinkPath;
        if (desired !== oldLinkPath) {
          finalPath = await uniquePath(vault, desired);
          try {
            await vault.rename(abstract, finalPath);
            renameCount++;
          } catch (e) {
            console.error(LOG_PREFIX, "no se pudo renombrar", oldLinkPath, e);
            failCount++;
            continue;
          }
        }
        renamed.set(oldLinkPath, finalPath);
      }

      const finalPath = renamed.get(oldLinkPath)!;
      if (finalPath !== oldLinkPath) {
        updated = updated.split(`![[${oldLinkPath}]]`).join(`![[${finalPath}]]`);
        touched = true;
      }
    }

    if (touched) {
      await vault.modify(file, updated);
      filesTouched++;
    }
  }

  console.info(
    LOG_PREFIX,
    `repair: ${renameCount} archivos renombrados, ${filesTouched} notas actualizadas, ${failCount} fallos`,
  );
  new Notice(
    `Media sync: ${renameCount} archivos renombrados en ${filesTouched} notas` +
      (failCount ? ` (${failCount} fallos, revisa la consola)` : ""),
  );
}