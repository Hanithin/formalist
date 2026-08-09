/**
 * scripts/seed-contrats-demo.js
 *
 * Crée quelques contrats à des stades différents pour voir la liste dans un
 * état représentatif. Les lignes sont écrites en base comme celles du produit.
 *
 *   node scripts/seed-contrats-demo.js <email>            # ajoute
 *   node scripts/seed-contrats-demo.js <email> --clean    # retire ceux créés ici
 */

const { db, stmts } = require("../db");

const email = (process.argv[2] || "").trim().toLowerCase();
const clean = process.argv.includes("--clean");

if (!email) {
  console.error("Usage : node scripts/seed-contrats-demo.js <email du compte> [--clean]");
  process.exit(1);
}

const user = stmts.getUserByEmail.get(email);
if (!user) {
  console.error("Aucun compte pour " + email);
  process.exit(1);
}

// Contrats plausibles pour un dirigeant qui vient de créer sa société
const DEMO = [
  {
    type: "cdi", titre: "CDI - Camille Ferrand, développeuse",
    status: "signe", age: "-21 days",
    data: { salarie_nom: "Camille Ferrand", poste: "Développeuse", salaire: "3 200 €", debut: "1er septembre 2026" }
  },
  {
    type: "prestation", titre: "Prestation - Refonte du site vitrine",
    status: "en_validation", age: "-6 days",
    data: { prestataire_societe: "Studio Kern", montant: "8 400 €", duree: "3 mois" }
  },
  {
    type: "bail_commercial", titre: "Bail commercial - 12 rue de Rivoli",
    status: "genere", age: "-2 days",
    data: { bailleur_nom: "SCI Rivoli", loyer: "1 850 €", surface: "64 m²" }
  },
  {
    type: "cgv_cgu", titre: "CGV - Vente en ligne",
    status: "brouillon", age: "-4 hours",
    data: {}
  }
];

if (clean) {
  const titles = DEMO.map(d => d.titre);
  const info = db.prepare(
    `DELETE FROM contrats WHERE user_id = ? AND titre IN (${titles.map(() => "?").join(",")})`
  ).run(user.id, ...titles);
  console.log("Supprimé : " + info.changes + " contrat(s).");
  process.exit(0);
}

const insert = db.prepare(`INSERT INTO contrats (user_id, type, titre, status, data_json, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, datetime('now', ?), datetime('now', ?))`);

let added = 0;
for (const c of DEMO) {
  const exists = db.prepare("SELECT id FROM contrats WHERE user_id = ? AND titre = ?").get(user.id, c.titre);
  if (exists) continue;
  insert.run(user.id, c.type, c.titre, c.status, JSON.stringify(c.data), c.age, c.age);
  added++;
}

console.log(added + " contrat(s) créé(s) pour " + email + " :");
db.prepare("SELECT titre, type, status FROM contrats WHERE user_id = ? ORDER BY updated_at DESC")
  .all(user.id)
  .forEach(c => console.log("  " + c.titre + "  [" + c.status + "]"));
console.log("\nPour revenir en arrière : node scripts/seed-contrats-demo.js " + email + " --clean");
