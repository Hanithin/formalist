import { NextResponse } from "next/server";
import { exigerUtilisateur, Interdit } from "@/infrastructure/db/utilisateur-courant";
import { deposerPiece } from "@/infrastructure/documents/depot";
import {
  LIVRABLES,
  estLivrable,
  avancerSelonLeTravail,
  documentFinalDuDossier,
  annoncerLeDocumentFinal,
} from "@/infrastructure/db/depots/avocat";
import { TYPE_KBIS } from "@/infrastructure/db/depots/suivi";
import { DepotRefuse } from "@/lib/fichiers";
import { route } from "@/lib/reponses";

/**
 * Le Kbis et le registre des bénéficiaires, déposés par le cabinet.
 *
 * Ils n'avaient aucun chemin pour arriver dans le dossier du client : les deux seules
 * routes de dépôt sont les pièces attendues de lui, restreintes à une liste, et le
 * coffre personnel, qui range dans les documents de celui qui dépose.
 *
 * Le type est contraint à deux valeurs, comme les pièces : un identifiant libre
 * deviendrait un fourre-tout, et c'est le type qui dit ensuite au suivi que l'étape
 * est franchie.
 */
export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  if (!utilisateur.roles.includes("avocat") && !utilisateur.roles.includes("admin")) {
    throw new Interdit("Réservé aux avocats");
  }

  const formulaire = await requete.formData();
  const dossierId = Number(formulaire.get("dossier"));
  const type = String(formulaire.get("type") ?? "");
  const fichier = formulaire.get("fichier");

  if (!Number.isInteger(dossierId) || dossierId <= 0) {
    return NextResponse.json({ error: "Dossier invalide" }, { status: 400 });
  }
  if (!estLivrable(type)) {
    return NextResponse.json({ error: "Ce document n'est pas attendu ici" }, { status: 400 });
  }
  if (!(fichier instanceof File)) {
    return NextResponse.json({ error: "Aucun fichier reçu" }, { status: 400 });
  }

  const livrable = LIVRABLES[type];

  /*
   * Le document porte le nom que le greffe lui donne pour ce dossier.
   *
   * Les deux titres étaient fixes : le client d'un dépôt de comptes recevait dans ses
   * documents une pièce intitulée « Kbis », là où le bouton disait « Déposer le
   * récépissé de dépôt » - et une société qu'on ferme recevait un Kbis au lieu de son
   * attestation de radiation. Le domaine nomme déjà le document de chaque type.
   */
  const titre =
    type === TYPE_KBIS ? await documentFinalDuDossier(dossierId) : livrable.titre;

  try {
    const depose = await deposerPiece(
      utilisateur,
      dossierId,
      { identifiant: type, titre },
      fichier,
      [...livrable.formats]
    );
    /*
     * Le document du greffe clôt le travail : l'étape suit, et le client est prévenu.
     *
     * C'était le seul geste du parcours dont personne n'apprenait rien : la tâche
     * promettait pourtant « le client en est prévenu aussitôt », et le chemin dégradé
     * - conclure sans document - envoyait bien un courriel. Le chemin normal était
     * muet.
     */
    await avancerSelonLeTravail(utilisateur, dossierId);
    if (type === TYPE_KBIS) await annoncerLeDocumentFinal(utilisateur, dossierId, titre);

    return NextResponse.json({ ok: true, document: depose }, { status: 201 });
  } catch (e) {
    if (e instanceof DepotRefuse) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
});
