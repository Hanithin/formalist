import { prisma } from "../client";
import { cheminDeLAvis } from "@/domain/formalite/avis";
import { partParCourriel, type Avis } from "@/domain/formalite/avis";
import { emailDAvis } from "@/infrastructure/mail/envoi";
import type { UtilisateurConnecte } from "../sessions";

/**
 * Prévenir quelqu'un.
 *
 * La table `notifications` existait et était alimentée ; aucun écran ne la lisait, et
 * aucun courriel ne partait. Écrire n'est pas prévenir : ce module fait les deux, et
 * c'est le domaine qui dit lequel des deux canaux mérite d'être employé.
 *
 * Un envoi qui échoue ne fait pas échouer le geste qui l'a déclenché. L'avocat qui
 * refuse un document a fait son travail ; que le courriel soit parti ou non ne doit
 * pas défaire son refus.
 */

export async function prevenir(destinataireId: number, dossierId: number | null, avis: Avis) {
  await prisma.notifications.create({
    data: {
      user_id: destinataireId,
      type: avis.genre,
      content: avis.contenu,
      formalite_id: dossierId,
    },
  });

  if (!partParCourriel(avis.genre) || !avis.sujet || !avis.corps) return;

  const destinataire = await prisma.users.findUnique({
    where: { id: destinataireId },
    select: { email: true, name: true },
  });
  if (!destinataire?.email) return;

  /*
   * Le bouton mène là où il dit.
   *
   * Tous pointaient vers le tableau de bord, quel que soit leur libellé : on cliquait
   * « Consulter le motif » et l'on arrivait sur l'accueil, à charge de retrouver son
   * dossier. Le type de la formalité décide de son adresse, d'où cette lecture.
   */
  const dossier = dossierId
    ? await prisma.formalites.findUnique({
        where: { id: dossierId },
        select: { id: true, type: true },
      })
    : null;

  await emailDAvis(destinataire.name ?? "", destinataire.email, avis, cheminDeLAvis(avis, dossier));
}

/** Les avis d'une personne, les plus récents d'abord. */
export async function mesAvis(utilisateur: UtilisateurConnecte, limite = 30) {
  const lignes = await prisma.notifications.findMany({
    where: { user_id: utilisateur.id },
    orderBy: { created_at: "desc" },
    take: limite,
  });

  return lignes.map((n) => ({
    id: n.id,
    genre: n.type,
    contenu: n.content,
    dossierId: n.formalite_id,
    lu: n.read,
    recuLe: n.created_at,
  }));
}

export async function avisNonLus(utilisateur: UtilisateurConnecte): Promise<number> {
  return prisma.notifications.count({ where: { user_id: utilisateur.id, read: false } });
}

/**
 * Marque tout comme lu.
 *
 * Tout, et non un avis à la fois : la cloche s'ouvre d'un bloc, et laisser un
 * compteur allumé sur des lignes qu'on vient de parcourir ne dit plus rien.
 */
export async function marquerAvisLus(utilisateur: UtilisateurConnecte): Promise<number> {
  const { count } = await prisma.notifications.updateMany({
    where: { user_id: utilisateur.id, read: false },
    data: { read: true },
  });
  return count;
}
