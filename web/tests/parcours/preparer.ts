import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/infrastructure/db/generated/client";
import { hacher } from "../../src/lib/mots-de-passe";

/**
 * Compte d'essai des parcours.
 *
 * Recréé à chaque série : un compte laissé d'une exécution à l'autre finit par
 * porter les traces des essais précédents, et les tests deviennent dépendants de
 * leur ordre de passage.
 */
export const COMPTE = { email: "parcours@exemple.test", motDePasse: "MotDePasseParcours2026!" };

export default async function preparer() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquante : les parcours ont besoin d'une base");

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  const ancien = await prisma.users.findUnique({ where: { email: COMPTE.email } });
  if (ancien) {
    await prisma.team_invitations.deleteMany({ where: { invited_by: ancien.id } });
    await prisma.team_members.deleteMany({ where: { user_id: ancien.id } });
    await prisma.teams.deleteMany({ where: { owner_id: ancien.id } });
    await prisma.sessions.deleteMany({ where: { user_id: ancien.id } });
    await prisma.users.delete({ where: { id: ancien.id } });
  }

  const empreinte = hacher(COMPTE.motDePasse);
  await prisma.users.create({
    data: {
      email: COMPTE.email,
      password_hash: empreinte.hash,
      salt: empreinte.salt,
      name: "Camille Parcours",
      first_name: "Camille",
      last_name: "Parcours",
      role: "user",
      roles: JSON.stringify(["user"]),
      email_verified: true,
    },
  });

  // Les tentatives de connexion sont comptées : sans ce nettoyage, relancer la
  // série plusieurs fois d'affilée finit par déclencher la limitation.
  await prisma.tentatives.deleteMany({ where: { cle: COMPTE.email } });

  await prisma.$disconnect();
}
