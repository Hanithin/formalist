/**
 * scripts/seed-demo-docs.js
 *
 * Crée des documents officiels de démo pour la première formalité de type
 * "creation" de chaque utilisateur user (statuts, PV, annonce légale, Kbis,
 * RBE, facture). Les fichiers pointent vers des PDFs existants dans /uploads.
 *
 * Usage: node scripts/seed-demo-docs.js
 */

const fs = require("fs");
const path = require("path");
const { db, stmts } = require("../db");

const UPLOADS = path.join(__dirname, "..", "uploads");

const DEMO_DOCS = [
  { name: "Statuts constitutifs.pdf",       category: "statuts",        type: "pdf" },
  { name: "PV de constitution.pdf",          category: "pv",             type: "pdf" },
  { name: "Annonce légale - Le Parisien.pdf", category: "annonce_legale", type: "pdf" },
  { name: "Kbis.pdf",                        category: "kbis",           type: "pdf" },
  { name: "RBE - Bénéficiaires effectifs.pdf", category: "rbe",          type: "pdf" },
  { name: "Facture FORM-2026-0042.pdf",      category: "facture",        type: "pdf" },
];

function pickPdfs(count) {
  const all = fs.readdirSync(UPLOADS).filter((f) => f.toLowerCase().endsWith(".pdf"));
  if (all.length === 0) return Array(count).fill(null);
  const picked = [];
  for (let i = 0; i < count; i++) picked.push(all[i % all.length]);
  return picked;
}

function seedForUser(userId) {
  // On cible une société nommée "ZS CAR" si elle existe, sinon la plus récente formalité de création
  let target = db
    .prepare("SELECT id, societe, forme FROM formalites WHERE user_id = ? AND societe = 'ZS CAR' ORDER BY created_at DESC LIMIT 1")
    .get(userId);
  if (!target) {
    target = db
      .prepare("SELECT id, societe, forme FROM formalites WHERE user_id = ? AND (type LIKE 'Création%' OR type = 'creation') ORDER BY created_at DESC LIMIT 1")
      .get(userId);
  }
  if (!target) return { userId, seeded: 0, skipped: "no formalite de création" };

  const existing = db
    .prepare("SELECT COUNT(*) as c FROM user_documents WHERE user_id = ? AND source_id = ? AND category IS NOT NULL")
    .get(userId, target.id);
  if (existing.c > 0) return { userId, seeded: 0, skipped: "already seeded for " + target.societe };

  const files = pickPdfs(DEMO_DOCS.length);
  let count = 0;
  DEMO_DOCS.forEach((d, i) => {
    stmts.createUserDocument.run(userId, "entreprise", target.id, d.name, d.type, files[i], d.category);
    count++;
  });
  return { userId, seeded: count, societe: target.societe };
}

function main() {
  const users = db.prepare("SELECT id, email, role FROM users WHERE role = 'user'").all();
  console.log(`Found ${users.length} user(s)`);
  for (const u of users) {
    const r = seedForUser(u.id);
    console.log(`  user ${u.email}:`, r);
  }
}

main();
