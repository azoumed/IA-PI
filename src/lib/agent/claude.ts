import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

export const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5";

/**
 * Repli côté serveur si le modèle décline une requête pour raison de politique :
 * l'API relance automatiquement sur le modèle de repli par défaut.
 */
const FALLBACK = { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };

let client: Anthropic | null = null;
export function hasApiKey() {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}
export function getClient() {
  if (!hasApiKey()) throw new Error("ANTHROPIC_API_KEY non configurée");
  client ??= new Anthropic();
  return client;
}

// ---------------------------------------------------------------------------
// 1. Extraction des demandes publiées dans un extrait de catalogue PDF
// ---------------------------------------------------------------------------

const EntrySchema = z.object({
  applicationNumber: z.string().describe("Numéro de la demande / du dépôt, tel qu'imprimé"),
  markName: z.string().describe("Dénomination de la marque en caractères latins ; si la marque est uniquement en arabe, une translittération latine"),
  markNameAr: z.string().nullable().describe("Dénomination en arabe si elle figure, sinon null"),
  figurative: z.boolean().describe("true si la marque comporte un élément figuratif (logo)"),
  applicant: z.string().nullable(),
  applicantAddress: z.string().nullable(),
  representative: z.string().nullable().describe("Mandataire, s'il est indiqué"),
  niceClasses: z.array(z.number().int()).describe("Classes de Nice revendiquées"),
  goodsServices: z.string().nullable().describe("Liste des produits et services, résumée si très longue"),
  filingDate: z.string().nullable().describe("Date de dépôt au format AAAA-MM-JJ"),
  international: z.boolean().describe("true pour un enregistrement international désignant le Maroc"),
  page: z.number().int().nullable().describe("Numéro de page dans le fichier PDF complet"),
});

const ExtractionSchema = z.object({
  catalogIssueRef: z.string().nullable().describe("Numéro ou référence du catalogue s'il apparaît"),
  catalogPublicationDate: z.string().nullable().describe("Date de publication du catalogue AAAA-MM-JJ si elle apparaît"),
  entries: z.array(EntrySchema),
});

export type ExtractedEntry = z.infer<typeof EntrySchema>;
export type Extraction = z.infer<typeof ExtractionSchema>;

const EXTRACTION_SYSTEM = `Tu extrais les demandes d'enregistrement de marques publiées dans le Catalogue officiel des marques de l'OMPIC (Maroc).
Le document peut être en français, en arabe ou bilingue. Recopie fidèlement les numéros, noms et classes ; n'invente rien.
Si un champ est absent ou illisible, mets null (ou une liste vide pour les classes). Ignore les pages de couverture, sommaires et avis généraux.
Une demande qui commence sur une page et continue sur la suivante doit apparaître une seule fois.`;

export async function extractCatalogChunk(pdfBase64: string, firstPage: number, lastPage: number): Promise<Extraction> {
  const response = await getClient().beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    ...FALLBACK,
    output_config: { effort: "medium", format: betaZodOutputFormat(ExtractionSchema) },
    system: EXTRACTION_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
          {
            type: "text",
            text: `Cet extrait correspond aux pages ${firstPage} à ${lastPage} du catalogue complet. Pour le champ "page", donne le numéro dans le catalogue complet (la première page de l'extrait est la page ${firstPage}). Extrais toutes les demandes publiées.`,
          },
        ],
      },
    ],
  });
  if (response.stop_reason === "refusal") throw new Error("Extraction refusée par le modèle");
  if (!response.parsed_output) throw new Error(`Réponse d'extraction illisible (stop_reason=${response.stop_reason})`);
  return response.parsed_output;
}

// ---------------------------------------------------------------------------
// 2. Analyse juridique préliminaire des rapprochements (bilingue)
// ---------------------------------------------------------------------------

