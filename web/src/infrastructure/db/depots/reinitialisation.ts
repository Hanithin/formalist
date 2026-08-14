import { prisma } from "../client";
import { revoquerToutesLesSessions, creerSession } from "../sessions";
import { etatJeton, type EtatJeton } from "@/domain/acces/inscription";
import { DUREE_JETON_MS, TYPE_JETON } from "@/domain/acces/reinitialisation";
import { emailDeReinitialisation } from "@/infrastructure/mail/envoi";
import { hacher, jeton as nouveauJeton } from "@/lib/mots-de-passe";

/**
 * Mot de passe oublié.
 *
 * Le compte se rouvre par un lien envoyé à l'adresse déclarée : c'est la seule chose
 * dont on soit sûr qu'elle appartienne à la personne. Le jeton vit dans email_tokens,
 * comme celui de confirmation d'adresse, sous un autre type.
 */

/**
 * Envoie un lien de réinitialisation, si un compte existe.
 *
 * Ne dit jamais si l'adresse est connue : la fonction rend la même chose dans tous
 * les cas. Une réponse qui distinguerait ferait de cette page un annuaire de vos
 * clients, interrogeable adresse par adresse.
 */
export async function demanderReinitialisation(email: string): Promise<void> {
  const compte = await prisma.users.findUnique({ where: { email: email.trim().toLowerCase() } });

  // Un compte suspendu ne se rouvre pas par ce chemin : ce serait contourner la
  // décision qui l'a suspendu.
  if (!compte || compte.suspended) return;

  // Les jetons précédents cessent d'être valables : deux liens actifs en même temps
  // doublent la surface d'attaque, et on ne saurait plus lequel a servi.
  await prisma.email_tokens.deleteMany({ where: { user_id: compte.id, type: TYPE_JETON } });

  const valeur = nouveauJeton();
  await prisma.email_tokens.create({
    data: {
      token: valeur,
      user_id: compte.id,
      type: TYPE_JETON,
      expires_at: new Date(Date.now() + DUREE_JETON_MS),
    },
  });

  // Le prénom est la première partie du nom enregistré ; on s'en passe s'il manque.
  const prenom = (compte.name ?? "").trim().split(/\s+/)[0] ?? "";
  await emailDeReinitialisation(prenom, compte.email, valeur);
}

/** L'état d'un jeton, pour afficher la page sans encore rien changer. */
export async function etatDuLien(valeur: string): Promise<EtatJeton> {
  if (!valeur) return "inconnu";

  const ligne = await prisma.email_tokens.findUnique({ where: { token: valeur } });
  return etatJeton(
    ligne && ligne.type === TYPE_JETON
      ? { utiliseLe: ligne.used_at, expireLe: ligne.expires_at }
      : null
  );
}

export interface Reinitialisation {
  etat: EtatJeton;
  /** Jeton de session ouvert pour la personne, quand le changement a eu lieu. */
  session: string | null;
}

/**
 * Pose le nouveau mot de passe.
 *
 * Le jeton est marqué utilisé avant tout : un lien de réinitialisation ne sert
 * qu'une fois, et deux requêtes lancées ensemble ne doivent pas passer toutes les
 * deux. Les sessions ouvertes tombent ensuite - on réinitialise souvent parce qu'un
 * accès est compromis, et laisser vivre les anciennes sessions viderait le geste de
 * son sens. Une nouvelle s'ouvre pour la personne qui vient de faire la manipulation,
 * sinon elle se retrouverait devant la page de connexion sans comprendre pourquoi.
 */
export async function reinitialiser(valeur: string, motDePasse: string): Promise<Reinitialisation> {
  const ligne = await prisma.email_tokens.findUnique({ where: { token: valeur } });

  const etat = etatJeton(
    ligne && ligne.type === TYPE_JETON
      ? { utiliseLe: ligne.used_at, expireLe: ligne.expires_at }
      : null
  );
  if (etat !== "valide" || !ligne) return { etat, session: null };

  const compte = await prisma.users.findUnique({ where: { id: ligne.user_id } });
  if (!compte || compte.suspended) return { etat: "inconnu", session: null };

  await prisma.email_tokens.update({
    where: { token: valeur },
    data: { used_at: new Date() },
  });

  const empreinte = hacher(motDePasse);
  await prisma.users.update({
    where: { id: compte.id },
    data: {
      password_hash: empreinte.hash,
      salt: empreinte.salt,
      // Recevoir le lien prouve que l'adresse est bien la sienne : un compte resté
      // non confirmé n'a plus de raison de l'être.
      email_verified: true,
    },
  });

  // La limitation de débit compte les échecs de connexion : les laisser bloquerait
  // la personne juste après lui avoir fait choisir un mot de passe.
  await prisma.tentatives.deleteMany({ where: { action: "connexion", cle: compte.email } });

  await revoquerToutesLesSessions(compte.id);
  const session = nouveauJeton();
  await creerSession(compte.id, session);

  return { etat: "valide", session };
}
