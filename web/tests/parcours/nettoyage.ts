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
    const actes = await client.documents.findMany({
      where: { formalite_id: { in: ids } },
      select: { file_path: true, source_path: true },
    });

    for (const acte of actes) {
      for (const chemin of [acte.file_path, acte.source_path]) {
        if (chemin) await rm(path.join(DEPOT, path.basename(chemin)), { force: true });
      }
    }

    await client.signature_requests.deleteMany({ where: { formalite_id: { in: ids } } });
    await client.audit_log.deleteMany({ where: { formalite_id: { in: ids } } });
    await client.messages.deleteMany({ where: { formalite_id: { in: ids } } });
    await client.team_notes.deleteMany({ where: { formalite_id: { in: ids } } });
    await client.uploaded_files.deleteMany({ where: { formalite_id: { in: ids } } });
    await client.documents.deleteMany({ where: { formalite_id: { in: ids } } });
    await client.formalites.deleteMany({ where: { id: { in: ids } } });
  } finally {
    await client.$disconnect();
  }
}