const ReviewSchema = z.object({
  reviews: z.array(
    z.object({
      candidateId: z.string(),
      relevant: z.boolean().describe("false si le rapprochement est manifestement sans intérêt (homonymie fortuite, produits sans lien)"),
      riskLevel: z.enum(["faible", "moyen", "élevé"]),
      whyFr: z.string().describe("Pourquoi l'alerte apparaît : 1 à 3 phrases factuelles (nom, prononciation, produits)"),
      whyAr: z.string().describe("Même explication en arabe"),
      actionFr: z.string().describe("Action envisagée : étude d'opposition, demande de document, vérification du statut…"),
      actionAr: z.string(),
    }),
  ),
});

export type ReviewCandidate = {
  candidateId: string;
  client: string;
  clientMark: { name: string; nameAr: string | null; classes: number[]; goodsServices: string | null };
  published: {
    number: string;
    name: string;
    nameAr: string | null;
    applicant: string | null;
    classes: number[];
    goodsServices: string | null;
  };
  automaticScore: number;
  signals: string[];
};

export async function reviewCandidates(cands: ReviewCandidate[]) {
  if (!cands.length) return [];
  const response = await getClient().beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    ...FALLBACK,
    output_config: { effort: "medium", format: betaZodOutputFormat(ReviewSchema) },
    system: `Tu assistes un avocat marocain en propriété industrielle. Pour chaque rapprochement entre une marque d'un client et une demande publiée au Catalogue officiel de l'OMPIC, rédige une analyse préliminaire en français et en arabe.
Tiens compte de la similitude visuelle, phonétique et intellectuelle des signes, et de la similarité des produits et services (classes de Nice).
Ton analyse est un signal pour l'examen juridique : ne conclus jamais à une contrefaçon ou à une atteinte certaine, et reste factuel et concis.`,
    messages: [{ role: "user", content: `Rapprochements à analyser :\n${JSON.stringify(cands, null, 2)}` }],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) return [];
  return response.parsed_output.reviews;
}

// ---------------------------------------------------------------------------
// 3. Résumé bilingue d'un passage de l'agent
// ---------------------------------------------------------------------------

const SummarySchema = z.object({ fr: z.string(), ar: z.string() });

export async function summarizeRun(facts: unknown) {
  const response = await getClient().beta.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    ...FALLBACK,
    output_config: { effort: "low", format: betaZodOutputFormat(SummarySchema) },
    system:
      "Rédige un compte rendu très court (3 à 5 phrases) d'un passage de veille pour un cabinet d'avocats, en français (fr) et en arabe (ar). Indique les nouveautés, les alertes créées, les délais proches et les sources en échec. Pas de mise en forme Markdown.",
    messages: [{ role: "user", content: JSON.stringify(facts) }],
  });
  return response.parsed_output ?? null;
}

// ---------------------------------------------------------------------------
// 4. Assistant conversationnel sur le portefeuille
// ---------------------------------------------------------------------------

export type ChatTurn = { role: "user" | "assistant"; content: string };

export async function askAssistant(history: ChatTurn[], portfolioSnapshot: string, locale: "fr" | "ar") {
  const response = await getClient().beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    ...FALLBACK,
    output_config: { effort: "low" },
    system: [
      {
        type: "text",
        text: `Tu es l'assistant d'un cabinet d'avocats marocain spécialisé en propriété industrielle (marques, brevets, dessins et modèles ; procédures OMPIC).
Réponds uniquement à partir des données du portefeuille fournies ci-dessous et de connaissances générales sur la procédure marocaine ; si une information manque, dis-le.
Réponds dans la langue de la question (arabe ou français). Les délais calculés par le système sont « à confirmer » tant qu'ils ne sont pas marqués confirmés : rappelle-le quand c'est pertinent.
Ne conclus jamais à une atteinte certaine ; parle de risque à examiner. Sois concis ; utilise des listes pour plusieurs éléments.`,
      },
      { type: "text", text: `Données du portefeuille (JSON) :\n${portfolioSnapshot}`, cache_control: { type: "ephemeral" } },
    ],
    messages: history.map((m) => ({ role: m.role, content: m.content })),
  });
  if (response.stop_reason === "refusal") {
    return locale === "ar" ? "تعذر الجواب على هذا الطلب." : "Je ne peux pas répondre à cette demande.";
  }
  return response.content
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}
