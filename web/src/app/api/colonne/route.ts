import { NextResponse } from "next/server";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { resumeColonne } from "@/infrastructure/db/depots/colonne";
import { route } from "@/lib/reponses";

/**
 * Le résumé de la colonne : société active et compteurs.
 *
 * La colonne le reçoit déjà de la disposition au premier rendu. Mais une disposition
 * partagée n'est pas réexécutée quand on passe d'une page à l'autre, si bien que ses
 * compteurs restaient ceux du chargement initial - la colonne annonçait trente et un
 * dossiers en cours quand la page en montrait vingt-huit. Elle les redemande donc à
 * chaque changement de page, comme le faisait la version d'origine, qui interrogeait
 * l'API sur chacune de ses pages.
 */
export const GET = route(async () => {
  const utilisateur = await exigerUtilisateur();
  return NextResponse.json(await resumeColonne(utilisateur));
});
