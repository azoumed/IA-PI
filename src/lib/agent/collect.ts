import "server-only";
import { createHash } from "node:crypto";

const UA = "VeillePI-Maroc/1.0 (outil interne de cabinet ; contact via le site du cabinet)";

export type FetchResult = { ok: true; body: string; hash: string } | { ok: false; error: string };

export async function fetchPage(url: string): Promise<FetchResult> {
  try {
    const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const body = await res.text();
    return { ok: true, body, hash: createHash("sha256").update(body).digest("hex") };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Repère les liens vers des fichiers PDF dans une page HTML (catalogues publiés). */
export function findPdfLinks(html: string, baseUrl: string) {
  const links = new Map<string, string>();
  const re = /<a\b[^>]*href\s*=\s*["']([^"']+\.pdf(?:\?[^"']*)?)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const url = new URL(m[1], baseUrl).toString();
      const label = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (!links.has(url)) links.set(url, label || decodeURIComponent(url.split("/").pop() ?? url));
    } catch {
      /* lien invalide ignoré */
    }
  }
  return [...links].map(([url, label]) => ({ url, label }));
}

export async function downloadPdf(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`Téléchargement impossible (HTTP ${res.status})`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.length > 200 * 1024 * 1024) throw new Error("Fichier trop volumineux (> 200 Mo)");
  if (String.fromCharCode(...buf.slice(0, 4)) !== "%PDF") throw new Error("Le fichier téléchargé n'est pas un PDF");
  return buf;
}
