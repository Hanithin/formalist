import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { ouvrirFermeture } from "@/infrastructure/db/depots/fermeture";
import {
  produireLesActesDeLaFermeture,
  FermetureIncomplete,
  VoieImpossible,
} from "@/infrastructure/documents/actes-fermeture";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

const SCHEMA = z.object({ dossier: schemas.identifiant });

/**
 * Produit les actes de la phase en cours.
 *
 * Ce qu'elle écrit vit dans le domaine et l'infrastructure, non ici : l'espace avocat
 * reproduit les mêmes actes après une correction, et deux enchaînements recopiés
 * finiraient par ne plus dire la même chose.
 */
export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { dossier } = await validerCorps(SCHEMA, requete);
  const { fermeture } = await ouvrirFermeture(utilisateur, dossier);

  try {
    const { produits, conserves } = await produireLesActesDeLaFermeture(dossier, fermeture, {
      par: utilisateur.id,
    });

    return NextResponse.json(
      {
        ok: true,
        documents: [
          ...produits.map((d) => ({ ...d, enRelecture: true })),
          ...conserves.map((d) => ({ ...d, enRelecture: false })),
        ],
      },
      { status: 201 }
    );
  } catch (e) {
    if (e instanceof VoieImpossible) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    if (e instanceof FermetureIncomplete) {
      return NextResponse.json(
        { error: "Le dossier est incomplet", manques: e.manques },
        { status: 400 }
      );
    }
    throw e;
  }
});
