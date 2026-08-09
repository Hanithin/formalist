import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/infrastructure/db/generated/client";
import { hacher, jeton } from "../../src/lib/mots-de-passe";

/**
 * Compte d'essai des parcours.
 *
 * Recréé à chaque série : un compte laissé d'une exécution à l'autre finit par
 * porter les traces des essais précédents, et les tests deviennent dépendants de
 * leur ordre de passage.
 *
 * La session est ouverte ici, une seule fois, et son cookie écrit dans
 * tests/parcours/session.json. Se reconnecter à chaque test déclenchait la
 * limitation de débit - dix tentatives par quart d'heure sur une même adresse -
 * et faisait échouer toute la série. Les tests qui vérifient la connexion
 * elle-même repartent d'un contexte vierge.
 */
export const FICHIER_SESSION = path.join(import.meta.dirname, "session.json");
export const COMPTE = { email: "parcours@exemple.test", motDePasse: "MotDePasseParcours2026!" };

export default async function preparer() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquante : les parcours ont besoin d'une base");

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  const ancien = await prisma.users.findUnique({ where: { email: COMPTE.email } });
  if (ancien) {
    await prisma.documents.deleteMany({ where: { formalites: { user_id: ancien.id } } });
    await prisma.contrats.deleteMany({ where: { user_id: ancien.id } });
    await prisma.formalites.deleteMany({ where: { user_id: ancien.id } });
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

  // Deux dossiers, un en cours et un terminé, pour que les listes et leurs filtres
  // aient de quoi être vérifiés.
  const compte = await prisma.users.findUniqueOrThrow({ where: { email: COMPTE.email } });

  const enCours = await prisma.formalites.create({
    data: {
      user_id: compte.id,
      type: "creation",
      forme: "SASU",
      societe: "PARCOURS EN COURS",
      status: "en_cours",
      phase: 3,
      data_json: "{}",
    },
  });

  await prisma.formalites.create({
    data: {
      user_id: compte.id,
      type: "creation",
      forme: "SARL",
      societe: "PARCOURS TERMINEE",
      status: "terminee",
      phase: 5,
      data_json: "{}",
    },
  });

  await prisma.documents.create({
    data: {
      formalite_id: enCours.id,
      name: "Statuts constitutifs.docx",
      type: "docx",
      status: "generated",
      uploaded_by: "system",
    },
  });

  await prisma.documents.create({
    data: {
      formalite_id: enCours.id,
      name: "Pièce d'identité.pdf",
      type: "pdf",
      status: "uploaded",
      uploaded_by: "user",
      rejection_reason: "Document illisible",
    },
  });

  await prisma.contrats.create({
    data: {
      user_id: compte.id,
      type: "nda",
      titre: "Accord de confidentialité",
      status: "brouillon",
      data_json: "{}",
    },
  });

  await prisma.contrats.create({
    data: {
      user_id: compte.id,
      type: "cgv",
      titre: "Conditions générales de vente",
      status: "signe",
      data_json: "{}",
    },
  });

  // Session ouverte directement en base : pas d'appel réseau, donc rien à compter
  const valeur = jeton();
  await prisma.sessions.create({
    data: {
      token: valeur,
      user_id: compte.id,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  await mkdir(path.dirname(FICHIER_SESSION), { recursive: true });
  await writeFile(
    FICHIER_SESSION,
    JSON.stringify({
      cookies: [
        {
          name: "formalist_session",
          value: valeur,
          domain: "localhost",
          path: "/",
          expires: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
          httpOnly: true,
          secure: false,
          sameSite: "Lax",
        },
      ],
      origins: [],
    })
  );

  await prisma.$disconnect();
}
