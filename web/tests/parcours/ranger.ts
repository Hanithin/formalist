import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/infrastructure/db/generated/client";
import { retirerDossiers } from "./nettoyage";
import { COMPTE } from "./preparer";

/**
 * Ce que la série laisse derrière elle, à la fin plutôt qu'au début.
 *
 * `preparer.ts` efface le compte d'essai au démarrage : les dossiers d'une passe
 * survivaient donc jusqu'à la suivante. Entre les deux, la liste du cabinet s'ouvrait
 * sur des dizaines de brouillons « Sans nom » fraîchement modifiés, et les dossiers
 * réels qui attendaient un avocat se trouvaient dessous.
 *
 * Chaque fichier retire déjà ce qu'il a ouvert, par son tableau `semes` : c'est ce qui
 * garde les listes justes pendant la série, pour les essais qui comptent des lignes.
 * Ce rangement final prend ce qu'aucun tableau ne peut retenir - les dossiers nés d'une
 * saisie à l'écran, que le serveur ouvre sans que le test en connaisse l'identifiant.
 */
export default async function ranger() {
  const url = process.env.DATABASE_URL;
  if (!url) return;

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  try {
    const dossiers = await prisma.formalites.findMany({
      where: { users_formalites_user_idTousers: { email: COMPTE.email } },
      select: { id: true },
    });
    await retirerDossiers(dossiers.map((d) => d.id));
  } finally {
    await prisma.$disconnect();
  }
}
