import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import {
  changerEtatDossier,
  changerSousPhase,
  assignerAvocat,
  marquerLesInformationsVerifiees,
} from "@/infrastructure/db/depots/avocat";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

const SCHEMA = z.union([
  z.object({
    dossier: schemas.identifiant,
    etat: z.string().trim().max(30),
    commentaire: z.string().trim().max(1000).optional(),
  }),
  z.object({ dossier: schemas.identifiant, sousPhase: z.string().trim().max(4) }),
  z.object({ dossier: schemas.identifiant, avocat: schemas.identifiant }),
  // La relecture du récapitulatif : un fait constaté, non un changement d'état.
  z.object({ dossier: schemas.identifiant, informationsVerifiees: z.boolean() }),
]);

export const PUT = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const demande = await validerCorps(SCHEMA, requete);

  if ("etat" in demande) {
    return NextResponse.json(
      await changerEtatDossier(utilisateur, demande.dossier, demande.etat, demande.commentaire)
    );
  }

  if ("sousPhase" in demande) {
    return NextResponse.json(
      await changerSousPhase(utilisateur, demande.dossier, demande.sousPhase)
    );
  }

  if ("informationsVerifiees" in demande) {
    return NextResponse.json(
      await marquerLesInformationsVerifiees(
        utilisateur,
        demande.dossier,
        demande.informationsVerifiees
      )
    );
  }

  return NextResponse.json(await assignerAvocat(utilisateur, demande.dossier, demande.avocat));
});
