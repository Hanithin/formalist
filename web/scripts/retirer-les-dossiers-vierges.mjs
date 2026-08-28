/**
 * Retire les dossiers ouverts par un écran, jamais par une personne.
 *
 * Les parcours de création ouvraient un dossier dès l'affichage de leur page, avant
 * toute saisie. Un visiteur qui regardait l'écran et repartait laissait derrière lui
 * une formalité « Sans nom », comptée « en cours », réclamée par le tableau de bord,
 * et posée en tête de la file de travail de l'avocat - qui ouvrait sa journée sur des
 * dossiers vides. Les pages ne le font plus ; ce script balaie ce qu'elles ont laissé.
 *
 * Il liste et ne supprime rien. La suppression demande `--supprimer`, parce qu'un
 * script qui efface des dossiers dès son premier lancement est un script qu'on lance
 * une fois de trop.
 *
 * Est vierge un dossier qui n'a rien reçu ni rien produit : pas de nom, pas de
 * données, et aucune ligne rattachée - document, règlement, signature, message,
 * version d'acte. Cette dernière condition est ce qui rend l'effacement sûr : un
 * dossier qui a produit quoi que ce soit n'est jamais vierge, quel que soit l'état de
 * ses colonnes.
 */

import pg from "pg";

/**
 * Le certificat est vérifié.
 *
 * Repris de `appliquer-les-migrations.mjs`, et pour la même raison : l'adresse interne
 * de Render ne sort pas du réseau privé et ne passe pas par TLS, quand une adresse
 * externe porte `sslmode=require`.
 */
function connexion(adresse) {
  const chiffre = /sslmode=(require|verify-ca|verify-full)/.test(adresse);
  return new pg.Client({
    connectionString: adresse,
    ssl: chiffre ? { rejectUnauthorized: true } : undefined,
  });
}

/*
 * Les tables qui rattachent quelque chose à un dossier.
 *
 * Elles sont nommées ici plutôt que devinées : une table oubliée rendrait vierge un
 * dossier qui ne l'est pas, et c'est la seule erreur que ce script puisse commettre.
 */
const RATTACHEMENTS = [
  "documents",
  "document_versions",
  "payments",
  "signature_requests",
  "messages",
];

const VIERGES = `
  SELECT id, type, created_at
  FROM formalites f
  WHERE f.status = 'en_cours'
    AND coalesce(f.societe, '') = ''
    AND coalesce(f.data_json, '') IN ('', '{}')
    ${RATTACHEMENTS.map(
      (t) => `AND NOT EXISTS (SELECT 1 FROM ${t} WHERE formalite_id = f.id)`
    ).join("\n    ")}
  ORDER BY id
`;

async function principal() {
  const adresse = process.env.DATABASE_URL;
  if (!adresse) {
    console.error("DATABASE_URL manque : impossible d'ouvrir la base.");
    process.exit(1);
  }

  const supprimer = process.argv.includes("--supprimer");
  const client = connexion(adresse);
  await client.connect();

  try {
    const { rows } = await client.query(VIERGES);

    if (rows.length === 0) {
      console.log("Aucun dossier vierge.");
      return;
    }

    console.log(rows.length + " dossier(s) vierge(s) :");
    for (const d of rows) {
      const jour = d.created_at ? new Date(d.created_at).toISOString().slice(0, 10) : "?";
      console.log("  #" + String(d.id).padStart(4, "0") + "  " + d.type.padEnd(20) + jour);
    }

    if (!supprimer) {
      console.log("\nRien n'a été supprimé. Relancer avec --supprimer pour les retirer.");
      return;
    }

    /*
     * Tout ou rien, et la condition est rejouée au moment de l'effacement.
     *
     * Les identifiants relevés à la lecture pourraient avoir reçu un document entre
     * les deux requêtes : la clause complète est donc répétée ici plutôt que de faire
     * confiance à la liste.
     */
    await client.query("BEGIN");
    try {
      const efface = await client.query(
        "DELETE FROM formalites WHERE id IN (SELECT id FROM (" + VIERGES + ") AS v)"
      );
      await client.query("COMMIT");
      console.log("\n" + efface.rowCount + " dossier(s) supprimé(s).");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  } finally {
    await client.end();
  }
}

principal().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
