/**
 * scripts/cleanup-subphase.js
 *
 * Remet business_sub_phase = NULL pour les formalités où il est défini
 * de manière incohérente :
 *  - phase = 1 ET aucune signature → le dossier n'a jamais avancé
 *  - sub_phase défini mais aucun avocat assigné → reset
 *
 * Usage: node scripts/cleanup-subphase.js [--dry-run]
 */
const { db } = require("../db");
const DRY = process.argv.includes("--dry-run");

function main() {
  const rows = db.prepare(`
    SELECT f.id, f.societe, f.phase, f.business_sub_phase, f.assigned_avocat_id,
      (SELECT COUNT(*) FROM signature_requests sr WHERE sr.formalite_id = f.id) AS total_signatures
    FROM formalites f
    WHERE f.business_sub_phase IS NOT NULL AND f.business_sub_phase != ''
  `).all();

  const toReset = rows.filter(r => {
    // Reset si phase=1 sans signature (jamais lancé) OU sub_phase incohérente (avocat manquant + 0 sig)
    return (r.phase <= 1 && r.total_signatures === 0)
      || (!r.assigned_avocat_id && r.total_signatures === 0 && r.business_sub_phase !== '5e');
  });

  console.log(`${rows.length} formalités avec business_sub_phase défini`);
  console.log(`${toReset.length} à réinitialiser`);
  console.log("");

  if (toReset.length === 0) {
    console.log("Rien à faire.");
    return;
  }

  toReset.forEach(r => {
    console.log(`  #${r.id} ${r.societe} : phase=${r.phase}, sub=${r.business_sub_phase}, avocat=${r.assigned_avocat_id || 'null'}, sigs=${r.total_signatures}`);
  });
  console.log("");

  if (DRY) {
    console.log("[dry-run] aucune modification");
    return;
  }

  const upd = db.prepare("UPDATE formalites SET business_sub_phase = NULL WHERE id = ?");
  const tx = db.transaction(() => {
    for (const r of toReset) upd.run(r.id);
  });
  tx();
  console.log(`✓ ${toReset.length} formalités mises à jour (business_sub_phase = NULL)`);
}

main();
