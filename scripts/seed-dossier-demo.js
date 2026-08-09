/**
 * scripts/seed-dossier-demo.js
 *
 * Remplit un dossier avec des documents et un historique cohérents, pour voir
 * l'accueil dans un état représentatif sans dérouler tout le parcours.
 * Les lignes sont écrites en base comme celles du produit : rien n'est simulé
 * côté interface.
 *
 *   node scripts/seed-dossier-demo.js <id>            # ajoute si le dossier est vide
 *   node scripts/seed-dossier-demo.js <id> --force    # remplace le contenu existant
 *   node scripts/seed-dossier-demo.js <id> --clean    # supprime ce qui a été ajouté
 */

const { db } = require("../db");

const id = parseInt(process.argv[2], 10);
const force = process.argv.includes("--force");
const clean = process.argv.includes("--clean");

if (!id) {
  console.error("Usage : node scripts/seed-dossier-demo.js <id du dossier> [--force|--clean]");
  process.exit(1);
}

const f = db.prepare("SELECT * FROM formalites WHERE id = ?").get(id);
if (!f) {
  console.error("Dossier " + id + " introuvable.");
  process.exit(1);
}

if (clean) {
  const d = db.prepare("DELETE FROM documents WHERE formalite_id = ?").run(id);
  const a = db.prepare("DELETE FROM audit_log WHERE formalite_id = ?").run(id);
  console.log("Supprimé : " + d.changes + " documents, " + a.changes + " entrées d'historique.");
  process.exit(0);
}

const existing = db.prepare("SELECT COUNT(*) c FROM documents WHERE formalite_id = ?").get(id).c;
if (existing > 0 && !force) {
  console.log("Le dossier a déjà " + existing + " document(s). Relancez avec --force pour les remplacer.");
  process.exit(0);
}
if (force) {
  db.prepare("DELETE FROM documents WHERE formalite_id = ?").run(id);
  db.prepare("DELETE FROM audit_log WHERE formalite_id = ?").run(id);
}

let data = {};
try { data = JSON.parse(f.data_json || "{}"); } catch (e) {}

const societe = data.NOM_SOCIETE || f.societe || "Société";
const forme = (data.FORME_JURIDIQUE || f.forme || "SASU").toUpperCase();
const banque = data.NOM_BANQUE && data.NOM_BANQUE !== "-" ? data.NOM_BANQUE : "votre banque";
const dirigeant = data.PRESIDENT_NOM || data.GERANT_NOM || f.user_name || "le dirigeant";
const avocat = db.prepare("SELECT id, name FROM users WHERE role = 'avocat' OR roles LIKE '%avocat%' LIMIT 1").get();

const insertDoc = db.prepare(
  "INSERT INTO documents (formalite_id, name, type, file_path, uploaded_by, status, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now', ?))"
);
const insertAudit = db.prepare(
  "INSERT INTO audit_log (formalite_id, actor_id, actor_role, action, target_field, before_value, after_value, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', ?))"
);

// Documents attendus à ce stade du dossier : les actes sont rédigés, les pièces
// des associés sont arrivées, l'attestation de capital reste à fournir.
const docs = [
  ["Statuts constitutifs - " + societe + ".docx", "statuts", "system", "generated", "-4 days"],
  ["Liste des souscripteurs.pdf", "souscripteurs", "system", "generated", "-4 days"],
  ["Déclaration de non-condamnation.pdf", "attestation", "system", "generated", "-4 days"],
  ["Pièce d'identité - " + dirigeant + ".pdf", "identite", "user", "uploaded", "-3 days"],
  ["Justificatif de domicile du siège.pdf", "domicile", "user", "uploaded", "-2 days"],
];
docs.forEach(function (d) {
  insertDoc.run(id, d[0], d[1], null, d[2], d[3], d[4]);
});

// Historique lisible par le client : qui a fait quoi, dans l'ordre
const events = [
  [f.user_id, "user", "status_change", null, null, "Dossier créé", null, "-5 days"],
  [f.user_id, "user", "field_update", "Capital social", null, (data.CAPITAL || f.capital || "") + " €", null, "-5 days"],
  [f.user_id, "user", "field_update", "Banque", null, banque, null, "-4 days"],
  [null, "system", "doc_generated", null, null, "Statuts constitutifs", "Rédigés à partir de vos réponses", "-4 days"],
  [f.user_id, "user", "doc_uploaded", null, null, "Pièce d'identité", null, "-3 days"],
  [f.user_id, "user", "doc_uploaded", null, null, "Justificatif de domicile", null, "-2 days"],
];
if (avocat) {
  events.push([avocat.id, "avocat", "doc_validated", null, null, "Pièce d'identité", "Conforme", "-1 days"]);
  events.push([avocat.id, "avocat", "note", null, null, null, "Il ne manque que l'attestation de dépôt de capital pour lancer l'immatriculation.", "-6 hours"]);
}
events.forEach(function (e) {
  insertAudit.run(id, e[0], e[1], e[2], e[3], e[4], e[5], e[6], e[7]);
});

console.log("Dossier " + id + " (" + forme + " " + societe + ") :");
console.log("  " + docs.length + " documents");
console.log("  " + events.length + " entrées d'historique" + (avocat ? " (avocat : " + avocat.name + ")" : " (aucun avocat en base)"));
console.log("Pour revenir en arrière : node scripts/seed-dossier-demo.js " + id + " --clean");
