import { prisma } from "../client";
import { DUREE_JETON_MS, etatJeton, type EtatJeton } from "@/domain/acces/inscription";
import { hacher, jeton as nouveauJeton } from "@/lib/mots-de-passe";
import { emailDeVerification } from "@/infrastructure/mail/envoi";

/**
 * Création de compte et confirmation d'adresse.
 *
 * Aucune session n'est ouverte à l'inscription : le compte n'est utilisable
 * qu'une fois l'adresse confirmée.
 */

export interface Demande {
  prenom: string;
  nom: string;
  email: string;
  motDePasse: string;
}

/**
 * @returns `deja` quand l'adresse est prise. L'appelant répond la même chose
 * dans les deux cas : distinguer permettrait d'énumérer les comptes.
 */
export async function inscrire(demande: Demande): Promise<{ cree: boolean }> {
  const existant = await prisma.users.findUnique({ where: { email: demande.email } });
  if (existant) return { cree: false };

  const empreinte = hacher(demande.motDePasse);

  // L'adresse d'administration vient de l'environnement, jamais du code : la
  // mettre en dur reviendrait à publier qui administre la plateforme.
  const adresseAdmin = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const role = adresseAdmin && demande.email === adresseAdmin ? "admin" : "user";

  const compte = await prisma.users.create({
    data: {
      email: demande.email,
      password_hash: empreinte.hash,
      salt: empreinte.salt,
      name: demande.prenom + " " + demande.nom,
      first_name: demande.prenom,
      last_name: demande.nom,
      role,
      roles: JSON.stringify([role]),
      email_verified: false,
    },
  });

  await envoyerJeton(compte.id, demande.email, demande.prenom);
  return { cree: true };
}

async function envoyerJeton(compteId: number, email: string, prenom: string) {
  // Les jetons précédents cessent d'être valables : un lien renvoyé remplace
  // celui d'avant, sinon plusieurs liens restent actifs en même temps.
  await prisma.email_tokens.deleteMany({ where: { user_id: compteId, type: "verify" } });

  const valeur = nouveauJeton();
  await prisma.email_tokens.create({
    data: {
      token: valeur,
      user_id: compteId,
      type: "verify",
      expires_at: new Date(Date.now() + DUREE_JETON_MS),
    },
  });

  await emailDeVerification(prenom, email, valeur);
}

export async function confirmer(valeur: string): Promise<EtatJeton> {
  const ligne = await prisma.email_tokens.findUnique({ where: { token: valeur } });

  const etat = etatJeton(
    ligne && ligne.type === "verify"
      ? { utiliseLe: ligne.used_at, expireLe: ligne.expires_at }
      : null
  );
  if (etat !== "valide" || !ligne) return etat;

  await prisma.email_tokens.update({
    where: { token: valeur },
    data: { used_at: new Date() },
  });
  await prisma.users.update({
    where: { id: ligne.user_id },
    data: { email_verified: true },
  });

  return "valide";
}

/**
 * Renvoie un lien de confirmation.
 *
 * La réponse est la même que le compte existe ou non, et qu'il soit déjà
 * confirmé ou non : c'est un formulaire ouvert à tous.
 */
export async function renvoyerConfirmation(email: string): Promise<void> {
  const compte = await prisma.users.findUnique({ where: { email } });
  if (!compte || compte.email_verified) return;

  await envoyerJeton(compte.id, compte.email, compte.first_name ?? "");
}
