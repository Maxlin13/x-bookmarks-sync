import { requestUrl, TFile, TFolder, Vault } from "obsidian";
import { LOG_PREFIX, MediaTweet } from "./types";

const ALLOWED_EXT = new Set(["jpg", "jpeg", "png", "gif", "webp", "avif", "bmp"]);

/** url remota → ruta local dentro del vault */
export type UrlMap = Map<string, string>;

function safeExt(url: string): string {
  try {
    const parts = new URL(url).pathname.split(".");
    if (parts.length > 1) {
      const ext = parts.pop()!.toLowerCase().split("?")[0];
      if (ALLOWED_EXT.has(ext)) return `.${ext}`;
    }
  } catch {
    /* URL inválida: se queda sin extensión */
  }
  return "";
}

export async function ensureFolder(vault: Vault, path: string): Promise<boolean> {
  if (!path) return false;
  let current = "";
  for (const part of path.split("/").filter(Boolean)) {
    current += (current ? "/" : "") + part;
    const existing = vault.getAbstractFileByPath(current);
    if (existing instanceof TFolder) continue;
    if (existing instanceof TFile) {
      console.error(LOG_PREFIX, "un archivo bloquea la carpeta", current);
      return false;
    }
    await vault.createFolder(current);
  }
  return vault.getAbstractFileByPath(path) instanceof TFolder;
}

async function downloadOne(url: string, absPath: string, vault: Vault): Promise<string | null> {
  try {
    const existing = vault.getAbstractFileByPath(absPath);
    if (existing instanceof TFile && existing.stat.size > 0) return absPath;

    const resp = await requestUrl({ url, method: "GET" });
    await vault.createBinary(absPath, resp.arrayBuffer);
    console.debug(LOG_PREFIX, "descargado", absPath, `(${resp.arrayBuffer.byteLength} bytes)`);
    return absPath;
  } catch (e) {
    console.warn(LOG_PREFIX, "falló la descarga", url, e);
    return null;
  }
}

interface DownloadJob {
  url: string;
  absPath: string;
}

async function runJobs(jobs: DownloadJob[], vault: Vault, concurrency: number): Promise<UrlMap> {
  const map: UrlMap = new Map();
  let next = 0;

  const worker = async (): Promise<void> => {
    while (next < jobs.length) {
      const job = jobs[next++];
      const local = await downloadOne(job.url, job.absPath, vault);
      if (local) map.set(job.url, local);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, jobs.length) }, () => worker()),
  );
  return map;
}

export function tweetHasMedia(tweet: MediaTweet): boolean {
  return Boolean(
    tweet.images?.length ||
      tweet.videoPosters?.length ||
      tweet.quoted?.images?.length ||
      tweet.quoted?.videoPosters?.length,
  );
}

/**
 * Descarga todos los medios de un tweet (incluidos los del tweet citado).
 * Devuelve solo las descargas exitosas: lo que falle conserva su URL remota.
 */
export async function downloadTweetMedia(
  vault: Vault,
  tweet: MediaTweet,
  destDir: string,
  concurrency = 3,
): Promise<UrlMap> {
  const jobs: DownloadJob[] = [];
  const seen = new Set<string>();

  const add = (urls: string[] | undefined, kind: string): void => {
    (urls ?? []).forEach((url, i) => {
      if (!url || seen.has(url)) return;
      seen.add(url);
      jobs.push({ url, absPath: `${destDir}/${tweet.id}_${kind}_${i}${safeExt(url)}` });
    });
  };

  add(tweet.images, "img");
  add(tweet.videoPosters, "poster");
  add(tweet.quoted?.images, "qimg");
  add(tweet.quoted?.videoPosters, "qposter");

  return jobs.length ? runJobs(jobs, vault, concurrency) : new Map();
}

/**
 * Sustituye en el Markdown ya generado cada `![](url-remota)` por `![[ruta-local]]`.
 * Si el upstream cambia el formato de embed, esto simplemente no encuentra nada:
 * las imágenes quedan descargadas pero la nota sigue apuntando a la URL remota.
 */
export function applyLocalEmbeds(markdown: string, map: UrlMap): string {
  let out = markdown;
  for (const [remote, local] of map) {
    const token = `![](${remote})`;
    if (out.includes(token)) {
      out = out.split(token).join(`![[${local}]]`);
    } else {
      console.warn(LOG_PREFIX, "no se encontró el embed esperado para", remote);
    }
  }
  return out;
}