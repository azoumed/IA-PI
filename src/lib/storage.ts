import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Les fichiers sont stockés dans ./storage (à monter sur un volume persistant et sauvegardé).
const ROOT = path.join(process.cwd(), "storage");

export function sha256(buf: Uint8Array) {
  return createHash("sha256").update(buf).digest("hex");
}

/** Enregistre un fichier dans le stockage local et renvoie son chemin relatif. */
export async function saveFile(folder: string, originalName: string, data: Uint8Array) {
  const safeFolder = folder.replace(/[^\w/\-]+/g, "_").replace(/\.\./g, "");
  await mkdir(path.join(process.cwd(), "storage", safeFolder), { recursive: true });
  const safe = originalName.replace(/[^\w.\-]+/g, "_").slice(-80);
  const rel = `${safeFolder}/${randomUUID().slice(0, 8)}_${safe}`;
  await writeFile(path.join(process.cwd(), "storage", rel), data);
  return rel;
}

export async function readStored(rel: string) {
  const full = path.join(process.cwd(), "storage", rel);
  if (!full.startsWith(ROOT + path.sep)) throw new Error("Chemin invalide");
  return readFile(full);
}
