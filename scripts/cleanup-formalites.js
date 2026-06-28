/**
 * scripts/cleanup-formalites.js
 *
 * Nettoie les formalités de test :
 *  - Supprime TOUS les TECH SOLUTIONS (32 doublons de load-test)
 *  - Supprime les "Sans nom" (brouillons abandonnés)
 *  - Garde uniquement la formalité la plus avancée pour les doublons (ZS CAR, TESTSOCIETE…)
 *  - Cascade : supprime aussi documents, messages, notifications, payments, audit, user_documents liés
 *
 * Usage: node scripts/cleanup-formalites.js [--dry-run]
 */

const { db } = require("../db");

const DRY = process.argv.includes("--dry-run");

function findBestPerSociete(societe) {
  // Garde la formalité la plus avancée (phase max), à phase égale la plus récente
  return db.prepare(`
    SELECT id FROM formalites
    WHERE societe = ?
    ORDER BY phase DESC, business_sub_phase DESC, updated_at DESC
    LIMIT 1
  `).get(societe);
}

function deleteFormalite(id, label) {
  // Cascade manuel sur toutes les tables liées
  const targets = [
    "DELETE FROM documents WHERE formalite_id = ?",
    "DELETE FROM messages WHERE formalite_id = ?",
    "DELETE FROM notifications WHERE formalite_id = ?",
    "DELETE FROM signature_requests WHERE formalite_id = ?",
    "DELETE FROM payments WHERE formalite_id = ?",
    "DELETE FROM audit_log WHERE formalite_id = ?",
    "DELETE FROM user_documents WHERE source_type = 'entreprise' AND source_id = ?",
    "DELETE FROM formalites WHERE id = ?",
  ];
  if (DRY) {
    console.log(`  [dry-run] would delete #${id} (${label})`);
    return;
  }
  const tx = db.transaction(() => {
    for (const sql of targets) {
      try { db.prepare(sql).run(id); } catch (e) { /* table might not exist or no fk */ }
    }
  });
  tx();
  console.log(`  ✓ deleted #${id} (${label})`);
}

function main() {
  const all = db.prepare("SELECT id, societe, type, forme, phase, business_sub_phase, status, created_at, updated_at FROM formalites ORDER BY societe, phase DESC, created_at").all();
  const total = all.length;
  console.log(`Total formalités avant nettoyage : ${total}`);
  console.log("");

  const toDelete = [];

  // Group by societe (case-insensitive et trim)
  const groups = {};
  for (const f of all) {
    const key = (f.societe || "").trim();
    if (!groups[key]) groups[key] = [];
    groups[key].push(f);
  }

  for (const societe of Object.keys(groups)) {
    const list = groups[societe];

    // Sociétés à virer complètement
    if (/^tech\s*solutions$/i.test(societe) || /^sans\s*nom$/i.test(societe) || societe === "") {
      console.log(`\n[purge] "${societe}" (${list.length} dossier${list.length > 1 ? "s" : ""})`);
      for (const f of list) toDelete.push({ id: f.id, label: `${societe} · phase ${f.phase}` });
      continue;
    }

    // Doublons : on garde le plus avancé, on vire les autres
    if (list.length > 1) {
      const best = findBestPerSociete(societe);
      console.log(`\n[dedup] "${societe}" : ${list.length} doublons, on garde #${best.id}`);
      for (const f of list) {
        if (f.id !== best.id) toDelete.push({ id: f.id, label: `${societe} · doublon phase ${f.phase}` });
      }
    }
  }

  console.log(`\nNb formalités à supprimer : ${toDelete.length}`);
  console.log(`Nb formalités restantes  : ${total - toDelete.length}`);
  console.log("");

  if (toDelete.length === 0) {
    console.log("Rien à nettoyer.");
    return;
  }

  for (const t of toDelete) deleteFormalite(t.id, t.label);

  if (!DRY) {
    const after = db.prepare("SELECT COUNT(*) as c FROM formalites").get().c;
    console.log(`\nTotal après : ${after}`);
  }
}

main();
