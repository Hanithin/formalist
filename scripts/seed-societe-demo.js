/**
 * scripts/seed-societe-demo.js
 *
 * Crée un second dossier de création pour voir le tableau de bord avec
 * plusieurs sociétés.
 *
 *   node scripts/seed-societe-demo.js <email>            # ajoute
 *   node scripts/seed-societe-demo.js <email> --clean    # retire
 */

const { db, stmts } = require("../db");

const email = (process.argv[2] || "").trim().toLowerCase();
const clean = process.argv.includes("--clean");

if (!email) {
  console.error("Usage : node scripts/seed-societe-demo.js <email> [--clean]");
  process.exit(1);
}

const user = stmts.getUserByEmail.get(email);
if (!user) {
  console.error("Aucun compte pour " + email);
  process.exit(1);
}

const SOCIETE = "ATELIER MERIDIEN";

if (clean) {
  const f = db.prepare("SELECT id FROM formalites WHERE user_id = ? AND societe = ?").get(user.id, SOCIETE);
  if (!f) { console.log("Rien à supprimer."); process.exit(0); }
  db.pragma("foreign_keys = OFF");
  ["documents", "messages", "audit_log", "signature_requests", "notifications"].forEach(t => {
    try { db.prepare(`DELETE FROM ${t} WHERE formalite_id = ?`).run(f.id); } catch (e) {}
  });
  db.prepare("DELETE FROM formalites WHERE id = ?").run(f.id);
  db.pragma("foreign_keys = ON");
  console.log("Dossier " + SOCIETE + " supprimé.");
  process.exit(0);
}

const existing = db.prepare("SELECT id FROM formalites WHERE user_id = ? AND societe = ?").get(user.id, SOCIETE);
if (existing) {
  console.log("Le dossier " + SOCIETE + " existe déjà (id " + existing.id + ").");
  process.exit(0);
}

// Référence 6 caractères, comme celles générées par l'application
const CHARS = "ABCDEFGHIJKLMNPQRSTUVWXYZ23456789";
let reference = "";
do {
  reference = Array.from({ length: 6 }, (_, i) => CHARS[(user.id * 7 + i * 13 + reference.length * 3) % CHARS.length]).join("");
} while (db.prepare("SELECT id FROM formalites WHERE reference = ?").get(reference));

// Dossier plus avancé que le premier : les statuts partent à la signature
const data = {
  NOM_SOCIETE: SOCIETE,
  NOM_SOCIETE_COMPLET: SOCIETE,
  FORME_JURIDIQUE: "SARL",
  CAPITAL: "25 000",
  CAPITAL_LETTRES: "vingt-cinq mille",
  ADRESSE_SIEGE: "8 rue des Tanneurs, 69001 Lyon",
  NOM_BANQUE: "Shine",
  GERANT_NOM: "Madfai",
  GERANT_PRENOM: "Hani",
  NB_PARTS: "250",
  VALEUR_NOMINALE: "100",
  DATE_CLOTURE: "31 décembre"
};

const info = db.prepare(`INSERT INTO formalites
  (user_id, type, forme, societe, capital, status, offer, phase, business_sub_phase, data_json, reference, created_at, updated_at)
  VALUES (?, 'Création SARL', 'SARL', ?, 25000, 'en_cours', 'starter', 4, NULL, ?, ?, datetime('now','-12 days'), datetime('now','-1 days'))`
).run(user.id, SOCIETE, JSON.stringify(data), reference);

const id = info.lastInsertRowid;

// Quelques documents et un historique cohérents avec l'étape "signature"
const insertDoc = db.prepare(
  "INSERT INTO documents (formalite_id, name, type, file_path, uploaded_by, status, created_at) VALUES (?, ?, ?, NULL, ?, ?, datetime('now', ?))"
);
[
  ["Statuts constitutifs - " + SOCIETE + ".docx", "statuts", "system", "generated", "-6 days"],
  ["Attestation de dépôt de capital.pdf", "capital", "user", "verified", "-4 days"],
  ["Pièce d'identité - Hani Madfai.pdf", "identite", "user", "verified", "-4 days"],
].forEach(d => insertDoc.run(id, d[0], d[1], d[2], d[3], d[4]));

const insertAudit = db.prepare(
  "INSERT INTO audit_log (formalite_id, actor_id, actor_role, action, target_field, before_value, after_value, comment, created_at) VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, datetime('now', ?))"
);
[
  [user.id, "user", "status_change", "Dossier créé", null, "-12 days"],
  [null, "system", "doc_generated", "Statuts constitutifs", "Rédigés à partir de vos réponses", "-6 days"],
  [user.id, "user", "doc_uploaded", "Attestation de dépôt de capital", null, "-4 days"],
].forEach(e => insertAudit.run(id, e[0], e[1], e[2], e[3], e[4], e[5]));

// Deux associés doivent signer, un seul l'a fait : le dossier est en attente
try {
  const insertSig = db.prepare(`INSERT INTO signature_requests
    (formalite_id, associe_index, associe_name, associe_email, token, status, signed_at, role)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  insertSig.run(id, 0, "Hani Madfai", email, "demo-sig-" + id + "-1", "signed",
    new Date(Date.now() - 36e5 * 30).toISOString(), "Gérant");
  insertSig.run(id, 1, "Claire Vasseur", "claire.vasseur@example.com", "demo-sig-" + id + "-2", "pending", null, "Associée");
} catch (e) {
  console.log("(signatures non créées : " + e.message + ")");
}

console.log("Dossier créé : SARL " + SOCIETE + " (id " + id + ", réf " + reference + ")");
console.log("  étape 4 sur 5 · signature · 1 associé sur 2 a signé");
console.log("\nPour revenir en arrière : node scripts/seed-societe-demo.js " + email + " --clean");
