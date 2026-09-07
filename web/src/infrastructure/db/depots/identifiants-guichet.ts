import { prisma } from "../client";
import { chiffrer, dechiffrer } from "@/lib/chiffrement";
import {
  enProduction,
  type Identifiants,
} from "@/infrastructure/guichet/transport";

/**
 * Les identifiants e-procedures d'un avocat.
 *
 * Le compte du guichet unique est nominatif : c'est sous la responsabilité de celui qui
 * dépose que la formalité part, et le journal de l'INPI doit pouvoir dire qui a agi. Le
 * compte du serveur reste en repli, pour le développement et les vérifications
 * manuelles, mais il ne convient pas à un cabinet où plusieurs avocats déposent.
 *
 * Le mot de passe est chiffré, jamais haché : il faut le rejouer auprès de l'INPI à
 * chaque session. Il ne ressort d'ici que vers le transport - jamais vers le navigateur,
 * jamais vers un journal.
 */

function environnement(): string {
  return enProduction() ? "production" : "demonstration";
}

export interface CompteDuGuichet {
  username: string;
  /** Quand le guichet a confirmé pour la dernière fois que ce couple fonctionne. */
  verifieLe: Date | null;
  environnement: string;
}

/** Ce que l'écran peut montrer : l'identifiant, pas le secret. */
export async function compteDeLAvocat(userId: number): Promise<CompteDuGuichet | null> {
  const ligne = await prisma.identifiants_guichet.findFirst({
    where: { user_id: userId, environnement: environnement() },
  });
  if (!ligne) return null;

  return {
    username: ligne.username,
    verifieLe: ligne.verifie_le,
    environnement: ligne.environnement,
  };
}

/**
 * Les identifiants utilisables pour déposer, ou rien.
 *
 * Rien plutôt qu'une erreur : l'appelant a mieux à dire qu'une exception - il ouvre la
 * fenêtre de connexion. Un secret devenu illisible - clé changée, ligne abîmée - vaut
 * « pas de compte » et non une panne : l'avocat se reconnecte, et la ligne se remplace.
 */
export async function identifiantsDeLAvocat(userId: number): Promise<Identifiants | null> {
  const ligne = await prisma.identifiants_guichet.findFirst({
    where: { user_id: userId, environnement: environnement() },
  });
  if (!ligne) return null;

  try {
    return { username: ligne.username, password: dechiffrer(ligne.password_chiffre) };
  } catch {
    return null;
  }
}

/**
 * Enregistre un compte dont la connexion a déjà été vérifiée.
 *
 * L'ordre importe : on n'écrit qu'après que le guichet a répondu. Enregistrer d'abord
 * ferait porter à l'avocat un compte qui ne fonctionne pas, et il ne l'apprendrait qu'au
 * moment de déposer - c'est-à-dire au pire moment.
 */
export async function enregistrerLeCompte(
  userId: number,
  identifiants: Identifiants
): Promise<void> {
  const env = environnement();
  const valeurs = {
    username: identifiants.username,
    password_chiffre: chiffrer(identifiants.password),
    verifie_le: new Date(),
    updated_at: new Date(),
  };

  const existant = await prisma.identifiants_guichet.findFirst({
    where: { user_id: userId, environnement: env },
  });

  if (existant) {
    await prisma.identifiants_guichet.update({ where: { id: existant.id }, data: valeurs });
    return;
  }
  await prisma.identifiants_guichet.create({
    data: { user_id: userId, environnement: env, ...valeurs },
  });
}

/** Oublier son compte : le mot de passe disparaît, les dépôts déjà faits demeurent. */
export async function oublierLeCompte(userId: number): Promise<void> {
  await prisma.identifiants_guichet.deleteMany({
    where: { user_id: userId, environnement: environnement() },
  });
}
