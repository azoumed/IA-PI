/**
 * Initialise : compte administrateur, sources OMPIC surveillées et (option --demo) données de démonstration.
 * Usage : npm run seed -- --email admin@cabinet.ma --password "MotDePasse" [--demo]
 */
import bcrypt from "bcryptjs";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../src/db/schema";

const args = process.argv.slice(2);
const arg = (k: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const email = arg("email") ?? "admin@cabinet.ma";
const password = arg("password");
if (!password || password.length < 10) {
  console.error("Indiquez un mot de passe d'au moins 10 caractères : --password \"...\"");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://postgres@localhost:5432/ompic" });
const db = drizzle(pool, { schema });

await db
  .insert(schema.users)
  .values({ email, name: arg("name") ?? "Administrateur", passwordHash: await bcrypt.hash(password, 12), role: "admin" })
  .onConflictDoNothing();

await db
  .insert(schema.sources)
  .values([
    { name: "Catalogue officiel des marques", url: "https://www.ompic.ma/fr/marques/Catalogue-Officiel-des-Marques", kind: "catalog_page" },
    { name: "Dépôt de marque au Maroc", url: "https://www.ompic.ma/fr/depot-de-marque-au-maroc", kind: "procedure_page" },
    { name: "Tarifs OMPIC", url: "https://www.ompic.ma/fr/tarifs", kind: "procedure_page", enabled: false },
  ])
  .onConflictDoNothing();

if (args.includes("--demo")) {
  const [c1] = await db.insert(schema.clients).values({ name: "Marjane Holding", nameAr: "مرجان القابضة", email: "pi@marjane.example" }).returning();
  const [c2] = await db.insert(schema.clients).values({ name: "Laboratoires Kaoutar", nameAr: "مختبرات كوثر" }).returning();
  const [r1] = await db
    .insert(schema.rights)
    .values([
      { clientId: c1.id, holder: "Marjane Holding SA", holderAr: "مرجان القابضة", name: "Marjane", nameAr: "مرجان", niceClasses: [35], applicationNumber: "185412", registrationNumber: "185412", filingDate: "2017-03-02", registrationDate: "2017-09-10", expiryDate: "2027-03-02", status: "enregistrée", goodsServices: "Services de vente au détail ; gestion des affaires commerciales." },
      { clientId: c2.id, holder: "Laboratoires Kaoutar SARL", holderAr: "مختبرات كوثر", name: "Kaoutar", nameAr: "كوثر", niceClasses: [3, 5], applicationNumber: "210977", filingDate: "2020-11-18", expiryDate: "2030-11-18", status: "enregistrée", goodsServices: "Cosmétiques, savons, produits d'hygiène." },
    ])
    .returning();
  const [cat] = await db
    .insert(schema.catalogs)
    .values({ title: "Catalogue de démonstration n° 2026/21", issueRef: "2026/21", publishedAt: "2026-10-15", status: "done", entriesCount: 3, pageCount: 12 })
    .returning();
  await db.insert(schema.publications).values([
    { catalogId: cat.id, applicationNumber: "268114", markName: "MARJANA MARKET", markNameAr: "مرجانة ماركت", applicant: "Sté Exemple Distribution", niceClasses: [35], publicationDate: "2026-10-15", page: 4 },
    { catalogId: cat.id, applicationNumber: "268230", markName: "KAWTAR", applicant: "Cosmétiques du Nord SARL", niceClasses: [3], publicationDate: "2026-10-15", page: 7 },
    { catalogId: cat.id, applicationNumber: "268301", markName: "ATLAS TRUCKS", applicant: "Atlas Transport", niceClasses: [12], publicationDate: "2026-10-15", page: 9 },
  ]);
  console.log(`Démonstration : 2 clients, 2 marques (dont #${r1.id}), 1 catalogue avec 3 demandes. Lancez l'agent ou « Relancer l'analyse » pour générer les alertes.`);
}

console.log(`Compte administrateur : ${email}`);
await pool.end();
