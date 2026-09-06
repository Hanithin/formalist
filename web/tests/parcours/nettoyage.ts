import { rm } from "node:fs/promises";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/infrastructure/db/generated/client";

/** Le dépôt des fichiers, tel que le voit le serveur lancé depuis web/. */
const DEPOT = path.join(process.cwd(), "..", "uploads");

/**
 * Retire des dossiers d'essai, leurs actes et les fichiers produits.
 *
 * En base directement, comme preparer.ts : il n'existe pas de point d'entrée pour
 * supprimer un dossier, et il n'en faut pas un pour les besoins des tests.
 *
 * Les séries partagent un compte : un dossier laissé derrière change les listes que
 * d'autres tests vérifient, et les compteurs avec.
 */
export async function retirerDossiers(ids: number[]) {
  if (ids.length === 0) return;

  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });

  try {
    /*
     * Toutes les tables qui portent un chemin, non les seuls actes.
     *
     * Les versions de statuts, les pièces déposées et les fichiers joints aux messages
     * partaient de la base et restaient sur le disque : chaque passage de la série en
     * laissait derrière lui, et le dépôt local a fini par porter vingt-trois mille six
     * cents fichiers pour neuf cent quarante lignes.
     */
    const aRetirer: (string | null)[] = [];

    for (const d of await client.documents.findMany({
      where: { formalite_id: { in: ids } },
      select: { file_path: true, source_path: true },
    })) {
      aRetirer.push(d.file_path, d.source_path);
    }
    for (const v of await client.document_versions.findMany({
      where: { formalite_id: { in: ids } },
      select: { file_path: true, source_path: true },
    })) {
      aRetirer.push(v.file_path, v.source_path);
    }
    for (const f of await client.uploaded_files.findMany({
      where: { formalite_id: { in: ids } },
      select: { filename: true },
    })) {
      aRetirer.push(f.filename);
    }
    for (const m of await client.messages.findMany({
      where: { formalite_id: { in: ids } },
      select: { file_path: true },
    })) {
      aRetirer.push(m.file_path);
    }

    for (const chemin of aRetirer) {
      if (chemin) await rm(path.join(DEPOT, path.basename(chemin)), { force: true });
    }

    await client.signature_requests.deleteMany({ where: { formalite_id: { in: ids } } });
    // Les avis rattachés au dossier : depuis qu'ils sont émis à chaque étape, ils
    // retiennent la ligne par leur clé étrangère et faisaient échouer le nettoyage.
    await client.notifications.deleteMany({ where: { formalite_id: { in: ids } } });
    await client.audit_log.deleteMany({ where: { formalite_id: { in: ids } } });
    await client.messages.deleteMany({ where: { formalite_id: { in: ids } } });
    await client.team_notes.deleteMany({ where: { formalite_id: { in: ids } } });
    await client.uploaded_files.deleteMany({ where: { formalite_id: { in: ids } } });
    await client.document_versions.deleteMany({ where: { formalite_id: { in: ids } } });
    await client.documents.deleteMany({ where: { formalite_id: { in: ids } } });
    await client.formalites.deleteMany({ where: { id: { in: ids } } });
  } finally {
    await client.$disconnect();
  }
}
