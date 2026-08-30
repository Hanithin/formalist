import { notFound } from "next/navigation";
import { Interdit } from "@/infrastructure/db/utilisateur-courant";

/**
 * Ouvrir un dossier, ou rendre la page « introuvable ».
 *
 * Les dépôts lèvent `Interdit` pour un dossier qui n'existe pas comme pour un dossier
 * qui n'est pas à vous - la même réponse aux deux, afin qu'essayer des numéros
 * n'apprenne rien. Les pages, elles, ne l'attrapaient pas : l'erreur traversait tout et
 * ressortait en page blanche de Next.
 *
 * `NonAuthentifie` n'est pas concerné et doit continuer sa route : la mise en page de
 * l'application renvoie déjà vers la connexion, et transformer une session expirée en
 * « dossier introuvable » ferait chercher un dossier là où il suffit de se reconnecter.
 */
export async function ouIntrouvable<T>(ouverture: Promise<T>): Promise<T> {
  try {
    return await ouverture;
  } catch (erreur) {
    if (erreur instanceof Interdit) notFound();
    throw erreur;
  }
}
