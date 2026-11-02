# Veille PI Maroc

Application de veille et de gestion des dossiers de propriété industrielle pour un cabinet d'avocats, basée sur les publications de l'OMPIC. Interface bilingue **français / arabe**, avec un **agent IA** (Claude, d'Anthropic) qui met l'application à jour.

Ce document décrit la **version 1** du cahier des charges (§7) : le portefeuille de marques des clients, la surveillance des demandes publiées similaires, et le tableau des délais et des actions. Les brevets et les dessins et modèles peuvent déjà être saisis ; leur veille automatique viendra plus tard.

## Fonctionnalités

| Cahier des charges | Dans l'application |
| --- | --- |
| §3 Fiche par droit | Identification, étendue de la protection, dates, suivi, preuve, correspondances (pièces jointes) |
| §4 Marques similaires | Similarité orthographique et phonétique, squelette consonantique, translittération arabe ↔ latin, inclusion, classes de Nice identiques ou voisines (`src/lib/similarity.ts`) |
| §5 Alertes | Chaque alerte répond aux 5 questions (quoi, quel dossier, pourquoi, quelle action, quel délai et quelle source), puis l'avocat la valide, l'écarte ou la marque traitée |
| §5 Délais | Délai légal distinct des rappels internes J-30 / J-15 / J-7 ; tout délai calculé reste « à confirmer » jusqu'à confirmation |
| §6 Données | Import des catalogues PDF (par fichier, par URL, ou automatique depuis les pages OMPIC). Date de dernière mise à jour et sources en échec visibles |
| §7 Sécurité | Comptes et rôles (administrateur, avocat, assistant(e)), stockage des pièces, journal de qui a ajouté ou modifié quoi (y compris « Agent IA ») |
| §8 Bilingue | Interface entière en FR et AR, sens droite-à-gauche, champs métier en double (latin / arabe), recherche croisée arabe ↔ latin |
| §9 Agent IA | Collecte → extraction des PDF → rapprochement → alertes et délais → validation humaine → compte rendu bilingue ; assistant conversationnel |

### L'agent IA

- Il se déclenche toutes les 6 heures (service `scheduler` de Docker, ou un cron sur `POST /api/agent/run`), à chaque import de catalogue, ou avec le bouton « Lancer l'agent maintenant ».
- Il consulte les **sources** configurées (page du Catalogue officiel des marques, pages procédurales), télécharge les nouveaux PDF et signale les pages modifiées.
- Il découpe chaque catalogue en blocs de 10 pages et les envoie à Claude, qui extrait en données structurées : numéro, marque (latin et arabe), déposant, classes de Nice, produits et services, page.
- Il compare chaque demande à toutes les marques surveillées. Claude rédige ensuite une analyse préliminaire en français et en arabe pour chaque rapprochement.
- Il crée les alertes et les délais d'opposition (2 mois après la publication, art. 148-2 de la loi 17-97), ainsi que les échéances de renouvellement à 12 mois.
- **Il ne décide rien seul** : les alertes attendent la validation de l'avocat, et les délais restent « à confirmer ».
- Il **n'interroge jamais** le moteur de recherche OMPIC, qui est protégé par CAPTCHA.

Sans `ANTHROPIC_API_KEY`, l'application fonctionne quand même : saisie, rapprochements sur les catalogues déjà extraits, délais. Seuls l'extraction des PDF, les analyses rédigées par l'IA et l'assistant sont désactivés.

## Installation locale

Prérequis : Node.js 22 et PostgreSQL 16.

```bash
npm install
cp .env.example .env.local   # puis renseigner AUTH_SECRET, CRON_SECRET, ANTHROPIC_API_KEY
npm run db:migrate
npm run seed -- --email admin@cabinet.ma --password "un-mot-de-passe-solide" --demo
npm run dev
```

L'option `--demo` ajoute 2 clients, 2 marques et un catalogue fictif. Dans « Veille catalogues », cliquez sur « Relancer l'analyse » de ce catalogue pour voir des alertes se créer.

## Déploiement (Docker)

```bash
export POSTGRES_PASSWORD=... AUTH_SECRET=$(openssl rand -hex 32) CRON_SECRET=$(openssl rand -hex 16) ANTHROPIC_API_KEY=...
docker compose up -d --build
docker compose exec app npx tsx scripts/seed.mts --email admin@cabinet.ma --password "..."
```

Points à prévoir pour la production :
- mettre un reverse proxy HTTPS devant (Caddy, Nginx) ;
- sauvegarder les volumes `pgdata` (base de données) et `storage` (pièces et catalogues) ;
- vérifier que l'hébergement et le traitement sont conformes à la loi 09-08 (CNDP).

## Commandes

| Commande | Rôle |
| --- | --- |
| `npm run dev` / `npm run build` / `npm start` | Développement / compilation / production |
| `npm test` | Tests du moteur de similarité et du calcul des délais |
| `npm run db:generate` / `npm run db:migrate` | Générer / appliquer les migrations (Drizzle) |
| `npm run seed -- --email … --password … [--demo]` | Créer l'administrateur et les sources OMPIC |
| `npm run agent:run` | Déclencher l'agent (variables `CRON_SECRET` et `APP_URL`) |

## Architecture

- **Next.js 16** (App Router, actions serveur), **PostgreSQL** et **Drizzle ORM**, Tailwind CSS 4
- `src/db/schema.ts` : clients, droits, pièces, sources, catalogues, publications, alertes, délais, passages de l'agent, journal
- `src/lib/agent/` : collecte (`collect.ts`), appels à Claude (`claude.ts`, modèle `claude-opus-5-5`, configurable avec `ANTHROPIC_MODEL`), orchestration (`run.ts`)
- `src/lib/i18n/` : dictionnaires `fr.ts` et `ar.ts` (l'arabe doit avoir exactement les mêmes clés que le français, ce que le compilateur vérifie)

## Limites connues

- L'OMPIC n'expose pas d'API publique. Si l'Office accorde un accès professionnel, il faudra ajouter un connecteur dans `src/lib/agent/collect.ts`.
- Les articles de loi cités (art. 148-2 et 152 de la loi 17-97) doivent être **vérifiés par l'avocat** avant usage.
- Les rappels J-30 / J-15 / J-7 s'affichent dans l'application. L'envoi par e-mail n'est pas encore branché.
