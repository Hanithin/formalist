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
    // Les essais de création laissent des dossiers, des pièces déposées et leur
    // inscription au registre : on retire dans l'ordre des dépendances.
    await prisma.support_messages.deleteMany({ where: { user_id: ancien.id } });
    await prisma.support_conversations.deleteMany({ where: { user_id: ancien.id } });
    await prisma.lawyer_consultations.deleteMany({ where: { user_id: ancien.id } });
    await prisma.signature_requests.deleteMany({ where: { formalites: { user_id: ancien.id } } });
    await prisma.uploaded_files.deleteMany({ where: { user_id: ancien.id } });
    await prisma.team_notes.deleteMany({ where: { formalites: { user_id: ancien.id } } });
    await prisma.audit_log.deleteMany({ where: { formalites: { user_id: ancien.id } } });
    await prisma.messages.deleteMany({ where: { formalites: { user_id: ancien.id } } });
    await prisma.documents.deleteMany({ where: { formalites: { user_id: ancien.id } } });
    // Les essais créent des contrats et des déclarations à chaque série.
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

  // Les inscriptions d'essai sont comptées par adresse IP : relancer la série
  // plusieurs fois d'affilée déclencherait la limitation, et les tests
  // échoueraient sur un mécanisme qui fonctionne.
  await prisma.tentatives.deleteMany({
    where: { action: { in: ["inscription", "renvoi-verification", "objet-social"] } },
  });
  await prisma.users.deleteMany({ where: { email: { startsWith: "nouvelle-" } } });
  await prisma.users.deleteMany({ where: { email: { startsWith: "nouveau-" } } });
  await prisma.users.deleteMany({ where: { email: { startsWith: "essai-direct" } } });

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

  // Un avocat, et deux messages échangés : sans interlocuteur, la messagerie
  // ne montre que des messages à soi-même, ce qui ne vérifie rien.
  const empreinteAvocat = hacher("MotDePasseAvocat2026!");
  const avocat = await prisma.users.upsert({
    where: { email: "avocat-parcours@exemple.test" },
    update: {},
    create: {
      email: "avocat-parcours@exemple.test",
      password_hash: empreinteAvocat.hash,
      salt: empreinteAvocat.salt,
      name: "Maître Dupont",
      role: "avocat",
      roles: JSON.stringify(["avocat"]),
      email_verified: true,
    },
  });

  await prisma.formalites.update({
    where: { id: enCours.id },
    data: { assigned_avocat_id: avocat.id },
  });

  await prisma.messages.create({
    data: {
      formalite_id: enCours.id,
      sender_id: avocat.id,
      content: "Bonjour, il manque une pièce d'identité lisible.",
      kind: "document_request",
      read: false,
    },
  });

  await prisma.messages.create({
    data: {
      formalite_id: enCours.id,
      sender_id: compte.id,
      content: "Merci, je la dépose aujourd'hui.",
      kind: "text",
      read: true,
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

  // Disponibilités de l'avocat : sans elles, aucun créneau n'est proposé.
  await prisma.avocat_availability.deleteMany({ where: { avocat_id: avocat.id } });
  for (const jour of [1, 2, 3, 4, 5]) {
    await prisma.avocat_availability.create({
      data: {
        avocat_id: avocat.id,
        day_of_week: jour,
        start_time: "09:00",
        end_time: "12:00",
        slot_duration_minutes: 30,
      },
    });
  }

  // Un jeton de signature connu, pour vérifier le circuit de bout en bout. Dans
  // la vraie vie il arrive par email et n'apparaît jamais dans une réponse.
  // Sur un dossier qui n'appartient qu'à lui : ouvrir un circuit efface les
  // demandes non signées, et un autre test emporterait ce jeton avec.
  const dossierSignature = await prisma.formalites.create({
    data: {
      user_id: compte.id,
      type: "creation",
      forme: "SASU",
      societe: "PARCOURS SIGNATURE",
      status: "en_cours",
      phase: 4,
      data_json: "{}",
    },
  });

  const jetonSignature = jeton();
  await prisma.signature_requests.create({
    data: {
      formalite_id: dossierSignature.id,
      associe_index: 0,
      associe_name: "Camille Parcours",
      associe_email: COMPTE.email,
      role: "associe",
      token: jetonSignature,
      status: "pending",
    },
  });
  await writeFile(
    path.join(import.meta.dirname, "jeton-signature.txt"),
    jetonSignature
  );

  // Un administrateur de plateforme, distinct de celui du dépôt : suspendre ou
  // rétrograder un vrai compte pendant les essais serait fâcheux.
  const empreinteAdmin = hacher("MotDePasseAdmin2026!");
  const administrateur = await prisma.users.upsert({
    where: { email: "admin-parcours@exemple.test" },
    update: { suspended: false, roles: JSON.stringify(["admin"]), role: "admin" },
    create: {
      email: "admin-parcours@exemple.test",
      password_hash: empreinteAdmin.hash,
      salt: empreinteAdmin.salt,
      name: "Admin Parcours",
      role: "admin",
      roles: JSON.stringify(["admin"]),
      email_verified: true,
    },
  });

  const jetonAdmin = jeton();
  await prisma.sessions.create({
    data: {
      token: jetonAdmin,
      user_id: administrateur.id,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  await writeFile(
    path.join(import.meta.dirname, "session-admin.json"),
    JSON.stringify({
      cookies: [
        {
          name: "formalist_session",
          value: jetonAdmin,
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

  await writeFile(
    path.join(import.meta.dirname, "comptes.json"),
    JSON.stringify({ client: compte.id, avocat: avocat.id, admin: administrateur.id })
  );

  // Session avocat, pour vérifier l'espace qui lui est réservé.
  const jetonAvocat = jeton();
  await prisma.sessions.create({
    data: {
      token: jetonAvocat,
      user_id: avocat.id,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  await writeFile(
    path.join(import.meta.dirname, "session-avocat.json"),
    JSON.stringify({
      cookies: [
        {
          name: "formalist_session",
          value: jetonAvocat,
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
