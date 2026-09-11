import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { annulerSignature, SignatureRetenue } from "@/infrastructure/db/depots/signatures";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

/**
 * Effacer une signature recueillie, et redemander la même.
 *
 * Le circuit ne savait pas revenir en arrière : une signature tracée de travers, un
 * doigt qui dérape sur un téléphone, et l'écran annonçait « Tout le monde a signé » sans
 * plus rien offrir. Il fallait passer par le cabinet.
 *
 * Le geste détruit ce qui a été recueilli - c'est son objet - et il se trace : l'écriture
 * au journal d'audit est la seule pièce qui dira, plus tard, pourquoi l'acte porte une
 * signature datée d'un autre jour.
 */
const ANNULATION = z.object({ demande: schemas.identifiant });

export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { demande } = await validerCorps(ANNULATION, requete);

  let reprise: Awaited<ReturnType<typeof annulerSignature>>;
  try {
    reprise = await annulerSignature(utilisateur, demande);
  } catch (e) {
    /* Un dossier clos, une demande pas encore signée : ce n'est pas une erreur du
       client, c'est l'ordre des choses. */
    if (e instanceof SignatureRetenue) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    throw e;
  }

  if (!reprise) {
    return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });
  }

  /* Le jeton neuf ne sort pas d'ici : il part par courriel, pas dans une réponse que le
     navigateur conserve. */
  return NextResponse.json({
    ok: true,
    nom: reprise.nom,
    parti: reprise.parti,
    simule: reprise.simule,
  });
});
