/**
 * scripts/audit-formalites-actions.js
 *
 * Pour chaque formalité, simule la logique de calcul d'action du dashboard
 * et l'affiche avec l'état réel. Permet de vérifier que l'action affichée
 * correspond bien à ce qui doit être fait.
 *
 * Usage: node scripts/audit-formalites-actions.js
 */

const { db } = require("../db");

function computeAction(f, data) {
  const banqueChoisie = data.NOM_BANQUE && data.NOM_BANQUE !== "-" ? data.NOM_BANQUE
    : data.BANQUE_SHINE ? "Shine"
    : data.BANQUE_QONTO ? "Qonto"
    : data.BANQUE_REVOLUT ? "Revolut"
    : null;
  const forme = data.FORME_JURIDIQUE || f.forme;
  const infosComplete = !!(data.NOM_SOCIETE && forme && data.CAPITAL && (data.PRESIDENT_NOM || data.GERANT_NOM));
  const sp = f.business_sub_phase || "";
  const pendingSig = f.pending_signatures || 0;
  const totalSig = f.total_signatures || 0;
  const rejectedDocs = f.rejected_docs || 0;

  if (rejectedDocs > 0 && f.status !== "terminee") {
    return { action: rejectedDocs + " doc(s) à renvoyer", userAction: true };
  }
  if (pendingSig > 0 && totalSig > 0) {
    return { action: pendingSig + " signature(s) en attente", userAction: true };
  }
  if (f.status === "terminee" || sp === "5e") return { action: "—", userAction: false, terminé: true };
  if (sp === "5c" || sp === "5d") return { action: "Préparation dépôt greffe", userAction: false };
  if ((f.phase || 1) >= 6) return { action: "Immatriculation en cours", userAction: false };
  if (sp === "5a" || sp === "5b") return { action: "Avocat vérifie", userAction: false };
  if (!infosComplete) return { action: "Compléter infos société", userAction: true };
  if (!banqueChoisie) return { action: "Choisir banque", userAction: true };
  if ((f.phase || 1) < 3) return { action: "Déposer capital chez " + banqueChoisie, userAction: true };
  if (f.phase === 3) return { action: "Téléverser pièce ID + justif domicile", userAction: true };
  if (f.phase === 4) return { action: totalSig > 0 ? "Signer (en attente)" : "Lancer signature", userAction: true };
  return { action: "Avocat traite", userAction: false };
}

function main() {
  const list = db.prepare(`
    SELECT f.id, f.reference, f.societe, f.forme, f.phase, f.business_sub_phase, f.status, f.data_json, f.user_id,
      (SELECT COUNT(*) FROM signature_requests sr WHERE sr.formalite_id = f.id) AS total_signatures,
      (SELECT COUNT(*) FROM signature_requests sr WHERE sr.formalite_id = f.id AND sr.signed_at IS NULL) AS pending_signatures,
      (SELECT COUNT(*) FROM documents d WHERE d.formalite_id = f.id AND d.rejection_reason IS NOT NULL) AS rejected_docs,
      (SELECT COUNT(*) FROM documents d WHERE d.formalite_id = f.id) AS total_docs,
      f.assigned_avocat_id
    FROM formalites f
    ORDER BY f.id
  `).all();

  console.log(`Audit de ${list.length} formalités\n`);
  console.log("ID  | Réf    | Société             | Phase | Sub | Sigs P/T | Docs(rej) | Banque         | Action calculée");
  console.log("----|--------|---------------------|-------|-----|----------|-----------|----------------|----------------");

  const issues = [];
  for (const f of list) {
    let data = {};
    try { data = JSON.parse(f.data_json || "{}"); } catch (e) {}
    const a = computeAction(f, data);
    const banque = data.NOM_BANQUE && data.NOM_BANQUE !== "-" ? data.NOM_BANQUE : (data.BANQUE_SHINE ? "Shine" : data.BANQUE_QONTO ? "Qonto" : data.BANQUE_REVOLUT ? "Revolut" : "—");
    const row = [
      String(f.id).padStart(2),
      (f.reference || "—").padEnd(6),
      (f.societe || "—").slice(0, 20).padEnd(20),
      String(f.phase).padStart(5),
      (f.business_sub_phase || "—").padEnd(3),
      `${f.pending_signatures}/${f.total_signatures}`.padStart(8),
      `${f.total_docs}(${f.rejected_docs})`.padStart(9),
      banque.slice(0, 14).padEnd(14),
      a.action,
    ].join(" | ");
    console.log(row);

    // Détection d'incohérences
    if (f.phase >= 4 && f.total_signatures === 0 && !["terminee"].includes(f.status)) {
      issues.push(`#${f.id} ${f.societe} : phase ${f.phase} mais 0 signature → flux signature jamais déclenché`);
    }
    if (f.business_sub_phase && f.business_sub_phase.startsWith("5") && f.phase < 4) {
      issues.push(`#${f.id} ${f.societe} : sub_phase=${f.business_sub_phase} mais phase=${f.phase} (désynchro)`);
    }
    if (f.pending_signatures > 0 && f.phase < 4) {
      issues.push(`#${f.id} ${f.societe} : signatures en attente mais phase=${f.phase} (devrait être ≥ 4)`);
    }
    if (f.business_sub_phase && f.business_sub_phase.startsWith("5") && f.business_sub_phase !== "5e" && !f.assigned_avocat_id) {
      issues.push(`#${f.id} ${f.societe} : en révision avocat mais aucun avocat assigné`);
    }
  }

  console.log("");
  if (issues.length === 0) {
    console.log("✓ Aucune incohérence détectée");
  } else {
    console.log(`⚠ ${issues.length} incohérence(s) détectée(s) :`);
    issues.forEach((i) => console.log("  - " + i));
  }
}

main();
