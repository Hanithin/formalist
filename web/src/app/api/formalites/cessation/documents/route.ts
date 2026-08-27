import { NextResponse } from "next/server";
import { z } from "zod";
import { exigerUtilisateur } from "@/infrastructure/db/utilisateur-courant";
import { ouvrirCessation } from "@/infrastructure/db/depots/cessation";
import {
  produireLesActesDeLaCessation,
  CessationIncomplete,
} from "@/infrastructure/documents/actes-cessation";
import { validerCorps, schemas } from "@/lib/valider";
import { route } from "@/lib/reponses";

const SCHEMA = z.object({ dossier: schemas.identifiant });

/**
 * Produit les deux pièces de la cessation.
 *
 * Ce qu'elle écrit vit dans le domaine et l'infrastructure, non ici : l'espace avocat
 * reproduit les mêmes actes après une correction, et deux enchaînements recopiés
 * finiraient par ne plus dire la même chose.
 */
export const POST = route(async (requete: Request) => {
  const utilisateur = await exigerUtilisateur();
  const { dossier } = await validerCorps(SCHEMA, requete);
  const { cessation } = await ouvrirCessation(utilisateur, dossier);

  try {
    const { produits, conserves } = await produireLesActesDeLaCessation(dossier, cessation, {
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
    if (e instanceof CessationIncomplete) {
      return NextResponse.json(
        { error: "Le dossier est incomplet", manques: e.manques },
        { status: 400 }
      );
    }
    throw e;
  }
});
