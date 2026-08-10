import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { changerEtatDossier, assignerAvocat } from "@/infrastructure/db/depots/avocat";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

const SCHEMA = z.union([
  z.object({
    dossier: schemas.identifiant,
    etat: z.string().trim().max(30),
    commentaire: z.string().trim().max(1000).optional(),
  }),
  z.object({ dossier: schemas.identifiant, avocat: schemas.identifiant }),
]);

export const PUT = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const demande = await validerCorps(SCHEMA, requete);

  if ("etat" in demande) {
    return NextResponse.json(
      await changerEtatDossier(utilisateur, demande.dossier, demande.etat, demande.commentaire)
    );
  }

  return NextResponse.json(await assignerAvocat(utilisateur, demande.dossier, demande.avocat));
});
